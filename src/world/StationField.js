/**
 * All orbital station exteriors — one Station instance per sector site.
 * GameEngine keeps `this.station` as the active dock target (approach shell or last dock).
 */

import { STATION } from '../core/Constants.js';
import { Station } from './Station.js';
import {
  getSectorLayout,
  listSites,
  siteWorldPosition,
  siteWorldVelocity,
} from './SectorLayout.js';
import { finiteGameTime } from './OrbitKinematics.js';
import { sitePlaceId } from './SectorBootstrap.js';

const JENNINGS_SITE_ID = 'site.jennings';
const DEFAULT_BAY_SIGNALS = ['green', 'green', 'green'];

export class StationField {
  constructor() {
    /** @type {Map<string, { site: object, station: Station, placeId: string }>} */
    this.entries = new Map();
    this._activeSiteId = JENNINGS_SITE_ID;
  }

  bootstrap(layout = getSectorLayout()) {
    this.entries.clear();
    for (const site of listSites('station', layout)) {
      const placeId = sitePlaceId(site);
      this.entries.set(site.id, { site, station: new Station(), placeId });
    }
    if (!this.entries.has(this._activeSiteId)) {
      this._activeSiteId = this.entries.keys().next().value ?? JENNINGS_SITE_ID;
    }
  }

  syncAll(gameTime = 0) {
    const t = finiteGameTime(gameTime);
    const layout = getSectorLayout();
    for (const entry of this.entries.values()) {
      const pos = siteWorldPosition(entry.site, t, layout);
      const vel = siteWorldVelocity(entry.site, t, layout);
      entry.station.setWorldAnchor(pos.x, pos.y, vel.vx, vel.vy);
    }
  }

  listEntries() {
    return [...this.entries.values()];
  }

  get(siteId) {
    return this.entries.get(siteId)?.station ?? null;
  }

  getEntry(siteId) {
    return this.entries.get(siteId) ?? null;
  }

  getEntryForStation(station) {
    if (!station) return null;
    for (const entry of this.entries.values()) {
      if (entry.station === station) return entry;
    }
    return null;
  }

  getByPlaceId(placeId) {
    if (!placeId) return null;
    for (const entry of this.entries.values()) {
      if (entry.placeId === placeId) return entry.station;
    }
    return null;
  }

  getJenningsStation() {
    return this.get(JENNINGS_SITE_ID) ?? this.listEntries()[0]?.station ?? null;
  }

  activeSiteId() {
    return this._activeSiteId;
  }

  activePlaceId() {
    return this.getEntry(this._activeSiteId)?.placeId ?? 'place.jennings';
  }

  /**
   * Pick the station whose approach corridor contains the ship; otherwise keep
   * last dock anchor for egress math.
   * @param {{ position?: { x: number, y: number } }|null} ship
   * @param {string} [lastDockPlaceId]
   */
  resolveDockTarget(ship, lastDockPlaceId = 'place.jennings') {
    if (ship?.position) {
      const px = ship.position.x;
      const py = ship.position.y;
      let bestId = null;
      let bestD = Infinity;
      for (const [siteId, { station }] of this.entries) {
        if (!station.inApproach(px, py) && !station.inApproachLights(px, py)) continue;
        const d = Math.hypot(px - station.x, py - station.y);
        if (d < bestD) {
          bestD = d;
          bestId = siteId;
        }
      }
      if (bestId) {
        this._activeSiteId = bestId;
        return this.get(bestId);
      }
    }
    const fallback =
      this.getByPlaceId(lastDockPlaceId) ?? this.get(this._activeSiteId) ?? this.getJenningsStation();
    const entry = this.getEntryForStation(fallback);
    if (entry) this._activeSiteId = entry.site.id;
    return fallback;
  }

  /** Viewport cull — station hull + approach corridor. */
  isNearCamera(station, cameraPos, viewRadius) {
    if (!station || !cameraPos) return false;
    const dx = station.x - cameraPos.x;
    const dy = station.y - cameraPos.y;
    const pad = STATION.APPROACH_RADIUS + STATION.RADIUS + 400;
    const r = viewRadius + pad;
    return dx * dx + dy * dy <= r * r;
  }

  static defaultBaySignals() {
    return DEFAULT_BAY_SIGNALS;
  }
}

export { JENNINGS_SITE_ID, DEFAULT_BAY_SIGNALS };
