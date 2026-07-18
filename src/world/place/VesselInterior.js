/**
 * Mk2+ vessel interior contract — templates, seat routing, sim bindings, hull scar ceiling.
 */

import { padMkForClass, padMkForSwapGroup } from '../../ships/ShipClasses.js';
import {
  defaultShell,
  isOperationalLook,
  inheritShell,
} from './Shell.js';
import { AREA_TYPES, FEATURE_TYPES, PLACE_KINDS } from './PlaceKinds.js';

/** Interior hull heal step when scarred (directional 99%, 98%, …). */
export const HULL_CEILING_STEP = 0.01;
export const HULL_CEILING_FLOOR = 0.7;

/**
 * @param {import('../../ships/ShipDefinition.js').ShipDefinition|null} shipDef
 * @param {{ hasInterior?: boolean }} [opts]
 */
export function shipHasInterior(shipDef, opts = {}) {
  if (opts.hasInterior === true) return true;
  if (opts.hasInterior === false) return false;
  if (!shipDef) return false;
  const mk =
    padMkForClass(shipDef.classId) ||
    padMkForSwapGroup(shipDef.swapGroup) ||
    1;
  return mk >= 2;
}

export function ensureVesselSimState(ship) {
  if (!ship) return null;
  if (ship.hullInteriorCeiling == null) ship.hullInteriorCeiling = 1;
  if (ship.hull == null) ship.hull = 1;
  if (ship.fuel == null) ship.fuel = 1;
  if (ship.ammo == null) ship.ammo = { bullets: 1, shells: 1 };
  if (ship.crewCount == null) ship.crewCount = 0;
  if (!ship.interiorStock) {
    ship.interiorStock = { fuelCells: 0, ammoBoxes: 0 };
  }
  return ship;
}

/** Call when the ship takes a distinct hull-damage incident in space. */
export function applyHullScar(ship) {
  ensureVesselSimState(ship);
  if (!ship) return;
  const next = Math.max(
    HULL_CEILING_FLOOR,
    (ship.hullInteriorCeiling ?? 1) - HULL_CEILING_STEP
  );
  ship.hullInteriorCeiling = Math.round(next * 1000) / 1000;
}

/**
 * @param {object} ship
 * @param {number} amount fraction of max hull to add
 * @param {'interior'|'exterior'} source
 */
export function applyHullHeal(ship, amount, source = 'interior') {
  ensureVesselSimState(ship);
  if (!ship || !(amount > 0)) return ship.hull;
  if (source === 'exterior') {
    ship.hull = 1;
    ship.hullInteriorCeiling = 1;
    return ship.hull;
  }
  const ceil = ship.hullInteriorCeiling ?? 1;
  ship.hull = Math.min(ceil, (ship.hull ?? 1) + amount);
  return ship.hull;
}

export function applyFuelFill(ship, amount) {
  ensureVesselSimState(ship);
  if (!ship || !(amount > 0)) return ship.fuel;
  ship.fuel = Math.min(1, (ship.fuel ?? 1) + amount);
  return ship.fuel;
}

export function applyAmmoFill(ship, amount, weaponId = null) {
  ensureVesselSimState(ship);
  if (!ship || !(amount > 0)) return ship.ammo;
  if (!ship.ammo || typeof ship.ammo !== 'object') {
    ship.ammo = { bullets: 1, shells: 1 };
  }
  if (weaponId === 'shells') {
    ship.ammo.shells = Math.min(1, (ship.ammo.shells ?? 1) + amount);
  } else if (weaponId === 'bullets') {
    ship.ammo.bullets = Math.min(1, (ship.ammo.bullets ?? 1) + amount);
  } else {
    ship.ammo.bullets = Math.min(1, (ship.ammo.bullets ?? 1) + amount);
    ship.ammo.shells = Math.min(1, (ship.ammo.shells ?? 1) + amount);
  }
  return ship.ammo;
}

/**
 * Apply a feature simBinding if the feature look is operational.
 * @returns {{ ok: boolean, reason?: string, value?: any }}
 */
export function applySimBinding(ship, feature, placeShell, areaShell, opts = {}) {
  ensureVesselSimState(ship);
  const binding = feature?.simBinding;
  if (!binding || binding.target !== 'parentVessel') {
    return { ok: false, reason: 'no_binding' };
  }
  const shell = inheritShell(placeShell, areaShell, feature.shell);
  const featureLook = {
    condition: shell.condition,
    techLevel: shell.techLevel,
  };
  if (!isOperationalLook(featureLook) && !opts.force) {
    return { ok: false, reason: 'broken' };
  }
  const source = binding.source || 'interior';
  switch (binding.channel) {
    case 'hull': {
      const amt = opts.amount ?? binding.rate?.healPerAction ?? 0.18;
      const v = applyHullHeal(ship, amt, source);
      return { ok: true, value: v };
    }
    case 'fuel': {
      if ((ship.interiorStock?.fuelCells ?? 0) <= 0 && !opts.ignoreStock) {
        return { ok: false, reason: 'no_stock' };
      }
      if (ship.interiorStock && !opts.ignoreStock) ship.interiorStock.fuelCells -= 1;
      const amt = opts.amount ?? binding.rate?.fillPerAction ?? 0.2;
      return { ok: true, value: applyFuelFill(ship, amt) };
    }
    case 'ammo': {
      if ((ship.interiorStock?.ammoBoxes ?? 0) <= 0 && !opts.ignoreStock) {
        return { ok: false, reason: 'no_stock' };
      }
      if (ship.interiorStock && !opts.ignoreStock) ship.interiorStock.ammoBoxes -= 1;
      const amt = opts.amount ?? binding.rate?.fillPerAction ?? 0.2;
      return {
        ok: true,
        value: applyAmmoFill(ship, amt, binding.weaponId || null),
      };
    }
    default:
      return { ok: false, reason: 'unknown_channel' };
  }
}

/**
 * Background crew tick — only when crewCount >= 1.
 * @returns {number} jobs completed this tick
 */
export function tickVesselInteriorCrew(ship, place, dt) {
  ensureVesselSimState(ship);
  if (!ship || !place || (ship.crewCount | 0) < 1) return 0;
  if (!(dt > 0)) return 0;
  // Simple accumulator: ~1 job every 4s per crew, split across needy channels
  if (ship._interiorJobAccum == null) ship._interiorJobAccum = 0;
  ship._interiorJobAccum += dt * Math.min(4, ship.crewCount) * 0.25;
  let done = 0;
  while (ship._interiorJobAccum >= 1) {
    ship._interiorJobAccum -= 1;
    const job = pickCrewJob(ship, place);
    if (!job) break;
    const area = place.areas[job.areaId];
    const feature = area?.features?.[job.featureId];
    const result = applySimBinding(ship, feature, place.shell, area?.shell, {
      ignoreStock: job.channel === 'hull',
    });
    if (result.ok) done += 1;
    else break;
  }
  return done;
}

function pickCrewJob(ship, place) {
  const areas = Object.values(place.areas || {});
  const hullNeed = (ship.hull ?? 1) < (ship.hullInteriorCeiling ?? 1) - 0.001;
  const fuelNeed = (ship.fuel ?? 1) < 0.85;
  const ammoNeed =
    (ship.ammo?.bullets ?? 1) < 0.85 || (ship.ammo?.shells ?? 1) < 0.85;

  const tryChannel = (channel) => {
    for (const area of areas) {
      for (const feature of Object.values(area.features || {})) {
        if (feature.simBinding?.channel === channel) {
          const shell = inheritShell(place.shell, area.shell, feature.shell);
          if (!isOperationalLook(shell)) continue;
          if (channel === 'fuel' && !(ship.interiorStock?.fuelCells > 0)) continue;
          if (channel === 'ammo' && !(ship.interiorStock?.ammoBoxes > 0)) continue;
          return { areaId: area.id, featureId: feature.id, channel };
        }
      }
    }
    return null;
  };

  if (hullNeed) {
    const j = tryChannel('hull');
    if (j) return j;
  }
  if (ammoNeed) {
    const j = tryChannel('ammo');
    if (j) return j;
  }
  if (fuelNeed) {
    const j = tryChannel('fuel');
    if (j) return j;
  }
  return null;
}

export function canEnterInterior(ship, opts = {}) {
  const manned = opts.isPlayerManned ?? ship?.isPlayerManned ?? false;
  return !!(ship && manned && shipHasInterior(ship.shipDef, ship));
}

/**
 * @returns {'shipInterior'|'exterior'}
 */
export function unseatCaptainRoute(ship, opts = {}) {
  return canEnterInterior(ship, opts) ? 'shipInterior' : 'exterior';
}

/** Compact Mk2 starter vessel interior place graph. */
export function createVesselInteriorPlace(shipId, opts = {}) {
  const id = `place.vessel.${shipId || 'player'}`;
  const shell = defaultShell({
    condition: opts.condition ?? 0.55,
    techLevel: opts.techLevel ?? 'mid',
    theme: opts.theme ?? 'stationYard',
    colorway: opts.colorway ?? 'jenningsBlue',
  });
  return {
    id,
    placeKind: PLACE_KINDS.vessel,
    label: opts.label || 'Vessel Interior',
    shell,
    shipId: shipId || 'player',
    areaOrder: [
      'area.bridge-access',
      'area.engineering',
      'area.fuel-bay',
      'area.magazine',
      'area.cargo-hold',
    ],
    areas: {
      'area.bridge-access': {
        id: 'area.bridge-access',
        areaType: AREA_TYPES.bridgeAccess,
        label: 'Bridge access',
        shell: null,
        shared: {},
        features: {
          'feature.seat-hatch': {
            id: 'feature.seat-hatch',
            featureType: FEATURE_TYPES.seatHatch,
            label: 'Seat hatch',
            shell: null,
          },
        },
      },
      'area.engineering': {
        id: 'area.engineering',
        areaType: AREA_TYPES.engineering,
        label: 'Engineering',
        shell: null,
        shared: {},
        features: {
          'feature.hull-bench': {
            id: 'feature.hull-bench',
            featureType: FEATURE_TYPES.hullRepair,
            label: 'Hull repair station',
            shell: null,
            simBinding: {
              target: 'parentVessel',
              channel: 'hull',
              source: 'interior',
              rate: { healPerAction: 0.18 },
            },
          },
        },
      },
      'area.fuel-bay': {
        id: 'area.fuel-bay',
        areaType: AREA_TYPES.fuelBay,
        label: 'Fuel bay',
        shell: null,
        shared: {},
        features: {
          'feature.fuel-input': {
            id: 'feature.fuel-input',
            featureType: FEATURE_TYPES.fuelInput,
            label: 'Fuel input',
            shell: null,
            simBinding: {
              target: 'parentVessel',
              channel: 'fuel',
              source: 'interior',
              rate: { fillPerAction: 0.2 },
            },
          },
        },
      },
      'area.magazine': {
        id: 'area.magazine',
        areaType: AREA_TYPES.magazine,
        label: 'Magazine',
        shell: null,
        shared: {},
        features: {
          'feature.gun-input': {
            id: 'feature.gun-input',
            featureType: FEATURE_TYPES.gunInput,
            label: 'Gun input',
            shell: null,
            simBinding: {
              target: 'parentVessel',
              channel: 'ammo',
              source: 'interior',
              rate: { fillPerAction: 0.2 },
            },
          },
        },
      },
      'area.cargo-hold': {
        id: 'area.cargo-hold',
        areaType: AREA_TYPES.cargoHold,
        label: 'Cargo hold',
        shell: null,
        shared: {},
        features: {
          'feature.cargo-rack': {
            id: 'feature.cargo-rack',
            featureType: FEATURE_TYPES.cargoRack,
            label: 'Cargo rack',
            shell: null,
          },
        },
      },
    },
  };
}
