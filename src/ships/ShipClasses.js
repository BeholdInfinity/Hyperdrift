/**
 * Ship classes and swap groups.
 * Parts may only mix within a swap group (see ShipAttach.js).
 *
 * Pad Mk: UltraLight + Light → Mk1 · Standard → Mk2 · Heavy → Mk3
 * Heavy is a size tier (mirrors Standard classes), not a single class.
 */

export const SWAP_GROUPS = {
  ultraLight: 'ultraLight',
  light: 'light',
  standard: 'standard',
  heavy: 'heavy',
};

/** Display order for Blueprint / Upgrade UI */
export const SWAP_GROUP_ORDER = [
  SWAP_GROUPS.ultraLight,
  SWAP_GROUPS.light,
  SWAP_GROUPS.standard,
  SWAP_GROUPS.heavy,
];

export const SWAP_GROUP_LABELS = {
  ultraLight: 'UltraLight',
  light: 'Light',
  standard: 'Standard',
  heavy: 'Heavy',
};

/** Exclusive pad tier required to dock this swap group */
export const SWAP_GROUP_PAD_MK = {
  ultraLight: 1,
  light: 1,
  standard: 2,
  heavy: 3,
};

/** Max hardpoint socket Mk by group */
export const SWAP_GROUP_SOCKET_MK_CAP = {
  ultraLight: 1,
  light: 2,
  standard: 3,
  heavy: 5,
};

export const SECTION_ROLES = {
  hull: 'hull',
  bridge: 'bridge',
  cockpit: 'cockpit',
  body: 'body',
  aft: 'aft',
  engine: 'engine',
};

/**
 * @typedef {string} ShipClassId
 */

/**
 * @typedef {{
 *   id: ShipClassId,
 *   label: string,
 *   swapGroup: string,
 *   sectionCount: number,
 *   sectionRoles: string[],
 *   scale: number,
 *   cargoBase: number,
 *   cargoPerBodyMk: number,
 *   seatBase: number,
 *   seatPerBodyMk: number,
 *   cargoFocus?: boolean,
 *   seatFocus?: boolean,
 *   cargoMkDefault: number,
 *   playerEquipable: boolean,
 *   canDockHomeBase: boolean,
 *   prebuiltOnly: boolean,
 *   padMk: number,
 * }} ShipClassDef
 */

/** @type {Record<string, ShipClassDef>} */
export const SHIP_CLASSES = {
  // —— UltraLight (Mk1 pads) ——
  drone: {
    id: 'drone',
    label: 'Drone',
    swapGroup: SWAP_GROUPS.ultraLight,
    sectionCount: 1,
    sectionRoles: [SECTION_ROLES.hull],
    scale: 0.42,
    cargoBase: 0,
    cargoPerBodyMk: 0,
    seatBase: 0,
    seatPerBodyMk: 0,
    cargoMkDefault: 0,
    playerEquipable: false,
    canDockHomeBase: true,
    prebuiltOnly: true,
    padMk: 1,
  },
  scout: {
    id: 'scout',
    label: 'Scout',
    swapGroup: SWAP_GROUPS.ultraLight,
    sectionCount: 1,
    sectionRoles: [SECTION_ROLES.hull],
    scale: 0.52,
    cargoBase: 0,
    cargoPerBodyMk: 0,
    seatBase: 0,
    seatPerBodyMk: 0,
    cargoMkDefault: 0,
    playerEquipable: false,
    canDockHomeBase: true,
    prebuiltOnly: true,
    padMk: 1,
  },
  racer: {
    id: 'racer',
    label: 'Racer',
    swapGroup: SWAP_GROUPS.ultraLight,
    sectionCount: 1,
    sectionRoles: [SECTION_ROLES.hull],
    scale: 0.68,
    cargoBase: 0,
    cargoPerBodyMk: 0,
    seatBase: 0,
    seatPerBodyMk: 0,
    cargoMkDefault: 0,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 1,
  },
  lightFighter: {
    id: 'lightFighter',
    label: 'Light Fighter',
    swapGroup: SWAP_GROUPS.ultraLight,
    sectionCount: 1,
    sectionRoles: [SECTION_ROLES.hull],
    scale: 0.82,
    cargoBase: 0,
    cargoPerBodyMk: 0,
    seatBase: 0,
    seatPerBodyMk: 0,
    cargoMkDefault: 0,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 1,
  },

  // —— Light (Mk1 pads) ——
  fighter: {
    id: 'fighter',
    label: 'Fighter',
    swapGroup: SWAP_GROUPS.light,
    sectionCount: 2,
    sectionRoles: [SECTION_ROLES.cockpit, SECTION_ROLES.aft],
    scale: 1.05,
    cargoBase: 1,
    cargoPerBodyMk: 0,
    seatBase: 0,
    seatPerBodyMk: 0,
    cargoMkDefault: 1,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 1,
  },
  transport: {
    id: 'transport',
    label: 'Personal Transport',
    swapGroup: SWAP_GROUPS.light,
    sectionCount: 2,
    sectionRoles: [SECTION_ROLES.cockpit, SECTION_ROLES.aft],
    scale: 1.12,
    cargoBase: 0,
    cargoPerBodyMk: 0,
    seatBase: 2,
    seatPerBodyMk: 0.5,
    seatFocus: true,
    cargoMkDefault: 0,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 1,
  },

  // —— Standard (Mk2 pads) ——
  miner: {
    id: 'miner',
    label: 'Miner',
    swapGroup: SWAP_GROUPS.standard,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 1.6,
    cargoBase: 2,
    cargoPerBodyMk: 1,
    seatBase: 1,
    seatPerBodyMk: 0.25,
    cargoMkDefault: 4,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 2,
  },
  generalist: {
    id: 'generalist',
    label: 'Generalist',
    swapGroup: SWAP_GROUPS.standard,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    /** Fills Mk2 pad (~0.9 × PAD_R / unit half-length); bell draw uses this scale */
    scale: 1.55,
    cargoBase: 2,
    cargoPerBodyMk: 1,
    seatBase: 2,
    seatPerBodyMk: 0.5,
    cargoMkDefault: 5,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 2,
  },
  science: {
    id: 'science',
    label: 'Science',
    swapGroup: SWAP_GROUPS.standard,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 1.55,
    cargoBase: 2,
    cargoPerBodyMk: 1,
    seatBase: 1,
    seatPerBodyMk: 0.25,
    cargoMkDefault: 3,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 2,
  },
  hauler: {
    id: 'hauler',
    label: 'Hauler',
    swapGroup: SWAP_GROUPS.standard,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 1.75,
    cargoBase: 4,
    cargoPerBodyMk: 1.5,
    seatBase: 1,
    seatPerBodyMk: 0.25,
    cargoFocus: true,
    cargoMkDefault: 6,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 2,
  },
  standardFighter: {
    id: 'standardFighter',
    label: 'Fighter',
    swapGroup: SWAP_GROUPS.standard,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 1.65,
    cargoBase: 1,
    cargoPerBodyMk: 0.75,
    seatBase: 1,
    seatPerBodyMk: 0.25,
    cargoMkDefault: 3,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 2,
  },
  standardTransport: {
    id: 'standardTransport',
    label: 'Transport',
    swapGroup: SWAP_GROUPS.standard,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 1.7,
    cargoBase: 0,
    cargoPerBodyMk: 0.25,
    seatBase: 8,
    seatPerBodyMk: 2,
    seatFocus: true,
    cargoMkDefault: 1,
    playerEquipable: true,
    canDockHomeBase: true,
    prebuiltOnly: false,
    padMk: 2,
  },

  // —— Heavy (Mk3 pads; mirrors Standard) ——
  heavyMiner: {
    id: 'heavyMiner',
    label: 'Miner',
    swapGroup: SWAP_GROUPS.heavy,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 3.15,
    cargoBase: 4,
    cargoPerBodyMk: 1.25,
    seatBase: 2,
    seatPerBodyMk: 0.35,
    cargoMkDefault: 8,
    playerEquipable: true,
    canDockHomeBase: false,
    prebuiltOnly: false,
    padMk: 3,
  },
  heavyGeneralist: {
    id: 'heavyGeneralist',
    label: 'Generalist',
    swapGroup: SWAP_GROUPS.heavy,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 3.1,
    cargoBase: 4,
    cargoPerBodyMk: 1.25,
    seatBase: 3,
    seatPerBodyMk: 0.5,
    cargoMkDefault: 9,
    playerEquipable: true,
    canDockHomeBase: false,
    prebuiltOnly: false,
    padMk: 3,
  },
  heavyScience: {
    id: 'heavyScience',
    label: 'Science',
    swapGroup: SWAP_GROUPS.heavy,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 3.1,
    cargoBase: 3,
    cargoPerBodyMk: 1.25,
    seatBase: 2,
    seatPerBodyMk: 0.35,
    cargoMkDefault: 7,
    playerEquipable: true,
    canDockHomeBase: false,
    prebuiltOnly: false,
    padMk: 3,
  },
  heavyHauler: {
    id: 'heavyHauler',
    label: 'Hauler',
    swapGroup: SWAP_GROUPS.heavy,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 3.45,
    cargoBase: 8,
    cargoPerBodyMk: 2,
    seatBase: 2,
    seatPerBodyMk: 0.35,
    cargoFocus: true,
    cargoMkDefault: 14,
    playerEquipable: true,
    canDockHomeBase: false,
    prebuiltOnly: false,
    padMk: 3,
  },
  heavyFighter: {
    id: 'heavyFighter',
    label: 'Fighter',
    swapGroup: SWAP_GROUPS.heavy,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 3.3,
    cargoBase: 3,
    cargoPerBodyMk: 1,
    seatBase: 2,
    seatPerBodyMk: 0.35,
    cargoMkDefault: 6,
    playerEquipable: true,
    canDockHomeBase: false,
    prebuiltOnly: false,
    padMk: 3,
  },
  heavyTransport: {
    id: 'heavyTransport',
    label: 'Transport',
    swapGroup: SWAP_GROUPS.heavy,
    sectionCount: 3,
    sectionRoles: [SECTION_ROLES.bridge, SECTION_ROLES.body, SECTION_ROLES.engine],
    scale: 3.4,
    cargoBase: 0,
    cargoPerBodyMk: 0.2,
    seatBase: 24,
    seatPerBodyMk: 4,
    seatFocus: true,
    cargoMkDefault: 1,
    playerEquipable: true,
    canDockHomeBase: false,
    prebuiltOnly: false,
    padMk: 3,
  },
};

/** Legacy id aliases */
const CLASS_ALIASES = {
  mega: 'heavyGeneralist',
  heavy: 'heavyGeneralist',
};

export function getShipClass(id) {
  const resolved = CLASS_ALIASES[id] || id;
  return SHIP_CLASSES[resolved] ?? null;
}

export function classesInSwapGroup(group) {
  const g = normalizeSwapGroup(group);
  return Object.values(SHIP_CLASSES).filter((c) => c.swapGroup === g);
}

export function normalizeSwapGroup(group) {
  if (group === 'scout') return SWAP_GROUPS.ultraLight;
  if (group === 'mega') return SWAP_GROUPS.heavy;
  return group;
}

export function padMkForSwapGroup(group) {
  const g = normalizeSwapGroup(group);
  return SWAP_GROUP_PAD_MK[g] ?? 2;
}

export function socketMkCapForSwapGroup(group) {
  const g = normalizeSwapGroup(group);
  return SWAP_GROUP_SOCKET_MK_CAP[g] ?? 3;
}

export function padMkForClass(classId) {
  const cls = getShipClass(classId);
  return cls?.padMk ?? padMkForSwapGroup(cls?.swapGroup);
}

export function padAcceptsSwapGroup(padMk, swapGroup) {
  return padMkForSwapGroup(swapGroup) === (padMk | 0);
}

export function padAcceptsClass(padMk, classId) {
  const cls = getShipClass(classId);
  if (!cls) return false;
  return padAcceptsSwapGroup(padMk, cls.swapGroup);
}

export function labelSwapGroup(group) {
  const g = normalizeSwapGroup(group);
  return SWAP_GROUP_LABELS[g] || g;
}

/**
 * Freight hold spots from class + hold-section Mk.
 * @param {ShipClassDef|null} cls
 * @param {number} holdMk
 */
export function cargoCapacityFor(cls, holdMk = 2) {
  if (!cls) return 0;
  const mk = Math.max(1, holdMk | 0);
  return Math.max(0, Math.round(cls.cargoBase + cls.cargoPerBodyMk * (mk - 1)));
}

/**
 * Rideable seats from class + hold-section Mk.
 * @param {ShipClassDef|null} cls
 * @param {number} holdMk
 */
export function seatCapacityFor(cls, holdMk = 2) {
  if (!cls) return 0;
  const mk = Math.max(1, holdMk | 0);
  return Math.max(0, Math.round(cls.seatBase + cls.seatPerBodyMk * (mk - 1)));
}
