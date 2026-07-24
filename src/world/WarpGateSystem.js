/**
 * Ring warp gate pairs — teleport through Planet Center.
 */

import { getSiteById, siteWorldPosition } from './SectorLayout.js';

const GATE_RADIUS = 2200;

export class WarpGateSystem {
  constructor() {
    this._cooldown = 0;
  }

  update(playerShip, gameTime, deltaTime) {
    if (!playerShip || this._cooldown > 0) {
      this._cooldown = Math.max(0, this._cooldown - deltaTime);
      return null;
    }
    for (const id of [
      'site.warp.ring.inner.a',
      'site.warp.ring.inner.b',
      'site.warp.ring.mid.a',
      'site.warp.ring.mid.b',
      'site.warp.ring.outer.a',
      'site.warp.ring.outer.b',
    ]) {
      const site = getSiteById(id);
      if (!site) continue;
      const pos = siteWorldPosition(site, gameTime);
      const d = Math.hypot(playerShip.position.x - pos.x, playerShip.position.y - pos.y);
      if (d > GATE_RADIUS) continue;
      const target = getSiteById(site.pairTarget);
      if (!target) continue;
      const dest = siteWorldPosition(target, gameTime);
      playerShip.position.x = dest.x;
      playerShip.position.y = dest.y;
      this._cooldown = 2.5;
      return { from: site.id, to: target.id };
    }
    return null;
  }
}

export function gateRadius() {
  return GATE_RADIUS;
}
