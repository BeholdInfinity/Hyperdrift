/**
 * Scanner Output Screen renderer — draws the circular radar ring / full-disc
 * scope from a `ScannerSystem` model. Contacts plot at their (radar-stepped)
 * bearing with piecewise range mapping; ship/asteroid blips use silhouettes.
 *
 * Indicators drawn here are ship telemetry (nose/tail heading, velocity /
 * anti-vector chevrons) and stay visible even when the sensor is offline; the
 * sweep, range rings, blips and selection only render when the scanner is on.
 */

import { IFF, SCANNER } from '../core/Constants.js';
import { drawShipSilhouette } from '../ships/ShipRenderer.js';

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
  rangeLabel: 'rgba(130, 195, 235, 0.42)',
  text: 'rgba(120, 190, 255, 0.75)',
  offline: 'rgba(150, 175, 200, 0.4)',
  ownShip: '#6a7a8a',
  ownShipStroke: '#3d4a58',
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
   *   fullScope?: boolean, plotPad?: number, chevronBand?: number,
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
      fullScope = false,
      plotPad = 0.28,
      chevronBand,
    } = opts;
    if (!ship || (band <= 0 && !fullScope)) return;
    if (maxSpeed) this.maxSpeed = maxSpeed;

    const telemetryBand = chevronBand ?? (fullScope ? 40 : band);

    ctx.save();
    this._drawBand(ctx, cx, cy, innerR, outerR);
    this._drawTicks(ctx, cx, cy, innerR, outerR, band, cameraRotation, model?.on, fullScope);

    if (model?.on) {
      this._drawRangeRings(
        ctx, cx, cy, innerR, outerR, band, model.rangeBreaks, plotPad,
        fullScope ? model.rangeRingMarks : null
      );
      this._drawSweep(ctx, cx, cy, innerR, outerR, model.sweepAngle, model.sweepArmCount?.() || 1);
    }

    if (fullScope) {
      this._drawOwnShip(ctx, cx, cy, ship, cameraRotation);
    }

    this._drawHeadingLine(ctx, cx, cy, innerR, outerR, ship, cameraRotation, 0, COLORS.nose);
    this._drawHeadingLine(
      ctx, cx, cy, innerR, outerR, ship, cameraRotation, Math.PI, COLORS.tail
    );
    this._drawChevrons(ctx, cx, cy, innerR, outerR, telemetryBand, ship, cameraRotation, false, fullScope);
    this._drawChevrons(ctx, cx, cy, innerR, outerR, telemetryBand, ship, cameraRotation, true, fullScope);

    if (model?.on) {
      if (!fullScope && innerR > 0.5) {
        // Clip blips to the band so they occlude cleanly at the blue / outer edges.
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, TWO_PI, false);
        ctx.arc(cx, cy, innerR, 0, TWO_PI, true);
        ctx.clip();
        this._drawContacts(ctx, model);
        this._drawSelection(ctx, cx, cy, innerR, model, cameraRotation, fullScope);
        ctx.restore();
        this._strokeBandEdges(ctx, cx, cy, innerR, outerR);
      } else {
        this._drawContacts(ctx, model);
        this._drawSelection(ctx, cx, cy, innerR, model, cameraRotation, fullScope);
      }
    } else {
      this._drawOffline(ctx, cx, cy, innerR, outerR, Math.max(band, 40));
    }

    ctx.restore();
  }

  _drawBand(ctx, cx, cy, innerR, outerR) {
    ctx.beginPath();
    if (innerR <= 0.5) {
      ctx.arc(cx, cy, outerR, 0, TWO_PI);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
      grad.addColorStop(0, 'rgba(10, 22, 34, 0.88)');
      grad.addColorStop(0.55, COLORS.band);
      grad.addColorStop(1, 'rgba(4, 9, 15, 0.92)');
      ctx.fillStyle = grad;
      ctx.fill();
    } else {
      ctx.arc(cx, cy, outerR, 0, TWO_PI, false);
      ctx.arc(cx, cy, innerR, 0, TWO_PI, true);
      const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      grad.addColorStop(0, 'rgba(10, 22, 34, 0.78)');
      grad.addColorStop(0.5, COLORS.band);
      grad.addColorStop(1, 'rgba(4, 9, 15, 0.9)');
      ctx.fillStyle = grad;
      ctx.fill();
    }

    this._strokeBandEdges(ctx, cx, cy, innerR, outerR);
  }

  /** Inner (blue) + outer band strokes — redrawn over edge blips for occlusion. */
  _strokeBandEdges(ctx, cx, cy, innerR, outerR) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.bandEdge;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, TWO_PI);
    ctx.stroke();
    if (innerR > 0.5) {
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, TWO_PI);
      ctx.stroke();
    }
  }

  _drawRangeRings(ctx, cx, cy, innerR, outerR, band, breaks, pad = 0.28, marks = null) {
    const fracs = breaks || [];
    const labels = marks || [];
    if (!fracs.length && !labels.length) return;
    const innerPlot = innerR + band * pad;
    const outerPlot = outerR - band * pad;
    ctx.save();
    ctx.strokeStyle = COLORS.rangeRing;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    for (const frac of fracs) {
      const r = innerPlot + (outerPlot - innerPlot) * frac;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TWO_PI);
      ctx.stroke();
    }
    if (labels.length) {
      // Screen-fixed upper-right radial so labels stay readable under view rotation.
      const labelAngle = -Math.PI * 0.32;
      const fontPx = Math.max(9, Math.min(12, outerR * 0.028));
      ctx.setLineDash([]);
      ctx.font = `500 ${fontPx}px 'Barlow Condensed', 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.rangeLabel;
      for (const m of labels) {
        const r = innerPlot + (outerPlot - innerPlot) * m.frac;
        const tr = Math.max(8, r - fontPx * 0.85);
        const tx = cx + Math.cos(labelAngle) * tr;
        const ty = cy + Math.sin(labelAngle) * tr;
        const km = m.dist / (SCANNER.KM_SCALE || 100);
        // Tier rings are whole km (50 / 100 / 150 / …).
        const text = `${Math.round(km)} km`;
        ctx.fillText(text, tx, ty);
      }
    }
    ctx.restore();
  }

  _drawTicks(ctx, cx, cy, innerR, outerR, band, rot, on, fullScope = false) {
    const tickBand = fullScope ? Math.min(Math.max(band, outerR) * 0.05, 18) : band;
    const midR = fullScope ? outerR - tickBand * 0.55 : innerR + band * 0.5;
    const dim = on ? 1 : 0.5;
    for (let deg = 0; deg < 360; deg += 15) {
      const cardinal = deg % 90 === 0;
      const north = deg === 270;
      const a = (deg * Math.PI) / 180 + rot;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const len = cardinal ? tickBand * 0.55 : tickBand * 0.3;
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

  _drawSweep(ctx, cx, cy, innerR, outerR, sweepAngle, arms = 1) {
    const n = Math.max(1, arms | 0);
    const step = TWO_PI / n;
    for (let i = 0; i < n; i++) {
      this._drawSweepArm(ctx, cx, cy, innerR, outerR, sweepAngle + i * step);
    }
  }

  _drawSweepArm(ctx, cx, cy, innerR, outerR, sweepAngle) {
    const a = sweepAngle;
    const width = 0.5;
    const start = a - width;
    const rIn = Math.max(0, innerR);
    ctx.save();
    ctx.beginPath();
    if (rIn <= 0.5) {
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, start, a, false);
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, outerR, start, a, false);
      ctx.arc(cx, cy, rIn, a, start, true);
      ctx.closePath();
    }
    const lead = { x: cx + Math.cos(a) * outerR, y: cy + Math.sin(a) * outerR };
    const tail = { x: cx + Math.cos(start) * outerR, y: cy + Math.sin(start) * outerR };
    const grad = ctx.createLinearGradient(tail.x, tail.y, lead.x, lead.y);
    grad.addColorStop(0, 'rgba(90, 200, 255, 0)');
    grad.addColorStop(1, COLORS.sweep);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  _drawOwnShip(ctx, cx, cy, ship, rot) {
    const def = ship.shipDef;
    if (!def) return;
    const extent = (def.forwardExtent?.() || 22) + (def.aftExtent?.() || 20);
    const target = 14;
    const s = target / Math.max(8, extent);
    const heading = (ship.angle || 0) + rot;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading);
    ctx.scale(s, s);
    try {
      drawShipSilhouette(ctx, ship, {
        fillStyle: COLORS.ownShip,
        strokeStyle: COLORS.ownShipStroke,
      });
    } catch (_) {
      /* ignore missing def */
    }
    ctx.restore();
  }

  _drawContacts(ctx, model) {
    for (const c of model.contacts) {
      if (c.id === model.selectedId) continue;
      if (model.passesContactFilter && !model.passesContactFilter(c)) continue;
      this._drawBlip(ctx, c);
    }
  }

  _drawBlip(ctx, c) {
    const color = IFF[c.iff] || IFF.yellow;
    const alpha = c.alpha != null ? c.alpha : c.state === 'edge' ? 0.5 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (c.state === 'visual') {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(c.screenX, c.screenY, Math.max(2.2, c.size * 0.5), 0, TWO_PI);
      ctx.fill();
      ctx.restore();
      return;
    }
    switch (c.type) {
      case 'station':
        this._shapeStation(ctx, c.screenX, c.screenY, c.size * 1.15, color);
        break;
      case 'asteroid':
        this._shapeAsteroid(ctx, c);
        break;
      default:
        this._shapeShip(ctx, c, color);
    }
    ctx.restore();
  }

  _shapeShip(ctx, c, color) {
    const shipDef = c.ref?.shipDef;
    const heading = c.heading != null ? c.heading : c.bearing;
    if (shipDef) {
      const extent =
        (shipDef.forwardExtent?.() || 22) + (shipDef.aftExtent?.() || 20);
      const s = (c.size * 2) / Math.max(8, extent);
      const stroke = shadeHex(color, -40);
      ctx.save();
      ctx.translate(c.screenX, c.screenY);
      ctx.rotate(heading);
      ctx.scale(s, s);
      ctx.shadowColor = color;
      ctx.shadowBlur = 3;
      try {
        drawShipSilhouette(ctx, c.ref, { fillStyle: color, strokeStyle: stroke });
      } catch (_) {
        this._shapeShipChevron(ctx, 0, 0, 0, color, c.size / s);
      }
      ctx.restore();
      return;
    }
    this._shapeShipChevron(ctx, c.screenX, c.screenY, heading, color, c.size);
  }

  _shapeShipChevron(ctx, x, y, heading, color, size) {
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

  _shapeAsteroid(ctx, c) {
    const color = IFF[c.iff] || IFF.object;
    const verts = c.ref?.vertices;
    const radius = c.ref?.radius || 1;
    const heading = c.heading != null ? c.heading : 0;
    ctx.save();
    ctx.translate(c.screenX, c.screenY);
    ctx.rotate(heading);
    const s = c.size / Math.max(1, radius);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.strokeStyle = shadeHex(color, -35);
    ctx.lineWidth = Math.max(0.8, 1.2 / s);
    ctx.shadowColor = color;
    ctx.shadowBlur = 3;
    ctx.beginPath();
    if (verts?.length) {
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i];
        if (i === 0) ctx.moveTo(v.x, v.y);
        else ctx.lineTo(v.x, v.y);
      }
      ctx.closePath();
    } else {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TWO_PI;
        const rr = radius * (0.7 + ((i * 37) % 5) * 0.06);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawSelection(ctx, cx, cy, innerR, model, rot, fullScope = false) {
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

    const km = (c.dist / 100).toFixed(1);
    let tx;
    let ty;
    if (fullScope) {
      const rr = Math.max(0, (c.plotR || 0) - r - 8);
      tx = cx + Math.cos(c.bearing) * rr;
      ty = cy + Math.sin(c.bearing) * rr;
    } else {
      const rr = innerR - 16;
      tx = cx + Math.cos(c.bearing) * rr;
      ty = cy + Math.sin(c.bearing) * rr;
    }
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

  _drawHeadingLine(ctx, cx, cy, innerR, outerR, ship, rot, offset, color) {
    const a = (ship.angle || 0) + rot + offset;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const r0 = Math.max(0, innerR);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(cx + cos * r0, cy + sin * r0);
    ctx.lineTo(cx + cos * outerR, cy + sin * outerR);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Chevron stack along the velocity vector. `anti` mirrors it toward center in
   * red; tips face outward (forward) or toward center (anti). PORT sits the
   * stack in the thin ring band; SCAN keeps the same band sizing at the outer
   * rose edge (not near the ship silhouette).
   */
  _drawChevrons(ctx, cx, cy, innerR, outerR, band, ship, rot, anti, fullScope = false) {
    const vx = ship.velocity?.x ?? 0;
    const vy = ship.velocity?.y ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed < 1) return;

    const f = Math.min(1, speed / (this.maxSpeed || 900));
    const litCount = f <= 1 / 3 ? 1 : f <= 2 / 3 ? 2 : 3;
    let intensity = 0.82;
    if (f > 2 / 3) intensity = 0.82 + 0.18 * ((f - 2 / 3) / (1 / 3));

    const vb = Math.atan2(vy, vx) + rot + (anti ? Math.PI : 0);
    // Same chevron size in PORT and SCAN (thin telemetry band, not disc radius).
    const cs = Math.min(band * 0.085, 12);
    const gap = cs * 2.1;
    // PORT: near viewport edge of the ring. SCAN: same relative slot at the outer rose.
    const r0 = fullScope
      ? Math.max(0, outerR - band * 0.76)
      : innerR + band * 0.24;
    const litRGB = anti ? '255, 110, 110' : '240, 248, 255';
    const glowRGB = anti ? '255, 140, 140' : '210, 232, 255';
    // Anti tips face center; forward tips face outward along velocity.
    const tipRot = anti ? vb + Math.PI : vb;

    for (let i = 0; i < 3; i++) {
      const lit = i < litCount;
      const r = r0 + gap * i;
      const px = cx + Math.cos(vb) * r;
      const py = cy + Math.sin(vb) * r;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tipRot);
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
    const r = (Math.max(0, innerR) + outerR) / 2;
    ctx.save();
    ctx.font = `600 ${Math.max(10, Math.round(band * 0.3))}px 'Barlow Condensed', 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.offline;
    ctx.fillText('SENSOR OFFLINE', cx, cy - r * 0.15);
    ctx.restore();
  }
}

function shadeHex(hex, amt) {
  const s = String(hex || '#8899aa').replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}
