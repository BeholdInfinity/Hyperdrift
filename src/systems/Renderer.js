import { SHIP } from '../core/Constants.js';
import { Vec2 } from '../utils/MathUtils.js';

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
    const screen = camera.getShipScreenPosition(this.centerX, this.centerY);
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(ship.angle);
    ctx.scale(camera.effectiveZoom, camera.effectiveZoom);

    this._drawThrusters(ctx, ship);

    ctx.fillStyle = '#1a2a3a';
    ctx.strokeStyle = '#64b4ff';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(SHIP.WIDTH / 2, 0);
    ctx.lineTo(-SHIP.WIDTH / 3, -SHIP.HEIGHT / 2);
    ctx.lineTo(-SHIP.WIDTH / 4, 0);
    ctx.lineTo(-SHIP.WIDTH / 3, SHIP.HEIGHT / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#64b4ff';
    ctx.beginPath();
    ctx.arc(SHIP.WIDTH / 2 - 2, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    if (ship.muzzleFlash > 0) {
      const flashAlpha = ship.muzzleFlash / 0.05;
      ctx.fillStyle = `rgba(150, 220, 255, ${flashAlpha})`;
      ctx.beginPath();
      ctx.arc(SHIP.CANNON_OFFSET, 0, 8 * flashAlpha, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawPlume(ctx, x, y, exhaustAngle, intensity, len, color, width = 2) {
    if (!intensity || intensity <= 0) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(exhaustAngle);
    ctx.globalAlpha = 0.5 + intensity * 0.4;

    const plumeLen = len * intensity;
    const grad = ctx.createLinearGradient(0, 0, plumeLen, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.3)'));
    grad.addColorStop(1, 'rgba(50, 100, 150, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(plumeLen, 0);
    ctx.lineTo(0, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawThrusters(ctx, ship) {
    const t = ship.thrusters;
    const w = SHIP.WIDTH;
    const h = SHIP.HEIGHT;

    if (t.mainEngine > 0 || t.retroBurn) {
      const intensity = t.mainEngine;
      const isAfterburner = t.afterburner > 0;
      const len = isAfterburner ? 30 : 20;
      const color = isAfterburner ? 'rgba(100, 180, 255, 0.9)' : 'rgba(80, 150, 255, 0.75)';
      const exhaustAngle = t.retroBurn ? 0 : Math.PI;
      this._drawPlume(ctx, -w / 4, 0, exhaustAngle, intensity, len, color, isAfterburner ? 6 : 4);
    }

    const maneuver = [
      { active: t.aft, x: -w / 4, y: 0, angle: Math.PI, color: 'rgba(100, 200, 150, 0.65)' },
      { active: t.nose, x: w / 4, y: 0, angle: 0, color: 'rgba(100, 200, 150, 0.65)' },
      { active: t.starboard, x: 0, y: -h / 3, angle: -Math.PI / 2, color: 'rgba(100, 200, 150, 0.65)' },
      { active: t.port, x: 0, y: h / 3, angle: Math.PI / 2, color: 'rgba(100, 200, 150, 0.65)' },
      { active: t.brakeAft, x: -w / 4, y: 0, angle: Math.PI, color: 'rgba(255, 150, 80, 0.7)' },
      { active: t.brakeNose, x: w / 4, y: 0, angle: 0, color: 'rgba(255, 150, 80, 0.7)' },
      { active: t.brakeStarboard, x: 0, y: -h / 3, angle: -Math.PI / 2, color: 'rgba(255, 150, 80, 0.7)' },
      { active: t.brakePort, x: 0, y: h / 3, angle: Math.PI / 2, color: 'rgba(255, 150, 80, 0.7)' },
    ];

    for (const m of maneuver) {
      this._drawPlume(ctx, m.x, m.y, m.angle, m.active, 12, m.color, 2);
    }

    if (t.rcsClockwise > 0) {
      this._drawPlume(ctx, w / 4, -h / 3, -Math.PI / 2, t.rcsClockwise, 10, 'rgba(150, 190, 255, 0.6)', 1.5);
      this._drawPlume(ctx, -w / 4, h / 3, Math.PI / 2, t.rcsClockwise, 10, 'rgba(150, 190, 255, 0.6)', 1.5);
    }
    if (t.rcsCounterClockwise > 0) {
      this._drawPlume(ctx, w / 4, h / 3, Math.PI / 2, t.rcsCounterClockwise, 10, 'rgba(150, 190, 255, 0.6)', 1.5);
      this._drawPlume(ctx, -w / 4, -h / 3, -Math.PI / 2, t.rcsCounterClockwise, 10, 'rgba(150, 190, 255, 0.6)', 1.5);
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

  renderParticles(particles, camera) {
    this.renderWorldLayer((ctx) => {
      for (const p of particles) {
        const lifeRatio = p.life / p.maxLife;
        ctx.globalAlpha = lifeRatio;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * lifeRatio, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }, camera);
  }

  emitThrusterParticles(ship, particleSystem) {
    const t = ship.thrusters;
    const forward = ship.getForward();
    const right = ship.getRight();
    const pos = ship.position;
    const w = SHIP.WIDTH;
    const h = SHIP.HEIGHT;

    if (t.mainEngine > 0 || t.retroBurn) {
      const intensity = t.mainEngine;
      const isAfterburner = t.afterburner > 0;
      const exhaustDir = t.retroBurn ? forward.clone() : forward.clone().scale(-1);
      const color = isAfterburner ? 'rgba(100, 180, 255, 0.8)' : 'rgba(60, 140, 255, 0.6)';
      const offset = forward.clone().scale(-w / 4);
      particleSystem.emitExhaust(
        pos.x + offset.x, pos.y + offset.y,
        exhaustDir.x, exhaustDir.y,
        intensity * (isAfterburner ? 1.5 : 1),
        color, isAfterburner ? 0.6 : 0.4
      );
    }

    const emits = [
      { active: t.aft, dir: forward.clone().scale(-1), ox: -w / 4, oy: 0, color: 'rgba(80, 200, 120, 0.5)' },
      { active: t.nose, dir: forward, ox: w / 4, oy: 0, color: 'rgba(80, 200, 120, 0.5)' },
      { active: t.starboard, dir: right.clone().scale(-1), ox: 0, oy: -h / 3, color: 'rgba(80, 200, 120, 0.5)' },
      { active: t.port, dir: right, ox: 0, oy: h / 3, color: 'rgba(80, 200, 120, 0.5)' },
      { active: t.brakeAft, dir: forward.clone().scale(-1), ox: -w / 4, oy: 0, color: 'rgba(255, 150, 80, 0.55)' },
      { active: t.brakeNose, dir: forward, ox: w / 4, oy: 0, color: 'rgba(255, 150, 80, 0.55)' },
      { active: t.brakeStarboard, dir: right.clone().scale(-1), ox: 0, oy: -h / 3, color: 'rgba(255, 150, 80, 0.55)' },
      { active: t.brakePort, dir: right, ox: 0, oy: h / 3, color: 'rgba(255, 150, 80, 0.55)' },
    ];

    for (const m of emits) {
      if (!m.active) continue;
      const intensity = typeof m.active === 'number' ? m.active : 1;
      particleSystem.emitExhaust(
        pos.x + forward.x * m.ox + right.x * m.oy,
        pos.y + forward.y * m.ox + right.y * m.oy,
        m.dir.x, m.dir.y, intensity * 0.55,
        m.color, 0.45
      );
    }

    const rcsEmits = [
      { active: t.rcsClockwise, ox: w / 4, oy: -h / 3, dir: right.clone().scale(-1) },
      { active: t.rcsClockwise, ox: -w / 4, oy: h / 3, dir: right },
      { active: t.rcsCounterClockwise, ox: w / 4, oy: h / 3, dir: right },
      { active: t.rcsCounterClockwise, ox: -w / 4, oy: -h / 3, dir: right.clone().scale(-1) },
    ];

    for (const r of rcsEmits) {
      if (!r.active) continue;
      const intensity = typeof r.active === 'number' ? r.active : 1;
      particleSystem.emitExhaust(
        pos.x + forward.x * r.ox + right.x * r.oy,
        pos.y + forward.y * r.ox + right.y * r.oy,
        r.dir.x, r.dir.y, intensity * 0.35,
        'rgba(150, 190, 255, 0.45)', 0.35
      );
    }
  }
}
