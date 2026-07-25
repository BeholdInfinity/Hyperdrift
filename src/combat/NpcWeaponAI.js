/**
 * Hostile ambient traffic — acquire player and fire turret using shared weapon path.
 */

import { AMBIENT, COMBAT } from '../core/Constants.js';
import { ensureVesselSimState } from '../world/place/VesselInterior.js';
import { hasTurretAmmo } from './AmmoSystem.js';
import { ensureNpcWeaponState, shipPosition, tickWeaponCooldowns } from './WeaponHelpers.js';

/**
 * @param {object[]} ships
 * @param {object|null} player
 * @param {import('../systems/WeaponSystem.js').WeaponSystem} weaponSystem
 * @param {number} deltaTime
 */
export function tickNpcWeapons(ships, player, weaponSystem, deltaTime) {
  if (!player || player.combatDestroyed || !weaponSystem) return;

  const ppos = player.position;
  if (!ppos) return;

  for (const ship of ships) {
    if (!ship.combatHostile || ship.pendingCull) continue;

    ensureNpcWeaponState(ship);
    ensureVesselSimState(ship);
    tickWeaponCooldowns(ship, deltaTime);

    if (ship.fireCooldown > 0) continue;
    if (!hasTurretAmmo(ship)) continue;

    const pos = shipPosition(ship);
    const dx = ppos.x - pos.x;
    const dy = ppos.y - pos.y;
    const dist = Math.hypot(dx, dy);

    const maxR = Math.min(COMBAT.NPC_FIRE_RANGE, AMBIENT.SCAN_RANGE * 2.5);
    if (dist < COMBAT.NPC_FIRE_MIN_RANGE || dist > maxR) continue;

    ship.turretAngle = Math.atan2(dy, dx);
    weaponSystem.fireTurretFromShip(ship, {
      gravityEnabled: true,
      consumeAmmo: true,
    });
  }
}

/** Player aggression — ship will return fire. */
export function markCombatHostile(ship) {
  if (!ship || ship.combatTeam === 'player') return;
  ship.combatHostile = true;
}
