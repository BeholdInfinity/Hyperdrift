/**
 * Procedural asteroid surface — material tints, shape warps, module draw helpers.
 */

import { compositionFillStyle, primaryComposition } from './AsteroidCatalog.js';

/** @typedef {'potato'|'spinningTop'|'bilobed'|'rubblePile'} ShapeProfileId */

export const SHAPE_PROFILES = ['potato', 'spinningTop', 'bilobed', 'rubblePile'];

const PATTERN_CACHE = new Map();
const PATTERN_SIZE = 64;

/** Seeded 0..1 from integers (no RNG instance needed at draw time). */
export function hash01(a, b = 0, c = 0) {
  let h = (a * 374761393) ^ (b * 668265263) ^ (c * 1274126177);
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}

/**
 * @param {import('../utils/SeededRandom.js').SeededRandom|null} rng
 * @param {number} seed
 * @returns {ShapeProfileId}
 */
export function rollShapeProfile(rng, seed) {
  if (rng) return rng.pick(SHAPE_PROFILES);
  const idx = Math.floor(hash01(seed, 91) * SHAPE_PROFILES.length);
  return SHAPE_PROFILES[idx] ?? 'potato';
}

/**
 * Radius multiplier for shape profile at angle θ (local space).
 * @param {ShapeProfileId} profile
 * @param {number} theta
 * @param {number} seed
 */
export function shapeRadiusMul(profile, theta, seed) {
  switch (profile) {
    case 'spinningTop':
      return 0.82 + 0.28 * Math.pow(Math.cos(theta * 2), 2);
    case 'bilobed': {
      const l1 = Math.hypot(Math.cos(theta) - 0.38, Math.sin(theta));
      const l2 = Math.hypot(Math.cos(theta) + 0.38, Math.sin(theta));
      return 0.55 + 0.45 * Math.min(l1, l2) * 1.8;
    }
    case 'rubblePile':
      return (
        0.68 +
        hash01(seed, Math.floor(Math.cos(theta) * 100), Math.floor(Math.sin(theta) * 100)) *
          0.38
      );
    default:
      return 1;
  }
}

/**
 * Irregular polygon vertices around origin.
 * @param {number} seed
 * @param {number} radius
 * @param {ShapeProfileId} profile
 * @param {number} [sideBias]
 */
export function generateRockVertices(seed, radius, profile = 'potato', sideBias = 0) {
  const profileN = (seed + sideBias * 17) % 5;
  const sides = 7 + profileN + (seed % 3);
  const verts = [];
  for (let i = 0; i < sides; i++) {
    const theta = (i / sides) * Math.PI * 2;
    const jag = 0.72 + ((seed * (i + 1) * (7 + profileN)) % 100) / 180;
    const shapeMul = shapeRadiusMul(profile, theta, seed + i * 13);
    const r = radius * jag * shapeMul;
    verts.push({ x: Math.cos(theta) * r, y: Math.sin(theta) * r });
  }
  return verts;
}

/**
 * Fixed-local surface anchors (craters / regolith patches) for readable spin.
 * @param {number} seed
 * @param {number} radius
 * @param {number} count
 */
export function generateSurfaceAnchors(seed, radius, count = 2) {
  const anchors = [];
  const n = Math.max(1, Math.min(3, count | 0));
  for (let i = 0; i < n; i++) {
    const t = hash01(seed, i + 3, 17) * Math.PI * 2;
    const dist = radius * (0.15 + hash01(seed, i + 7, 23) * 0.55);
    const r = radius * (0.08 + hash01(seed, i + 11, 29) * 0.14);
    anchors.push({
      x: Math.cos(t) * dist,
      y: Math.sin(t) * dist,
      r,
      kind: hash01(seed, i + 19, 31) > 0.55 ? 'crater' : 'patch',
    });
  }
  return anchors;
}

/**
 * Cached CanvasPattern for module fill (bucketed seed).
 * @param {string} compositionTag
 * @param {number} seed
 */
export function getMaterialPattern(compositionTag, seed) {
  const bucket = (seed >>> 0) % 256;
  const key = `${compositionTag}:${bucket}`;
  if (PATTERN_CACHE.has(key)) return PATTERN_CACHE.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = PATTERN_SIZE;
  canvas.height = PATTERN_SIZE;
  const c = canvas.getContext('2d');
  const base = compositionFillStyle({ [compositionTag]: 1 }, 1);
  c.fillStyle = base;
  c.fillRect(0, 0, PATTERN_SIZE, PATTERN_SIZE);

  const nSpeck = 28 + (bucket % 12);
  for (let i = 0; i < nSpeck; i++) {
    const x = hash01(bucket, i, 1) * PATTERN_SIZE;
    const y = hash01(bucket, i, 2) * PATTERN_SIZE;
    const s = 0.6 + hash01(bucket, i, 3) * 1.8;
    const dark = hash01(bucket, i, 4) > 0.5;
    c.fillStyle = dark ? 'rgba(20,18,16,0.35)' : 'rgba(220,210,200,0.12)';
    c.beginPath();
    c.arc(x, y, s, 0, Math.PI * 2);
    c.fill();
  }

  if (compositionTag === 'iron' || compositionTag === 'titanium') {
    for (let i = 0; i < 6; i++) {
      const x = hash01(bucket + 50, i, 5) * PATTERN_SIZE;
      const y = hash01(bucket + 50, i, 6) * PATTERN_SIZE;
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.beginPath();
      c.arc(x, y, 1.2 + hash01(bucket, i, 7) * 2, 0, Math.PI * 2);
      c.fill();
    }
  }

  const pattern = c.createPattern(canvas, 'repeat');
  PATTERN_CACHE.set(key, pattern);
  return pattern;
}

/**
 * Draw one asteroid module in parent-local space (already translated/rotated).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} mod
 * @param {number} zoom
 * @param {boolean} [detail]
 */
export function drawModuleSurface(ctx, mod, zoom, detail = true) {
  const verts = mod.vertices;
  if (!verts?.length) return;

  ctx.beginPath();
  ctx.moveTo(mod.ox + verts[0].x, mod.oy + verts[0].y);
  for (let i = 1; i < verts.length; i++) {
    ctx.lineTo(mod.ox + verts[i].x, mod.oy + verts[i].y);
  }
  ctx.closePath();

  const tag = mod.compositionTag || primaryComposition(mod.composition);
  const pattern = detail && zoom > 0.35 ? getMaterialPattern(tag, mod.lootSeed ?? mod.seed ?? 0) : null;
  if (pattern) {
    ctx.fillStyle = pattern;
  } else {
    ctx.fillStyle = compositionFillStyle(mod.composition ?? tag, 1);
  }
  ctx.fill();

  ctx.strokeStyle = compositionFillStyle(mod.composition ?? tag, 0.55);
  ctx.lineWidth = Math.max(0.6, 1.1 / Math.max(zoom, 0.001));
  ctx.stroke();

  if (!detail || zoom < 0.2) return;

  const anchors = mod.anchors;
  if (!anchors?.length) return;
  for (const a of anchors) {
    const ax = mod.ox + a.x;
    const ay = mod.oy + a.y;
    if (a.kind === 'crater') {
      ctx.fillStyle = 'rgba(12,10,8,0.55)';
      ctx.beginPath();
      ctx.arc(ax, ay, a.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,35,30,0.4)';
      ctx.lineWidth = Math.max(0.4, 0.7 / Math.max(zoom, 0.001));
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(200,195,185,0.15)';
      ctx.beginPath();
      ctx.arc(ax, ay, a.r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Composite outline vertices from active modules (convex hull approximation).
 * @param {object[]} modules
 */
export function compositeOutlineVertices(modules) {
  const pts = [];
  for (const m of modules) {
    if (m.active === false) continue;
    for (const v of m.vertices || []) {
      pts.push({ x: m.ox + v.x, y: m.oy + v.y });
    }
  }
  if (pts.length < 3) return pts;
  return convexHull(pts);
}

/** @param {{ x: number, y: number }[]} points */
function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Bounding radius from module set. */
export function boundingRadiusFromModules(modules) {
  let maxR = 1;
  for (const m of modules) {
    if (m.active === false) continue;
    const mr = m.radius ?? 0;
    const dist = Math.hypot(m.ox ?? 0, m.oy ?? 0) + mr;
    if (dist > maxR) maxR = dist;
  }
  return maxR;
}

/**
 * Seeded crack segments across a module (local space, relative to module origin).
 * @param {object} mod
 * @param {number} hitX local hit on module
 * @param {number} hitY
 */
export function generateCrackLines(mod, hitX, hitY) {
  const seed = (mod.lootSeed ?? mod.seed ?? 1) >>> 0;
  const ox = mod.ox ?? 0;
  const oy = mod.oy ?? 0;
  const hx = hitX - ox;
  const hy = hitY - oy;
  const n = 3 + (seed % 6);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const ang = hash01(seed, i, 40) * Math.PI * 2;
    const len = (mod.radius ?? 8) * (0.35 + hash01(seed, i, 41) * 0.85);
    lines.push({
      x1: hx,
      y1: hy,
      x2: hx + Math.cos(ang) * len,
      y2: hy + Math.sin(ang) * len,
    });
  }
  return lines;
}

/**
 * Heat-glow crack overlay for a module being mined.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} mod
 * @param {number} progress 0..1
 * @param {number} zoom
 */
export function drawCrackOverlay(ctx, mod, progress, zoom) {
  const lines = mod.crackLines;
  if (!lines?.length || progress <= 0) return;
  const ox = mod.ox ?? 0;
  const oy = mod.oy ?? 0;
  const glow = 0.35 + progress * 0.65;
  const core = progress > 0.75 ? `rgba(255,240,220,${glow})` : `rgba(255,120,40,${glow})`;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = core;
  ctx.lineWidth = Math.max(0.8, (1.2 + progress * 1.8) / Math.max(zoom, 0.001));
  ctx.shadowColor = 'rgba(255,100,30,0.9)';
  ctx.shadowBlur = 4 + progress * 10;
  for (const ln of lines) {
    ctx.beginPath();
    ctx.moveTo(ox + ln.x1, oy + ln.y1);
    ctx.lineTo(ox + ln.x1 + (ln.x2 - ln.x1) * progress, oy + ln.y1 + (ln.y2 - ln.y1) * progress);
    ctx.stroke();
  }
  ctx.restore();
}
