/**
 * Hangar flavor layout — props, linger stands, gossip path-to points.
 * Machine-editable via Dev Mode Hangar Layout Editor. Structural sim stays in HangarBay.js.
 */

/**
 * @typedef {{
 *   id?: string,
 *   x: number,
 *   y: number,
 *   bays?: number[],
 *   faceDeg?: number,
 *   faceSlackDeg?: number,
 * }} LingerStand
 */

/**
 * @typedef {{
 *   id: string,
 *   kind: string,
 *   variant?: number,
 *   x: number,
 *   y: number,
 *   bay?: number,
 *   facing?: number,
 *   linger?: LingerStand[],
 * }} HangarProp
 */

/**
 * @typedef {{ id: string, x: number, y: number, capacity: number }} GossipWp
 */

/** @type {{ version: number, props: HangarProp[], yardProps: HangarProp[], gossip: GossipWp[] }} */
export let HANGAR_LAYOUT = {
  version: 1,
  props: [
    // —— West wing ——
    {
      id: 'storesW',
      kind: 'partsRack',
      variant: 0,
      x: -312,
      y: -92,
      bay: 0,
      facing: 0,
      linger: [
        { id: 'storesW_0', x: -294, y: -84, bays: [0, 1, 2], faceDeg: 180, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'spoolW',
      kind: 'cableSpool',
      variant: 0,
      x: -300,
      y: -28,
      bay: 0,
      facing: 0,
      linger: [
        { id: 'spoolW_0', x: -282, y: -20, bays: [0, 1, 2], faceDeg: 180, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'coolantW',
      kind: 'drumStack',
      variant: 0,
      x: -308,
      y: 42,
      bay: 0,
      facing: 0,
      linger: [
        { id: 'coolantW_0', x: -290, y: 50, bays: [0, 1, 2], faceDeg: 180, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'lockerW',
      kind: 'suitLocker',
      variant: 0,
      x: -276,
      y: -58,
      bay: 0,
      facing: 0,
      linger: [
        { id: 'lockerW_0', x: -258, y: -50, bays: [0, 1, 2], faceDeg: 180, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'breakW',
      kind: 'breakCrate',
      variant: 0,
      x: -268,
      y: 18,
      bay: 0,
      facing: 0,
      linger: [
        { id: 'breakW_0', x: -250, y: 26, bays: [0, 1, 2], faceDeg: 180, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'weldScreenW',
      kind: 'weldScreen',
      variant: 0,
      x: -286,
      y: -8,
      bay: 0,
      facing: 0,
      linger: [
        { id: 'weldScreenW_0', x: -268, y: 0, bays: [0, 1, 2], faceDeg: 180, faceSlackDeg: 25 },
      ],
    },
    // —— East wing ——
    {
      id: 'nozzleE',
      kind: 'pallet',
      variant: 0,
      x: 308,
      y: -88,
      bay: 2,
      facing: 0,
      linger: [
        { id: 'nozzleE_0', x: 290, y: -80, bays: [0, 1, 2], faceDeg: 0, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'bottleE',
      kind: 'bottleRack',
      variant: 0,
      x: 316,
      y: -34,
      bay: 2,
      facing: 0,
      linger: [
        { id: 'bottleE_0', x: 298, y: -26, bays: [0, 1, 2], faceDeg: 0, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'ammoE',
      kind: 'drumStack',
      variant: 1,
      x: 300,
      y: 12,
      bay: 2,
      facing: 0,
      linger: [
        { id: 'ammoE_0', x: 282, y: 20, bays: [0, 1, 2], faceDeg: 0, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'cartE',
      kind: 'diagCart',
      variant: 0,
      x: 274,
      y: -56,
      bay: 2,
      facing: 0,
      linger: [
        { id: 'cartE_0', x: 256, y: -48, bays: [0, 1, 2], faceDeg: 0, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'lockerE',
      kind: 'suitLocker',
      variant: 1,
      x: 282,
      y: 48,
      bay: 2,
      facing: 0,
      linger: [
        { id: 'lockerE_0', x: 264, y: 56, bays: [0, 1, 2], faceDeg: 0, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'shiftE',
      kind: 'shiftBoard',
      variant: 0,
      x: 264,
      y: -12,
      bay: 2,
      facing: 0,
      linger: [
        { id: 'shiftE_0', x: 246, y: -4, bays: [0, 1, 2], faceDeg: 0, faceSlackDeg: 25 },
      ],
    },
    // —— Bay apron workbenches / terminals (SIDE_PAD_X=155, DANGER_SOUTH=63) ——
    {
      id: 'bayBench0',
      kind: 'workbench',
      variant: 0,
      x: -251,
      y: 79,
      bay: 0,
      facing: 0,
      linger: [
        { id: 'bayBench0_a', x: -237, y: 91, bays: [0], faceDeg: 270, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'bayTerm0',
      kind: 'bayTerminal',
      variant: 0,
      x: -239,
      y: 99,
      bay: 0,
      facing: 0,
      linger: [
        { id: 'bayTerm0_a', x: -227, y: 109, bays: [0], faceDeg: 270, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'bayBench1',
      kind: 'workbench',
      variant: 1,
      x: 90,
      y: 81,
      bay: 1,
      facing: 0,
      linger: [
        { id: 'bayBench1_a', x: 104, y: 93, bays: [1], faceDeg: 270, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'bayTerm1',
      kind: 'bayTerminal',
      variant: 1,
      x: -90,
      y: 97,
      bay: 1,
      facing: 0,
      linger: [
        { id: 'bayTerm1_a', x: -78, y: 107, bays: [1], faceDeg: 270, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'bayBench2',
      kind: 'workbench',
      variant: 2,
      x: 251,
      y: 83,
      bay: 2,
      facing: 0,
      linger: [
        { id: 'bayBench2_a', x: 237, y: 95, bays: [2], faceDeg: 270, faceSlackDeg: 25 },
      ],
    },
    {
      id: 'bayTerm2',
      kind: 'bayTerminal',
      variant: 2,
      x: 239,
      y: 101,
      bay: 2,
      facing: 0,
      linger: [
        { id: 'bayTerm2_a', x: 227, y: 111, bays: [2], faceDeg: 270, faceSlackDeg: 25 },
      ],
    },
    // —— Service-board linger anchors (boards draw in code; kind computer = non-drawable) ——
    {
      id: 'bayComputer0',
      kind: 'computer',
      x: -155,
      y: 119,
      bay: 0,
      facing: 0,
      linger: [
        { id: 'bayComputer0_n0', x: -173, y: 41, bays: [0], faceDeg: 90, faceSlackDeg: 20 },
        { id: 'bayComputer0_n1', x: -183, y: 51, bays: [0], faceDeg: 90, faceSlackDeg: 20 },
        { id: 'bayComputer0_n2', x: -139, y: 41, bays: [0], faceDeg: 90, faceSlackDeg: 20 },
        { id: 'bayComputer0_s0', x: -177, y: 103, bays: [0], faceDeg: 270, faceSlackDeg: 20 },
      ],
    },
    {
      id: 'bayComputer1',
      kind: 'computer',
      x: 0,
      y: 119,
      bay: 1,
      facing: 0,
      linger: [
        { id: 'bayComputer1_n0', x: -18, y: 41, bays: [1], faceDeg: 90, faceSlackDeg: 20 },
        { id: 'bayComputer1_n1', x: 28, y: 51, bays: [1], faceDeg: 90, faceSlackDeg: 20 },
        { id: 'bayComputer1_n2', x: 16, y: 41, bays: [1], faceDeg: 90, faceSlackDeg: 20 },
        { id: 'bayComputer1_s0', x: 22, y: 103, bays: [1], faceDeg: 270, faceSlackDeg: 20 },
      ],
    },
    {
      id: 'bayComputer2',
      kind: 'computer',
      x: 155,
      y: 119,
      bay: 2,
      facing: 0,
      linger: [
        { id: 'bayComputer2_n0', x: 173, y: 41, bays: [2], faceDeg: 90, faceSlackDeg: 20 },
        { id: 'bayComputer2_n1', x: 183, y: 51, bays: [2], faceDeg: 90, faceSlackDeg: 20 },
        { id: 'bayComputer2_n2', x: 139, y: 41, bays: [2], faceDeg: 90, faceSlackDeg: 20 },
        { id: 'bayComputer2_s0', x: 177, y: 103, bays: [2], faceDeg: 270, faceSlackDeg: 20 },
      ],
    },
  ],
  yardProps: [
    { id: 'forkChargeW', kind: 'forkCharger', variant: 0, x: -194, y: 186, facing: 0 },
    { id: 'forkTireE', kind: 'forkTireRack', variant: 0, x: 192, y: 180, facing: 0 },
    { id: 'forkConesW', kind: 'forkCones', variant: 0, x: -188, y: 202, facing: 0 },
    { id: 'forkCrateE', kind: 'forkCrate', variant: 0, x: 188, y: 200, facing: 0 },
  ],
  gossip: [
    { id: 'gossipW1', x: -270, y: -52, capacity: 3 },
    { id: 'gossipW2', x: -258, y: 22, capacity: 3 },
    { id: 'gossipE1', x: 268, y: -50, capacity: 3 },
    { id: 'gossipE2', x: 276, y: 52, capacity: 3 },
    { id: 'gossipWN', x: -298, y: -96, capacity: 2 },
    { id: 'gossipEN', x: 300, y: -82, capacity: 2 },
  ],
};

/** Deep-clone helper for drafts / revert */
export function cloneHangarLayout(layout = HANGAR_LAYOUT) {
  return JSON.parse(JSON.stringify(layout));
}

/**
 * Replace live layout (hot-apply from editor).
 * @param {typeof HANGAR_LAYOUT} next
 */
export function setHangarLayout(next) {
  HANGAR_LAYOUT = next;
}

export function getHangarProps() {
  return HANGAR_LAYOUT.props;
}

export function getYardProps() {
  return HANGAR_LAYOUT.yardProps;
}

export function getGossipWaypoints() {
  return HANGAR_LAYOUT.gossip;
}

/**
 * Normalize linger.bays (legacy bay:n → [n]; omit → inherit prop).
 * @param {LingerStand} stand
 * @param {HangarProp} prop
 * @returns {number[]}
 */
export function resolveLingerBays(stand, prop) {
  if (stand?.bays && Array.isArray(stand.bays) && stand.bays.length) {
    return stand.bays.filter((b) => b === 0 || b === 1 || b === 2);
  }
  if (typeof stand?.bay === 'number' && stand.bay >= 0 && stand.bay <= 2) {
    return [stand.bay];
  }
  if (typeof prop?.bay === 'number' && prop.bay >= 0 && prop.bay <= 2) {
    return [prop.bay];
  }
  return [0, 1, 2];
}

/**
 * @param {number[]} bays
 * @param {number} homeBay
 */
export function lingerAllowsBay(bays, homeBay) {
  return bays.includes(homeBay);
}

/** Placeable kinds for the hangar editor palette */
export const HANGAR_PROP_KINDS = [
  'workbench',
  'bayTerminal',
  'partsRack',
  'cableSpool',
  'drumStack',
  'suitLocker',
  'pallet',
  'diagCart',
  'breakCrate',
  'weldScreen',
  'bottleRack',
  'shiftBoard',
];

export const HANGAR_YARD_KINDS = [
  'forkCharger',
  'forkTireRack',
  'forkCones',
  'forkCrate',
];
