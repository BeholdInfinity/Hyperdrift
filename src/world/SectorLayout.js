/**
 * Sector layout sampling — ring at world radius, composition pick, bounds.
 */

import { SECTOR_LAYOUT } from './data/sectorLayout.js';

export function getSectorLayout() {
  return SECTOR_LAYOUT;
}

export function radiusAt(x, y) {
  return Math.hypot(x, y);
}

export function ringAt(x, y) {
  const r = radiusAt(x, y);
  const { planet, rings } = SECTOR_LAYOUT;
  if (r < planet.radius) return null;
  for (const ring of rings) {
    if (r >= ring.innerR && r <= ring.outerR) return ring;
  }
  return null;
}

/** Weighted composition tag for spawning / mining. */
export function pickCompositionTag(rng, ring) {
  if (!ring?.composition) return 'silicate';
  const comp = ring.composition;
  const keys = Object.keys(comp);
  let sum = 0;
  for (const k of keys) sum += comp[k];
  let roll = rng.next() * sum;
  for (const k of keys) {
    roll -= comp[k];
    if (roll <= 0) return k;
  }
  return keys[keys.length - 1] || 'silicate';
}

export function ringDensityMultiplier(x, y) {
  const ring = ringAt(x, y);
  if (!ring) return 0.15;
  return ring.density;
}

export function isInsidePlayableSector(x, y) {
  const r = radiusAt(x, y);
  const outer = SECTOR_LAYOUT.rings[SECTOR_LAYOUT.rings.length - 1]?.outerR ?? 60000;
  return r >= SECTOR_LAYOUT.planet.radius * 0.98 && r <= outer * 1.05;
}
