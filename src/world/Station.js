/**
 * Jennings Station — overworld exterior for Home Base.
 * Large industrial hull; B2 bay mouth faces north (−Y). Ship exits hangar
 * northward and appears just outside this aperture.
 */

import { STATION } from '../core/Constants.js';

export class Station {
  constructor() {
    this.x = STATION.WORLD_X;
    this.y = STATION.WORLD_Y;
  }

  /** World point just outside the B2 bay mouth (north of station). */
  getExitSpawn() {
    return {
      x: this.x,
      y: this.y - STATION.EXIT_OFFSET,
      angle: -Math.PI / 2,
    };
  }

  /** Soft approach ring for dock prompt. */
  inApproach(shipX, shipY) {
    const dx = shipX - this.x;
    const dy = shipY - (this.y - STATION.DOCK_FACE_Y);
    return Math.hypot(dx, dy) < STATION.APPROACH_RADIUS;
  }

  /** Tight zone + slow enough to request landing. */
  canRequestDock(shipX, shipY, speed) {
    const dx = shipX - this.x;
    const dy = shipY - (this.y - STATION.DOCK_FACE_Y);
    return Math.hypot(dx, dy) < STATION.DOCK_RADIUS && speed < STATION.DOCK_MAX_SPEED;
  }

  render(ctx) {
    const { x, y } = this;
    ctx.save();
    ctx.translate(x, y);

    // Soft exterior glow
    const glow = ctx.createRadialGradient(0, 0, 40, 0, 0, STATION.RADIUS * 1.15);
    glow.addColorStop(0, 'rgba(40, 70, 95, 0.35)');
    glow.addColorStop(0.55, 'rgba(20, 35, 50, 0.2)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, STATION.RADIUS * 1.2, 0, Math.PI * 2);
    ctx.fill();

    this._drawHull(ctx);
    this._drawArms(ctx);
    this._drawBayMouth(ctx);
    this._drawLights(ctx);
    this._drawLabel(ctx);

    ctx.restore();
  }

  _drawHull(ctx) {
    const r = STATION.RADIUS;
    // Outer ring
    ctx.fillStyle = '#1a2430';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#243444';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.fill();

    // Panel wedges
    ctx.strokeStyle = 'rgba(90, 120, 145, 0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35);
      ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
      ctx.stroke();
    }

    // Core block
    ctx.fillStyle = '#121a22';
    ctx.fillRect(-48, -38, 96, 76);
    ctx.strokeStyle = '#5a7a92';
    ctx.lineWidth = 2;
    ctx.strokeRect(-48, -38, 96, 76);

    // Hab rings
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();

    // Rivet belt
    ctx.fillStyle = 'rgba(150, 170, 185, 0.35)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawArms(ctx) {
    const arms = [
      { a: 0.35, len: 110 },
      { a: Math.PI - 0.35, len: 110 },
      { a: Math.PI * 0.5, len: 90 },
      { a: -Math.PI * 0.55, len: 70 },
    ];
    for (const arm of arms) {
      const c = Math.cos(arm.a);
      const s = Math.sin(arm.a);
      ctx.fillStyle = '#2a3848';
      ctx.save();
      ctx.translate(c * 70, s * 70);
      ctx.rotate(arm.a);
      ctx.fillRect(0, -10, arm.len, 20);
      ctx.fillStyle = '#3a4a58';
      ctx.fillRect(arm.len - 18, -16, 28, 32);
      ctx.fillStyle = 'rgba(255, 170, 40, 0.55)';
      ctx.fillRect(arm.len + 4, -4, 6, 8);
      ctx.restore();
    }
  }

  _drawBayMouth(ctx) {
    const mouthY = -STATION.RADIUS + 8;
    const hw = 58;
    // Recess into hull (space aperture)
    ctx.fillStyle = '#05080c';
    ctx.fillRect(-hw, mouthY - 36, hw * 2, 50);

    // Frame
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(-hw - 10, mouthY - 40, 10, 58);
    ctx.fillRect(hw, mouthY - 40, 10, 58);
    ctx.fillRect(-hw - 10, mouthY + 10, hw * 2 + 20, 10);

    // Caution stripes
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#c9a020' : '#1a1a1a';
      ctx.fillRect(-hw + i * ((hw * 2) / 8), mouthY + 12, (hw * 2) / 8, 6);
    }

    // Inner glow (hangar light leak)
    const g = ctx.createLinearGradient(0, mouthY - 36, 0, mouthY + 8);
    g.addColorStop(0, 'rgba(100, 180, 255, 0.12)');
    g.addColorStop(1, 'rgba(100, 180, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(-hw + 4, mouthY - 34, hw * 2 - 8, 42);
  }

  _drawLights(ctx) {
    const t = performance.now() / 1000;
    const blink = Math.sin(t * 3) > 0;
    ctx.fillStyle = blink ? 'rgba(255, 80, 60, 0.9)' : 'rgba(80, 20, 20, 0.5)';
    for (const a of [ -0.9, -2.2, 0.4, 2.5 ]) {
      ctx.beginPath();
      ctx.arc(Math.cos(a) * STATION.RADIUS * 0.92, Math.sin(a) * STATION.RADIUS * 0.92, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Approach chevrons north of mouth
    ctx.fillStyle = 'rgba(100, 180, 255, 0.35)';
    for (const y of [-STATION.RADIUS - 28, -STATION.RADIUS - 48, -STATION.RADIUS - 68]) {
      ctx.beginPath();
      ctx.moveTo(0, y - 6);
      ctx.lineTo(-7, y + 6);
      ctx.lineTo(7, y + 6);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawLabel(ctx) {
    ctx.fillStyle = 'rgba(100, 180, 255, 0.55)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JENNINGS STATION', 0, STATION.RADIUS + 22);
    ctx.font = '8px sans-serif';
    ctx.fillStyle = 'rgba(200, 214, 229, 0.4)';
    ctx.fillText('HOME BASE · B2', 0, STATION.RADIUS + 36);
  }
}
