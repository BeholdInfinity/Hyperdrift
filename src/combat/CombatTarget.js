/**
 * Combat target adapter — normalize player + ambient ships for hit tests.
 */

import { COMBAT } from '../core/Constants.js';
import { ensureVesselSimState } from '../world/place/VesselInterior.js';

/** @param {import('../ships/ShipDefinition.js').ShipDefinition} shipDef */
export function combatRadius(shipDef) {
  if (!shipDef?.hullExtents) return 22;
  const { forward: fwd, aft } = shipDef.hullExtents();
  const lat = Math.max(fwd, aft) * 0.48;
  return Math.hypot(Math.max(fwd, aft), lat);
}

/**
 * @param {object} ship — player Ship entity or ambient traffic bag
 * @returns {import('./CombatTarget.js').CombatTarget|null}
 */
export function getCombatTarget(ship) {
  if (!ship || ship.combatDestroyed || ship.pendingCull) return null;

  const def = ship.shipDef;
  if (!def) return null;

  ensureVesselSimState(ship);

  const x = ship.position?.x ?? ship.x ?? 0;
  const y = ship.position?.y ?? ship.y ?? 0;

  return {
    ref: ship,
    id: ship.id,
    x,
    y,
    radius: combatRadius(def),
    team: ship.combatTeam ?? 'neutral',
    hull: ship.hull ?? 1,
  };
}

/**
 * @typedef {{
 *   ref: object,
 *   id: number|string,
 *   x: number,
 *   y: number,
 *   radius: number,
 *   team: string,
 *   hull: number,
 * }} CombatTarget
 */

/**
 * @param {CombatTarget} target
 * @param {number} rawDamage — projectile damage points or laser DPS×dt
 */
export function hullDamageFraction(rawDamage) {
  return rawDamage / COMBAT.HULL_HIT_POINTS;
}

/** Refresh world positions on cached targets before hit tests. */
export function syncCombatTargetPositions(targets) {
  for (const t of targets) {
    if (!t?.ref) continue;
    const ship = t.ref;
    t.x = ship.position?.x ?? ship.x ?? t.x;
    t.y = ship.position?.y ?? ship.y ?? t.y;
  }
}
