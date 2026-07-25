/**
 * Wire sectorLayout v2 into POI, Station anchor, and runtime STATION world coords.
 */

import { STATION } from '../core/Constants.js';
import {
  getSectorLayout,
  getJenningsSite,
  getSiteById,
  hydrateOrbitParams,
  siteWorldPosition,
  siteWorldVelocity,
} from './SectorLayout.js';
import { registerLayoutPlaces } from './place/PlaceRegistry.js';

let _bootstrapped = false;

export function bootstrapSectorWorld({ poiSystem, station, placeRegistry } = {}) {
  const layout = getSectorLayout();
  hydrateOrbitParams(layout);

  const jennings = getJenningsSite(layout);
  const pos = siteWorldPosition(jennings, 0, layout);
  const vel = siteWorldVelocity(jennings, 0, layout);
  STATION.WORLD_X = pos.x;
  STATION.WORLD_Y = pos.y;
  STATION.WORLD_VX = vel.vx;
  STATION.WORLD_VY = vel.vy;

  if (station?.setWorldAnchor) {
    station.setWorldAnchor(pos.x, pos.y, vel.vx, vel.vy);
  } else if (station) {
    station.x = pos.x;
    station.y = pos.y;
    station.vx = vel.vx;
    station.vy = vel.vy;
  }

  if (poiSystem?.bootstrapFromLayout) {
    poiSystem.bootstrapFromLayout(layout);
  }

  if (placeRegistry) {
    registerLayoutPlaces(placeRegistry, layout);
  }

  _bootstrapped = true;
  return { layout, jenningsPos: pos };
}

export function isSectorBootstrapped() {
  return _bootstrapped;
}

export function syncStationAnchor(station, gameTime = 0) {
  syncStationToPlace(station, 'place.jennings', gameTime);
}

/** Map place id → sector site id (`place.jennings` → `site.jennings`). */
export function placeIdToSiteId(placeId) {
  if (!placeId) return 'site.jennings';
  if (placeId.startsWith('place.')) return `site.${placeId.slice(6)}`;
  return placeId;
}

/** Move the overworld station anchor to a dock place (falls back to Jennings). */
export function syncStationToPlace(station, placeId, gameTime = 0) {
  const siteId = placeIdToSiteId(placeId);
  const site = getSiteById(siteId) ?? getJenningsSite();
  if (!site || !station) return;
  const pos = siteWorldPosition(site, gameTime);
  const vel = siteWorldVelocity(site, gameTime);
  if (station.setWorldAnchor) {
    station.setWorldAnchor(pos.x, pos.y, vel.vx, vel.vy);
  } else {
    station.x = pos.x;
    station.y = pos.y;
    station.vx = vel.vx;
    station.vy = vel.vy;
  }
  STATION.WORLD_X = pos.x;
  STATION.WORLD_Y = pos.y;
  STATION.WORLD_VX = vel.vx;
  STATION.WORLD_VY = vel.vy;
}
