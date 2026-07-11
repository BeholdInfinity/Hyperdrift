import { HARDPOINTS, THRUSTER_KEYS } from '../entities/ShipHardpoints.js';
import { SHIP } from '../core/Constants.js';

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
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.viewportRadius = Math.min(this.width, this.height) / 2 * (1 - 0.08);
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

  renderShip(ship, camera) {
    const screen = camera.getShipScreenPosition(
      this.centerX,
      this.centerY,
      ship.position
    );
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(ship.angle);
    ctx.scale(camera.effectiveZoom, camera.effectiveZoom);

    this._drawShipHull(ctx);
    this._drawHardpointHardware(ctx, ship);
    this._drawThrusterPlumes(ctx, ship);
    this._drawDorsalTurret(ctx, ship);
    this._drawMiningLaserBeam(ctx, ship);

    if (ship.muzzleFlash > 0) {
      this._drawTurretMuzzleBloom(ctx, ship);
    }

    ctx.restore();
  }

  _drawShipHull(ctx) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.2;

    // Main body — tapers forward, flares aft (readable fore/aft)
    ctx.fillStyle = '#1e2d3d';
    ctx.strokeStyle = '#5a8ab0';
    ctx.beginPath();
    ctx.moveTo(10, -7);
    ctx.lineTo(4, -9);
    ctx.lineTo(-6, -11);
    ctx.lineTo(-14, -13.5);
    ctx.lineTo(-16, -11);
    ctx.lineTo(-16, 11);
    ctx.lineTo(-14, 13.5);
    ctx.lineTo(-6, 11);
    ctx.lineTo(4, 9);
    ctx.lineTo(10, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dorsal panel strip
    ctx.fillStyle = '#2a3f52';
    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.lineTo(-8, -5);
    ctx.lineTo(-8, 5);
    ctx.lineTo(6, 4);
    ctx.closePath();
    ctx.fill();

    // Bridge / cockpit module (narrower than aft)
    ctx.fillStyle = '#2c4558';
    ctx.strokeStyle = '#7eb6d8';
    ctx.beginPath();
    ctx.moveTo(20, -4);
    ctx.lineTo(12, -6.5);
    ctx.lineTo(8, -5.5);
    ctx.lineTo(8, 5.5);
    ctx.lineTo(12, 6.5);
    ctx.lineTo(20, 4);
    ctx.lineTo(21.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Canopy glass
    ctx.fillStyle = '#4a9fd4';
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(19, -2);
    ctx.lineTo(14, -3.2);
    ctx.lineTo(14, 3.2);
    ctx.lineTo(19, 2);
    ctx.lineTo(19.8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Wide aft engineering bay (widest mass — triangle cue)
    ctx.fillStyle = '#243646';
    ctx.strokeStyle = '#6a90a8';
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(-14, -14);
    ctx.lineTo(-20, -7);
    ctx.lineTo(-20, 7);
    ctx.lineTo(-14, 14);
    ctx.lineTo(-8, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Engine housing ring
    ctx.fillStyle = '#1a2834';
    ctx.strokeStyle = '#c47840';
    ctx.beginPath();
    ctx.ellipse(-17.5, 0, 3.2, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wide side sponsons at aft
    ctx.fillStyle = '#253848';
    ctx.beginPath();
    ctx.moveTo(-2, -11);
    ctx.lineTo(-12, -13.5);
    ctx.lineTo(-12, -10.5);
    ctx.lineTo(-2, -9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2, 11);
    ctx.lineTo(-12, 13.5);
    ctx.lineTo(-12, 10.5);
    ctx.lineTo(-2, 9);
    ctx.closePath();
    ctx.fill();
  }

  _drawHardpointHardware(ctx, ship) {
    const eng = HARDPOINTS.mainEngine;
    const laser = HARDPOINTS.miningLaser;

    // Main engine bell (shared cruise / afterburner origin)
    ctx.fillStyle = '#121c24';
    ctx.strokeStyle = '#e09050';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(eng.x + 2, -4.5);
    ctx.lineTo(eng.x - 1.5, -6);
    ctx.lineTo(eng.x - 1.5, 6);
    ctx.lineTo(eng.x + 2, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0a1016';
    ctx.beginPath();
    ctx.ellipse(eng.x - 0.5, 0, 1.2, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Thruster cups at each maneuver hardpoint
    for (const key of THRUSTER_KEYS) {
      const hp = HARDPOINTS[key];
      ctx.save();
      ctx.translate(hp.x, hp.y);
      ctx.rotate(hp.angle);
      ctx.fillStyle = '#0e1620';
      ctx.strokeStyle = '#6aa0c8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -1.6);
      ctx.lineTo(2.4, -2.2);
      ctx.lineTo(2.4, 2.2);
      ctx.lineTo(0, 1.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Mining laser head — aims within forward arc
    ctx.save();
    ctx.translate(laser.x, laser.y);
    ctx.rotate(ship.miningLaserRelAngle);
    ctx.fillStyle = '#2a4050';
    ctx.strokeStyle = '#7ec8a0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3.5, -2.1);
    ctx.lineTo(3, -1.5);
    ctx.lineTo(3, 1.5);
    ctx.lineTo(-3.5, 2.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a3028';
    ctx.beginPath();
    ctx.arc(3.2, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawDorsalTurret(ctx, ship) {
    const outer = SHIP.TURRET_BASE_OUTER;
    const mid = SHIP.TURRET_BASE_MID;
    const inner = SHIP.TURRET_BASE_INNER;
    const localAim = ship.getTurretLocalAngle();
    const recoil = ship.turretRecoil * SHIP.TURRET_RECOIL_DIST;

    // Concentric base rings (ship-fixed) — match hull blue outline
    ctx.strokeStyle = '#5a8ab0';
    ctx.lineWidth = 1.2;
    ctx.fillStyle = 'rgba(20, 32, 42, 0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, mid, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal spokes outer→mid
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.moveTo(Math.cos(a) * mid, Math.sin(a) * mid);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    }
    ctx.stroke();

    // Inner pie wedges
    ctx.beginPath();
    ctx.arc(0, 0, inner, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
    }
    ctx.stroke();

    // Rotating sleeve + recoiling barrel
    ctx.save();
    ctx.rotate(localAim);

    // Grey housing (outlined; black gun is fill-only)
    ctx.fillStyle = '#6a7278';
    ctx.strokeStyle = '#5a8ab0';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    const sleeveInner = inner + 0.4;
    const sleeveOuter = outer - 0.5;
    const halfW = 2.4;
    ctx.moveTo(sleeveInner, -halfW);
    ctx.lineTo(sleeveOuter, -halfW);
    ctx.lineTo(sleeveOuter, halfW);
    ctx.lineTo(sleeveInner, halfW);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Rounded against inner disc
    ctx.beginPath();
    ctx.arc(0, 0, sleeveInner, -Math.asin(halfW / sleeveInner), Math.asin(halfW / sleeveInner));
    ctx.lineTo(sleeveInner, -halfW);
    ctx.closePath();
    ctx.fill();

    // Black barrel + muzzle (recoil toward center) — no blue outline
    const barrelStart = sleeveInner + 0.5;
    const barrelEnd = SHIP.TURRET_BARREL_LENGTH - recoil;
    const muzzleLen = 3.4;
    const muzzleEnd = barrelEnd + SHIP.TURRET_MUZZLE_EXTRA;
    ctx.fillStyle = '#0a0c0e';
    ctx.fillRect(barrelStart, -1.35, Math.max(0.5, barrelEnd - barrelStart), 2.7);
    ctx.fillRect(muzzleEnd - muzzleLen, -2.1, muzzleLen, 4.2);

    ctx.restore();
  }

  _drawTurretMuzzleBloom(ctx, ship) {
    const localAim = ship.getTurretLocalAngle();
    const recoil = ship.turretRecoil * SHIP.TURRET_RECOIL_DIST;
    const tipX = SHIP.TURRET_BARREL_LENGTH + SHIP.TURRET_MUZZLE_EXTRA - recoil;
    const flashAlpha = Math.min(1, ship.muzzleFlash / 0.06);

    ctx.save();
    ctx.rotate(localAim);
    ctx.fillStyle = `rgba(150, 220, 255, ${flashAlpha})`;
    ctx.beginPath();
    ctx.arc(tipX + 1, 0, 5 * flashAlpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 240, 200, ${flashAlpha * 0.85})`;
    ctx.beginPath();
    ctx.arc(tipX + 2.5, 0, 2.5 * flashAlpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawMiningLaserBeam(ctx, ship) {
    if (!ship.miningLaserFiring) return;
    const laser = HARDPOINTS.miningLaser;

    ctx.save();
    ctx.translate(laser.x, laser.y);
    ctx.rotate(ship.miningLaserRelAngle);

    const len = ship.miningLaserBeamLength || SHIP.MINING_LASER_RANGE;
    const grad = ctx.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, 'rgba(120, 255, 180, 0.85)');
    grad.addColorStop(0.4, 'rgba(80, 220, 140, 0.45)');
    grad.addColorStop(1, 'rgba(40, 180, 100, 0)');

    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(200, 255, 220, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(len * 0.7, 0);
    ctx.stroke();

    ctx.restore();
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

  _thrusterMounts() {
    return THRUSTER_KEYS.map((key) => ({ key, ...HARDPOINTS[key] }));
  }

  _drawThrusterPlumes(ctx, ship) {
    const t = ship.thrusters;
    const forward = ship.getForward();
    const eng = HARDPOINTS.mainEngine;

    const THRUSTER_BLUE = 'rgba(100, 180, 255, 0.7)';
    const THRUSTER_FADE = 'rgba(40, 90, 160, 0)';
    const ENGINE_ORANGE = 'rgba(255, 160, 70, 0.9)';
    const ENGINE_ORANGE_AB = 'rgba(255, 200, 100, 0.95)';
    const ENGINE_FADE = 'rgba(180, 80, 30, 0)';

    if (t.mainEngine > 0 || t.retroBurn) {
      const intensity = t.mainEngine || 0.5;
      const isAfterburner = t.afterburner > 0;
      let len = isAfterburner ? 54 : 30;
      let width = isAfterburner ? 3.75 : 6.75;
      const color = isAfterburner ? ENGINE_ORANGE_AB : ENGINE_ORANGE;

      const exhaustDir = forward.clone().scale(-1);
      const flow = this._computePlumeFlow(exhaustDir.x, exhaustDir.y, ship, eng.x, eng.y);
      len *= flow.lengthMul * (1 - 0.48 * flow.cone);
      width *= 1 + 0.65 * flow.cone;

      this._drawPlume(ctx, eng.x, eng.y, eng.angle, intensity, len, color, width, ENGINE_FADE, flow.lean);
    }

    for (const m of this._thrusterMounts()) {
      const intensity = t[m.key];
      if (!intensity) continue;

      const dirX = Math.cos(ship.angle + m.angle);
      const dirY = Math.sin(ship.angle + m.angle);
      const flow = this._computePlumeFlow(dirX, dirY, ship, m.x, m.y);

      let len = 15 + intensity * 6;
      let width = 2 + intensity * 1.65;
      len *= flow.lengthMul * (1 - 0.48 * flow.cone);
      width *= 1 + 0.7 * flow.cone;

      this._drawPlume(ctx, m.x, m.y, m.angle, intensity, len, THRUSTER_BLUE, width, THRUSTER_FADE, flow.lean);
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
    const eng = HARDPOINTS.mainEngine;

    if (t.mainEngine > 0 || t.retroBurn) {
      const intensity = t.mainEngine || 0.5;
      const isAfterburner = t.afterburner > 0;
      const exhaustDir = forward.clone().scale(-1);
      const color = isAfterburner ? 'rgba(255, 200, 100, 0.85)' : 'rgba(255, 150, 70, 0.7)';
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

    for (const m of this._thrusterMounts()) {
      const intensity = t[m.key];
      if (!intensity) continue;

      const dirX = Math.cos(ship.angle + m.angle);
      const dirY = Math.sin(ship.angle + m.angle);
      const flow = this._computePlumeFlow(dirX, dirY, ship, m.x, m.y);

      particleSystem.emitExhaustLocal(
        m.x, m.y, m.angle,
        intensity * 0.55 * (1 - 0.18 * flow.spray),
        'rgba(100, 180, 255, 0.55)',
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
