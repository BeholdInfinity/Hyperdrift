/**
 * Planet-radial social tier spawn affinity for ambient traffic.
 */

import { getSectorLayout } from './SectorLayout.js';

/** @typedef {import('./data/sectorLayout.js').default} SectorLayout */

const DEFAULT_SOCIAL_ORBIT_INNER = {
  military: 450000,
  elite: 450000,
  home: 490000,
  upper: 520000,
  mid: 540000,
  guild: 560000,
  poor: 590000,
  derelict: 600000,
  pirate: 620000,
};

export const TIER_CLASS_POOLS = {
  military: [],
  elite: ['standardTransport', 'hauler', 'generalist'],
  home: ['transport', 'hauler', 'generalist', 'science'],
  upper: ['transport', 'hauler', 'generalist', 'science'],
  mid: ['transport', 'hauler', 'generalist', 'science'],
  guild: ['miner', 'hauler', 'scout'],
  poor: ['scout', 'drone', 'miner'],
  derelict: ['scout', 'drone', 'miner'],
  pirate: ['racer', 'scout', 'drone'],
};

export function getSocialOrbitInnerFromLayout(layout = getSectorLayout()) {
  return layout?.socialOrbitInner ?? DEFAULT_SOCIAL_ORBIT_INNER;
}

function tierSigma(tierId, orbitR, sortedTiers, sigmaFactor) {
  const idx = sortedTiers.findIndex((t) => t.id === tierId);
  let gap = orbitR * 0.15;
  if (idx > 0) gap = Math.min(gap, sortedTiers[idx].r - sortedTiers[idx - 1].r);
  if (idx >= 0 && idx < sortedTiers.length - 1) {
    gap = Math.min(gap, sortedTiers[idx + 1].r - sortedTiers[idx].r);
  }
  return Math.max(8000, gap * sigmaFactor);
}

/**
 * @param {number} r planet-center radial distance (u)
 * @param {object} [layout]
 * @param {{ floor?: number, sigmaFactor?: number }} [opts]
 */
export function tierAffinityWeights(r, layout = getSectorLayout(), opts = {}) {
  const floor = opts.floor ?? 0.05;
  const sigmaFactor = opts.sigmaFactor ?? 0.35;
  const inner = getSocialOrbitInnerFromLayout(layout);
  const sortedTiers = Object.entries(inner)
    .map(([id, orbitR]) => ({ id, r: orbitR }))
    .sort((a, b) => a.r - b.r);

  const weights = {};
  for (const { id, r: tierR } of sortedTiers) {
    const sigma = tierSigma(id, tierR, sortedTiers, sigmaFactor);
    const d = r - tierR;
    weights[id] = floor + (1 - floor) * Math.exp(-(d * d) / (2 * sigma * sigma));
  }
  return weights;
}

export function pickSocialTierForRadius(r, layout = getSectorLayout(), rng = Math.random, opts = {}) {
  const weights = tierAffinityWeights(r, layout, opts);
  let sum = 0;
  for (const w of Object.values(weights)) sum += w;
  if (sum <= 0) return 'mid';
  let roll = rng() * sum;
  for (const [id, w] of Object.entries(weights)) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return Object.keys(weights).pop() || 'mid';
}

export function tierAffinityAtRadius(r, tierId, layout = getSectorLayout(), opts = {}) {
  return tierAffinityWeights(r, layout, opts)[tierId] ?? opts.floor ?? 0.05;
}

export function shipClassForTier(tierId, rng = Math.random) {
  const pool = TIER_CLASS_POOLS[tierId] || TIER_CLASS_POOLS.mid;
  if (!pool.length) return 'generalist';
  return pool[(rng() * pool.length) | 0];
}

export function planetRadialDistance(x, y, layout = getSectorLayout()) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  return Math.hypot(x - cx, y - cy);
}
