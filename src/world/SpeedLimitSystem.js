/**
 * Regulatory posted speed limits by ring band + station shells.
 * Station shells are relative to each site's orbital velocity.
 */

import {
  getSectorLayout,
  listSites,
  ringAt,
  siteWorldPosition,
  siteWorldVelocity,
  stationTrafficOuterRadius,
  stationTrafficZonesFor,
} from './SectorLayout.js';

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function postedSpeedLimitAt(x, y, gameTime = 0, layout = getSectorLayout()) {
  let absLimit = Infinity;
  let relDelta = Infinity;
  let refVx = 0;
  let refVy = 0;
  let enforcement = null;

  const ring = ringAt(x, y, layout);
  if (ring?.postedSpeedLimit) {
    absLimit = Math.min(absLimit, ring.postedSpeedLimit);
    enforcement = ring.enforcement || enforcement;
  }

  for (const site of listSites('station', layout)) {
    if (site.trafficPolicy === 'none') continue;
    const pos = siteWorldPosition(site, gameTime, layout);
    const d = dist(x, y, pos.x, pos.y);
    const outerR = stationTrafficOuterRadius(site, layout);
    if (d > outerR) continue;
    const zones = stationTrafficZonesFor(site, layout);
    for (const z of zones) {
      if (d <= z.maxDist) {
        let lim = z.postedSpeedLimit;
        if (site.trafficPolicy === 'strict') {
          lim *= site.limitMultiplier ?? 0.75;
        } else if (site.limitMultiplier) {
          lim *= site.limitMultiplier;
        }
        if (lim < relDelta) {
          relDelta = lim;
          const sv = siteWorldVelocity(site, gameTime, layout);
          refVx = sv.vx;
          refVy = sv.vy;
          enforcement = z.enforcement || 'patrol_witness';
        }
      }
    }
  }

  const stationSpeed = Math.hypot(refVx, refVy);
  const stationCap = Number.isFinite(relDelta) ? stationSpeed + relDelta : Infinity;
  const limit = Math.min(absLimit, stationCap);
  if (!Number.isFinite(limit)) {
    return { limit: 900, enforcement, refVx: 0, refVy: 0, relDelta: Infinity, usesStationFrame: false };
  }
  return {
    limit,
    enforcement,
    refVx,
    refVy,
    relDelta,
    usesStationFrame: stationCap <= absLimit && Number.isFinite(relDelta),
  };
}

export function playerOverLimit(vx, vy, x, y, gameTime, layout = getSectorLayout()) {
  const info = postedSpeedLimitAt(x, y, gameTime, layout);
  const absSpeed = Math.hypot(vx, vy);
  const relSpeed = Math.hypot(vx - info.refVx, vy - info.refVy);

  if (Number.isFinite(info.relDelta) && relSpeed > info.relDelta) return true;

  const ring = ringAt(x, y, layout);
  if (ring?.postedSpeedLimit && absSpeed > ring.postedSpeedLimit) return true;

  return !ring && !Number.isFinite(info.relDelta) && absSpeed > info.limit;
}

export function playerSpeedForLimit(vx, vy, x, y, gameTime, layout = getSectorLayout(), info = null) {
  const resolved = info || postedSpeedLimitAt(x, y, gameTime, layout);
  if (resolved.usesStationFrame) {
    return Math.hypot(vx - resolved.refVx, vy - resolved.refVy);
  }
  return Math.hypot(vx, vy);
}
