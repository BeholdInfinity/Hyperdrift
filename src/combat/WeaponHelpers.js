/**
 * Shared weapon pose + cooldown helpers for player Ship and ambient traffic bags.
 */

import { HARDPOINTS } from '../entities/ShipHardpoints.js';
import { SHIP } from '../core/Constants.js';

export function shipPosition(ship) {
  if (ship.position?.x != null) return ship.position;
  return { x: ship.x ?? 0, y: ship.y ?? 0 };
}

export function hardpointWorld(ship, key) {
  const pos = shipPosition(ship);
  const angle = ship.angle ?? 0;
  const table = ship.shipDef?.hardpointsTable?.() ?? {};
  const mount = table[key] || HARDPOINTS[key] || { x: 0, y: 0 };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: pos.x + mount.x * cos - mount.y * sin,
    y: pos.y + mount.x * sin + mount.y * cos,
  };
}

export function turretMuzzleWorld(ship) {
  if (typeof ship.getTurretMuzzle === 'function') {
    return ship.getTurretMuzzle();
  }
  const recoil = (ship.turretRecoil || 0) * SHIP.TURRET_RECOIL_DIST;
  const tipDist =
    SHIP.TURRET_BARREL_LENGTH + SHIP.TURRET_MUZZLE_EXTRA - recoil;
  const angle = ship.turretAngle ?? ship.angle ?? 0;
  const base = hardpointWorld(ship, 'dorsalTurret');
  return {
    x: base.x + Math.cos(angle) * tipDist,
    y: base.y + Math.sin(angle) * tipDist,
  };
}

export function tickWeaponCooldowns(ship, deltaTime) {
  if (ship.fireCooldown > 0) ship.fireCooldown -= deltaTime;
  if (ship.muzzleFlash > 0) ship.muzzleFlash -= deltaTime;
  if (ship.turretRecoil > 0) {
    ship.turretRecoil = Math.max(
      0,
      ship.turretRecoil - deltaTime / SHIP.TURRET_RECOIL_RECOVER
    );
  }
}

export function ensureNpcWeaponState(ship) {
  if (ship.turretAngle == null) ship.turretAngle = ship.angle ?? 0;
  if (ship.fireCooldown == null) ship.fireCooldown = 0;
  if (ship.muzzleFlash == null) ship.muzzleFlash = 0;
  if (ship.turretRecoil == null) ship.turretRecoil = 0;
  if (ship.combatHostile == null) ship.combatHostile = false;
}
