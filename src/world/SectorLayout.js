/**
 * Sector layout sampling — rings, sites, bounds, world positions.
 */

import { SECTOR_LAYOUT } from './data/sectorLayout.js';
import { positionAt, velocityAt, orbitOmegaFor } from './OrbitKinematics.js';
import { surfacePositionAt } from './PlanetSpin.js';

/** When set, dev sector editor preview uses the in-memory draft. */
let _layoutOverride = null;

export function setSectorLayoutOverride(layout) {
  _layoutOverride = layout;
}

export function clearSectorLayoutOverride() {
  _layoutOverride = null;
}

export function getSectorLayout() {
  return _layoutOverride ?? SECTOR_LAYOUT;
}

export function getJenningsSite(layout = getSectorLayout()) {
  return layout.sites?.find((s) => s.id === 'site.jennings') ?? null;
}

export function getSiteById(id, layout = getSectorLayout()) {
  return layout.sites?.find((s) => s.id === id) ?? null;
}

export function listSites(kind = null, layout = getSectorLayout()) {
  const sites = layout.sites ?? [];
  return kind ? sites.filter((s) => s.kind === kind) : sites;
}

export function radiusAt(x, y, layout = getSectorLayout()) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  return Math.hypot(x - cx, y - cy);
}

/** Outermost authored ring band edge (world u from Planet Center). */
export function maxRingOuterR(layout = getSectorLayout()) {
  let max = 0;
  for (const ring of layout.rings ?? []) {
    max = Math.max(max, ring.outerR ?? 0);
  }
  return max;
}

/** Furthest major site orbit / static position from Planet Center. */
export function maxSystemRadius(layout = getSectorLayout()) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  let max = maxRingOuterR(layout);
  for (const site of layout.sites ?? []) {
    if (site.orbit?.orbitR != null) {
      max = Math.max(max, site.orbit.orbitR);
      continue;
    }
    const x = site.x ?? 0;
    const y = site.y ?? 0;
    max = Math.max(max, Math.hypot(x - cx, y - cy));
  }
  return max;
}

export function ringAt(x, y, layout = getSectorLayout()) {
  const r = radiusAt(x, y, layout);
  const { planet, rings } = layout;
  if (r < planet.radius) return null;
  for (const ring of rings) {
    if (r >= ring.innerR && r <= ring.outerR) return ring;
  }
  return null;
}

/** Ring whose annulus contains the point, or whose inner/outer edge is within margin. */
export function nearRingAt(x, y, margin = 0, layout = getSectorLayout()) {
  const r = radiusAt(x, y, layout);
  const { planet, rings } = layout;
  if (r < (planet?.radius ?? 0)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const ring of rings ?? []) {
    if (r >= ring.innerR && r <= ring.outerR) return ring;
    const edgeDist = r < ring.innerR ? ring.innerR - r : r - ring.outerR;
    if (edgeDist <= margin && edgeDist < bestDist) {
      bestDist = edgeDist;
      best = ring;
    }
  }
  return best;
}

export function distToNearestRing(x, y, layout = getSectorLayout()) {
  const r = radiusAt(x, y, layout);
  const { planet, rings } = layout;
  if (r < planet.radius) return 0;
  let best = Infinity;
  for (const ring of rings) {
    if (r >= ring.innerR && r <= ring.outerR) return 0;
    if (r < ring.innerR) best = Math.min(best, ring.innerR - r);
    else if (r > ring.outerR) best = Math.min(best, r - ring.outerR);
  }
  return best;
}

export function siteWorldPosition(site, gameTime = 0, layout = getSectorLayout()) {
  if (!site) return { x: 0, y: 0 };
  const motion = site.motion ?? site.kind;
  if (motion === 'surface' || site.kind === 'planetary') {
    return surfacePositionAt(site, gameTime, layout);
  }
  if (site.orbit) {
    return positionAt(site.orbit, gameTime, layout);
  }
  if (motion === 'static') {
    return { x: site.x ?? 0, y: site.y ?? 0 };
  }
  return { x: site.x ?? 0, y: site.y ?? 0 };
}

/** Orbital / surface velocity in world space (static sites → zero). */
export function siteWorldVelocity(site, gameTime = 0, layout = getSectorLayout()) {
  if (!site) return { vx: 0, vy: 0, speed: 0 };
  if (site.orbit) {
    const v = velocityAt(site.orbit, gameTime, layout);
    return { vx: v.vx, vy: v.vy, speed: v.speed };
  }
  return { vx: 0, vy: 0, speed: 0 };
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

export function ringDensityMultiplier(x, y, layout = getSectorLayout()) {
  const ring = ringAt(x, y, layout);
  if (!ring) return 0.08;
  return ring.density;
}

export function isInsidePlayableSector(x, y, layout = getSectorLayout()) {
  const r = radiusAt(x, y, layout);
  const inner = (layout.planet?.radius ?? 35000) * 0.95;
  if (r < inner) return false;
  // Ring annuli are always playable even beyond spacing.softEdgeRadius (outer belt > 750k).
  if (ringAt(x, y, layout)) return true;
  const soft = layout.spacing?.softEdgeRadius ?? 750000;
  return r <= soft;
}

export function isNearAuthoredSite(x, y, layout = getSectorLayout()) {
  const ex = layout.spacing?.siteExclusionRadius ?? 45000;
  for (const site of layout.sites ?? []) {
    const pos = siteWorldPosition(site, 0, layout);
    if (Math.hypot(x - pos.x, y - pos.y) < ex) return true;
  }
  return false;
}

export function siteInsideRing(site, layout = getSectorLayout()) {
  const pos = siteWorldPosition(site, 0, layout);
  return !!ringAt(pos.x, pos.y, layout);
}

/** Derive orbitOmega from planet.gravityMu — single authority for gravity + kinematic orbits. */
export function hydrateOrbitParams(layout = getSectorLayout()) {
  for (const site of layout.sites ?? []) {
    if (!site.orbit?.orbitR) continue;
    site.orbit.orbitOmega = orbitOmegaFor(site.orbit.orbitR, layout);
    const p = siteWorldPosition(site, 0, layout);
    site.x = p.x;
    site.y = p.y;
  }
  for (const site of layout.sites ?? []) {
    if (site.kind === 'planetary' || site.motion === 'surface') {
      const p = surfacePositionAt(site, 0, layout);
      site.x = p.x;
      site.y = p.y;
    }
  }
  hydrateLayoutBounds(layout);
}

/**
 * Recompute spacing.softEdgeRadius from ring/site geometry.
 * Called on sector editor bake and runtime bootstrap.
 */
export function hydrateLayoutBounds(layout = getSectorLayout()) {
  if (!layout.spacing) layout.spacing = {};
  const outerRing = maxRingOuterR(layout);
  const fringeClear = layout.spacing.minFringeFromRing ?? 270000;
  const systemOuter = Math.max(maxSystemRadius(layout), outerRing + fringeClear);
  layout.spacing.softEdgeRadius = Math.ceil(Math.max(outerRing + fringeClear, systemOuter));
  if (layout.planet?.influenceRadius != null) {
    delete layout.planet.influenceRadius;
  }
}

const FALLBACK_STATION_TRAFFIC_ZONES = [
  { maxDist: 2400, postedSpeedLimit: 120, enforcement: 'sensor_auto' },
  { maxDist: 5500, postedSpeedLimit: 250, enforcement: 'patrol_witness' },
  { maxDist: 9000, postedSpeedLimit: 400, enforcement: 'patrol_witness' },
];

/** Per-station regulatory shells (layout default unless site overrides). */
export function stationTrafficZonesFor(site, layout = getSectorLayout()) {
  if (site?.trafficZones?.length) return site.trafficZones;
  const fromLayout = layout.trafficDefaults?.stationTrafficZones;
  if (fromLayout?.length) return fromLayout;
  return FALLBACK_STATION_TRAFFIC_ZONES;
}

export function stationTrafficOuterRadius(site, layout = getSectorLayout()) {
  const zones = stationTrafficZonesFor(site, layout);
  return zones.reduce((m, z) => Math.max(m, z.maxDist ?? 0), 0);
}
