/**
 * Sector editor geography helpers — add rings, shepherd moons, hero fields,
 * Orbit lock (t=0), hero rock generation.
 */

import { SeededRandom } from '../utils/SeededRandom.js';
import { orbitFromWorldAt, orbitOmegaFor } from '../world/OrbitKinematics.js';
import { siteWorldPosition, hydrateOrbitParams } from '../world/SectorLayout.js';
import {
  rollRockStats,
  getSizeTier,
  rollCapacity,
  rollRadius,
  hpForRock,
} from '../systems/AsteroidCatalog.js';
import {
  sectorEditorDraft,
  sectorEditorUI,
  notifySectorEditorChange,
  syncFringeSitesFromRings,
  warpGateOrbitR,
  RING_TO_PAIR_ID,
} from './DevSectorEditor.js';

export function editorMapTime(engine) {
  if (sectorEditorUI.freezeOrbit !== false) return 0;
  return engine?.gameTime || 0;
}

export function setOrbitLock(on) {
  sectorEditorUI.freezeOrbit = !!on;
  notifySectorEditorChange();
}

export function isOrbitLocked() {
  return sectorEditorUI.freezeOrbit !== false;
}

function sortedRings(layout = sectorEditorDraft) {
  return [...(layout.rings ?? [])].sort((a, b) => a.innerR - b.innerR);
}

/** Gaps between consecutive rings: { innerRing, outerRing, midR, width }. */
export function listRingGaps(layout = sectorEditorDraft) {
  const rings = sortedRings(layout);
  const gaps = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    const width = b.innerR - a.outerR;
    if (width <= 0) continue;
    gaps.push({
      innerRingId: a.id,
      outerRingId: b.id,
      midR: (a.outerR + b.innerR) * 0.5,
      width,
      label: `${a.id} → ${b.id}`,
    });
  }
  return gaps;
}

export function uniqueRingId(base, layout = sectorEditorDraft) {
  let id = base;
  let n = 2;
  const ids = new Set((layout.rings ?? []).map((r) => r.id));
  while (ids.has(id)) {
    id = `${base}_${n++}`;
  }
  return id;
}

export function uniqueSiteId(base, layout = sectorEditorDraft) {
  let id = base;
  let n = 2;
  const ids = new Set((layout.sites ?? []).map((s) => s.id));
  while (ids.has(id)) {
    id = `${base}_${n++}`;
  }
  return id;
}

/** Add a new ring outside the outermost (or at suggested radii). */
export function addRing(opts = {}, layout = sectorEditorDraft) {
  const rings = sortedRings(layout);
  const outer = rings[rings.length - 1];
  const gap = opts.gap ?? 120000;
  const width = opts.width ?? 200000;
  const innerR = opts.innerR ?? (outer ? outer.outerR + gap : 400000);
  const outerR = opts.outerR ?? innerR + width;
  const id = uniqueRingId(opts.id || 'fringe_ice', layout);
  const ring = {
    id,
    innerR,
    outerR,
    density: opts.density ?? 4,
    composition: opts.composition ?? {
      ice: 0.6,
      silicate: 0.15,
      carbonaceous: 0.1,
      iron: 0.1,
      rare: 0.05,
    },
    postedSpeedLimit: opts.postedSpeedLimit ?? 900,
    enforcement: opts.enforcement ?? 'patrol_witness',
    subBelts: [],
    warpPairId: opts.warpPairId ?? null,
  };
  layout.rings.push(ring);
  layout.rings.sort((a, b) => a.innerR - b.innerR);
  syncFringeSitesFromRings(layout, { silent: true });
  hydrateOrbitParams(layout);
  notifySectorEditorChange();
  return ring;
}

export function deleteRing(ringId, layout = sectorEditorDraft) {
  if ((layout.rings?.length ?? 0) <= 1) return false;
  const idx = layout.rings.findIndex((r) => r.id === ringId);
  if (idx < 0) return false;
  const ring = layout.rings[idx];
  layout.rings.splice(idx, 1);
  const pairId = ring.warpPairId || RING_TO_PAIR_ID[ringId];
  if (pairId) {
    layout.sites = (layout.sites ?? []).filter(
      (s) => !(s.kind === 'warp_ring' && s.pairId === pairId)
    );
  }
  syncFringeSitesFromRings(layout, { silent: true });
  hydrateOrbitParams(layout);
  notifySectorEditorChange();
  return true;
}

export function addShepherdMoon(gapIndex = 0, layout = sectorEditorDraft) {
  const gaps = listRingGaps(layout);
  const gap = gaps[gapIndex] ?? gaps[0];
  if (!gap) return null;
  const orbitR = gap.midR;
  const orbitAngle0 = (gapIndex * 2.1) % (Math.PI * 2);
  const id = uniqueSiteId(`site.moon.gap.${gap.innerRingId}_${gap.outerRingId}`, layout);
  const site = {
    id,
    kind: 'shepherd_moon',
    name: `Shepherd ${String.fromCharCode(65 + (layout.sites?.filter((s) => s.kind === 'shepherd_moon').length ?? 0))}`,
    iff: 'blue',
    motion: 'orbit',
    orbit: {
      orbitR,
      orbitAngle0,
      orbitOmega: orbitOmegaFor(orbitR, layout),
    },
    radius: Math.min(12000, Math.max(3000, gap.width * 0.08)),
    shepherds: {
      innerRingId: gap.innerRingId,
      outerRingId: gap.outerRingId,
    },
  };
  const pos = siteWorldPosition(site, 0, layout);
  site.x = pos.x;
  site.y = pos.y;
  layout.sites.push(site);
  notifySectorEditorChange();
  return site;
}

export function setMoonRadius(siteId, radius, layout = sectorEditorDraft) {
  const site = layout.sites?.find((s) => s.id === siteId);
  if (!site || site.kind !== 'shepherd_moon') return false;
  site.radius = Math.max(500, Number(radius) || 500);
  notifySectorEditorChange();
  return true;
}

/** Generate rocks clustered around a field orbit. */
export function generateHeroFieldRocks(fieldOrbit, count = 12, opts = {}) {
  const layout = opts.layout ?? sectorEditorDraft;
  const rng = new SeededRandom(opts.seed ?? 424242);
  const rocks = [];
  const spreadR = opts.spreadR ?? 1800;
  const spreadTh = opts.spreadTh ?? 0.012;
  for (let i = 0; i < count; i++) {
    const heroTier = i === 0 ? 'very_large' : i === 1 ? 'large' : null;
    const sampleR = fieldOrbit.orbitR + rng.range(-spreadR, spreadR);
    const theta = fieldOrbit.orbitAngle0 + rng.range(-spreadTh, spreadTh);
    const orbit = orbitFromWorldAt(
      Math.cos(theta) * sampleR,
      Math.sin(theta) * sampleR,
      0,
      layout
    );
    let stats = rollRockStats({
      rng,
      sizeTierId: heroTier || undefined,
      allowHeroTiers: true,
      composition: opts.composition ?? { iron: 0.5, ice: 0.3, silicate: 0.2 },
    });
    if (heroTier) {
      const t = getSizeTier(heroTier);
      stats.sizeTier = heroTier;
      stats.weight = t.weight;
      stats.capacityMax = rollCapacity(rng, heroTier);
      stats.capacityRemaining = stats.capacityMax;
      stats.radius = rollRadius(rng, heroTier);
      stats.hp = hpForRock(stats.radius, stats.capacityMax);
    }
    rocks.push({
      id: `r${i}`,
      orbitR: orbit.orbitR,
      orbitAngle0: orbit.orbitAngle0,
      sizeTier: stats.sizeTier,
      weight: stats.weight,
      capacityMax: stats.capacityMax,
      capacityRemaining: stats.capacityMax,
      radius: stats.radius,
      hp: stats.hp,
      seed: stats.seed,
      composition: stats.composition,
      compositionTag: stats.compositionTag,
      lootSeed: stats.lootSeed,
      allowHeroTiers: true,
    });
  }
  return rocks;
}

export function addAsteroidField(worldX, worldY, opts = {}, layout = sectorEditorDraft) {
  const orbit = orbitFromWorldAt(worldX, worldY, 0, layout);
  if (orbit.orbitR <= 0) return null;
  const id = uniqueSiteId(opts.id || 'site.asteroid.field', layout);
  const rocks = generateHeroFieldRocks(
    { orbitR: orbit.orbitR, orbitAngle0: orbit.orbitAngle0 },
    opts.rockCount ?? 10,
    { layout, composition: opts.composition, seed: opts.seed }
  );
  const site = {
    id,
    kind: 'asteroid_field',
    name: opts.name || 'Asteroid Cluster',
    iff: opts.iff || 'yellow',
    motion: 'orbit',
    orbit: {
      orbitR: orbit.orbitR,
      orbitAngle0: orbit.orbitAngle0,
      orbitOmega: orbitOmegaFor(orbit.orbitR, layout),
    },
    fieldRadius: opts.fieldRadius ?? 2800,
    rocks,
  };
  const pos = siteWorldPosition(site, 0, layout);
  site.x = pos.x;
  site.y = pos.y;
  layout.sites.push(site);
  notifySectorEditorChange();
  return site;
}

/** Rebase child rock orbits when the field center orbit moves. */
export function rebaseHeroFieldRocks(site, prevOrbit, layout = sectorEditorDraft) {
  if (!site?.rocks?.length || !site.orbit || !prevOrbit) return;
  const dR = site.orbit.orbitR - prevOrbit.orbitR;
  const dA = site.orbit.orbitAngle0 - prevOrbit.orbitAngle0;
  for (const rock of site.rocks) {
    rock.orbitR = (rock.orbitR ?? site.orbit.orbitR) + dR;
    rock.orbitAngle0 = (rock.orbitAngle0 ?? site.orbit.orbitAngle0) + dA;
  }
}

export function moveSiteOrbitWithHeroRebase(siteId, orbitR, orbitAngle0, layout = sectorEditorDraft) {
  const site = layout.sites?.find((s) => s.id === siteId);
  if (!site?.orbit) return false;
  const prev = { ...site.orbit };
  site.orbit.orbitR = orbitR;
  site.orbit.orbitAngle0 = orbitAngle0;
  site.orbit.orbitOmega = orbitOmegaFor(orbitR, layout);
  const pos = siteWorldPosition(site, 0, layout);
  site.x = pos.x;
  site.y = pos.y;
  if (site.kind === 'asteroid_field') {
    rebaseHeroFieldRocks(site, prev, layout);
  }
  notifySectorEditorChange();
  return true;
}

/** Warp pair id for a ring — authored warpPairId or legacy map. */
export function ringWarpPairId(ring) {
  if (!ring) return null;
  return ring.warpPairId || RING_TO_PAIR_ID[ring.id] || null;
}

function uniqueWarpPairId(ringId, layout = sectorEditorDraft) {
  let base = String(ringId || 'ring').replace(/_ice$|_ore$|_mixed$/i, '') || 'ring';
  if (!base) base = String(ringId).split('_')[0] || 'ring';
  let id = base;
  let n = 2;
  const used = new Set();
  for (const r of layout.rings ?? []) {
    const pid = r.warpPairId || RING_TO_PAIR_ID[r.id];
    if (pid) used.add(pid);
  }
  for (const s of layout.sites ?? []) {
    if (s.kind === 'warp_ring' && s.pairId) used.add(s.pairId);
  }
  while (used.has(id)) id = `${base}_${n++}`;
  return id;
}

/** True if ring already has warp gates for its pair id. */
export function ringHasWarpPair(ring, layout = sectorEditorDraft) {
  const pid = ringWarpPairId(ring);
  if (!pid) return false;
  return (layout.sites ?? []).some((s) => s.kind === 'warp_ring' && s.pairId === pid);
}

/**
 * Create a diametric warp gate pair for a ring that has none.
 * Sets ring.warpPairId and two warp_ring sites.
 */
export function addWarpPair(ringId, layout = sectorEditorDraft) {
  const ring = layout.rings?.find((r) => r.id === ringId);
  if (!ring) return null;
  if (ringHasWarpPair(ring, layout)) return null;
  const pairId = ring.warpPairId || uniqueWarpPairId(ring.id, layout);
  ring.warpPairId = pairId;
  const gateR = warpGateOrbitR(ring, layout);
  const idA = uniqueSiteId(`site.warp.ring.${pairId}.a`, layout);
  const idB = uniqueSiteId(`site.warp.ring.${pairId}.b`, layout);
  const mkGate = (id, side, angle, target) => {
    const site = {
      id,
      kind: 'warp_ring',
      name: `${ring.id} Gate ${side.toUpperCase()}`,
      iff: 'blue',
      motion: 'orbit',
      trafficPolicy: 'standard',
      orbit: {
        orbitR: gateR,
        orbitAngle0: angle,
        orbitOmega: orbitOmegaFor(gateR, layout),
      },
      pairId,
      pairSide: side,
      pairTarget: target,
    };
    const pos = siteWorldPosition(site, 0, layout);
    site.x = pos.x;
    site.y = pos.y;
    return site;
  };
  const a = mkGate(idA, 'a', 0, idB);
  const b = mkGate(idB, 'b', Math.PI, idA);
  layout.sites.push(a, b);
  hydrateOrbitParams(layout);
  notifySectorEditorChange();
  return { pairId, gates: [a, b] };
}

export function uniqueSubBeltId(ring, base = 'pocket') {
  let id = base;
  let n = 2;
  const ids = new Set((ring?.subBelts ?? []).map((s) => s.id));
  while (ids.has(id)) id = `${base}_${n++}`;
  return id;
}

/** Add a composition pocket on a ring (radial ± optional angular). */
export function addSubBelt(ringId, opts = {}, layout = sectorEditorDraft) {
  const ring = layout.rings?.find((r) => r.id === ringId);
  if (!ring) return null;
  if (!Array.isArray(ring.subBelts)) ring.subBelts = [];
  const sub = {
    id: uniqueSubBeltId(ring, opts.id || 'pocket'),
    t0: opts.t0 ?? 0.2,
    t1: opts.t1 ?? 0.6,
    theta0: opts.theta0 ?? null,
    theta1: opts.theta1 ?? null,
    composition: opts.composition ?? { ice: 0.7, iron: 0.3 },
  };
  ring.subBelts.push(sub);
  notifySectorEditorChange();
  return sub;
}

export function updateSubBelt(ringId, subBeltId, patch = {}, layout = sectorEditorDraft) {
  const ring = layout.rings?.find((r) => r.id === ringId);
  const sub = ring?.subBelts?.find((s) => s.id === subBeltId);
  if (!sub) return false;
  if (patch.t0 != null) sub.t0 = Math.max(0, Math.min(1, Number(patch.t0)));
  if (patch.t1 != null) sub.t1 = Math.max(0, Math.min(1, Number(patch.t1)));
  if (patch.theta0 !== undefined) sub.theta0 = patch.theta0;
  if (patch.theta1 !== undefined) sub.theta1 = patch.theta1;
  if (patch.composition && typeof patch.composition === 'object') {
    sub.composition = { ...patch.composition };
  }
  if (sub.t1 < sub.t0) {
    const tmp = sub.t0;
    sub.t0 = sub.t1;
    sub.t1 = tmp;
  }
  notifySectorEditorChange();
  return true;
}

export function removeSubBelt(ringId, subBeltId, layout = sectorEditorDraft) {
  const ring = layout.rings?.find((r) => r.id === ringId);
  if (!ring?.subBelts) return false;
  const idx = ring.subBelts.findIndex((s) => s.id === subBeltId);
  if (idx < 0) return false;
  ring.subBelts.splice(idx, 1);
  notifySectorEditorChange();
  return true;
}

export { warpGateOrbitR };
