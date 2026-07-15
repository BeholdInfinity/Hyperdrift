import { HARDPOINTS, THRUSTER_KEYS } from '../entities/ShipHardpoints.js';
import { SHIP, BLUEPRINT } from '../core/Constants.js';
import {
  drawModularShip,
  getShipHardpointsTable,
  getShipThrusterKeys,
} from '../ships/ShipRenderer.js';
import { hexToRgba } from '../ships/Themes.js';
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
    ctx.rotate(ship.angle);
    ctx.scale(camera.effectiveZoom * visualScale, camera.effectiveZoom * visualScale);

    this._drawShipBody(ctx, ship, view);

    ctx.restore();
  }

  /**
   * Draw ship in a world-space canvas (already camera-transformed).
   * Used by hangar occlusion so the hull can sit behind the north wall.
   */
  drawShipInWorld(ctx, ship) {
    this.drawShipBodyAt(ctx, ship, ship.position.x, ship.position.y);
  }

  /** Draw ship hull at a world offset (used by B2 elevator shaft clip pass). */
  /**
   * Draw ship hull at a world offset (used by B2 elevator shaft clip pass).
   * Pass an angled view for hangar / blueprint 2.5D.
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
   * Modular catalog draw (sections + items). Hangar can pass angled view.
   * Plumes draw first so the hull / thruster cup housing paints over their
   * base — the flame reads as emerging from the nozzle bore, not floating
   * on top of the deck (matches `HangarVisitorShips.drawVisitorShip` order).
   * @param {{ mode?: string, headingIndex?: number }} [view]
   */
  _drawShipBody(ctx, ship, view) {
    this._drawThrusterPlumes(ctx, ship);
    drawModularShip(ctx, ship, view || topDownView());
  }


  _drawPlume(ctx, x, y, exhaustAngle, intensity, len, color, width = 2, fadeRgba = 'rgba(50, 100, 150, 0)', lean = 0) {
    if (!intensity || intensity <= 0) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(exhaustAngle);
    ctx.globalAlpha = 0.5 + Math.min(intensity, 1.5) * 0.35;

    const plumeLen = len * Math.min(intensity, 1.5);
    // lean: -1..1-ish, tip offset in exhaust-local +Y (CCW from exhaust)
    const tipY = Math.max(-1.1, Math.min(1.1, lean)) * plumeLen * 0.52;
    const midX = plumeLen * 0.42;
    const midY = tipY * 0.28;

    const grad = ctx.createLinearGradient(0, 0, plumeLen, tipY * 0.35);
    grad.addColorStop(0, color);
    grad.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.3)'));
    grad.addColorStop(1, fadeRgba);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.quadraticCurveTo(midX, midY - width * 0.25, plumeLen, tipY);
    ctx.quadraticCurveTo(midX, midY + width * 0.25, 0, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Hermite smoothstep, t mapped from [edge0, edge1] → [0, 1]. */
  _smoothstep(edge0, edge1, t) {
    const x = Math.max(0, Math.min(1, (t - edge0) / (edge1 - edge0)));
    return x * x * (3 - 2 * x);
  }

  /**
   * Plume flow vs ship motion — readability + motion cue, not vacuum physics.
   *   cone / spray — leading flatten (cue + into-flow wash + mild spin)
   *   lean         — signed crosswind from relative wind (−velocity); bends
   *                  plume with the flow (sideways thrusters curve “aft”)
   *   lengthMul    — trailing stretch when wind blows along the exhaust
   */
  _computePlumeFlow(exhaustDirX, exhaustDirY, ship, localOx, localOy) {
    const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
    let cue = 0;
    let wash = 0;
    let lean = 0;
    let lengthMul = 1;

    if (speed > 8) {
      const inv = 1 / speed;
      const align = (exhaustDirX * ship.velocity.x + exhaustDirY * ship.velocity.y) * inv;
      const speedT = this._smoothstep(15, 380, speed);
      const lead = Math.max(0, align);
      cue = lead * speedT * 0.32;
      wash = this._smoothstep(0.4, 0.98, align) * speedT;

      // Relative wind W = −velocity (blows the plume downwind)
      const wx = -ship.velocity.x;
      const wy = -ship.velocity.y;
      const parallel = (wx * exhaustDirX + wy * exhaustDirY) * inv; // −1..1 along exhaust
      const perpX = wx * inv - parallel * exhaustDirX;
      const perpY = wy * inv - parallel * exhaustDirY;
      // Exhaust-local +Y = rotate exhaust 90° CCW
      const side = perpX * (-exhaustDirY) + perpY * exhaustDirX;
      lean = Math.max(-1, Math.min(1, side)) * speedT * 0.85;

      // Trailing: wind along exhaust → slightly longer proud plume
      const trail = Math.max(0, parallel);
      lengthMul = 1 + 0.22 * trail * speedT;
    }

    let spin = 0;
    const omega = ship.angularVelocity;
    if (Math.abs(omega) > 0.45) {
      const cos = Math.cos(ship.angle);
      const sin = Math.sin(ship.angle);
      const rx = localOx * cos - localOy * sin;
      const ry = localOx * sin + localOy * cos;
      const tx = -omega * ry;
      const ty = omega * rx;
      const tLen = Math.hypot(tx, ty);
      if (tLen > 8) {
        const tAlign = (exhaustDirX * tx + exhaustDirY * ty) / tLen;
        const spinT = this._smoothstep(0.45, 3.2, Math.abs(omega));
        spin = this._smoothstep(0.15, 0.9, tAlign) * spinT * 0.55;

        // Mild extra lean from spin “crosswind” at the nozzle
        const tInv = 1 / tLen;
        const twx = -tx;
        const twy = -ty;
        const tPar = (twx * exhaustDirX + twy * exhaustDirY) * tInv;
        const tPerpX = twx * tInv - tPar * exhaustDirX;
        const tPerpY = twy * tInv - tPar * exhaustDirY;
        const tSide = tPerpX * (-exhaustDirY) + tPerpY * exhaustDirX;
        lean += Math.max(-1, Math.min(1, tSide)) * spinT * 0.25;
      }
    }

    lean = Math.max(-1.15, Math.min(1.15, lean));
    const cone = Math.max(0, Math.min(1, cue * 0.55 + wash * 0.5 + spin * 0.35));
    const spray = Math.max(0, Math.min(1, cue * 0.2 + wash * 0.9 + spin));
    return { cone, spray, lean, lengthMul };
  }

  _thrusterMounts(ship) {
    const table = getShipHardpointsTable(ship);
    const keys = getShipThrusterKeys(ship);
    const list = keys.length ? keys : THRUSTER_KEYS;
    return list.map((key) => {
      const hp = table[key] || HARDPOINTS[key];
      return hp ? { key, ...hp } : null;
    }).filter(Boolean);
  }

  _drawThrusterPlumes(ctx, ship) {
    const t = ship.thrusters;
    const forward = ship.getForward();
    const table = getShipHardpointsTable(ship);
    const eng = table.mainEngine || HARDPOINTS.mainEngine;
    const def = ship.shipDef;

    const defaultBlue = 'rgba(100, 180, 255, 0.7)';
    const defaultBlueFade = 'rgba(40, 90, 160, 0)';
    const defaultOrange = 'rgba(255, 160, 70, 0.9)';
    const defaultOrangeAb = 'rgba(255, 200, 100, 0.95)';
    const defaultOrangeFade = 'rgba(180, 80, 30, 0)';

    if (t.mainEngine > 0 || t.retroBurn) {
      const mounts = def?.resolveMounts?.();
      const engKeys =
        typeof def?.mainEngineKeys === 'function'
          ? def.mainEngineKeys()
          : mounts?.mainEngine?.item
            ? ['mainEngine']
            : [];
      const keys =
        engKeys.length > 0
          ? engKeys
          : table.mainEngine
            ? ['mainEngine']
            : [];
      for (const engKey of keys) {
        const engHp = table[engKey] || (engKey === 'mainEngine' ? eng : null);
        if (!engHp) continue;
        if (mounts && mounts[engKey] && !mounts[engKey].item) continue;
        const intensity = t.mainEngine || 0.5;
        const isAfterburner = t.afterburner > 0;
        let len = isAfterburner ? 54 : 30;
        let width = isAfterburner ? 3.75 : 6.75;
        const engPal = def?.paletteForMount?.(engKey);
        const accent = engPal?.colors?.accent || engPal?.colors?.trim;
        const color = accent
          ? hexToRgba(accent, isAfterburner ? 0.95 : 0.9)
          : isAfterburner
            ? defaultOrangeAb
            : defaultOrange;
        const fade = accent ? hexToRgba(accent, 0) : defaultOrangeFade;

        const exhaustDir = forward.clone().scale(-1);
        const flow = this._computePlumeFlow(
          exhaustDir.x,
          exhaustDir.y,
          ship,
          engHp.x,
          engHp.y
        );
        len *= flow.lengthMul * (1 - 0.48 * flow.cone);
        width *= 1 + 0.65 * flow.cone;

        this._drawPlume(
          ctx,
          engHp.x,
          engHp.y,
          engHp.angle,
          intensity,
          len,
          color,
          width,
          fade,
          flow.lean
        );
      }
    }

    for (const m of this._thrusterMounts(ship)) {
      const intensity = t[m.key];
      if (!intensity) continue;

      const dirX = Math.cos(ship.angle + m.angle);
      const dirY = Math.sin(ship.angle + m.angle);
      const flow = this._computePlumeFlow(dirX, dirY, ship, m.x, m.y);

      let len = (8 + intensity * 3.5) * SHIP.THRUSTER_PLUME_SCALE;
      let width = (1.15 + intensity * 0.9) * SHIP.THRUSTER_PLUME_SCALE;
      len *= flow.lengthMul * (1 - 0.48 * flow.cone);
      width *= 1 + 0.7 * flow.cone;

      const pal = def?.paletteForMount?.(m.key);
      const trim = pal?.colors?.trim || pal?.colors?.accent;
      const color = trim ? hexToRgba(trim, 0.7) : defaultBlue;
      const fade = trim ? hexToRgba(trim, 0) : defaultBlueFade;

      this._drawPlume(ctx, m.x, m.y, m.angle, intensity, len, color, width, fade, flow.lean);
    }
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

  renderParticles(particles, camera, ship) {
    this.renderWorldLayer((ctx) => {
      const cos = ship ? Math.cos(ship.angle) : 1;
      const sin = ship ? Math.sin(ship.angle) : 0;
      const sx = ship ? ship.position.x : 0;
      const sy = ship ? ship.position.y : 0;

      for (const p of particles) {
        const lifeRatio = p.life / p.maxLife;
        let x = p.x;
        let y = p.y;
        if (p.space === 'ship' && ship) {
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

  emitThrusterParticles(ship, particleSystem) {
    const t = ship.thrusters;
    const forward = ship.getForward();
    const table = getShipHardpointsTable(ship);
    const eng = table.mainEngine || HARDPOINTS.mainEngine;

    if (t.mainEngine > 0 || t.retroBurn) {
      const intensity = t.mainEngine || 0.5;
      const isAfterburner = t.afterburner > 0;
      const exhaustDir = forward.clone().scale(-1);
      const engPal = ship.shipDef?.paletteForMount?.('mainEngine');
      const accent = engPal?.colors?.accent || engPal?.colors?.trim;
      const color = accent
        ? hexToRgba(accent, isAfterburner ? 0.85 : 0.7)
        : isAfterburner
          ? 'rgba(255, 200, 100, 0.85)'
          : 'rgba(255, 150, 70, 0.7)';
      const flow = this._computePlumeFlow(exhaustDir.x, exhaustDir.y, ship, eng.x, eng.y);
      particleSystem.emitExhaustLocal(
        eng.x, eng.y, eng.angle,
        intensity * (isAfterburner ? 1.4 : 1) * (1 - 0.22 * flow.spray),
        color,
        isAfterburner ? 0.28 : 0.4 + 0.42 * flow.spray,
        {
          speedScale: flow.lengthMul * (1 - 0.78 * flow.spray),
          lifeScale: flow.lengthMul * (1 - 0.68 * flow.spray),
          leanAngle: flow.lean * 0.55,
        }
      );
    }

    for (const m of this._thrusterMounts(ship)) {
      const intensity = t[m.key];
      if (!intensity) continue;

      const dirX = Math.cos(ship.angle + m.angle);
      const dirY = Math.sin(ship.angle + m.angle);
      const flow = this._computePlumeFlow(dirX, dirY, ship, m.x, m.y);
      const pal = ship.shipDef?.paletteForMount?.(m.key);
      const trim = pal?.colors?.trim || pal?.colors?.accent;
      const color = trim ? hexToRgba(trim, 0.55) : 'rgba(100, 180, 255, 0.55)';

      particleSystem.emitExhaustLocal(
        m.x, m.y, m.angle,
        intensity * 0.55 * (1 - 0.18 * flow.spray),
        color,
        0.4 + 0.45 * flow.spray,
        {
          speedScale: flow.lengthMul * (1 - 0.8 * flow.spray),
          lifeScale: flow.lengthMul * (1 - 0.7 * flow.spray),
          leanAngle: flow.lean * 0.55,
        }
      );
    }
  }
}
