/**
 * Live Place instances — stations, capital ships, outposts, vessels.
 */

import { PLACE_KINDS, AREA_TYPES } from './PlaceKinds.js';
import { defaultShell, cloneShell } from './Shell.js';
import {
  createJenningsHangarArea,
  createDerelictHangarArea,
  createPoorShedHangarArea,
  hangarRuntimeConfig,
  orderedBays,
} from './HangarArea.js';
import { createVesselInteriorPlace } from './VesselInterior.js';

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

function stubArea(id, areaType, label, shellPartial = {}) {
  return {
    id,
    areaType,
    label,
    shell: defaultShell({
      condition: 0.08,
      techLevel: 'broken',
      theme: 'derelictRust',
      colorway: 'coldDark',
      ...shellPartial,
    }),
    shared: { modules: [] },
    features: {},
  };
}

export function createJenningsPlace() {
  const hangar = createJenningsHangarArea();
  return {
    id: 'place.jennings',
    placeKind: PLACE_KINDS.station,
    label: 'Jennings Station',
    shell: cloneShell(hangar.shell),
    dockPolicy: 'welcoming',
    areaOrder: [hangar.id],
    areas: { [hangar.id]: hangar },
    defaultHangarAreaId: hangar.id,
  };
}

export function createDerelictHomePlace() {
  const hangar = createDerelictHangarArea();
  const bar = stubArea('area.bar-cantina', AREA_TYPES.bar, 'Cantina');
  const shop = stubArea('area.shop-chandler', AREA_TYPES.shop, 'Chandler');
  return {
    id: 'place.derelict-home',
    placeKind: PLACE_KINDS.station,
    label: 'Derelict Home',
    shell: defaultShell({
      condition: 0.08,
      techLevel: 'broken',
      theme: 'derelictRust',
      colorway: 'coldDark',
    }),
    dockPolicy: 'welcoming',
    areaOrder: [hangar.id, bar.id, shop.id],
    areas: {
      [hangar.id]: hangar,
      [bar.id]: bar,
      [shop.id]: shop,
    },
    defaultHangarAreaId: hangar.id,
  };
}

export function createPoorShedPlace() {
  const hangar = createPoorShedHangarArea();
  return {
    id: 'place.poor-shed',
    placeKind: PLACE_KINDS.station,
    label: 'Backwater Shed',
    shell: cloneShell(hangar.shell),
    dockPolicy: 'welcoming',
    areaOrder: [hangar.id],
    areas: { [hangar.id]: hangar },
    defaultHangarAreaId: hangar.id,
  };
}

export function createStationClonePlace(placeId, label, socialTier = 'mid') {
  const themes = {
    military: { theme: 'militaryOlive', colorway: 'armorGray', techLevel: 'elite', condition: 0.82 },
    elite: { theme: 'stationYard', colorway: 'jenningsBlue', techLevel: 'high', condition: 0.78 },
    home: { theme: 'stationYard', colorway: 'jenningsBlue', techLevel: 'high', condition: 0.72 },
    upper: { theme: 'stationYard', colorway: 'jenningsBlue', techLevel: 'mid', condition: 0.65 },
    mid: { theme: 'stationYard', colorway: 'jenningsBlue', techLevel: 'mid', condition: 0.58 },
    guild: { theme: 'backwaterRust', colorway: 'rustSteel', techLevel: 'mid', condition: 0.5 },
    poor: { theme: 'backwaterRust', colorway: 'rustSteel', techLevel: 'low', condition: 0.35 },
    derelict: { theme: 'derelictRust', colorway: 'coldDark', techLevel: 'broken', condition: 0.12 },
    pirate: { theme: 'derelictRust', colorway: 'coldDark', techLevel: 'low', condition: 0.28 },
  };
  const look = themes[socialTier] || themes.mid;
  const hangar = createJenningsHangarArea();
  hangar.id = 'area.hangar-main';
  hangar.label = `${label} Hangar`;
  hangar.shell = defaultShell(look);
  hangar.shared.visitorFilter = socialTier === 'military' ? 'military' : 'civilian';
  return {
    id: placeId,
    placeKind: PLACE_KINDS.station,
    label,
    shell: cloneShell(hangar.shell),
    dockPolicy: socialTier === 'military' ? 'restricted' : 'welcoming',
    areaOrder: [hangar.id],
    areas: { [hangar.id]: hangar },
    defaultHangarAreaId: hangar.id,
  };
}

export function createPlanetaryOutpostPlace(placeId, label) {
  const hangar = createPoorShedHangarArea();
  hangar.id = 'area.landing';
  hangar.label = 'Landing apron';
  hangar.shell = defaultShell({
    condition: 0.35,
    techLevel: 'low',
    theme: 'backwaterRust',
    colorway: 'rustSteel',
  });
  const farm = stubArea('area.surface', AREA_TYPES.farm, 'Surface district', {
    condition: 0.4,
    techLevel: 'low',
    theme: 'backwaterRust',
    colorway: 'rustSteel',
  });
  return {
    id: placeId,
    placeKind: PLACE_KINDS.outpost,
    label,
    shell: cloneShell(hangar.shell),
    dockPolicy: 'welcoming',
    areaOrder: [hangar.id, farm.id],
    areas: { [hangar.id]: hangar, [farm.id]: farm },
    defaultHangarAreaId: hangar.id,
  };
}

/** Registry stubs — undrawn, for Dev picker + future dock/land. */
export function createTraderStubPlace() {
  const hangar = createJenningsHangarArea();
  hangar.id = 'area.hangar-main';
  hangar.label = 'Trade Hangar';
  hangar.shell = defaultShell({
    condition: 0.7,
    techLevel: 'high',
    theme: 'stationYard',
    colorway: 'jenningsBlue',
  });
  hangar.shared.visitorFilter = 'civilian';
  return {
    id: 'place.trader-stub',
    placeKind: PLACE_KINDS.capitalShip,
    label: 'Wandering Trader (stub)',
    shell: cloneShell(hangar.shell),
    dockPolicy: 'welcoming',
    pose: null,
    areaOrder: [hangar.id, 'area.deck-ops'],
    areas: {
      [hangar.id]: hangar,
      'area.deck-ops': stubArea('area.deck-ops', AREA_TYPES.deck, 'Ops deck', {
        condition: 0.65,
        techLevel: 'mid',
        theme: 'stationYard',
        colorway: 'jenningsBlue',
      }),
    },
    defaultHangarAreaId: hangar.id,
  };
}

export function createFlagCruiserStubPlace() {
  const hangar = createJenningsHangarArea();
  hangar.id = 'area.hangar-main';
  hangar.label = 'Flight Deck';
  hangar.shell = defaultShell({
    condition: 0.75,
    techLevel: 'elite',
    theme: 'militaryOlive',
    colorway: 'armorGray',
  });
  hangar.shared.modules = ['crane', 'forkliftHub', 'securityPost'];
  hangar.shared.visitorFilter = 'military';
  hangar.features['feature.bay-b1'].padMk = 2;
  hangar.features['feature.bay-b2'].padMk = 3;
  hangar.features['feature.bay-b3'].padMk = 2;
  return {
    id: 'place.flag-cruiser-stub',
    placeKind: PLACE_KINDS.capitalShip,
    label: 'Flag Cruiser (stub)',
    shell: cloneShell(hangar.shell),
    dockPolicy: 'restricted',
    pose: null,
    areaOrder: [hangar.id, 'area.deck-ops'],
    areas: {
      [hangar.id]: hangar,
      'area.deck-ops': stubArea('area.deck-ops', AREA_TYPES.deck, 'CIC', {
        condition: 0.8,
        techLevel: 'elite',
        theme: 'militaryOlive',
        colorway: 'armorGray',
      }),
    },
    defaultHangarAreaId: hangar.id,
  };
}

export function createOutpostDustStubPlace() {
  const hangar = createPoorShedHangarArea();
  hangar.id = 'area.landing';
  hangar.label = 'Landing apron';
  hangar.shell = defaultShell({
    condition: 0.2,
    techLevel: 'low',
    theme: 'backwaterRust',
    colorway: 'rustSteel',
  });
  return {
    id: 'place.outpost-dust',
    placeKind: PLACE_KINDS.outpost,
    label: 'Dust Outpost (stub)',
    shell: cloneShell(hangar.shell),
    dockPolicy: 'welcoming',
    areaOrder: [hangar.id, 'area.farm-north', 'area.factory-ore'],
    areas: {
      [hangar.id]: hangar,
      'area.farm-north': stubArea('area.farm-north', AREA_TYPES.farm, 'North farm', {
        condition: 0.4,
        techLevel: 'low',
        theme: 'backwaterRust',
        colorway: 'rustSteel',
      }),
      'area.factory-ore': stubArea(
        'area.factory-ore',
        AREA_TYPES.factory,
        'Ore factory',
        { condition: 0.1, techLevel: 'broken' }
      ),
    },
    defaultHangarAreaId: hangar.id,
  };
}

const PRESET_BUILDERS = {
  'place.jennings': createJenningsPlace,
  'place.derelict-home': createDerelictHomePlace,
  'place.poor-shed': createPoorShedPlace,
  'place.trader-stub': createTraderStubPlace,
  'place.flag-cruiser-stub': createFlagCruiserStubPlace,
  'place.outpost-dust': createOutpostDustStubPlace,
};

export function registerLayoutPlaces(registry, layout) {
  if (!registry?.places || !layout?.sites) return;
  for (const site of layout.sites) {
    if (site.kind === 'station') {
      const placeId = site.placeId || `place.${site.id.replace(/^site\./, '')}`;
      if (registry.places.has(placeId)) continue;
      if (placeId === 'place.jennings' || placeId === 'place.derelict-home') continue;
      registry.places.set(
        placeId,
        createStationClonePlace(placeId, site.name, site.socialTier || 'mid')
      );
    }
    if (site.kind === 'planetary') {
      const placeId = site.placeId || `place.${site.id.replace(/^site\./, '')}`;
      if (registry.places.has(placeId)) continue;
      registry.places.set(placeId, createPlanetaryOutpostPlace(placeId, site.name));
    }
  }
}

export class PlaceRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this.places = new Map();
    this.activePlaceId = 'place.jennings';
    this.activeAreaId = 'area.hangar-main';
    /** @type {'none'|'shipInterior'|string} */
    this.interiorMode = 'none';
    this._seedDefaults();
  }

  _seedDefaults() {
    for (const build of Object.values(PRESET_BUILDERS)) {
      const p = build();
      this.places.set(p.id, p);
    }
  }

  listPlaces() {
    return [...this.places.values()];
  }

  get(placeId) {
    return this.places.get(placeId) || null;
  }

  getActive() {
    return this.get(this.activePlaceId);
  }

  getActiveArea() {
    const place = this.getActive();
    if (!place) return null;
    return place.areas[this.activeAreaId] || null;
  }

  getActiveHangarArea() {
    const place = this.getActive();
    if (!place) return null;
    const id = place.defaultHangarAreaId || this.activeAreaId;
    const area = place.areas[id];
    return area?.areaType === 'hangar' ? area : null;
  }

  setActive(placeId, areaId = null) {
    const place = this.get(placeId);
    if (!place) return false;
    this.activePlaceId = placeId;
    this.activeAreaId =
      areaId ||
      place.defaultHangarAreaId ||
      place.areaOrder?.[0] ||
      Object.keys(place.areas)[0];
    return true;
  }

  /** Replace live place with a fresh preset clone (Dev Apply). */
  applyPreset(placeId) {
    const build = PRESET_BUILDERS[placeId];
    if (!build) return null;
    const place = build();
    this.places.set(place.id, place);
    this.setActive(place.id, place.defaultHangarAreaId);
    return place;
  }

  ensureVesselPlace(shipId, opts = {}) {
    const id = `place.vessel.${shipId || 'player'}`;
    if (!this.places.has(id)) {
      this.places.set(id, createVesselInteriorPlace(shipId, opts));
    }
    return this.places.get(id);
  }

  getHangarRuntimeConfig(placeId = null, areaId = null) {
    const place = this.get(placeId || this.activePlaceId) || createJenningsPlace();
    const aid = areaId || place.defaultHangarAreaId;
    const area = place.areas[aid];
    if (!area || area.areaType !== 'hangar') {
      return hangarRuntimeConfig(createJenningsHangarArea(), place.shell);
    }
    return hangarRuntimeConfig(area, place.shell);
  }

  /** Snapshot for Dev UI */
  describeActive() {
    const place = this.getActive();
    const area = this.getActiveArea();
    const bays = area?.areaType === 'hangar' ? orderedBays(area) : [];
    return {
      placeId: place?.id,
      placeKind: place?.placeKind,
      placeLabel: place?.label,
      areaId: area?.id,
      areaType: area?.areaType,
      areaLabel: area?.label,
      bayCount: bays.length,
      bays: bays.map((b) => ({
        id: b.id,
        label: b.label,
        padMk: b.padMk,
        mechs: b.mechs,
        modules: b.modules,
        techLevel: b.shell?.techLevel,
        condition: b.shell?.condition,
      })),
      shared: area?.shared || null,
      shell: place?.shell || null,
    };
  }
}

/** Singleton used by GameEngine / HangarBay / Dev */
export const placeRegistry = new PlaceRegistry();

export { PRESET_BUILDERS, deepClone };
