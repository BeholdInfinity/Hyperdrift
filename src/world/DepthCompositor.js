/**
 * Single depth-sorted compositor for space ambience layers.
 */

import {
  getDepthCompositorConfig,
  getEnabledLayersForDepthBucket,
} from './DepthCompositorConfig.js';

const SCREEN_TYPES = new Set(['star', 'nebulaAmbient', 'dust', 'speedStreaks']);
const HANGAR_PLATE_TYPES = new Set(['star', 'nebulaAmbient', 'dust']);

export class DepthCompositor {
  /**
   * @param {import('./Starfield.js').Starfield} starfield
   * @param {import('./NebulaField.js').NebulaField} nebulaField
   * @param {import('./SpeedStreaks.js').SpeedStreaks} speedStreaks
   * @param {import('./DustLayer.js').DustLayer} dustLayer
   * @param {() => object[]} getNebulae
   */
  constructor(starfield, nebulaField, speedStreaks, dustLayer, getNebulae) {
    this.starfield = starfield;
    this.nebulaField = nebulaField;
    this.speedStreaks = speedStreaks;
    this.dustLayer = dustLayer;
    this.getNebulae = getNebulae;
    /** @type {Map<string, Function>} */
    this._customPainters = new Map();
  }

  registerLayerPainter(type, fn) {
    this._customPainters.set(type, fn);
  }

  _globals() {
    return getDepthCompositorConfig().globals;
  }

  _paintParams(params) {
    return {
      cameraX: params.cameraX,
      cameraY: params.cameraY,
      time: params.time ?? 0,
      coverRadius: params.coverRadius,
      zoom: params.zoom ?? 1,
      renderer: params.renderer,
      camera: params.camera,
    };
  }

  _withScreenTransform(ctx, renderer, camera, fn) {
    ctx.save();
    ctx.translate(
      renderer.centerX + camera.offset.x,
      renderer.centerY + camera.offset.y
    );
    if (camera.rotation) ctx.rotate(camera.rotation);
    fn(ctx);
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} layer
   * @param {object} p
   */
  _paintLayer(ctx, layer, p, { worldCtx = null } = {}) {
    const globals = this._globals();
    const custom = this._customPainters.get(layer.type);
    if (custom) {
      custom(ctx, layer, p, globals, worldCtx);
      return;
    }

    switch (layer.type) {
      case 'star':
        this.starfield.renderLayer(
          ctx,
          layer.layerIndex,
          p.cameraX,
          p.cameraY,
          p.coverRadius,
          p.time,
          p.zoom,
          { globals, layerCfg: layer }
        );
        break;
      case 'nebulaAmbient':
        this.nebulaField.paintAmbientLayer(
          ctx,
          layer.layerIndex,
          p.cameraX,
          p.cameraY,
          p.time,
          p.coverRadius,
          p.zoom,
          { globals, layerCfg: layer }
        );
        break;
      case 'nebulaStream':
        if (worldCtx) {
          this.nebulaField.renderWorldNebulae(worldCtx, this.getNebulae(), p.time, {
            layerCfg: layer,
            globals,
          });
        }
        break;
      case 'speedStreaks':
        this.speedStreaks.render(ctx, { layerCfg: layer, globals });
        break;
      case 'dust':
        this.dustLayer.render(
          ctx,
          layer,
          p.cameraX,
          p.cameraY,
          p.coverRadius,
          p.time,
          p.zoom,
          globals
        );
        break;
      default:
        break;
    }
  }

  _paintBucket(bucket, ctx, params) {
    const p = this._paintParams(params);
    const layers = getEnabledLayersForDepthBucket(bucket);
    const { renderer, camera } = p;
    if (!renderer || !camera) return;

    let i = 0;
    while (i < layers.length) {
      const layer = layers[i];
      if (SCREEN_TYPES.has(layer.type)) {
        this._withScreenTransform(ctx, renderer, camera, (sctx) => {
          while (i < layers.length && SCREEN_TYPES.has(layers[i].type)) {
            this._paintLayer(sctx, layers[i], p);
            i++;
          }
        });
      } else if (layer.type === 'nebulaStream') {
        renderer.renderWorldLayer((wctx) => {
          this._paintLayer(ctx, layer, p, { worldCtx: wctx });
        }, camera);
        i++;
      } else {
        this._paintLayer(ctx, layer, p);
        i++;
      }
    }
  }

  update(deltaTime, { shipVelocity, shipSpeed, viewportRadius, referenceSpeed } = {}) {
    const layer = getDepthCompositorConfig().layers.find((l) => l.type === 'speedStreaks');
    const ref = referenceSpeed ?? this._globals().referenceSpeed;

    if (!layer?.enabled) {
      this.speedStreaks.update(
        { x: 0, y: 0 },
        0,
        ref,
        deltaTime,
        viewportRadius ?? 0,
        { layerCfg: { enabled: false } }
      );
      return;
    }

    this.speedStreaks.update(
      shipVelocity || { x: 0, y: 0 },
      shipSpeed ?? 0,
      ref,
      deltaTime,
      viewportRadius ?? 0,
      { layerCfg: layer, globals: this._globals() }
    );
  }

  paintBelowPlayable(ctx, params) {
    this._paintBucket('below', ctx, params);
  }

  paintAtPlayable(ctx, params) {
    this._paintBucket('at', ctx, params);
  }

  paintAbovePlayable(ctx, params) {
    this._paintBucket('above', ctx, params);
  }

  /** Hangar peephole — negative-depth screen-parallax layers only. */
  paintHangarPlate(plateCtx, params) {
    const p = this._paintParams(params);
    const layers = getEnabledLayersForDepthBucket('below')
      .filter((l) => HANGAR_PLATE_TYPES.has(l.type))
      .sort((a, b) => a.depth - b.depth);

    for (const layer of layers) {
      this._paintLayer(plateCtx, layer, p);
    }
  }
}
