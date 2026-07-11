import { HARDPOINTS, THRUSTER_KEYS } from '../entities/ShipHardpoints.js';

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
    this._drawHardpointHardware(ctx);
    this._drawThrusterPlumes(ctx, ship);

    const gun = HARDPOINTS.gun;
    if (ship.muzzleFlash > 0) {
      const flashAlpha = ship.muzzleFlash / 0.05;
      ctx.fillStyle = `rgba(150, 220, 255, ${flashAlpha})`;
      ctx.beginPath();
      ctx.arc(gun.x, gun.y, 7 * flashAlpha, 0, Math.PI * 2);
      ctx.fill();
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

  _drawHardpointHardware(ctx) {
    const eng = HARDPOINTS.mainEngine;
    const gun = HARDPOINTS.gun;

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

    // Forward gun barrel
    ctx.fillStyle = '#3a5060';
    ctx.strokeStyle = '#9ec8e8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gun.x - 5, -1.4);
    ctx.lineTo(gun.x + 1.5, -1.1);
    ctx.lineTo(gun.x + 1.5, 1.1);
    ctx.lineTo(gun.x - 5, 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1a2834';
    ctx.beginPath();
    ctx.arc(gun.x + 0.5, 0, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawPlume(ctx, x, y, exhaustAngle, intensity, len, color, width = 2, fadeRgba = 'rgba(50, 100, 150, 0)') {
    if (!intensity || intensity <= 0) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(exhaustAngle);
    ctx.globalAlpha = 0.5 + Math.min(intensity, 1.5) * 0.35;

    const plumeLen = len * Math.min(intensity, 1.5);
    const grad = ctx.createLinearGradient(0, 0, plumeLen, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.3)'));
    grad.addColorStop(1, fadeRgba);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(plumeLen, 0);
    ctx.lineTo(0, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Visual cheat: when exhaust fires into ship motion (leading face),
   * shorten/widen the plume so it does not stream under the hull.
   */
  _computeRamFactor(exhaustDirX, exhaustDirY, ship, localOx, localOy) {
    const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
    let ram = 0;

    if (speed > 30) {
      const inv = 1 / speed;
      const align = (exhaustDirX * ship.velocity.x + exhaustDirY * ship.velocity.y) * inv;
      const speedFactor = Math.min(1, (speed - 30) / 220);
      ram = Math.max(0, Math.min(1, ((align - 0.15) / 0.85) * speedFactor));
    }

    const omega = ship.angularVelocity;
    if (Math.abs(omega) > 0.4) {
      const cos = Math.cos(ship.angle);
      const sin = Math.sin(ship.angle);
      const wx = localOx * cos - localOy * sin;
      const wy = localOx * sin + localOy * cos;
      const tx = -omega * wy;
      const ty = omega * wx;
      const tLen = Math.hypot(tx, ty);
      if (tLen > 8) {
        const tAlign = (exhaustDirX * tx + exhaustDirY * ty) / tLen;
        const spinRam = Math.max(0, Math.min(1, ((tAlign - 0.2) / 0.8) * Math.min(1, (Math.abs(omega) - 0.4) / 3)));
        ram = Math.max(ram, spinRam * 0.7);
      }
    }

    return ram;
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
      const ram = this._computeRamFactor(exhaustDir.x, exhaustDir.y, ship, eng.x, eng.y);
      len *= 1 - 0.72 * ram;
      width *= 1 + 0.85 * ram;

      this._drawPlume(ctx, eng.x, eng.y, eng.angle, intensity, len, color, width, ENGINE_FADE);
    }

    for (const m of this._thrusterMounts()) {
      const intensity = t[m.key];
      if (!intensity) continue;

      const dirX = Math.cos(ship.angle + m.angle);
      const dirY = Math.sin(ship.angle + m.angle);
      const ram = this._computeRamFactor(dirX, dirY, ship, m.x, m.y);

      let len = 15 + intensity * 6;
      let width = 2 + intensity * 1.65;
      len *= 1 - 0.72 * ram;
      width *= 1 + 0.9 * ram;

      this._drawPlume(ctx, m.x, m.y, m.angle, intensity, len, THRUSTER_BLUE, width, THRUSTER_FADE);
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
      const ram = this._computeRamFactor(exhaustDir.x, exhaustDir.y, ship, eng.x, eng.y);
      particleSystem.emitExhaustLocal(
        eng.x, eng.y, eng.angle,
        intensity * (isAfterburner ? 1.4 : 1) * (1 - 0.35 * ram),
        color,
        isAfterburner ? 0.28 : 0.4 + 0.35 * ram,
        {
          speedScale: 1 - 0.65 * ram,
          lifeScale: 1 - 0.55 * ram,
        }
      );
    }

    for (const m of this._thrusterMounts()) {
      const intensity = t[m.key];
      if (!intensity) continue;

      const dirX = Math.cos(ship.angle + m.angle);
      const dirY = Math.sin(ship.angle + m.angle);
      const ram = this._computeRamFactor(dirX, dirY, ship, m.x, m.y);

      particleSystem.emitExhaustLocal(
        m.x, m.y, m.angle,
        intensity * 0.55 * (1 - 0.3 * ram),
        'rgba(100, 180, 255, 0.55)',
        0.4 + 0.4 * ram,
        {
          speedScale: 1 - 0.7 * ram,
          lifeScale: 1 - 0.6 * ram,
        }
      );
    }
  }
}
