/**
 * Wire sectorLayout v2 into POI, Station anchor, and runtime STATION world coords.
 */

import { STATION } from '../core/Constants.js';
import {
  getSectorLayout,
  getJenningsSite,
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
  const jennings = getJenningsSite();
  if (!jennings || !station) return;
  const pos = siteWorldPosition(jennings, gameTime);
  const vel = siteWorldVelocity(jennings, gameTime);
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
