/**
 * Ship-local silhouette outlines for scan FX / clip paths.
 * Built from the same section footprints used by SectionDraw / StarterBellDraw.
 */

import { getShipClass } from './ShipClasses.js';
import { BELL_FEET, ULTRA_FEET, sectionScale } from './SectionGeometry.js';

const SAMPLE_N = 28;
/** @type {WeakMap<object, { key: string, n: number, verts: {x:number,y:number}[] }>} */
const _cache = new WeakMap();

function layoutKey(def) {
  const ids = def?.sectionIds || {};
  const parts = [];
  for (const role of Object.keys(ids).sort()) parts.push(`${role}:${ids[role]}`);
  return `${def?.classId || ''}|${parts.join(',')}`;
}

function scaleFoot(pts, s) {
  if (!(s > 0) || s === 1) return pts.map(([x, y]) => [x, y]);
  return pts.map(([x, y]) => [x * s, y * s]);
}

/**
 * Unit footprint for one catalog section (mirrors SectionDraw / bell feet).
 * @param {object} sec
 * @returns {[number, number][] | null}
 */
export function sectionUnitFootprint(sec) {
  if (!sec) return null;
  const classId = sec.classId;
  const role = sec.role;
  const cls = getShipClass(classId);
  const group = cls?.swapGroup || sec.swapGroup;
  const theme = sec.theme || '';

  if (sec.geometryKey === 'bell') {
    return BELL_FEET[role] || null;
  }

  if (group === 'ultraLight' || role === 'hull') {
    return ULTRA_FEET[classId] || ULTRA_FEET.lightFighter;
  }

  if (group === 'light') {
    if (role === 'cockpit') {
      if (classId === 'fighter') {
        return [
          [16, -4],
          [8, -6],
          [4, -5],
          [4, 5],
          [8, 6],
          [16, 4],
          [17, 0],
        ];
      }
      return [
        [14, -5],
        [6, -7],
        [2, -6],
        [2, 6],
        [6, 7],
        [14, 5],
        [15.5, 0],
      ];
    }
    if (classId === 'fighter') {
      return [
        [2, -7],
        [-8, -9],
        [-14, -5],
        [-14, 5],
        [-8, 9],
        [2, 7],
      ];
    }
    return [
      [2, -8],
      [-6, -10],
      [-14, -7],
      [-14, 7],
      [-6, 10],
      [2, 8],
    ];
  }

  if (group === 'heavy') {
    const isTransport = classId === 'heavyTransport';
    const isHauler = classId === 'heavyHauler';
    const isFighter = classId === 'heavyFighter';
    const eliteYacht = isTransport && theme === 'elite';
    const cruise = isTransport && (theme === 'civMid' || theme === 'civUpper');
    if (role === 'bridge') {
      if (eliteYacht) {
        return [
          [20, -5],
          [12, -7],
          [6, -6],
          [6, 6],
          [12, 7],
          [20, 5],
          [22, 0],
        ];
      }
      if (cruise) {
        return [
          [19, -6],
          [11, -8],
          [6, -7],
          [6, 7],
          [11, 8],
          [19, 6],
          [21, 0],
        ];
      }
      if (isFighter) {
        return [
          [18, -7],
          [10, -9],
          [6, -8],
          [6, 8],
          [10, 9],
          [18, 7],
          [20, 0],
        ];
      }
      return [
        [20, -5],
        [12, -7],
        [6, -6],
        [6, 6],
        [12, 7],
        [20, 5],
        [21.5, 0],
      ];
    }
    if (role === 'body') {
      if (eliteYacht) {
        return [
          [10, -10],
          [2, -12],
          [-10, -13],
          [-16, -11],
          [-16, 11],
          [-10, 13],
          [2, 12],
          [10, 10],
        ];
      }
      if (cruise) {
        return [
          [10, -11],
          [2, -13],
          [-10, -14],
          [-16, -12],
          [-16, 12],
          [-10, 14],
          [2, 13],
          [10, 11],
        ];
      }
      if (isHauler) {
        return [
          [10, -12],
          [2, -14],
          [-12, -15],
          [-16, -13],
          [-16, 13],
          [-12, 15],
          [2, 14],
          [10, 12],
        ];
      }
      if (isFighter) {
        return [
          [10, -12],
          [2, -14],
          [-10, -15],
          [-16, -12],
          [-16, 12],
          [-10, 15],
          [2, 14],
          [10, 12],
        ];
      }
      return [
        [10, -11],
        [2, -13],
        [-10, -14],
        [-16, -12],
        [-16, 12],
        [-10, 14],
        [2, 13],
        [10, 11],
      ];
    }
    // aft / engine
    return [
      [-6, -13],
      [-14, -15],
      [-20, -8],
      [-20, 8],
      [-14, 15],
      [-6, 13],
    ];
  }

  // Standard group (and fallback)
  const isTank = classId === 'standardFighter';
  const isHauler = classId === 'hauler';
  const isTransport = classId === 'standardTransport';
  const isScience = classId === 'science';
  const isMiner = classId === 'miner';

  if (role === 'bridge' || role === 'cockpit') {
    if (isTank) {
      return [
        [18, -6],
        [10, -8],
        [6, -7],
        [6, 7],
        [10, 8],
        [18, 6],
        [20, 0],
      ];
    }
    if (isTransport) {
      return [
        [18, -5],
        [10, -7],
        [6, -6],
        [6, 6],
        [10, 7],
        [18, 5],
        [19, 0],
      ];
    }
    if (isScience) {
      return [
        [22, -3],
        [12, -5],
        [6, -4.5],
        [6, 4.5],
        [12, 5],
        [22, 3],
        [24, 0],
      ];
    }
    return [
      [20, -4],
      [12, -6],
      [8, -5],
      [8, 5],
      [12, 6],
      [20, 4],
      [21.5, 0],
    ];
  }

  if (role === 'body' || role === 'hull') {
    if (isTank) {
      return [
        [10, -10],
        [2, -12],
        [-10, -13],
        [-14, -10],
        [-14, 10],
        [-10, 13],
        [2, 12],
        [10, 10],
      ];
    }
    if (isHauler) {
      return [
        [10, -9],
        [2, -12],
        [-12, -14],
        [-16, -11],
        [-16, 11],
        [-12, 14],
        [2, 12],
        [10, 9],
      ];
    }
    if (isTransport) {
      return [
        [10, -8],
        [2, -10],
        [-10, -11],
        [-14, -9],
        [-14, 9],
        [-10, 11],
        [2, 10],
        [10, 8],
      ];
    }
    if (isMiner) {
      return [
        [10, -8],
        [2, -10],
        [-8, -12],
        [-14, -10],
        [-14, 10],
        [-8, 12],
        [2, 10],
        [10, 8],
      ];
    }
    return [
      [10, -7],
      [4, -9],
      [-6, -11],
      [-14, -13],
      [-16, -11],
      [-16, 11],
      [-14, 13],
      [-6, 11],
      [4, 9],
      [10, 7],
    ];
  }

  // aft / engine
  if (isHauler || isTank) {
    return [
      [-6, -12],
      [-14, -14],
      [-20, -8],
      [-20, 8],
      [-14, 14],
      [-6, 12],
    ];
  }
  return [
    [-8, -12],
    [-14, -14],
    [-20, -7],
    [-20, 7],
    [-14, 14],
    [-8, 12],
  ];
}

/**
 * Scaled ship-local footprint for one section.
 * @param {object} sec
 * @param {number} [classScale]
 * @returns {[number, number][] | null}
 */
export function scaledSectionFootprint(sec, classScale) {
  const unit = sectionUnitFootprint(sec);
  if (!unit?.length) return null;
  const clsScale = classScale ?? getShipClass(sec.classId)?.scale ?? 1;
  const s =
    sec.geometryKey === 'bell'
      ? clsScale || 1
      : sectionScale(clsScale, sec.morph || 0);
  return scaleFoot(unit, s);
}

/** Ray P+tD vs segment AB — max t ≥ 0 or null. */
function raySegT(ox, oy, dx, dy, ax, ay, bx, by) {
  const ex = bx - ax;
  const ey = by - ay;
  const det = dx * ey - dy * ex;
  if (Math.abs(det) < 1e-9) return null;
  const fx = ax - ox;
  const fy = ay - oy;
  const t = (fx * ey - fy * ex) / det;
  const u = (fx * dy - fy * dx) / det;
  if (t >= 1e-6 && u >= 0 && u <= 1) return t;
  return null;
}

function rayPolyMaxT(dx, dy, poly) {
  let best = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const t = raySegT(0, 0, dx, dy, a[0], a[1], b[0], b[1]);
    if (t != null && t > best) best = t;
  }
  return best;
}

/**
 * Outer radial envelope of overlapping section footprints (ship-local).
 * @param {Array<[number, number][]>} polys
 * @param {number} samples
 * @returns {{ x: number, y: number }[]}
 */
function radialEnvelope(polys, samples) {
  const verts = [];
  const n = Math.max(8, samples | 0);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    let best = 0;
    for (const poly of polys) {
      const t = rayPolyMaxT(dx, dy, poly);
      if (t > best) best = t;
    }
    if (best < 1e-3) {
      // Fallback: farthest vertex projection on this ray
      for (const poly of polys) {
        for (const [x, y] of poly) {
          const proj = x * dx + y * dy;
          if (proj > best) best = proj;
        }
      }
    }
    if (best < 1e-3) best = 1;
    verts.push({ x: dx * best, y: dy * best });
  }
  return verts;
}

/**
 * Ship-local silhouette outline ({x,y}[], nose = +X).
 * @param {import('./ShipDefinition.js').ShipDefinition|object} defOrShip
 * @param {{ samples?: number }} [opts]
 * @returns {{ x: number, y: number }[] | null}
 */
export function shipLocalSilhouetteVerts(defOrShip, opts = {}) {
  const def =
    defOrShip?.shipDef && typeof defOrShip.shipDef.sections === 'function'
      ? defOrShip.shipDef
      : defOrShip;
  if (!def || typeof def.sections !== 'function') return null;

  const samples = opts.samples ?? SAMPLE_N;
  const key = layoutKey(def);
  const hit = _cache.get(def);
  if (hit && hit.key === key && hit.n === samples) return hit.verts;

  const classScale = def.scale ?? getShipClass(def.classId)?.scale ?? 1;
  /** @type {Array<[number, number][]>} */
  const polys = [];
  for (const sec of def.sections()) {
    const foot = scaledSectionFootprint(sec, classScale);
    if (foot && foot.length >= 3) polys.push(foot);
  }
  if (!polys.length) return null;

  const verts = radialEnvelope(polys, samples);
  _cache.set(def, { key, n: samples, verts });
  return verts;
}
