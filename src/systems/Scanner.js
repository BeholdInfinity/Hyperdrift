/**
 * Scanner Output Screen renderer — draws the circular radar ring in the border
 * band hugging the space viewport from a `ScannerSystem` model. Contacts plot
 * at their (radar-stepped) bearing, radial position encoding distance, sized
 * down with range and colored by IFF with distinct per-type shapes.
 *
 * Indicators drawn here are ship telemetry (nose/tail heading, velocity /
 * anti-vector chevrons) and stay visible even when the sensor is offline; the
 * sweep, range rings, blips and selection only render when the scanner is on.
 *
 * World bearing maps straight to screen (the play camera is north-up);
 * `cameraRotation` is folded in so the ring stays correct if that changes.
 */

import { IFF } from '../core/Constants.js';

const TWO_PI = Math.PI * 2;

const COLORS = {
  band: 'rgba(6, 14, 22, 0.82)',
  bandEdge: 'rgba(100, 180, 255, 0.28)',
  tick: 'rgba(100, 180, 255, 0.22)',
  tickCardinal: 'rgba(120, 200, 255, 0.55)',
  sweep: 'rgba(90, 200, 255, 0.10)',
  north: 'rgba(150, 215, 255, 0.75)',
  nose: 'rgba(240, 248, 255, 0.85)',
  tail: 'rgba(255, 110, 110, 0.7)',
  rangeRing: 'rgba(110, 190, 255, 0.16)',
  text: 'rgba(120, 190, 255, 0.75)',
  offline: 'rgba(150, 175, 200, 0.4)',
};

export class Scanner {
  constructor() {
    this.maxSpeed = 900;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{
   *   centerX: number, centerY: number,
   *   innerR: number, outerR: number, band: number,
   *   ship: object, model: import('./ScannerSystem.js').ScannerSystem,
   *   cameraRotation?: number, time?: number, maxSpeed?: number,
   * }} opts
   */
  render(ctx, opts) {
    const {
      centerX: cx,
      centerY: cy,
      innerR,
      outerR,
      band,
      ship,
      model,
      cameraRotation = 0,
      time = 0,
      maxSpeed,
    } = opts;
    if (!ship || band <= 0) return;
    if (maxSpeed) this.maxSpeed = maxSpeed;

    ctx.save();
    this._drawBand(ctx, cx, cy, innerR, outerR);
    this._drawTicks(ctx, cx, cy, innerR, outerR, band, cameraRotation, model?.on);

    if (model?.on) {
      this._drawRangeRings(ctx, cx, cy, innerR, outerR, band, model.rings);
      this._drawSweep(ctx, cx, cy, innerR, outerR, model.sweepAngle);
    }

    // Telemetry indicators (always on).
    this._drawHeadingLine(ctx, cx, cy, innerR, outerR, ship, cameraRotation, 0, COLORS.nose);
    this._drawHeadingLine(
      ctx, cx, cy, innerR, outerR, ship, cameraRotation, Math.PI, COLORS.tail
    );
    this._drawChevrons(ctx, cx, cy, innerR, band, ship, cameraRotation, false);
    this._drawChevrons(ctx, cx, cy, innerR, band, ship, cameraRotation, true);

    if (model?.on) {
      this._drawContacts(ctx, model);
      this._drawSelection(ctx, cx, cy, innerR, model, cameraRotation);
    } else {
      this._drawOffline(ctx, cx, cy, innerR, outerR, band);
    }

    ctx.restore();
  }

  _drawBand(ctx, cx, cy, innerR, outerR) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, TWO_PI, false);
    ctx.arc(cx, cy, innerR, 0, TWO_PI, true);
    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    grad.addColorStop(0, 'rgba(10, 22, 34, 0.78)');
    grad.addColorStop(0.5, COLORS.band);
    grad.addColorStop(1, 'rgba(4, 9, 15, 0.9)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.bandEdge;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, TWO_PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, TWO_PI);
    ctx.stroke();
  }

  _drawRangeRings(ctx, cx, cy, innerR, outerR, band, rings) {
    if (!rings) return;
    const innerPlot = innerR + band * 0.28;
    const outerPlot = outerR - band * 0.28;
    ctx.save();
    ctx.strokeStyle = COLORS.rangeRing;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    for (let i = 1; i <= rings; i++) {
      const frac = i / (rings + 1);
      const r = innerPlot + (outerPlot - innerPlot) * frac;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TWO_PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawTicks(ctx, cx, cy, innerR, outerR, band, rot, on) {
    const midR = innerR + band * 0.5;
    const dim = on ? 1 : 0.5;
    for (let deg = 0; deg < 360; deg += 15) {
      const cardinal = deg % 90 === 0;
      const north = deg === 270;
      const a = (deg * Math.PI) / 180 + rot;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const len = cardinal ? band * 0.55 : band * 0.3;
      const r0 = midR - len / 2;
      const r1 = midR + len / 2;
      ctx.beginPath();
      ctx.moveTo(cx + cos * r0, cy + sin * r0);
      ctx.lineTo(cx + cos * r1, cy + sin * r1);
      ctx.lineWidth = north ? 3 : cardinal ? 1.6 : 1;
      ctx.globalAlpha = dim;
      ctx.strokeStyle = north
        ? COLORS.north
        : cardinal
          ? COLORS.tickCardinal
          : COLORS.tick;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawSweep(ctx, cx, cy, innerR, outerR, sweepAngle) {
    const a = sweepAngle;
    const width = 0.5;
    const start = a - width;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, start, a, false);
    ctx.arc(cx, cy, innerR, a, start, true);
    ctx.closePath();
    const lead = { x: cx + Math.cos(a) * outerR, y: cy + Math.sin(a) * outerR };
    const tail = { x: cx + Math.cos(start) * outerR, y: cy + Math.sin(start) * outerR };
    const grad = ctx.createLinearGradient(tail.x, tail.y, lead.x, lead.y);
    grad.addColorStop(0, 'rgba(90, 200, 255, 0)');
    grad.addColorStop(1, COLORS.sweep);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  _drawContacts(ctx, model) {
    for (const c of model.contacts) {
      if (c.id === model.selectedId) continue; // drawn on top by selection
      this._drawBlip(ctx, c);
    }
  }

  _drawBlip(ctx, c) {
    const color = IFF[c.iff] || IFF.yellow;
    const alpha = c.state === 'edge' ? 0.5 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (c.state === 'visual') {
      // Collapsed to a dot on the inner border (contact is in visual range).
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(c.screenX, c.screenY, Math.max(2.2, c.size * 0.5), 0, TWO_PI);
      ctx.fill();
      ctx.restore();
      return;
    }
    // Shape is keyed to contact TYPE; IFF is conveyed purely by color.
    switch (c.type) {
      case 'station':
        this._shapeStation(ctx, c.screenX, c.screenY, c.size * 1.15, color);
        break;
      case 'asteroid':
        this._shapeAsteroid(ctx, c.screenX, c.screenY, c.size, color);
        break;
      default:
        // All ship contacts (patrol, civilian, …) share the ship silhouette.
        this._shapeShip(ctx, c.screenX, c.screenY, c.bearing, color, c.size);
    }
    ctx.restore();
  }

  _shapeShip(ctx, x, y, heading, color, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.62);
    ctx.lineTo(-size * 0.38, 0);
    ctx.lineTo(-size * 0.7, -size * 0.62);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.restore();
  }

  _shapeStation(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, TWO_PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.05, 0, TWO_PI, false);
    ctx.arc(0, 0, size * 0.78, 0, TWO_PI, true);
    ctx.fill('evenodd');
    ctx.restore();
  }

  _shapeAsteroid(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.beginPath();
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TWO_PI;
      const rr = size * (0.7 + ((i * 37) % 5) * 0.06);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawSelection(ctx, cx, cy, innerR, model, rot) {
    const c = model.getSelected();
    if (!c) return;
    this._drawBlip(ctx, c);
    const r = Math.max(9, c.size * 1.9);
    ctx.save();
    ctx.translate(c.screenX, c.screenY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(200, 230, 255, 0.7)';
    ctx.shadowBlur = 4;
    const g = r * 0.5;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(sx * r, sy * r - sy * g);
      ctx.lineTo(sx * r, sy * r);
      ctx.lineTo(sx * r - sx * g, sy * r);
      ctx.stroke();
    }
    ctx.restore();

    // Distance readout just inside the viewport, along the contact bearing.
    const km = (c.dist / 100).toFixed(1);
    const rr = innerR - 16;
    const tx = cx + Math.cos(c.bearing) * rr;
    const ty = cy + Math.sin(c.bearing) * rr;
    ctx.save();
    ctx.font = "600 12px 'Barlow Condensed', 'Segoe UI', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(220, 240, 255, 0.92)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(`${km} km`, tx, ty);
    ctx.restore();
  }

  /** White nose / red tail heading line (offset 0 or π). */
  _drawHeadingLine(ctx, cx, cy, innerR, outerR, ship, rot, offset, color) {
    const a = (ship.angle || 0) + rot + offset;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(cx + cos * innerR, cy + sin * innerR);
    ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Chevron stack along the velocity vector. `anti` mirrors it toward center in
   * red (anti-vector). Lit count/intensity ramp with speed; hidden at rest.
   */
  _drawChevrons(ctx, cx, cy, innerR, band, ship, rot, anti) {
    const vx = ship.velocity?.x ?? 0;
    const vy = ship.velocity?.y ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed < 1) return;

    const f = Math.min(1, speed / (this.maxSpeed || 900));
    const litCount = f <= 1 / 3 ? 1 : f <= 2 / 3 ? 2 : 3;
    let intensity = 0.82;
    if (f > 2 / 3) intensity = 0.82 + 0.18 * ((f - 2 / 3) / (1 / 3));

    const vb = Math.atan2(vy, vx) + rot + (anti ? Math.PI : 0);
    const cs = band * 0.085;
    const gap = cs * 2.1;
    const r0 = innerR + band * 0.24;
    const litRGB = anti ? '255, 110, 110' : '240, 248, 255';
    const glowRGB = anti ? '255, 140, 140' : '210, 232, 255';

    for (let i = 0; i < 3; i++) {
      const lit = i < litCount;
      const r = r0 + gap * i;
      const px = cx + Math.cos(vb) * r;
      const py = cy + Math.sin(vb) * r;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(vb);
      ctx.beginPath();
      ctx.moveTo(-cs, -cs);
      ctx.lineTo(cs, 0);
      ctx.lineTo(-cs, cs);
      ctx.lineWidth = Math.max(1.4, cs * 0.55);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (lit) {
        ctx.strokeStyle = `rgba(${litRGB}, ${intensity.toFixed(3)})`;
        ctx.shadowColor = `rgba(${glowRGB}, 0.7)`;
        ctx.shadowBlur = 2 + ((intensity - 0.82) / 0.18) * 4;
      } else {
        ctx.strokeStyle = anti
          ? 'rgba(150, 90, 90, 0.16)'
          : 'rgba(120, 150, 175, 0.18)';
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawOffline(ctx, cx, cy, innerR, outerR, band) {
    const r = (innerR + outerR) / 2;
    ctx.save();
    ctx.font = `600 ${Math.max(10, Math.round(band * 0.3))}px 'Barlow Condensed', 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.offline;
    ctx.fillText('SENSOR OFFLINE', cx, cy - r);
    ctx.restore();
  }
}
