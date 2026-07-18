/**
 * Mutate Place / Area / Feature by stable ID without wiping siblings.
 */

import { defaultShell, cloneShell, mergeShells } from './Shell.js';
import {
  normalizeModuleList,
  BAY_MODULE_IDS,
  SHARED_MODULE_IDS,
  hasModule,
} from './HangarModules.js';
import { applySimBinding } from './VesselInterior.js';
import { FEATURE_TYPES } from './PlaceKinds.js';

export function setPlaceShell(place, partial) {
  if (!place) return null;
  place.shell = mergeShells(place.shell || defaultShell(), partial || {});
  return place.shell;
}

export function setAreaShell(place, areaId, partial) {
  const area = place?.areas?.[areaId];
  if (!area) return null;
  area.shell = mergeShells(area.shell || defaultShell(), partial || {});
  return area.shell;
}

export function setFeatureShell(place, areaId, featureId, partial) {
  const feature = place?.areas?.[areaId]?.features?.[featureId];
  if (!feature) return null;
  feature.shell = mergeShells(feature.shell || defaultShell(), partial || {});
  return feature.shell;
}

export function setBayMechs(place, areaId, bayId, n) {
  const bay = place?.areas?.[areaId]?.features?.[bayId];
  if (!bay || bay.featureType !== FEATURE_TYPES.bay) return null;
  bay.mechs = Math.max(0, n | 0);
  return bay.mechs;
}

export function setBayPadMk(place, areaId, bayId, mk) {
  const bay = place?.areas?.[areaId]?.features?.[bayId];
  if (!bay || bay.featureType !== FEATURE_TYPES.bay) return null;
  bay.padMk = Math.max(1, Math.min(3, mk | 0));
  return bay.padMk;
}

export function installBayModule(place, areaId, bayId, moduleId) {
  const bay = place?.areas?.[areaId]?.features?.[bayId];
  if (!bay || bay.featureType !== FEATURE_TYPES.bay) return false;
  if (!BAY_MODULE_IDS.includes(moduleId)) return false;
  if (!bay.modules.includes(moduleId)) bay.modules.push(moduleId);
  return true;
}

export function uninstallBayModule(place, areaId, bayId, moduleId) {
  const bay = place?.areas?.[areaId]?.features?.[bayId];
  if (!bay) return false;
  bay.modules = (bay.modules || []).filter((m) => m !== moduleId);
  return true;
}

export function installSharedModule(place, areaId, moduleId) {
  const area = place?.areas?.[areaId];
  if (!area) return false;
  if (!SHARED_MODULE_IDS.includes(moduleId)) return false;
  if (!area.shared) area.shared = { modules: [], forkliftCount: 0 };
  if (!area.shared.modules) area.shared.modules = [];
  if (!area.shared.modules.includes(moduleId)) area.shared.modules.push(moduleId);
  if (moduleId === 'forkliftHub' && !(area.shared.forkliftCount > 0)) {
    area.shared.forkliftCount = 1;
  }
  return true;
}

export function uninstallSharedModule(place, areaId, moduleId) {
  const area = place?.areas?.[areaId];
  if (!area?.shared) return false;
  area.shared.modules = normalizeModuleList(
    (area.shared.modules || []).filter((m) => m !== moduleId),
    SHARED_MODULE_IDS
  );
  if (moduleId === 'crane') {
    /* turret swaps become gated via hasCrane */
  }
  if (moduleId === 'forkliftHub') area.shared.forkliftCount = 0;
  return true;
}

export function setForkliftCount(place, areaId, n) {
  const area = place?.areas?.[areaId];
  if (!area) return null;
  if (!area.shared) area.shared = { modules: [], forkliftCount: 0 };
  area.shared.forkliftCount = Math.max(0, n | 0);
  if (area.shared.forkliftCount > 0 && !hasModule(area.shared.modules, 'forkliftHub')) {
    installSharedModule(place, areaId, 'forkliftHub');
  }
  if (area.shared.forkliftCount === 0) {
    uninstallSharedModule(place, areaId, 'forkliftHub');
  }
  return area.shared.forkliftCount;
}

export function setPlayerCraneAuthority(place, areaId, on) {
  const area = place?.areas?.[areaId];
  if (!area) return false;
  if (!area.shared) area.shared = { modules: [], forkliftCount: 0 };
  area.shared.playerCraneAuthority = !!on;
  return area.shared.playerCraneAuthority;
}

/**
 * Interact with a vessel feature (Dev / future walker).
 */
export function interactFeature(place, areaId, featureId, ship, opts = {}) {
  const area = place?.areas?.[areaId];
  const feature = area?.features?.[featureId];
  if (!feature) return { ok: false, reason: 'missing' };
  return applySimBinding(ship, feature, place.shell, area.shell, opts);
}

export function clonePlace(place) {
  return place ? JSON.parse(JSON.stringify(place)) : null;
}

export { cloneShell };
