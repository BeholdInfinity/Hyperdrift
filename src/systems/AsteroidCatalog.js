/**
 * Asteroid size tiers, volume, capacity, composition mixes, yield stubs.
 * Single authority for proc + hero rock generation.
 * Rock weight = composition base density × tier volume (Fibonacci 1–21).
 */

import { SeededRandom } from '../utils/SeededRandom.js';
import {
  boundingRadiusFromModules,
  compositeOutlineVertices,
  generateRockVertices,
  generateSurfaceAnchors,
  rollShapeProfile,
} from './AsteroidSurface.js';

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

const ORE_BY_TAG = {
  silicate: 'stoneOre',
  iron: 'ironOre',
  ice: 'waterIce',
  carbonaceous: 'carbonOre',
  rare: 'rareOre',
  titanium: 'titaniumOre',
};

/** Pop duration baseline (seconds at laser Mk1) by primary tag. */
export const POP_BASE_SECONDS = {
  silicate: 2.8,
  iron: 3.6,
  ice: 2.0,
  carbonaceous: 2.5,
  rare: 3.2,
  titanium: 3.8,
};

export function basePopSeconds(compositionTag) {
  return POP_BASE_SECONDS[compositionTag] ?? POP_BASE_SECONDS.silicate;
}

/** Laser Mk speeds crack→pop (Mk5 ≈ 0.55× duration). */
export function laserMkPopFactor(laserMk = 1) {
  const mk = Math.max(1, Math.min(5, laserMk | 0));
  return 0.75 + ((mk - 1) / 4) * 0.25;
}

/** Signed rad/s; ~5–10% land at zero for visual variety. */
export function rollSpinSpeed(rng, seed = 0) {
  const r = rng ?? new SeededRandom((seed >>> 0) || 1);
  if (r.next() < 0.08) return 0;
  return r.range(-0.14, 0.14);
}

/** Hybrid module composition — ~30% pocket re-roll from ring context. */
export function rollModuleComposition(rng, parentMix, parentTag, moduleIndex, ctx = {}) {
  const { ring, sampleR, theta } = ctx;
  if (ring && rng.next() < 0.3) {
    return pickCompositionMix(rng, ring, sampleR, theta);
  }
  const mix = normalizeComposition(parentMix);
  const bleedTags = Object.keys(COMPOSITION_BASE_WEIGHT).filter((k) => k !== parentTag);
  if (rng.next() < 0.35 && bleedTags.length) {
    const other = rng.pick(bleedTags);
    const bleed = rng.range(0.08, 0.22);
    return normalizeComposition({ ...mix, [other]: (mix[other] ?? 0) + bleed, [parentTag]: Math.max(0.05, (mix[parentTag] ?? 0.7) - bleed * 0.5) });
  }
  return mix;
}

/** Resolve drop table from lootSeed + module composition. */
export function resolveDropTable(lootSeed, composition) {
  const mix = normalizeComposition(composition);
  const tag = primaryComposition(mix);
  const oreType = ORE_BY_TAG[tag] ?? ORE_BY_TAG.silicate;
  const rng = new SeededRandom((lootSeed >>> 0) || 1);
  const entries = [{ oreType, weight: 1, amount: 1 }];
  if (rng.next() < 0.12) {
    const secondary = Object.keys(mix).find((k) => k !== tag && mix[k] >= 0.15);
    if (secondary) {
      entries.push({
        oreType: ORE_BY_TAG[secondary] ?? ORE_BY_TAG.silicate,
        weight: 0.35,
        amount: 1,
      });
    }
  }
  return {
    resolved: true,
    lootSeed,
    composition: mix,
    entries,
  };
}

/**
 * Build modular very-small cells for a rock (module count = Fibonacci volume).
 * @param {object} stats Gen-time rock stats
 * @param {object} [ctx] ring / rng context for pocket rolls
 */
export function buildModularRock(stats, ctx = {}) {
  const volume = Math.max(1, stats.volume ?? getSizeTier(stats.sizeTier).volume | 0);
  const parentRadius = stats.radius ?? 12;
  const seed = stats.seed ?? 1;
  const lootSeed = stats.lootSeed ?? seed;
  const parentMix = normalizeComposition(stats.composition);
  const parentTag = stats.compositionTag ?? primaryComposition(parentMix);
  const rng =
    ctx.rng ??
    new SeededRandom((lootSeed ^ (seed * 2654435761)) >>> 0 || 1);
  const shapeProfile = stats.shapeProfile ?? rollShapeProfile(rng, seed);
  const spinSpeed = stats.spinSpeed ?? rollSpinSpeed(rng, seed);

  const modules = [];
  const moduleCount = volume;

  if (moduleCount === 1) {
    const modSeed = (seed * 17 + 1) >>> 0;
    const modLoot = (lootSeed + 1) >>> 0;
    const comp = rollModuleComposition(rng, parentMix, parentTag, 0, ctx);
    const modR = parentRadius;
    modules.push({
      id: 0,
      active: true,
      seed: modSeed,
      lootSeed: modLoot,
      composition: comp,
      compositionTag: primaryComposition(comp),
      dropTable: resolveDropTable(modLoot, comp),
      ox: 0,
      oy: 0,
      radius: modR,
      vertices: generateRockVertices(modSeed, modR, shapeProfile, 0),
      anchors: generateSurfaceAnchors(modLoot, modR, 2),
      mineState: 'idle',
      crackProgress: 0,
      crackLines: null,
    });
  } else {
    const packR = parentRadius * 0.82;
    const cellR = parentRadius * Math.max(0.22, 0.52 / Math.sqrt(moduleCount));
    for (let i = 0; i < moduleCount; i++) {
      const golden = Math.PI * (3 - Math.sqrt(5));
      const t = i * golden;
      const distFrac = Math.sqrt((i + 0.5) / moduleCount) * 0.92;
      const ox = Math.cos(t) * packR * distFrac;
      const oy = Math.sin(t) * packR * distFrac;
      const modSeed = (seed * 17 + i * 131) >>> 0;
      const modLoot = (lootSeed + i * 9973) >>> 0;
      const comp = rollModuleComposition(rng, parentMix, parentTag, i, ctx);
      const modR = cellR * (0.88 + rng.range(0, 0.18));
      modules.push({
        id: i,
        active: true,
        seed: modSeed,
        lootSeed: modLoot,
        composition: comp,
        compositionTag: primaryComposition(comp),
        dropTable: resolveDropTable(modLoot, comp),
        ox,
        oy,
        radius: modR,
        vertices: generateRockVertices(modSeed, modR, shapeProfile, i),
        anchors: generateSurfaceAnchors(modLoot, modR, 1 + (i % 2)),
        mineState: 'idle',
        crackProgress: 0,
        crackLines: null,
      });
    }
  }

  const outline = compositeOutlineVertices(modules);
  const boundR = boundingRadiusFromModules(modules);

  return {
    modules,
    shapeProfile,
    spinSpeed,
    vertices: outline.length >= 3 ? outline : generateRockVertices(seed, parentRadius, shapeProfile),
    radius: Math.max(parentRadius * 0.85, boundR),
    capacityMax: moduleCount,
    capacityRemaining: moduleCount,
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
  const lootSeed = (seed * 1103515245 + (rng.int(1, 1e6) | 0)) >>> 0;
  const base = {
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
    lootSeed,
    dropTable: null,
    spinSpeed: rollSpinSpeed(rng, seed),
    orbitSpeedMul: rng.range(0.99, 1.01),
  };
  const ctx = {
    rng,
    ring: opts.ring,
    sampleR: opts.sampleR,
    theta: opts.theta,
  };
  return { ...base, ...buildModularRock(base, ctx) };
}
