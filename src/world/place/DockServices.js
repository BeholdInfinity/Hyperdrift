/**
 * Dock / pad service rules — player self-service except crane-gated turrets.
 */

import { hasModule } from './HangarModules.js';

/** Services the player may perform alone on a pad (tools assumed for now). */
export const PLAYER_PAD_SERVICES = [
  'exteriorHull',
  'fuel',
  'ammo',
  'cargoLoad',
  'cargoUnload',
  'freightStaging',
];

/**
 * @param {string} catalogCategory
 * @param {string} [freightShape]
 */
export function isTurretMountCategory(catalogCategory, freightShape = null) {
  const c = String(catalogCategory || '').toLowerCase();
  const s = String(freightShape || '').toLowerCase();
  return (
    c === 'turret' ||
    c === 'smallturret' ||
    c === 'dorsalturret' ||
    s === 'turret'
  );
}

/**
 * Can this hangar runtime config run turret install/uninstall crane stages?
 * @param {{ hasCrane?: boolean, sharedModules?: string[] }} hangarConfig
 * @param {{ playerCraneAuthority?: boolean, playerManningCrane?: boolean }} [opts]
 */
export function canPerformTurretCraneStage(hangarConfig, opts = {}) {
  const hasCrane =
    hangarConfig?.hasCrane ||
    hasModule(hangarConfig?.sharedModules, 'crane');
  if (!hasCrane) return false;
  // NPC crane operator always OK when crane exists; player needs authority to man it
  if (opts.playerManningCrane) {
    return !!(
      hangarConfig?.playerCraneAuthority ||
      opts.playerCraneAuthority ||
      opts.devForce
    );
  }
  return true;
}

/**
 * Player may start a turret swap only if a crane is present (lift stages).
 * Weld stages are always player-capable when the swap is allowed.
 */
export function canPlayerStartTurretSwap(hangarConfig) {
  return canPerformTurretCraneStage(hangarConfig, { playerManningCrane: false });
}

export function canPlayerPerformPadService(serviceId, hangarConfig) {
  if (serviceId === 'turretInstall' || serviceId === 'turretUninstall') {
    return canPlayerStartTurretSwap(hangarConfig);
  }
  return PLAYER_PAD_SERVICES.includes(serviceId);
}

/**
 * Locked choreography phase ids.
 * Uninstall: weldDetach → craneLiftOff → empty
 * Install: craneMount → weldSeat → installed
 */
export const TURRET_UNINSTALL_PHASES = [
  'weldDetach',
  'craneLiftOff',
  'empty',
];

export const TURRET_INSTALL_PHASES = [
  'craneMount',
  'weldSeat',
  'installed',
];

export function isCraneTurretPhase(phase) {
  return phase === 'craneLiftOff' || phase === 'craneMount';
}

export function isWeldTurretPhase(phase) {
  return phase === 'weldDetach' || phase === 'weldSeat';
}
