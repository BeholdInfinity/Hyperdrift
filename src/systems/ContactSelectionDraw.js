/**
 * Shared corner-bracket selection chrome for radar blips and in-viewport contacts.
 */

import { STATION } from '../core/Constants.js';

/**
 * Axis-aligned corner brackets (radar ring + viewport hand-off).
 */
export function drawCornerBrackets(ctx, cx, cy, halfW, halfH, opts = {}) {
  const pulse = opts.pulse || 0;
  const g = Math.min(halfW, halfH) * 0.5;
  ctx.save();
  ctx.strokeStyle = opts.strokeStyle || `rgba(255, 255, 255, ${(0.72 + pulse * 0.28).toFixed(3)})`;
  ctx.lineWidth = opts.lineWidth ?? 1.6 + pulse * 0.8;
  ctx.shadowColor = opts.shadowColor || `rgba(120, 220, 255, ${(0.35 + pulse * 0.55).toFixed(3)})`;
  ctx.shadowBlur = opts.shadowBlur ?? 4 + pulse * 10;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const px = cx + sx * halfW;
    const py = cy + sy * halfH;
    ctx.beginPath();
    ctx.moveTo(px, py - sy * g);
    ctx.lineTo(px, py);
    ctx.lineTo(px - sx * g, py);
    ctx.stroke();
  }
  ctx.restore();
}

/** Ship-local corners (+X nose) for screen AABB projection. */
function shipLocalCorners(fwd, aft) {
  const lat = Math.max(fwd, aft) * 0.48;
  return [
    [fwd, lat],
    [fwd, -lat],
    [-aft, -lat],
    [-aft, lat],
  ];
}

/**
 * Project a contact's hull bounds to screen space for viewport brackets.
 * @returns {{ cx: number, cy: number, halfW: number, halfH: number }|null}
 */
export function contactScreenAabb(contact, camera, screenCx, screenCy, pad = 8) {
  if (!contact) return null;
  const ref = contact.ref;
  if (!ref && contact.id !== 'station') return null;

  let wx;
  let wy;
  let angle = 0;
  let corners;

  if (contact.type === 'station' || contact.id === 'station') {
    wx = ref?.x ?? STATION.WORLD_X;
    wy = ref?.y ?? STATION.WORLD_Y;
    const r = STATION.RADIUS * 0.72;
    corners = [
      [r, r],
      [r, -r],
      [-r, -r],
      [-r, r],
    ];
  } else if (contact.type === 'asteroid') {
    wx = ref.position?.x ?? ref.x;
    wy = ref.position?.y ?? ref.y;
    angle = ref.angle || 0;
    const r = ref.radius || 18;
    corners = [
      [r, r],
      [r, -r],
      [-r, -r],
      [-r, r],
    ];
  } else {
    wx = ref.x ?? ref.position?.x;
    wy = ref.y ?? ref.position?.y;
    angle = ref.angle || 0;
    const def = ref.shipDef;
    const ext = def?.hullExtents?.();
    const fwd = ext?.forward ?? def?.forwardExtent?.() ?? 22;
    const aft = ext?.aft ?? def?.aftExtent?.() ?? 20;
    corners = shipLocalCorners(fwd, aft);
  }

  if (wx == null || wy == null) return null;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [lx, ly] of corners) {
    const px = wx + lx * cos - ly * sin;
    const py = wy + lx * sin + ly * cos;
    const s = camera.worldToScreen(px, py, screenCx, screenCy);
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
  }

  if (!Number.isFinite(minX)) return null;

  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    halfW: (maxX - minX) / 2 + pad,
    halfH: (maxY - minY) / 2 + pad,
  };
}

/**
 * Nearest filter-passing contact under a screen point (viewport hull pick).
 * @param {(c: object) => boolean} [passesFilter]
 */
export function pickContactAtScreen(
  contacts,
  camera,
  screenCx,
  screenCy,
  sx,
  sy,
  passesFilter = null
) {
  let best = null;
  let bestD = Infinity;
  for (const c of contacts) {
    if (passesFilter && !passesFilter(c)) continue;
    const box = contactScreenAabb(c, camera, screenCx, screenCy, 6);
    if (!box) continue;
    const dx = (sx - box.cx) / Math.max(1, box.halfW);
    const dy = (sy - box.cy) / Math.max(1, box.halfH);
    if (Math.abs(dx) > 1.08 || Math.abs(dy) > 1.08) continue;
    const d = Math.hypot(sx - box.cx, sy - box.cy);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
