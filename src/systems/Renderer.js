import { BLUEPRINT } from '../core/Constants.js';
import { drawModularShip } from '../ships/ShipRenderer.js';
import { emitMountExhaust } from '../ships/PlumeDraw.js';
import { topDownView } from '../ships/ShipViews.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.viewportRadius = 0;
    this.time = 0;
    /** @type {'default'|'blueprint'} */
    this.layoutMode = 'default';
  }

  setLayoutMode(mode) {
    this.layoutMode = mode === 'blueprint' ? 'blueprint' : 'default';
    if (this.width && this.height) this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.centerX = this.width / 2;
    const minDim = Math.min(this.width, this.height);
    if (this.layoutMode === 'blueprint') {
      this.centerY = this.height * BLUEPRINT.VIEW_CENTER_Y;
      this.viewportRadius = (minDim / 2) * BLUEPRINT.VIEW_RADIUS_FRAC;
    } else {
      this.centerY = this.height / 2;
      this.viewportRadius = (minDim / 2) * (1 - 0.08);
    }
  }

  beginFrame() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.time += 0.016;
  }

  setupCircularClip() {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, this.viewportRadius, 0, Math.PI * 2);
    this.ctx.clip();
  }

  endCircularClip() {
    this.ctx.restore();

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(100, 180, 255, 0.2)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, this.viewportRadius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  renderWorldLayer(callback, camera) {
    const zoom = camera.effectiveZoom;
    this.ctx.save();
    this.ctx.translate(
      this.centerX + camera.offset.x,
      this.centerY + camera.offset.y
    );
    if (camera.rotation) this.ctx.rotate(camera.rotation);
    this.ctx.scale(zoom, zoom);
    this.ctx.translate(-camera.position.x, -camera.position.y);
    callback(this.ctx);
    this.ctx.restore();
  }

  renderScreenLayer(callback, camera) {
    const zoom = camera.effectiveZoom;
    this.ctx.save();
    this.ctx.translate(
      this.centerX + camera.offset.x,
      this.centerY + camera.offset.y
    );
    if (camera.rotation) this.ctx.rotate(camera.rotation);
    this.ctx.scale(zoom, zoom);
    callback(this.ctx);
    this.ctx.restore();
  }

  renderShip(ship, camera, view) {
    const screen = camera.getShipScreenPosition(
      this.centerX,
      this.centerY,
      ship.position
    );
    const ctx = this.ctx;
    const visualScale = ship.visualScale ?? 1;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(ship.angle + (camera.rotation || 0));
    ctx.scale(camera.effectiveZoom * visualScale, camera.effectiveZoom * visualScale);

    this._drawShipBody(ctx, ship, view);

    ctx.restore();
  }

  /**
   * Draw ship in a world-space canvas (already camera-transformed).
   * Used by hangar occlusion so the hull can sit behind the north wall.
   * @param {{ mode?: string, headingIndex?: number }} [view]
   */
  drawShipInWorld(ctx, ship, view) {
    this.drawShipBodyAt(ctx, ship, ship.position.x, ship.position.y, view);
  }

  /**
   * Draw ship hull at a world offset (used by B2 elevator shaft clip pass).
   * Pass an angled view for hangar / blueprint 2.5D.
   * @param {{ mode?: string, headingIndex?: number }} [view]
   */
  drawShipBodyAt(ctx, ship, x = 0, y = 0, view) {
    const visualScale = ship.visualScale ?? 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.angle);
    ctx.scale(visualScale, visualScale);
    this._drawShipBody(ctx, ship, view || topDownView());
    ctx.restore();
  }

  /**
   * Modular catalog draw (sections + items + mount-driven plumes).
   * @param {{ mode?: string, headingIndex?: number }} [view]
   */
  _drawShipBody(ctx, ship, view) {
    drawModularShip(ctx, ship, view || topDownView());
  }

  renderAsteroids(asteroids, camera) {
    this.renderWorldLayer((wctx) => {
      for (const asteroid of asteroids) {
        if (!asteroid.active) continue;

        wctx.save();
        wctx.translate(asteroid.position.x, asteroid.position.y);
        wctx.rotate(asteroid.angle);

        wctx.fillStyle = '#3a3a3a';
        wctx.strokeStyle = '#5a5a5a';
        wctx.lineWidth = 1 / camera.effectiveZoom;

        wctx.beginPath();
        const verts = asteroid.vertices;
        wctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
          wctx.lineTo(verts[i].x, verts[i].y);
        }
        wctx.closePath();
        wctx.fill();
        wctx.stroke();

        wctx.restore();
      }
    }, camera);
  }

  renderProjectiles(projectiles, camera) {
    this.renderWorldLayer((ctx) => {
      for (const proj of projectiles) {
        if (!proj.active) continue;

        ctx.save();
        ctx.translate(proj.position.x, proj.position.y);
        ctx.rotate(proj.angle);

        const grad = ctx.createLinearGradient(-8, 0, 4, 0);
        grad.addColorStop(0, 'rgba(50, 150, 255, 0)');
        grad.addColorStop(0.5, 'rgba(100, 200, 255, 0.8)');
        grad.addColorStop(1, 'rgba(200, 240, 255, 1)');

        ctx.strokeStyle = grad;
        ctx.lineWidth = 3 / camera.effectiveZoom;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(2, 0, 2 / camera.effectiveZoom, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }, camera);
  }

  /**
   * @param {object[]} particles
   * @param {object} camera
   * @param {object|null} ship — primary hull for ship-local particles with no attachId
   * @param {{
   *   layer?: 'all'|'under'|'over',
   *   shipLocalUnder?: boolean,
   *   hulls?: Record<string, { x: number, y: number, angle: number }>,
   * }} [opts]
   *   layer under/over splits station-mouth occlusion; primary ship-local
   *   exhaust uses shipLocalUnder; attachId particles use p.underStation.
   */
  renderParticles(particles, camera, ship, opts = {}) {
    const layer = opts.layer || 'all';
    const shipLocalUnder = !!opts.shipLocalUnder;
    const hulls = opts.hulls || null;
    this.renderWorldLayer((ctx) => {
      const primaryCos = ship ? Math.cos(ship.angle) : 1;
      const primarySin = ship ? Math.sin(ship.angle) : 0;
      const primarySx = ship ? ship.position.x : 0;
      const primarySy = ship ? ship.position.y : 0;

      for (const p of particles) {
        const isShipLocal = p.space === 'ship';
        const under = isShipLocal
          ? p.attachId != null
            ? !!p.underStation
            : shipLocalUnder
          : !!p.underStation;
        if (layer === 'under' && !under) continue;
        if (layer === 'over' && under) continue;

        const lifeRatio = p.life / p.maxLife;
        let x = p.x;
        let y = p.y;
        if (isShipLocal) {
          let sx = primarySx;
          let sy = primarySy;
          let cos = primaryCos;
          let sin = primarySin;
          let havePose = !!ship;
          if (p.attachId != null) {
            const pose = hulls?.[p.attachId];
            if (!pose) continue;
            sx = pose.x;
            sy = pose.y;
            cos = Math.cos(pose.angle);
            sin = Math.sin(pose.angle);
            havePose = true;
          }
          if (!havePose) continue;
          x = sx + p.x * cos - p.y * sin;
          y = sy + p.x * sin + p.y * cos;
        }
        ctx.globalAlpha = lifeRatio;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, p.size * lifeRatio, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }, camera);
  }

  /**
   * Exhaust particles from equipped propulsion mounts (same path for all ships).
   * @param {object} ship
   * @param {import('../entities/Particle.js').ParticleSystem} particleSystem
   * @param {{ attachId?: string|null, underStation?: boolean, worldSpace?: boolean }} [opts]
   */
  emitThrusterParticles(ship, particleSystem, opts = {}) {
    emitMountExhaust(ship, particleSystem, opts);
  }
}
