/**
 * Hangar flavor layout — props, linger stands, gossip path-to points.
 * Machine-editable via Dev Mode Hangar Layout Editor.
 * `sidePadX` = B1/B3 pad offset from center (outer bays stay symmetric).
 * Props use one list + `category` (desk/shelf/storage/tool/yard/decor/anchor).
 */

export const HANGAR_SIDE_PAD_DEFAULT = 155;
export const HANGAR_SIDE_PAD_MIN = 145;
export const HANGAR_SIDE_PAD_MAX = 240;
export const HANGAR_BAY_UNIT_HALF = 120;

export let HANGAR_LAYOUT = {
  "version": 2,
  "sidePadX": 194,
  "props": [
    {
      "id": "posterCrewB1W",
      "kind": "wallPoster",
      "variant": 0,
      "x": -302,
      "y": -164,
      "bay": 0,
      "facing": 0,
      "linger": [],
      "category": "decor"
    },
    {
      "id": "storesW",
      "kind": "partsRack",
      "variant": 0,
      "x": -289,
      "y": -99,
      "bay": 0,
      "facing": 0,
      "linger": [],
      "category": "shelf"
    },
    {
      "id": "spoolW",
      "kind": "cableSpool",
      "variant": 0,
      "x": -292,
      "y": 0,
      "bay": 0,
      "facing": 0,
      "linger": [],
      "category": "storage"
    },
    {
      "id": "coolantW",
      "kind": "drumStack",
      "variant": 0,
      "x": -97,
      "y": -144,
      "bay": 0,
      "facing": 0,
      "linger": [],
      "category": "storage"
    },
    {
      "id": "lockerW",
      "kind": "suitLocker",
      "variant": 0,
      "x": -321,
      "y": -27,
      "bay": 0,
      "facing": 6,
      "linger": [],
      "category": "shelf"
    },
    {
      "id": "breakW",
      "kind": "breakCrate",
      "variant": 0,
      "x": -325,
      "y": 22,
      "bay": 0,
      "facing": 6,
      "linger": [],
      "category": "storage"
    },
    {
      "id": "weldScreenW",
      "kind": "weldScreen",
      "variant": 0,
      "x": -98,
      "y": -97,
      "bay": 0,
      "facing": 0,
      "linger": [],
      "category": "tool"
    },
    {
      "id": "nozzleE",
      "kind": "pallet",
      "variant": 0,
      "x": 324,
      "y": -84,
      "bay": 2,
      "facing": 2,
      "linger": [
        {
          "id": "nozzleE_0",
          "x": 301,
          "y": -83,
          "bays": [
            2
          ],
          "faceDeg": 0,
          "faceSlackDeg": 25
        }
      ],
      "category": "storage"
    },
    {
      "id": "bottleE",
      "kind": "bottleRack",
      "variant": 0,
      "x": 94,
      "y": -140,
      "bay": 2,
      "facing": 0,
      "linger": [
        {
          "id": "bottleE_0",
          "x": 299,
          "y": -32,
          "bays": [
            2
          ],
          "faceDeg": 0,
          "faceSlackDeg": 25
        }
      ],
      "category": "shelf"
    },
    {
      "id": "ammoE",
      "kind": "drumStack",
      "variant": 1,
      "x": 321,
      "y": -138,
      "bay": 2,
      "facing": 0,
      "linger": [
        {
          "id": "ammoE_0",
          "x": 321,
          "y": -118,
          "bays": [
            2
          ],
          "faceDeg": 270,
          "faceSlackDeg": 25
        }
      ],
      "category": "storage"
    },
    {
      "id": "cartE",
      "kind": "diagCart",
      "variant": 0,
      "x": 92,
      "y": -3,
      "bay": 2,
      "facing": 6,
      "linger": [
        {
          "id": "cartE_0",
          "x": 292,
          "y": -98,
          "bays": [
            2
          ],
          "faceDeg": 270,
          "faceSlackDeg": 25
        }
      ],
      "category": "storage"
    },
    {
      "id": "lockerE",
      "kind": "suitLocker",
      "variant": 1,
      "x": 283,
      "y": 12,
      "bay": 2,
      "facing": 0,
      "linger": [
        {
          "id": "lockerE_0",
          "x": 308,
          "y": 40,
          "bays": [
            2
          ],
          "faceDeg": 0,
          "faceSlackDeg": 25
        }
      ],
      "category": "shelf"
    },
    {
      "id": "shiftE",
      "kind": "shiftBoard",
      "variant": 0,
      "x": 293,
      "y": -110,
      "bay": 2,
      "facing": 0,
      "linger": [
        {
          "id": "shiftE_0",
          "x": 284,
          "y": 27,
          "bays": [
            2
          ],
          "faceDeg": 270,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro5jrio_10",
          "x": 302,
          "y": 65,
          "bays": [
            2
          ],
          "faceDeg": 49,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro64g93_17",
          "x": 110,
          "y": 59,
          "bays": [
            2
          ],
          "faceDeg": 109,
          "faceSlackDeg": 25
        }
      ],
      "category": "desk"
    },
    {
      "id": "bayBench0",
      "kind": "workbench",
      "variant": 0,
      "x": -315,
      "y": 68,
      "bay": 0,
      "facing": 5,
      "linger": [
        {
          "id": "bayBench0_a",
          "x": -232,
          "y": 111,
          "bays": [
            0
          ],
          "faceDeg": 270,
          "faceSlackDeg": 25
        }
      ],
      "category": "desk"
    },
    {
      "id": "bayTerm0",
      "kind": "bayTerminal",
      "variant": 0,
      "x": -99,
      "y": -53,
      "bay": 0,
      "facing": 1,
      "linger": [
        {
          "id": "bayTerm0_a",
          "x": -195,
          "y": 121,
          "bays": [
            0
          ],
          "faceDeg": 270,
          "faceSlackDeg": 25
        }
      ],
      "category": "desk"
    },
    {
      "id": "bayBench1",
      "kind": "workbench",
      "variant": 1,
      "x": 322,
      "y": -30,
      "bay": 1,
      "facing": 2,
      "linger": [
        {
          "id": "bayBench1_a",
          "x": 84,
          "y": 60,
          "bays": [
            1
          ],
          "faceDeg": 60,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro5z45h_15",
          "x": -86,
          "y": 56,
          "bays": [
            1
          ],
          "faceDeg": 109,
          "faceSlackDeg": 25
        }
      ],
      "category": "desk"
    },
    {
      "id": "bayTerm1",
      "kind": "bayTerminal",
      "variant": 1,
      "x": -95,
      "y": 17,
      "bay": 1,
      "facing": 6,
      "linger": [
        {
          "id": "bayTerm1_a",
          "x": -42,
          "y": 107,
          "bays": [
            1
          ],
          "faceDeg": 270,
          "faceSlackDeg": 25
        }
      ],
      "category": "desk"
    },
    {
      "id": "bayBench2",
      "kind": "workbench",
      "variant": 2,
      "x": 312,
      "y": 77,
      "bay": 2,
      "facing": 3,
      "linger": [
        {
          "id": "bayBench2_a",
          "x": 227,
          "y": 115,
          "bays": [
            2
          ],
          "faceDeg": 270,
          "faceSlackDeg": 25
        }
      ],
      "category": "desk"
    },
    {
      "id": "bayTerm2",
      "kind": "bayTerminal",
      "variant": 2,
      "x": 326,
      "y": 39,
      "bay": 2,
      "facing": 2,
      "linger": [
        {
          "id": "bayTerm2_a",
          "x": 194,
          "y": 111,
          "bays": [
            2
          ],
          "faceDeg": 270,
          "faceSlackDeg": 25
        }
      ],
      "category": "desk"
    },
    {
      "id": "bayComputer0",
      "kind": "computer",
      "x": -194,
      "y": 119,
      "bay": 0,
      "facing": 0,
      "linger": [
        {
          "id": "bayComputer0_n0",
          "x": -113,
          "y": -102,
          "bays": [
            0
          ],
          "faceDeg": 0,
          "faceSlackDeg": 20
        },
        {
          "id": "bayComputer0_n1",
          "x": -114,
          "y": 55,
          "bays": [
            0
          ],
          "faceDeg": 60,
          "faceSlackDeg": 20
        },
        {
          "id": "bayComputer0_n2",
          "x": -107,
          "y": -45,
          "bays": [
            0
          ],
          "faceDeg": 315,
          "faceSlackDeg": 20
        },
        {
          "id": "bayComputer0_s0",
          "x": -158,
          "y": 113,
          "bays": [
            0
          ],
          "faceDeg": 270,
          "faceSlackDeg": 20
        }
      ],
      "category": "anchor"
    },
    {
      "id": "bayComputer1",
      "kind": "computer",
      "x": 0,
      "y": 119,
      "bay": 1,
      "facing": 0,
      "linger": [
        {
          "id": "bayComputer1_n0",
          "x": -85,
          "y": 17,
          "bays": [
            1
          ],
          "faceDeg": 180,
          "faceSlackDeg": 20
        },
        {
          "id": "bayComputer1_n1",
          "x": 36,
          "y": 111,
          "bays": [
            1
          ],
          "faceDeg": 270,
          "faceSlackDeg": 20
        },
        {
          "id": "bayComputer1_n2",
          "x": 87,
          "y": -67,
          "bays": [
            1
          ],
          "faceDeg": 300,
          "faceSlackDeg": 20
        },
        {
          "id": "bayComputer1_s0",
          "x": 14,
          "y": 110,
          "bays": [
            1
          ],
          "faceDeg": 255,
          "faceSlackDeg": 20
        },
        {
          "id": "linger_mro5vmxl_13",
          "x": 84,
          "y": -126,
          "bays": [
            1
          ],
          "faceDeg": 289,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro60ywq_16",
          "x": -83,
          "y": -46,
          "bays": [
            1
          ],
          "faceDeg": 184,
          "faceSlackDeg": 25
        }
      ],
      "category": "anchor"
    },
    {
      "id": "bayComputer2",
      "kind": "computer",
      "x": 194,
      "y": 119,
      "bay": 2,
      "facing": 0,
      "linger": [
        {
          "id": "bayComputer2_n0",
          "x": 112,
          "y": -66,
          "bays": [
            2
          ],
          "faceDeg": 225,
          "faceSlackDeg": 20
        },
        {
          "id": "bayComputer2_n1",
          "x": 106,
          "y": -130,
          "bays": [
            2
          ],
          "faceDeg": 240,
          "faceSlackDeg": 20
        },
        {
          "id": "bayComputer2_n2",
          "x": 107,
          "y": 1,
          "bays": [
            2
          ],
          "faceDeg": 195,
          "faceSlackDeg": 20
        },
        {
          "id": "bayComputer2_s0",
          "x": 158,
          "y": 113,
          "bays": [
            2
          ],
          "faceDeg": 270,
          "faceSlackDeg": 20
        },
        {
          "id": "linger_mro5ou4i_11",
          "x": -82,
          "y": -94,
          "bays": [
            1
          ],
          "faceDeg": 199,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro5wzfp_14",
          "x": -86,
          "y": -129,
          "bays": [
            1
          ],
          "faceDeg": 244,
          "faceSlackDeg": 25
        }
      ],
      "category": "anchor"
    },
    {
      "id": "partsRack_mro56kkr_1",
      "kind": "partsRack",
      "variant": 0,
      "x": -310,
      "y": -99,
      "bay": 0,
      "facing": 0,
      "linger": [],
      "category": "shelf"
    },
    {
      "id": "partsRack_mro56rs6_3",
      "kind": "partsRack",
      "variant": 0,
      "x": -320,
      "y": -72,
      "bay": 0,
      "facing": 6,
      "linger": [
        {
          "id": "linger_mro56rs6_4",
          "x": -306,
          "y": -25,
          "bays": [
            0
          ],
          "faceDeg": 180,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro66h1u_18",
          "x": -293,
          "y": -81,
          "bays": [
            0
          ],
          "faceDeg": 259,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro672zj_19",
          "x": -301,
          "y": -71,
          "bays": [
            0
          ],
          "faceDeg": 184,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro67i8f_20",
          "x": -278,
          "y": 11,
          "bays": [
            0
          ],
          "faceDeg": -131,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro67phx_21",
          "x": -305,
          "y": 30,
          "bays": [
            0
          ],
          "faceDeg": 199,
          "faceSlackDeg": 25
        },
        {
          "id": "linger_mro68onz_22",
          "x": -303,
          "y": 59,
          "bays": [
            0
          ],
          "faceDeg": 139,
          "faceSlackDeg": 25
        }
      ],
      "category": "shelf"
    },
    {
      "id": "weldScreen_mro5d0uy_5",
      "kind": "weldScreen",
      "variant": 0,
      "x": 98,
      "y": -75,
      "bay": 0,
      "facing": 0,
      "linger": [],
      "category": "tool"
    },
    {
      "id": "forkChargeW",
      "kind": "forkCharger",
      "variant": 0,
      "x": -264,
      "y": 188,
      "facing": 6,
      "category": "yard"
    },
    {
      "id": "forkTireE",
      "kind": "forkTireRack",
      "variant": 0,
      "x": 271,
      "y": 189,
      "facing": 0,
      "category": "yard"
    },
    {
      "id": "forkConesW",
      "kind": "forkCones",
      "variant": 0,
      "x": -195,
      "y": 183,
      "facing": 0,
      "category": "yard"
    },
    {
      "id": "forkCrateE",
      "kind": "forkCrate",
      "variant": 0,
      "x": 203,
      "y": 189,
      "facing": 0,
      "category": "yard"
    }
  ],
  "gossip": [
    {
      "id": "gossipW1",
      "x": -98,
      "y": 57,
      "capacity": 3
    },
    {
      "id": "gossipW2",
      "x": -100,
      "y": 103,
      "capacity": 3
    },
    {
      "id": "gossipE1",
      "x": 93,
      "y": -110,
      "capacity": 3
    },
    {
      "id": "gossipE2",
      "x": 96,
      "y": 99,
      "capacity": 3
    },
    {
      "id": "gossipWN",
      "x": -98,
      "y": -81,
      "capacity": 2
    },
    {
      "id": "gossipEN",
      "x": -98,
      "y": -125,
      "capacity": 2
    },
    {
      "id": "gossip_mro5gbcl_7",
      "x": 97,
      "y": 48,
      "capacity": 2
    },
    {
      "id": "gossip_mro5gxgy_8",
      "x": -94,
      "y": -17,
      "capacity": 3
    },
    {
      "id": "gossip_mro5htqc_9",
      "x": 99,
      "y": -41,
      "capacity": 3
    }
  ]
};

/**
 * Prop catalog themes — one prop class; `category` filters future item browsers.
 * desk / shelf / storage / tool / yard / decor / anchor
 * decor = wall art / posters (engine-drawn, higher-fidelity faces)
 */
export const HANGAR_PROP_CATEGORY_KINDS = {
  desk: ['workbench', 'bayTerminal', 'shiftBoard'],
  shelf: ['partsRack', 'bottleRack', 'suitLocker'],
  storage: ['drumStack', 'pallet', 'breakCrate', 'cableSpool', 'diagCart'],
  tool: ['weldScreen'],
  yard: ['forkCharger', 'forkTireRack', 'forkCones', 'forkCrate'],
  decor: ['wallPoster'],
  anchor: ['computer'],
};

/** Flat kind list for the editor palette (excludes linger-only anchors). */
export const HANGAR_PROP_KINDS = Object.entries(HANGAR_PROP_CATEGORY_KINDS)
  .filter(([cat]) => cat !== 'anchor')
  .flatMap(([, kinds]) => kinds);

/** @deprecated use HANGAR_PROP_CATEGORY_KINDS.yard */
export const HANGAR_YARD_KINDS = HANGAR_PROP_CATEGORY_KINDS.yard;

/** @param {string} kind */
export function categoryForPropKind(kind) {
  for (const [cat, kinds] of Object.entries(HANGAR_PROP_CATEGORY_KINDS)) {
    if (kinds.includes(kind)) return cat;
  }
  return 'storage';
}

/**
 * Merge legacy yardProps into props and ensure every prop has a category.
 * @param {typeof HANGAR_LAYOUT} layout
 */
export function normalizeHangarLayout(layout) {
  if (!layout) return layout;
  if (!Array.isArray(layout.props)) layout.props = [];
  if (Array.isArray(layout.yardProps) && layout.yardProps.length) {
    for (const p of layout.yardProps) {
      if (!p.category) p.category = categoryForPropKind(p.kind);
      layout.props.push(p);
    }
  }
  delete layout.yardProps;
  for (const p of layout.props) {
    if (!p.category) p.category = categoryForPropKind(p.kind);
  }
  if (!Number.isFinite(layout.sidePadX)) {
    layout.sidePadX = HANGAR_SIDE_PAD_DEFAULT;
  }
  return layout;
}

export function cloneHangarLayout(layout = HANGAR_LAYOUT) {
  return normalizeHangarLayout(JSON.parse(JSON.stringify(layout)));
}

export function setHangarLayout(next) {
  HANGAR_LAYOUT = normalizeHangarLayout(next);
}

export function getHangarProps() {
  return HANGAR_LAYOUT.props;
}

/** @param {string} category */
export function getHangarPropsByCategory(category) {
  return HANGAR_LAYOUT.props.filter((p) => (p.category || categoryForPropKind(p.kind)) === category);
}

/** @deprecated use getHangarPropsByCategory('yard') */
export function getYardProps() {
  return getHangarPropsByCategory('yard');
}

export function getGossipWaypoints() {
  return HANGAR_LAYOUT.gossip;
}

export function getHangarSidePadX(layout = HANGAR_LAYOUT) {
  const v = layout?.sidePadX;
  return Number.isFinite(v) ? v : HANGAR_SIDE_PAD_DEFAULT;
}

export function clampHangarSidePadX(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return HANGAR_SIDE_PAD_DEFAULT;
  return Math.max(HANGAR_SIDE_PAD_MIN, Math.min(HANGAR_SIDE_PAD_MAX, n));
}

export function isBayUnitProp(prop, bay, sidePadX) {
  if (!prop || prop.bay !== bay) return false;
  if (bay !== 0 && bay !== 2) return false;
  const cx = bay === 0 ? -sidePadX : sidePadX;
  return Math.abs(prop.x - cx) <= HANGAR_BAY_UNIT_HALF;
}

export function shiftBayUnitFlavor(layout, oldSide, newSide) {
  const d = Math.round(newSide) - Math.round(oldSide);
  if (!d || !layout?.props) return;
  for (const prop of layout.props) {
    let shift = 0;
    if (isBayUnitProp(prop, 0, oldSide)) shift = -d;
    else if (isBayUnitProp(prop, 2, oldSide)) shift = d;
    if (!shift) continue;
    prop.x = Math.round(prop.x + shift);
    for (const L of prop.linger || []) {
      L.x = Math.round(L.x + shift);
    }
  }
}

export function setHangarSidePadX(next, opts = {}) {
  const shiftFlavor = opts.shiftFlavor !== false;
  const old = getHangarSidePadX();
  const clamped = clampHangarSidePadX(next);
  const delta = clamped - old;
  if (delta && shiftFlavor) shiftBayUnitFlavor(HANGAR_LAYOUT, old, clamped);
  HANGAR_LAYOUT.sidePadX = clamped;
  return { old, next: clamped, delta };
}

export function resolveLingerBays(stand, prop) {
  if (stand?.bays && Array.isArray(stand.bays) && stand.bays.length) {
    return stand.bays.filter((b) => b === 0 || b === 1 || b === 2);
  }
  if (typeof stand?.bay === "number" && stand.bay >= 0 && stand.bay <= 2) {
    return [stand.bay];
  }
  if (typeof prop?.bay === "number" && prop.bay >= 0 && prop.bay <= 2) {
    return [prop.bay];
  }
  return [0, 1, 2];
}

export function lingerAllowsBay(bays, homeBay) {
  return bays.includes(homeBay);
}

normalizeHangarLayout(HANGAR_LAYOUT);
