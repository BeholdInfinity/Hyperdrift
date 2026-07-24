/**
 * Viewport telemetry labels — speed + target distances laid out together inside
 * the radar ring / full SCAN scope without overlapping.
 */

import { RADAR } from '../core/Constants.js';
import { contactScreenAabb } from './ContactSelectionDraw.js';

const FONT = "'Barlow Condensed', 'Segoe UI', sans-serif";

/** @param {number} worldDist */
export function formatDistKm(worldDist, kmScale = RADAR.KM_SCALE || 100) {
  const km = worldDist / kmScale;
  if (km >= 100) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
}

function measureLabel(ctx, text, fs, weight = 600) {
  ctx.font = `${weight} ${fs}px ${FONT}`;
  return ctx.measureText(text).width;
}

function labelBox(x, y, w, h) {
  return { x, y, w, h };
}

function overlaps(a, b, pad = 5) {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) * 0.5 + pad &&
    Math.abs(a.y - b.y) < (a.h + b.h) * 0.5 + pad
  );
}

function drawText(ctx, x, y, text, color, fs, weight = 600) {
  ctx.save();
  ctx.font = `${weight} ${fs}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.82)';
  ctx.shadowBlur = 3;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function speedChevronMetrics(band) {
  const cs = Math.min(band * 0.085, 12);
  return { cs, gap: cs * 2.1, fs: Math.max(11, Math.min(14, cs * 1.05)) };
}

/** Preferred anchor for the numeric speed readout (matches legacy radar placement). */
function speedAnchor(cx, cy, innerR, outerR, band, ship, rot, fullScope) {
  const vx = ship.velocity?.x ?? 0;
  const vy = ship.velocity?.y ?? 0;
  const speed = Math.hypot(vx, vy);
  if (speed < 1) return null;

  const vb = Math.atan2(vy, vx) + rot;
  const { gap, fs } = speedChevronMetrics(band);
  let r;
  if (fullScope || innerR <= 0.5) {
    const r0 = Math.max(0, outerR - band * 0.76);
    r = Math.max(22, r0 - gap * 0.55);
  } else {
    const ringStroke = 1.5;
    r = innerR - ringStroke - gap * 0.12 - fs * 0.38;
    r = Math.max(innerR * 0.38, r);
  }

  const x = cx + Math.cos(vb) * r;
  const y = cy + Math.sin(vb) * r;
  const text = `${Math.round(speed)}`;
  return { x, y, r, bearing: vb, fs, text, weight: 700, color: 'rgba(240, 248, 255, 0.88)' };
}

function scopePlotR(dist, plotRange, outerR, plotPad = 0.02) {
  const frac = Math.min(1, dist / Math.max(1, plotRange));
  return outerR * (plotPad + frac * Math.max(0, 1 - plotPad * 2));
}

function ringPreferredR(innerR, slot = 0) {
  return Math.max(innerR * 0.38, innerR - 16 - slot * 13);
}

function resolveRadial(ctx, cx, cy, bearing, preferredR, text, fs, weight, placed) {
  const w = measureLabel(ctx, text, fs, weight) + 10;
  const h = fs + 8;
  const attempts = [
    { r: preferredR, b: bearing },
    { r: preferredR - 12, b: bearing },
    { r: preferredR - 24, b: bearing },
    { r: preferredR + 10, b: bearing },
    { r: preferredR, b: bearing + 0.16 },
    { r: preferredR, b: bearing - 0.16 },
    { r: preferredR - 18, b: bearing + 0.12 },
    { r: preferredR - 18, b: bearing - 0.12 },
  ];

  for (const att of attempts) {
    const x = cx + Math.cos(att.b) * att.r;
    const y = cy + Math.sin(att.b) * att.r;
    const box = labelBox(x, y, w, h);
    if (!placed.some((p) => overlaps(box, p))) return { x, y, box };
  }

  const x = cx + Math.cos(bearing) * preferredR;
  const y = cy + Math.sin(bearing) * preferredR;
  return { x, y, box: labelBox(x, y, w, h) };
}

function resolveHull(ctx, box, text, fs, weight, placed) {
  const w = measureLabel(ctx, text, fs, weight) + 10;
  const h = fs + 8;
  const attempts = [
    { x: box.cx, y: box.cy + box.halfH + 14 },
    { x: box.cx, y: box.cy - box.halfH - 14 },
    { x: box.cx + box.halfW + 12, y: box.cy },
    { x: box.cx - box.halfW - 12, y: box.cy },
  ];
  for (const att of attempts) {
    const b = labelBox(att.x, att.y, w, h);
    if (!placed.some((p) => overlaps(b, p))) return { x: att.x, y: att.y, box: b };
  }
  const att = attempts[0];
  return { x: att.x, y: att.y, box: labelBox(att.x, att.y, w, h) };
}

function nearSameWorld(a, b, eps = 80) {
  if (!a || !b) return false;
  return Math.hypot(a.x - b.x, a.y - b.y) < eps;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{
 *   centerX: number, centerY: number,
 *   innerR: number, outerR: number, band: number,
 *   plotPad?: number, fullScope?: boolean,
 *   ship: object, cameraRotation?: number, maxSpeed?: number,
 *   radarSystem?: import('./RadarSystem.js').RadarSystem,
 *   poiSystem?: import('../world/PoiSystem.js').PoiSystem,
 *   navRoute?: import('../world/NavRoute.js').NavRoute,
 *   engine?: object, camera?: object,
 * }} opts
 */
export function renderViewportTelemetry(ctx, opts) {
  const {
    centerX: cx,
    centerY: cy,
    innerR,
    outerR,
    band,
    plotPad = 0,
    fullScope = false,
    ship,
    cameraRotation: rot = 0,
    radarSystem,
    poiSystem,
    navRoute,
    engine,
    camera,
  } = opts;
  if (!ship) return;

  const placed = [];
  const fs = speedChevronMetrics(band).fs;
  const distFs = Math.max(11, fs - 1);
  const plotRange = radarSystem?.plotRange || radarSystem?.range || 1;

  const speed = speedAnchor(cx, cy, innerR, outerR, band, ship, rot, fullScope);
  if (speed) {
    const w = measureLabel(ctx, speed.text, speed.fs, speed.weight) + 8;
    const h = speed.fs + 6;
    drawText(ctx, speed.x, speed.y, speed.text, speed.color, speed.fs, speed.weight);
    placed.push(labelBox(speed.x, speed.y, w, h));
  }

  /** @type {Array<{ dist: number, bearing: number, text: string, color: string, slot: number, hull?: object, plotR?: number|null }>} */
  const targets = [];
  let slot = 0;

  navRoute?.resolvePosition?.(engine);
  const stop = navRoute?.activeStop?.();
  if (stop) {
    const { range, bearing } = navRoute.rangeBearing(ship, stop);
    targets.push({
      dist: range,
      bearing: bearing + rot,
      text: formatDistKm(range),
      color: navRoute.stopColor(engine, stop),
      slot: slot++,
    });
  }

  const poi = poiSystem?.getSelected?.();
  const samePoi = poi && stop?.kind === 'poi' && stop.poiId === poi.id;
  const gt = engine?.gameTime || 0;
  if (poi && !samePoi) {
    targets.push({
      dist: poiSystem.range(ship, poi, gt),
      bearing: poiSystem.bearing(ship, poi, gt) + rot,
      text: formatDistKm(poiSystem.range(ship, poi, gt)),
      color: poiSystem.color(poi),
      slot: slot++,
    });
  }

  const contact = radarSystem?.on && radarSystem.getSelected?.();
  if (contact) {
    const dupNav = stop && nearSameWorld({ x: contact.x, y: contact.y }, stop);
    const dupPoi = poi && nearSameWorld({ x: contact.x, y: contact.y }, poi);
    if (!dupNav && !dupPoi) {
      const hull =
        !fullScope &&
        contact.state === 'visual' &&
        camera &&
        contactScreenAabb(contact, camera, cx, cy);
      targets.push({
        dist: contact.dist,
        bearing: contact.bearing,
        text: formatDistKm(contact.dist),
        color: 'rgba(220, 240, 255, 0.92)',
        slot: slot++,
        hull: hull || undefined,
        plotR: fullScope ? contact.plotR : null,
      });
    }
  }

  for (const t of targets) {
    if (t.hull) {
      const pos = resolveHull(ctx, t.hull, t.text, distFs, 600, placed);
      drawText(ctx, pos.x, pos.y, t.text, t.color, distFs, 600);
      placed.push(pos.box);
      continue;
    }

    let preferredR;
    if (fullScope) {
      if (t.plotR != null) {
        preferredR = Math.max(18, t.plotR - 10);
      } else {
        preferredR = scopePlotR(t.dist, plotRange, outerR, plotPad || 0.02);
      }
    } else {
      preferredR = ringPreferredR(innerR, t.slot);
    }

    const pos = resolveRadial(ctx, cx, cy, t.bearing, preferredR, t.text, distFs, 600, placed);
    drawText(ctx, pos.x, pos.y, t.text, t.color, distFs, 600);
    placed.push(pos.box);
  }
}
