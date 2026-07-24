/**
 * Traffic citations — sensor auto in inner ring, patrol witness near stations.
 */

import { postedSpeedLimitAt, playerOverLimit, playerSpeedForLimit } from './SpeedLimitSystem.js';
import { listSites, siteWorldPosition, stationTrafficOuterRadius } from './SectorLayout.js';
import { getSectorLayout } from './SectorLayout.js';

export class TrafficEnforcement {
  constructor(trafficRecord) {
    this.trafficRecord = trafficRecord;
    this._cooldown = 0;
    this._toast = '';
    this._toastUntil = 0;
  }

  update(engine, deltaTime) {
    const ship = engine.ship;
    if (!ship || engine.mode !== 'playing') return;
    this._lastGameTime = engine.gameTime || 0;
    this._cooldown = Math.max(0, this._cooldown - deltaTime);
    const t = this._lastGameTime;
    if (this._toastUntil > 0 && t >= this._toastUntil) this._toast = '';

    const x = ship.position.x;
    const y = ship.position.y;
    const vx = ship.velocity.x;
    const vy = ship.velocity.y;
    if (!playerOverLimit(vx, vy, x, y, t)) return;
    if (this._cooldown > 0) return;

    const layout = getSectorLayout();
    const info = postedSpeedLimitAt(x, y, t, layout);
    const checkSpeed = playerSpeedForLimit(vx, vy, x, y, t, layout, info);
    const effectiveLimit = info.usesStationFrame ? info.relDelta : info.limit;
    const over = checkSpeed - effectiveLimit;
    const { enforcement } = info;
    const defaults = layout.trafficDefaults || {};

    if (enforcement === 'sensor_auto') {
      this._cite('site.jennings', over, layout, defaults);
      return;
    }

    const patrolSite = this._nearestPatrolSite(x, y, t, layout);
    if (patrolSite && patrolSite.trafficPolicy !== 'none') {
      const pos = siteWorldPosition(patrolSite, t, layout);
      const witnessR = stationTrafficOuterRadius(patrolSite, layout)
        * (0.65 + 0.35 * (patrolSite.patrolDensity ?? 1));
      if (Math.hypot(x - pos.x, y - pos.y) < witnessR) {
        this._cite(patrolSite.id, over, layout, defaults);
      }
    }
  }

  _nearestPatrolSite(x, y, t, layout) {
    let best = null;
    let bestD = Infinity;
    for (const site of listSites('station', layout)) {
      if ((site.patrolDensity ?? 0) <= 0) continue;
      const pos = siteWorldPosition(site, t, layout);
      const d = Math.hypot(x - pos.x, y - pos.y);
      if (d < bestD) {
        bestD = d;
        best = site;
      }
    }
    return best;
  }

  _cite(siteId, over, layout, defaults) {
    const amount = Math.ceil((defaults.finePerSecondOver ?? 12) * Math.max(1, over * 0.05));
    this.trafficRecord.addFine(siteId, amount, layout);
    this._cooldown = defaults.citationCooldownSec ?? 8;
    this._toast = `SPEED FINE — ${amount} cr (${siteId})`;
    this._toastUntil = (this._lastGameTime ?? 0) + 4;
  }

  getToast() {
    return this._toast;
  }
}
