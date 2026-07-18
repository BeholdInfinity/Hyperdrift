/**
 * Hangar area helpers — bay features + shared modules → runtime config for HangarBay.
 */

import {
  JENNINGS_BAY_MODULES,
  JENNINGS_SHARED_MODULES,
  hasModule,
  normalizeModuleList,
  BAY_MODULE_IDS,
  SHARED_MODULE_IDS,
} from './HangarModules.js';
import { defaultShell } from './Shell.js';
import { FEATURE_TYPES } from './PlaceKinds.js';

/**
 * @typedef {{
 *   id: string,
 *   featureType: 'bay',
 *   label?: string,
 *   padMk: number,
 *   mechs: number,
 *   modules: string[],
 *   shell?: import('./Shell.js').ShellDef,
 *   offline?: boolean,
 * }} BayFeature
 */

/**
 * @typedef {{
 *   id: string,
 *   areaType: 'hangar',
 *   label?: string,
 *   shell?: import('./Shell.js').ShellDef,
 *   shared: { modules: string[], forkliftCount: number, visitorTraffic?: boolean, visitorFilter?: string, checklistMode?: string, playerCraneAuthority?: boolean },
 *   features: Record<string, BayFeature>,
 *   layoutId?: string,
 * }} HangarAreaDef
 */

export function createBayFeature(id, opts = {}) {
  return {
    id,
    featureType: FEATURE_TYPES.bay,
    label: opts.label || id,
    padMk: opts.padMk ?? 1,
    mechs: opts.mechs ?? 2,
    modules: normalizeModuleList(opts.modules ?? JENNINGS_BAY_MODULES, BAY_MODULE_IDS),
    shell: opts.shell ? { ...defaultShell(), ...opts.shell } : undefined,
    offline: !!opts.offline,
  };
}

/**
 * Ordered bay list (layout index order). Prefer numeric suffix / B1,B2,B3 labels.
 * @param {HangarAreaDef} area
 * @returns {BayFeature[]}
 */
export function orderedBays(area) {
  const list = Object.values(area?.features || {}).filter(
    (f) => f.featureType === FEATURE_TYPES.bay
  );
  list.sort((a, b) => {
    const na = Number((a.id.match(/(\d+)/) || [])[1] || 0);
    const nb = Number((b.id.match(/(\d+)/) || [])[1] || 0);
    if (na !== nb) return na - nb;
    return String(a.id).localeCompare(String(b.id));
  });
  return list;
}

/**
 * Flatten hangar area into values HangarBay can consume without forking gameplay.
 * @param {HangarAreaDef} area
 * @param {import('./Shell.js').ShellDef} [placeShell]
 */
export function hangarRuntimeConfig(area, placeShell = null) {
  const bays = orderedBays(area);
  const sharedMods = normalizeModuleList(
    area?.shared?.modules || [],
    SHARED_MODULE_IDS
  );
  return {
    areaId: area?.id || 'area.hangar',
    bayCount: bays.length,
    bayIds: bays.map((b) => b.id),
    padMk: bays.map((b) => b.padMk | 0),
    mechsPerBay: bays.map((b) => Math.max(0, b.mechs | 0)),
    bayModules: bays.map((b) => b.modules.slice()),
    bayOffline: bays.map((b) => !!b.offline),
    bayShells: bays.map((b) => b.shell || null),
    sharedModules: sharedMods,
    hasCrane: hasModule(sharedMods, 'crane'),
    hasForkliftHub: hasModule(sharedMods, 'forkliftHub'),
    forkliftCount: Math.max(0, area?.shared?.forkliftCount | 0),
    visitorTraffic: area?.shared?.visitorTraffic !== false,
    visitorFilter: area?.shared?.visitorFilter || 'civilian',
    checklistMode: area?.shared?.checklistMode || 'captain',
    playerCraneAuthority: !!area?.shared?.playerCraneAuthority,
    layoutId: area?.layoutId || 'jennings',
    placeShell: placeShell || null,
    areaShell: area?.shell || null,
  };
}

/** Jennings Home Base hangar (current prototype kit). */
export function createJenningsHangarArea() {
  /** @type {HangarAreaDef} */
  const area = {
    id: 'area.hangar-main',
    areaType: 'hangar',
    label: 'Hangar Main',
    shell: defaultShell({
      condition: 0.55,
      techLevel: 'mid',
      theme: 'stationYard',
      colorway: 'jenningsBlue',
    }),
    shared: {
      modules: [...JENNINGS_SHARED_MODULES],
      forkliftCount: 4,
      visitorTraffic: true,
      visitorFilter: 'civilian',
      checklistMode: 'captain',
      playerCraneAuthority: true,
    },
    features: {
      'feature.bay-b1': createBayFeature('feature.bay-b1', {
        label: 'B1',
        padMk: 1,
        mechs: 2,
        modules: JENNINGS_BAY_MODULES,
      }),
      'feature.bay-b2': createBayFeature('feature.bay-b2', {
        label: 'B2',
        padMk: 2,
        mechs: 2,
        modules: JENNINGS_BAY_MODULES,
      }),
      'feature.bay-b3': createBayFeature('feature.bay-b3', {
        label: 'B3',
        padMk: 1,
        mechs: 2,
        modules: JENNINGS_BAY_MODULES,
      }),
    },
    layoutId: 'jennings',
  };
  return area;
}

/** Act 3 seed — one hangar, Bay 1 slightly ahead, Bays 2–3 broken. */
export function createDerelictHangarArea() {
  const broke = {
    condition: 0.06,
    techLevel: 'broken',
    theme: 'derelictRust',
    colorway: 'coldDark',
  };
  /** @type {HangarAreaDef} */
  return {
    id: 'area.hangar-1',
    areaType: 'hangar',
    label: 'Hangar 1',
    shell: defaultShell({
      condition: 0.3,
      techLevel: 'low',
      theme: 'derelictRust',
      colorway: 'coldDark',
    }),
    shared: {
      modules: [],
      forkliftCount: 0,
      visitorTraffic: false,
      visitorFilter: 'none',
      checklistMode: 'minimal',
      playerCraneAuthority: true,
    },
    features: {
      'feature.bay-1': createBayFeature('feature.bay-1', {
        label: 'Bay 1',
        padMk: 1,
        mechs: 1,
        modules: ['serviceBoard', 'door'],
        shell: defaultShell({
          condition: 0.55,
          techLevel: 'mid',
          theme: 'derelictRust',
          colorway: 'coldDark',
        }),
      }),
      'feature.bay-2': createBayFeature('feature.bay-2', {
        label: 'Bay 2',
        padMk: 1,
        mechs: 0,
        modules: [],
        shell: defaultShell(broke),
      }),
      'feature.bay-3': createBayFeature('feature.bay-3', {
        label: 'Bay 3',
        padMk: 1,
        mechs: 0,
        modules: [],
        shell: defaultShell(broke),
      }),
    },
    layoutId: 'derelict',
  };
}

export function createPoorShedHangarArea() {
  return {
    id: 'area.hangar-shed',
    areaType: 'hangar',
    label: 'Shed',
    shell: defaultShell({
      condition: 0.22,
      techLevel: 'low',
      theme: 'backwaterRust',
      colorway: 'rustSteel',
    }),
    shared: {
      modules: [],
      forkliftCount: 0,
      visitorTraffic: false,
      visitorFilter: 'none',
      checklistMode: 'minimal',
      playerCraneAuthority: false,
    },
    features: {
      'feature.bay-1': createBayFeature('feature.bay-1', {
        label: 'Bay 1',
        padMk: 1,
        mechs: 1,
        modules: ['serviceBoard', 'door'],
      }),
    },
    layoutId: 'shed',
  };
}
