import { BLUEPRINT } from '../core/Constants.js';
import { drawModularShip } from '../ships/ShipRenderer.js';
import { emitMountExhaust } from '../ships/PlumeDraw.js';
import { topDownView } from '../ships/ShipViews.js';
import { drawModuleSurface, drawCrackOverlay, getMaterialPattern } from './AsteroidSurface.js';
import { oreFillStyle } from './MiningLootCatalog.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.width = 0;
    this.height = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.viewportRadius = 0;
    /** Radar display ring band (space mode only). */
    this.radarBand = 0;
    this.radarOuterRadius = 0;
    /** POI waypoint rim outer radius (reaches the 16:9 frame top/bottom). */
    this.poiOuterRadius = 0;
    /** Largest 16:9 cockpit content box; {x,y,w,h} or null outside space mode. */
    this.hudRect = null;
    this.time = 0;
    /** @type {'default'|'blueprint'|'settings'} */
    this.layoutMode = 'default';
  }

  setLayoutMode(mode) {
    const next =
      mode === 'blueprint' ? 'blueprint' : mode === 'settings' ? 'settings' : 'default';
    this.layoutMode = next;
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
      this.radarBand = 0;
      this.radarOuterRadius = this.viewportRadius;
      this.poiOuterRadius = this.viewportRadius;
      this.hudRect = null;
    } else if (this.layoutMode === 'settings') {
      const panelReserve = Math.min(720, Math.max(450, this.width * 0.69));
      const rightW = Math.max(160, this.width - panelReserve);
      const pad = 28;
      this.centerX = panelReserve + rightW * 0.5;
      this.centerY = this.height * 0.5;
      this.viewportRadius = Math.max(
        80,
        Math.min((rightW - pad * 2) * 0.5, (this.height - pad * 2) * 0.5)
      );
      this.radarBand = 0;
      this.radarOuterRadius = this.viewportRadius;
      this.poiOuterRadius = this.viewportRadius;
      this.hudRect = null;
    } else {
      this.centerY = this.height / 2;
      // 16:9 cockpit content box, letterboxed when the window isn't 16:9.
      const aspect = 16 / 9;
      let hw;
      let hh;
      if (this.width / this.height > aspect) {
        hh = this.height;
        hw = hh * aspect;
      } else {
        hw = this.width;
        hh = hw / aspect;
      }
      this.hudRect = {
        x: this.centerX - hw / 2,
        y: this.centerY - hh / 2,
        w: hw,
        h: hh,
      };
      // Rings size to the frame's short axis so the POI rim can reach the
      // 16:9 frame's top/bottom edge (fills the old ~2% margin). On a 16:9-or-
      // wider window this equals the previous window-based sizing.
      const frameMin = hh;
      const outer = (frameMin / 2) * (1 - 0.02);
      this.radarBand = Math.max(34, Math.round(frameMin * 0.05));
      this.viewportRadius = outer - this.radarBand;
      this.radarOuterRadius = outer;
      this.poiOuterRadius = hh / 2;
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
   * Draw ship hull at a world offset (used by elevator shaft clip pass).
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

  /**
   * Simple shaded discs for shepherd moons (kinematic POIs).
   * @param {{ x: number, y: number, radius: number }[]} moons
   */
  renderShepherdMoons(moons, camera) {
    if (!moons?.length) return;
    const zoom = camera.effectiveZoom || 1;
    const cx = camera.position?.x ?? 0;
    const cy = camera.position?.y ?? 0;
    const viewR = this.viewportRadius / zoom + 40000;
    const viewR2 = viewR * viewR;

    this.renderWorldLayer((ctx) => {
      for (const moon of moons) {
        const dx = moon.x - cx;
        const dy = moon.y - cy;
        if (dx * dx + dy * dy > viewR2) continue;
        const r = Math.max(80, moon.radius || 4000);
        ctx.save();
        const grad = ctx.createRadialGradient(
          moon.x - r * 0.35,
          moon.y - r * 0.35,
          r * 0.1,
          moon.x,
          moon.y,
          r
        );
        grad.addColorStop(0, 'rgba(190, 195, 205, 0.95)');
        grad.addColorStop(0.55, 'rgba(110, 118, 130, 0.92)');
        grad.addColorStop(1, 'rgba(55, 60, 70, 0.88)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(moon.x, moon.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220, 225, 235, 0.35)';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
        ctx.restore();
      }
    }, camera);
  }

  renderAsteroids(asteroids, camera) {
    const zoom = Math.max(camera.effectiveZoom, 0.001);
    const margin = 140 / zoom;
    const cx = camera.position?.x ?? 0;
    const cy = camera.position?.y ?? 0;
    const viewR = this.viewportRadius / zoom + margin;
    const viewR2 = viewR * viewR;

    this.renderWorldLayer((wctx) => {
      for (const asteroid of asteroids) {
        if (!asteroid.active) continue;

        const dx = asteroid.position.x - cx;
        const dy = asteroid.position.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > viewR2) continue;

        wctx.save();
        wctx.translate(asteroid.position.x, asteroid.position.y);
        wctx.rotate(asteroid.angle);

        const modules = asteroid.modules?.length
          ? asteroid.activeModules?.() ?? asteroid.modules
          : null;

        if (modules?.length) {
          const detail = zoom > 0.15;
          if (modules.length > 1) {
            // Draw as a single composite outline to hide module seams and present
            // the rock as one large, oddly-shaped asteroid.
            const verts = asteroid.vertices;
            const tag = asteroid.compositionTag ?? (typeof asteroid.composition === 'string' ? asteroid.composition : null);
            const seed = asteroid.lootSeed ?? asteroid.seed ?? 0;
            const pattern = detail && zoom > 0.35 ? getMaterialPattern(tag, seed) : null;

            if (verts?.length) {
              wctx.beginPath();
              wctx.moveTo(verts[0].x, verts[0].y);
              for (let i = 1; i < verts.length; i++) wctx.lineTo(verts[i].x, verts[i].y);
              wctx.closePath();

              if (pattern) {
                wctx.fillStyle = pattern;
              } else {
                wctx.fillStyle = asteroid.fillStyle?.() ?? '#3a3a3a';
              }
              wctx.fill();

              wctx.strokeStyle = asteroid.strokeStyle?.() ?? '#5a5a5a';
              wctx.lineWidth = Math.max(0.6, 1.1 / Math.max(zoom, 0.001));
              wctx.stroke();
            }

            // Still show crack overlays for modules being mined.
            for (const mod of modules) {
              if (mod.mineState === 'cracking' && (mod.crackProgress ?? 0) > 0) {
                drawCrackOverlay(wctx, mod, mod.crackProgress, zoom);
              }
            }
          } else {
            for (const mod of modules) {
              drawModuleSurface(wctx, mod, zoom, detail);
              if (mod.mineState === 'cracking' && (mod.crackProgress ?? 0) > 0) {
                drawCrackOverlay(wctx, mod, mod.crackProgress, zoom);
              }
            }
          }
        } else {
          wctx.fillStyle = asteroid.fillStyle?.() ?? '#3a3a3a';
          wctx.strokeStyle = asteroid.strokeStyle?.() ?? '#5a5a5a';
          wctx.lineWidth = 1 / zoom;

          wctx.beginPath();
          const verts = asteroid.vertices;
          if (verts?.length) {
            wctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < verts.length; i++) {
              wctx.lineTo(verts[i].x, verts[i].y);
            }
            wctx.closePath();
            wctx.fill();
            wctx.stroke();
          }
        }

        wctx.restore();
      }
    }, camera);
  }

  renderMiningDrops(drops, camera) {
    if (!drops?.size && !Array.isArray(drops)) return;
    const list = drops instanceof Set ? drops : drops;
    const zoom = Math.max(camera.effectiveZoom, 0.001);
    this.renderWorldLayer((ctx) => {
      for (const drop of list) {
        if (!drop?.active) continue;
        const r = drop.radius ?? 5;
        ctx.save();
        ctx.translate(drop.position.x, drop.position.y);
        ctx.fillStyle = oreFillStyle(drop.oreType);
        ctx.strokeStyle = 'rgba(255, 220, 140, 0.55)';
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }, camera);
  }

  renderGrappleCable(cable, camera) {
    if (!cable) return;
    const zoom = Math.max(camera.effectiveZoom, 0.001);
    this.renderWorldLayer((ctx) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(180, 200, 220, 0.85)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(cable.x1, cable.y1);
      ctx.lineTo(cable.x2, cable.y2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 200, 80, 0.95)';
      ctx.beginPath();
      ctx.arc(cable.x2, cable.y2, 3 / zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }, camera);
  }

  renderProjectiles(projectiles, camera) {
    const zoom = Math.max(camera.effectiveZoom, 0.001);
    const lw = 3 / zoom;
    const tipR = 2 / zoom;
    this.renderWorldLayer((ctx) => {
      ctx.strokeStyle = 'rgba(140, 215, 255, 0.92)';
      ctx.lineWidth = lw;
      ctx.fillStyle = '#fff';
      for (const proj of projectiles) {
        if (!proj.active) continue;

        ctx.save();
        ctx.translate(proj.position.x, proj.position.y);
        ctx.rotate(proj.angle);
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(4, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(2, 0, tipR, 0, Math.PI * 2);
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

      /** @type {Map<string, number[]>} color|alpha → [x,y,r,...] */
      const batches = new Map();

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

        const r = p.size * lifeRatio;
        if (r <= 0) continue;
        const alphaKey = Math.round(lifeRatio * 20) / 20;
        const key = `${p.color}|${alphaKey}`;
        let batch = batches.get(key);
        if (!batch) {
          batch = [];
          batches.set(key, batch);
        }
        batch.push(x, y, r);
      }

      for (const [key, pts] of batches) {
        const sep = key.lastIndexOf('|');
        ctx.fillStyle = key.slice(0, sep);
        ctx.globalAlpha = parseFloat(key.slice(sep + 1));
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 3) {
          const x = pts[i];
          const y = pts[i + 1];
          const r = pts[i + 2];
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
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
