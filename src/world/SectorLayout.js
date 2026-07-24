/**
 * Sector layout sampling — rings, sites, bounds, world positions.
 */

import { SECTOR_LAYOUT } from './data/sectorLayout.js';
import { positionAt, velocityAt } from './OrbitKinematics.js';
import { surfacePositionAt } from './PlanetSpin.js';

export function getSectorLayout() {
  return SECTOR_LAYOUT;
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

export function ringAt(x, y, layout = getSectorLayout()) {
  const r = radiusAt(x, y, layout);
  const { planet, rings } = layout;
  if (r < planet.radius) return null;
  for (const ring of rings) {
    if (r >= ring.innerR && r <= ring.outerR) return ring;
  }
  return null;
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
  if (motion === 'static' || site.kind === 'landmark' || site.kind === 'warp_instance') {
    return { x: site.x ?? 0, y: site.y ?? 0 };
  }
  if (site.orbit) {
    return positionAt(site.orbit, gameTime, layout);
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
  const soft = layout.spacing?.softEdgeRadius ?? 750000;
  const inner = (layout.planet?.radius ?? 35000) * 0.95;
  return r >= inner && r <= soft;
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

/** Bootstrap orbitOmega from μ when missing. */
export function hydrateOrbitParams(layout = getSectorLayout()) {
  const mu = layout.planet?.gravityMu ?? 1.8e12;
  for (const site of layout.sites ?? []) {
    if (!site.orbit?.orbitR) continue;
    if (site.orbit.orbitOmega == null) {
      site.orbit.orbitOmega = Math.sqrt(mu / (site.orbit.orbitR ** 3));
    }
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
