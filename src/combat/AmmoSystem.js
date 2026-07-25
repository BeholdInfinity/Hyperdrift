/**
 * Turret ammunition — uses vessel sim `ship.ammo.bullets` (0–1 fraction).
 */

import { COMBAT } from '../core/Constants.js';
import { ensureVesselSimState } from '../world/place/VesselInterior.js';

export function getTurretAmmo(ship) {
  ensureVesselSimState(ship);
  return ship.ammo?.bullets ?? 1;
}

export function hasTurretAmmo(ship) {
  return getTurretAmmo(ship) > COMBAT.TURRET_AMMO_EPS;
}

/** @returns {boolean} true if a round was consumed */
export function consumeTurretAmmo(ship) {
  ensureVesselSimState(ship);
  const cur = getTurretAmmo(ship);
  if (cur <= COMBAT.TURRET_AMMO_EPS) return false;
  ship.ammo.bullets = Math.max(0, cur - COMBAT.TURRET_AMMO_PER_SHOT);
  return true;
}

/** @returns {number} 0–1 */
export function turretAmmoFraction(ship) {
  return Math.max(0, Math.min(1, getTurretAmmo(ship)));
}

export function formatTurretAmmoStatus(ship) {
  if (!hasTurretAmmo(ship)) return 'empty';
  const f = turretAmmoFraction(ship);
  if (f < 0.2) return 'low';
  return 'ready';
}

export function formatTurretAmmoLabel(ship) {
  const pct = Math.round(turretAmmoFraction(ship) * 100);
  return `${pct}%`;
}
