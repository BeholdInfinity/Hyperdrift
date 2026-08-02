/**
 * Asteroid size tiers, volume, capacity, composition mixes, yield stubs.
 * Single authority for proc + hero rock generation.
 * Rock weight = composition base density × tier volume (Fibonacci 1–21).
 */

/** @typedef {'very_small'|'small'|'small_medium'|'medium'|'large_medium'|'large'|'very_large'} SizeTierId */

export const SIZE_TIERS = [
  {
    id: 'very_small',
    label: 'Very Small',
    volume: 1,
    capacityMin: 0,
    capacityMax: 1,
    procWeight: 15,
    radiusMin: 6,
    radiusMax: 12,
    heroOnly: false,
  },
  {
    id: 'small',
    label: 'Small',
    volume: 2,
    capacityMin: 0,
    capacityMax: 2,
    procWeight: 25,
    radiusMin: 12,
    radiusMax: 18,
    heroOnly: false,
  },
  {
    id: 'small_medium',
    label: 'Small-Medium',
    volume: 3,
    capacityMin: 1,
    capacityMax: 3,
    procWeight: 40,
    radiusMin: 18,
    radiusMax: 26,
    heroOnly: false,
  },
  {
    id: 'medium',
    label: 'Medium',
    volume: 5,
    capacityMin: 2,
    capacityMax: 5,
    procWeight: 15,
    radiusMin: 26,
    radiusMax: 36,
    heroOnly: false,
  },
  {
    id: 'large_medium',
    label: 'Large-Medium',
    volume: 8,
    capacityMin: 3,
    capacityMax: 8,
    procWeight: 5,
    radiusMin: 36,
    radiusMax: 48,
    heroOnly: false,
  },
  {
    id: 'large',
    label: 'Large',
    volume: 13,
    capacityMin: 5,
    capacityMax: 13,
    procWeight: 0,
    radiusMin: 48,
    radiusMax: 70,
    heroOnly: true,
  },
  {
    id: 'very_large',
    label: 'Very Large',
    volume: 21,
    capacityMin: 8,
    capacityMax: 21,
    procWeight: 0,
    radiusMin: 70,
    radiusMax: 110,
    heroOnly: true,
  },
];

const TIER_BY_ID = Object.fromEntries(SIZE_TIERS.map((t) => [t.id, t]));

export function getSizeTier(id) {
  return TIER_BY_ID[id] ?? TIER_BY_ID.small_medium;
}

/** Proc belt size roll (excludes hero-only Large / Very Large). */
export function rollProcSizeTier(rng) {
  let sum = 0;
  for (const t of SIZE_TIERS) {
    if (!t.heroOnly) sum += t.procWeight;
  }
  let roll = rng.next() * sum;
  for (const t of SIZE_TIERS) {
    if (t.heroOnly) continue;
    roll -= t.procWeight;
    if (roll <= 0) return t.id;
  }
  return 'small_medium';
}

export function rollCapacity(rng, sizeTierId) {
  const t = getSizeTier(sizeTierId);
  if (t.capacityMax <= t.capacityMin) return t.capacityMin;
  return rng.int(t.capacityMin, t.capacityMax);
}

export function rollRadius(rng, sizeTierId) {
  const t = getSizeTier(sizeTierId);
  return rng.range(t.radiusMin, t.radiusMax);
}

/** HP scales with size + capacity so ammo still destroys meaningfully. */
export function hpForRock(radius, capacityMax) {
  return Math.max(1, Math.ceil(radius / 4 + (capacityMax ?? 0) * 2));
}

/**
 * Normalize composition weights. Accepts mix object or legacy string tag.
 * @returns {Record<string, number>}
 */
export function normalizeComposition(comp) {
  if (!comp) return { silicate: 1 };
  if (typeof comp === 'string') return { [comp]: 1 };
  const out = {};
  let sum = 0;
  for (const [k, v] of Object.entries(comp)) {
    const n = Number(v);
    if (n > 0) {
      out[k] = n;
      sum += n;
    }
  }
  if (sum <= 0) return { silicate: 1 };
  for (const k of Object.keys(out)) out[k] /= sum;
  return out;
}

export function primaryComposition(comp) {
  const mix = normalizeComposition(comp);
  let best = 'silicate';
  let bestW = -1;
  for (const [k, v] of Object.entries(mix)) {
    if (v > bestW) {
      bestW = v;
      best = k;
    }
  }
  return best;
}

/** UI label e.g. Icy-Iron when secondary ≥ 0.25. */
export function compositionLabel(comp) {
  const mix = normalizeComposition(comp);
  const entries = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return 'Silicate';
  const [p, pw] = entries[0];
  const pretty = (k) => k.charAt(0).toUpperCase() + k.slice(1);
  if (entries.length > 1 && entries[1][1] >= 0.25) {
    return `${pretty(p)}-${pretty(entries[1][0])}`;
  }
  return pretty(p);
}

const COMP_TINT = {
  iron: { r: 145, g: 118, b: 95 },
  ice: { r: 195, g: 210, b: 228 },
  silicate: { r: 90, g: 88, b: 85 },
  carbonaceous: { r: 70, g: 65, b: 60 },
  rare: { r: 160, g: 150, b: 120 },
  titanium: { r: 140, g: 145, b: 155 },
};

/** Relative mass density per composition tag (silicate = 1). */
export const COMPOSITION_BASE_WEIGHT = {
  silicate: 1,
  iron: 1.45,
  carbonaceous: 0.85,
  ice: 0.42,
  rare: 1.25,
  titanium: 1.55,
};

/** Weighted-average base density for a composition mix. */
export function compositionBaseWeight(comp) {
  const mix = normalizeComposition(comp);
  let sum = 0;
  for (const [k, w] of Object.entries(mix)) {
    sum += w * (COMPOSITION_BASE_WEIGHT[k] ?? COMPOSITION_BASE_WEIGHT.silicate);
  }
  return sum > 0 ? sum : COMPOSITION_BASE_WEIGHT.silicate;
}

/** Rock mass taxonomy — tier volume × material base weight. */
export function rockWeight(volume, comp) {
  const v = Math.max(0, Number(volume) || 0);
  return v * compositionBaseWeight(comp);
}

/** CSS fill color from composition mix. */
export function compositionFillStyle(comp, alpha = 1) {
  const mix = normalizeComposition(comp);
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [k, w] of Object.entries(mix)) {
    const t = COMP_TINT[k] || COMP_TINT.silicate;
    r += t.r * w;
    g += t.g * w;
    b += t.b * w;
  }
  return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
}

/**
 * Pick composition mix from ring default + optional subBelts covering (sampleR, theta).
 */
export function pickCompositionMix(rng, ring, sampleR, theta) {
  const sub = pickSubBelt(ring, sampleR, theta);
  const source = sub?.composition ?? ring?.composition;
  if (!source || typeof source !== 'object') {
    return normalizeComposition(typeof source === 'string' ? source : 'silicate');
  }
  // Soften pure single-tag into a slight mix for ice/iron fantasy.
  const mix = normalizeComposition(source);
  const keys = Object.keys(mix);
  if (keys.length === 1 && (keys[0] === 'ice' || keys[0] === 'iron')) {
    const other = keys[0] === 'ice' ? 'iron' : 'ice';
    const bleed = rng.range(0.05, 0.22);
    return normalizeComposition({ [keys[0]]: 1 - bleed, [other]: bleed });
  }
  return mix;
}

/** Most specific overlapping subBelt (smallest area), or null. */
export function pickSubBelt(ring, sampleR, theta) {
  const list = ring?.subBelts;
  if (!list?.length) return null;
  const annulusW = Math.max(1, (ring.outerR ?? 0) - (ring.innerR ?? 0));
  const t = ((sampleR ?? 0) - (ring.innerR ?? 0)) / annulusW;
  let best = null;
  let bestArea = Infinity;
  for (const sb of list) {
    const t0 = sb.t0 ?? 0;
    const t1 = sb.t1 ?? 1;
    if (t < t0 || t > t1) continue;
    const th0 = sb.theta0;
    const th1 = sb.theta1;
    if (th0 != null && th1 != null) {
      let a = theta;
      while (a < th0) a += Math.PI * 2;
      while (a > th1 + Math.PI * 2) a -= Math.PI * 2;
      if (a < th0 || a > th1) continue;
    }
    const angSpan =
      th0 != null && th1 != null ? Math.abs(th1 - th0) : Math.PI * 2;
    const area = Math.max(1e-6, (t1 - t0) * angSpan);
    if (area < bestArea) {
      bestArea = area;
      best = sb;
    }
  }
  return best;
}

/** Laser Mk → fraction of capacityMax recoverable over the rock's life (stub). */
export function laserYieldFrac(laserMk = 1) {
  const mk = Math.max(1, Math.min(5, laserMk | 0));
  return 0.75 + ((mk - 1) / 4) * 0.25;
}

export function ammoYieldCount(capacityRemaining) {
  return Math.floor(Math.max(0, capacityRemaining) * 0.25);
}

/**
 * Smallest size tier that can still hold `remaining` capacity (mining shrink).
 * @returns {SizeTierId|null} null if remaining is 0
 */
export function tierForRemainingCapacity(remaining, allowHeroTiers = false) {
  if (remaining <= 0) return null;
  const list = allowHeroTiers
    ? SIZE_TIERS
    : SIZE_TIERS.filter((t) => !t.heroOnly);
  for (const t of list) {
    if (t.capacityMax >= remaining) return t.id;
  }
  return list[list.length - 1].id;
}

/** Expand concrete drop table later — hook from lootSeed + composition. */
export function resolveDropTable(lootSeed, composition) {
  return {
    resolved: false,
    lootSeed,
    composition: normalizeComposition(composition),
    entries: null,
  };
}

/**
 * Full gen-time rock stats for catalogs / heroes.
 * @param {object} opts
 * @param {object} opts.rng SeededRandom
 * @param {string} [opts.sizeTierId]
 * @param {boolean} [opts.allowHeroTiers]
 * @param {object} [opts.ring]
 * @param {number} [opts.sampleR]
 * @param {number} [opts.theta]
 * @param {Record<string, number>|string} [opts.composition]
 */
export function rollRockStats(opts) {
  const rng = opts.rng;
  const sizeTierId =
    opts.sizeTierId ??
    (opts.allowHeroTiers
      ? rollProcSizeTier(rng) // caller should pass hero tiers explicitly
      : rollProcSizeTier(rng));
  const tier = getSizeTier(sizeTierId);
  const capacityMax = rollCapacity(rng, sizeTierId);
  const radius = rollRadius(rng, sizeTierId);
  const composition =
    opts.composition != null
      ? normalizeComposition(opts.composition)
      : pickCompositionMix(rng, opts.ring, opts.sampleR, opts.theta);
  const seed = rng.int(1, 99999);
  const volume = tier.volume;
  return {
    sizeTier: sizeTierId,
    volume,
    weight: rockWeight(volume, composition),
    capacityMax,
    capacityRemaining: capacityMax,
    radius,
    hp: hpForRock(radius, capacityMax),
    seed,
    composition,
    compositionTag: primaryComposition(composition),
    lootSeed: (seed * 1103515245 + (rng.int(1, 1e6) | 0)) >>> 0,
    dropTable: null,
  };
}
