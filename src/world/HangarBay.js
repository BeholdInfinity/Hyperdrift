/**
 * Home Base hangar: docked bay, logistics, and reacting NPCs.
 * Seed for new-game start + between-mission hub.
 * Controlled ship seats on a chosen bay (space land = green lane; menu = assigned pad).
 * +Y = south, −Y = north (bay doors to space).
 *
 * Cargo hardpoints: 3×6 — two columns per bay (left=inbound, right=outbound).
 * Rows: N=ship mounts/upgrades, M=hold cargo, S=forklift ↔ storage I/O.
 * Crane ferries S↔N/M in-lane; mechanics ferry N/M ↔ ships; forklifts use S.
 */

import { HANGAR, SHIP } from '../core/Constants.js';
import { clamp, normalizeAngle } from '../utils/MathUtils.js';
import { SHIP_EXTENT, HARDPOINTS } from '../entities/ShipHardpoints.js';
import {
  drawVisitorShip,
  pickVisitorId,
  makeVisitorThrusters,
  getVisitorPropulsion,
  VISITOR_CATALOG,
  equipPadVisitor,
  clearPadVisitor,
  createVisitorShipDef,
} from './HangarVisitorShips.js';
import {
  upgradeKindFromItemId,
  pickCatalogItemId,
  pickAmbientCatalogUpgradeId,
  pickUpgradeInstallRequest,
  unequipHardpoint,
  equipHardpoint,
  emptySocketsForCategory,
  pickStripKey,
  needsStripBeforeInstall,
  needsStripBeforeInstallKey,
  categoryFromFreightLabel,
  shipDefSwapGroup,
} from '../ships/HangarLoadout.js';
import {
  createPlayerStarter,
} from '../ships/ShipGenerator.js';
import {
  hangarShipView,
  headingIndexFromAngle,
  angledLiftLocal,
  angledDepthScale,
} from '../ships/ShipViews.js';
import { padMkForSwapGroup } from '../ships/ShipClasses.js';
import { getItem } from '../ships/ItemCatalog.js';
import { Settings } from '../core/Settings.js';
import {
  getHangarProps,
  getGossipWaypoints,
  getHangarSidePadX,
  resolveLingerBays,
  lingerAllowsBay,
} from './hangar-layout.js';
import {
  placeRegistry,
  resolveHangarSkin,
  hasModule,
  isTurretMountCategory,
  canPerformTurretCraneStage,
  canPlayerStartTurretSwap,
  applyHullHeal,
  ensureVesselSimState,
} from './place/index.js';

const FACE_SOUTH = Math.PI / 2;
const FACE_NORTH = SHIP.SPAWN_ANGLE;
const BAY = {
  HALF_W: 340,
  HALF_H: 200,
  PAD_R: HANGAR.PAD_R,
  DOOR_HALF: 52,
  DOOR_H: 42,
  VIEWPORT_W: 96,
  VIEWPORT_H: 22,
  /** South apron — forklift corridor */
  PATH_Y: 148,
  BULK_DOOR_HALF: 32,
  BULK_THICK: 16,
  RUNWAY_INSET: 26,
};

const ROW = { N: 0, M: 1, S: 2 };
/** Half-gap from pad center to that bay's inbound / outbound column */
const COL_OFFSET = 58;

/** Inbound/outbound column X for each bay (recomputed when sidePadX changes). */
function colXs() {
  const xs = [];
  for (const px of padCenters()) {
    xs.push(px - COL_OFFSET); // inbound (load)
    xs.push(px + COL_OFFSET); // outbound (unload)
  }
  return xs;
}
/** North (upgrades), mid (hold cargo), south (forklift storage) */
const ROW_Y = [-78, 8, 118];
/**
 * South edge of each bay's engine danger zone (former stair Y).
 * Floor running-lights end here; stairs moved further south past the backsplash.
 */
const DANGER_ZONE_SOUTH = (ROW_Y[1] + ROW_Y[2]) / 2;
/**
 * Service display boards behind each pad.
 * Northern lip is fixed (must not grow into the pad); extra height lowers the bottom.
 */
const SERVICE_BOARD_TOP = DANGER_ZONE_SOUTH + 14 - 28; // was BACKSPLASH_Y - old H
const BACKSPLASH_HALF_W = 62;
const SERVICE_BOARD_H = 48;
const SERVICE_BOARD_BOTTOM = SERVICE_BOARD_TOP + SERVICE_BOARD_H;

/**
 * Widest allowed hangar zoom-out for the current bay spacing.
 * Grows (lower zoom number) when sidePadX pushes B1/B3 farther apart.
 * @param {number} viewportRadius
 */
export function hangarZoomMin(viewportRadius) {
  const floor = HANGAR.ZOOM_MIN;
  if (!viewportRadius || viewportRadius < 40) return floor;
  const halfW = HANGAR.SIDE_PAD_X + HANGAR.PAD_R * 2.5 + 28;
  const halfH = HANGAR.BAY_HALF_H + 40;
  const fit = viewportRadius / Math.max(halfW, halfH);
  return clamp(Math.min(floor, fit * 0.95), 0.95, floor);
}

/** @param {number} [_viewportRadius] */
export function hangarZoomMax(_viewportRadius) {
  return HANGAR.ZOOM_MAX;
}

/**
 * Hangar zoom that frames the service board bottom at the viewport rim (cam at pad).
 * @param {number} viewportRadius
 * @param {number} [marginPx]
 */
export function hangarDefaultZoom(viewportRadius, marginPx = 12) {
  if (!viewportRadius || viewportRadius < 40) return HANGAR.ZOOM_DEFAULT;
  const zMin = hangarZoomMin(viewportRadius);
  return clamp(
    (viewportRadius - marginPx) / SERVICE_BOARD_BOTTOM,
    zMin,
    hangarZoomMax(viewportRadius)
  );
}

/**
 * Title elevator arrival close-up — pad-centered, less extreme than old ZOOM_MAX 14.
 * @param {number} viewportRadius
 */
export function hangarElevatorZoom(viewportRadius) {
  const zMin = hangarZoomMin(viewportRadius);
  const zMax = hangarZoomMax(viewportRadius);
  if (!viewportRadius || viewportRadius < 40) {
    return clamp(HANGAR.ZOOM_ELEVATOR, zMin, zMax);
  }
  // Frame ~pad disc with margin (not hull-fill).
  const framed = viewportRadius / (HANGAR.PAD_R * 2.15);
  return clamp(Math.min(HANGAR.ZOOM_ELEVATOR, framed), zMin, zMax);
}

/** Pathing slab midline / half-band covering the full board footprint */
const BACKSPLASH_Y = (SERVICE_BOARD_TOP + SERVICE_BOARD_BOTTOM) / 2;
const BACKSPLASH_BAND = (SERVICE_BOARD_BOTTOM - SERVICE_BOARD_TOP) / 2 + 2;
/** Clearance past board end when bypassing (agent body ~4–5px) */
const BACKSPLASH_BYPASS = 10;
/** Soft body radius for board hit tests */
const MECH_BODY_R = 4;
/** Match danger lights; small pad for body radius */
const DANGER_ZONE_PAD = 4;
/** Crane reclaims unclaimed floor drops after this many seconds */
const FLOOR_DROP_CRANE_AGE = 5;
/**
 * Soft travel scale for crane job picks (~1 bay). Equal-weight scores halve
 * around this distance; tracks live sidePadX.
 */
function craneJobDistScale() {
  return Math.max(120, HANGAR.SIDE_PAD_X * 0.97);
}
/** Safe-side apron south of service boards */
const APRON_SAFE_Y = SERVICE_BOARD_BOTTOM + 14;
/** Bay computer / service board stand points (south face of each display) */
const BAY_COMPUTERS = [0, 1, 2].map((bay) => ({
  id: `bayComputer${bay}`,
  x: 0,
  y: APRON_SAFE_Y + 8,
  bay,
  kind: 'computer',
}));
/** Visual heading snap — 8 ground-plane directions (E, SE, S, SW, W, NW, N, NE) */
const CREW_VIS_OCT = Math.PI / 4;
/** Weld spots per Hull checklist pip (progress splits across these animations). */
const WELD_SPOTS_MIN = 2;
const WELD_SPOTS_MAX = 3;
function weldSpotsForPip() {
  return WELD_SPOTS_MIN + ((Math.random() * (WELD_SPOTS_MAX - WELD_SPOTS_MIN + 1)) | 0);
}

/** Turn rate for draw heading (rad/s); locks snap faster during pile / weld work */
const CREW_VIS_TURN = 7;
const CREW_VIS_TURN_LOCK = 14;
/**
 * Per-bay mechanic suit themes (both mechs on a bay share one).
 * B1 rust/hazard · B2 station teal · B3 olive utility.
 */
const MECH_BAY_THEMES = [
  {
    suit: '#8a4a28',
    suitDark: '#5a3018',
    suitWear: '#6a3820',
    stripe: '#d09030',
    helmet: '#c8b090',
    visor: 'rgba(70, 150, 190, 0.42)',
    pack: '#3a2e2a',
    boot: '#2a2018',
    glove: '#4a3830',
    tool: '#b0b8c0',
  },
  {
    suit: '#3a6a78',
    suitDark: '#1e4048',
    suitWear: '#2a5058',
    stripe: '#50b0c0',
    helmet: '#b8c8d0',
    visor: 'rgba(100, 200, 220, 0.45)',
    pack: '#2a3840',
    boot: '#1a282e',
    glove: '#304850',
    tool: '#c0c8d0',
  },
  {
    suit: '#4a6a38',
    suitDark: '#2a4020',
    suitWear: '#3a5028',
    stripe: '#90b048',
    helmet: '#c0c8b0',
    visor: 'rgba(120, 180, 100, 0.4)',
    pack: '#303828',
    boot: '#1e2818',
    glove: '#384030',
    tool: '#b8c0b0',
  },
];
/** Full truck body + forks length (local −10…+16) — used for hub merge + overshoot */
const FORK_TRUCK_LEN = 26;
/** Forklift hub — south wall center; apron is half the bottom-wall width. */
const FORKLIFT_HUB_W = BAY.HALF_W; // half of 2*HALF_W bottom wall
const FORKLIFT_HUB_HALF_W = FORKLIFT_HUB_W / 2;
/** Spot pitch sized for full truck body + fork tines (~26 long) + clearance */
const FORKLIFT_PARK_MIN_PITCH = 32;
const FORKLIFT_PARK_COUNT = Math.max(
  4,
  Math.floor(FORKLIFT_HUB_W / FORKLIFT_PARK_MIN_PITCH)
);
const FORKLIFT_PARK_PITCH = FORKLIFT_HUB_W / FORKLIFT_PARK_COUNT;
const FORKLIFT_PARK_SPOT_W = FORKLIFT_PARK_PITCH - 4;
const FORKLIFT_PARK_SPOT_H = 22;
/** Stall centers sit south of the roadway (clear of the PATH_Y band) */
const FORKLIFT_HUB_Y = BAY.PATH_Y + 36;
const FORKLIFT_PARKS = Array.from({ length: FORKLIFT_PARK_COUNT }, (_, i) => {
  const span = (FORKLIFT_PARK_COUNT - 1) * FORKLIFT_PARK_PITCH;
  const x = -span / 2 + i * FORKLIFT_PARK_PITCH;
  return { id: `forkPark${i + 1}`, x, y: FORKLIFT_HUB_Y, index: i };
});
/** Working forklift drivers on stage */
const FORKLIFT_ACTIVE = 4;
/** Crane home — top-left of gantry travel (y clamped to bridge min in use) */
const CRANE_HOME = { x: -BAY.HALF_W + 48, y: -BAY.HALF_H + 63 };
/** Compat alias — flee/rally still uses apron points near each bay */
const STAIRS = BAY_COMPUTERS.map((c) => ({
  x: c.x,
  y: c.y + 10,
  bay: c.bay,
  col: c.bay * 2,
}));
const STAIR_Y = APRON_SAFE_Y;
// Honor baked hangar-layout sidePadX as soon as the module loads (not only on reset).
HANGAR.SIDE_PAD_X = getHangarSidePadX();
syncBayAnchors();

/**
 * Set-dressing + gossip live in hangar-layout.js (Dev Mode bake target).
 * Mech linger stays north of the forklift corridor (y < MECH_LINGER_Y_MAX).
 */
const MECH_LINGER_Y_MAX = BAY.PATH_Y - 28;
const GOSSIP_RING_RADIUS = 12;

/**
 * Half-width of per-bay danger-zone light lanes (door → DANGER_ZONE_SOUTH).
 * Shrinks when sidePadX is tight so neighboring bays don't overlap.
 */
function bayLaneHalf() {
  const halfGap = HANGAR.SIDE_PAD_X / 2;
  return Math.min(72, Math.max(52, halfGap - 6));
}
const BRIDGE_Y_MIN = -BAY.HALF_H + 55;
const BRIDGE_Y_MAX = BAY.HALF_H - 36;
const RUNWAY_X = [-BAY.HALF_W + BAY.RUNWAY_INSET, BAY.HALF_W - BAY.RUNWAY_INSET];
const HOIST_RAISED = 0;
const HOIST_MAX = 42;
/** Trolley parks this far north of the pile; hoist drops south to the cargo */
const TROLLEY_NORTH = 52;
/** Claw: 1 = open empty, ~0.35 = gripped around cargo */
const CLAW_OPEN = 1;
const CLAW_GRIP = 0.35;
/** Palm depth + fingertip reach — tip math is locked for cargo lift/lower alignment */
const CLAW_PALM = 5;
const CLAW_FINGER = 11;
/** Crane operator suit (worn industrial — fixed, not random) */
const CRANE_CREW = {
  suit: '#8a5530',
  suitDark: '#5a3018',
  helmet: '#c8b898',
  /** Dark rubber / polycarb faceplate — distinct from helmet so look dir reads */
  mask: '#1e2a36',
  maskRim: '#6a7888',
  visor: 'rgba(70, 170, 210, 0.55)',
  stripe: '#d09030',
};
/** Forklift fork height: 0 = raised travel, 1 = lowered to deck */
const FORK_RAISED = 0;
const FORK_LOWERED = 1;
const FORK_ANIM_SPEED = 3.4;
/** Lateral standoff west/east of each 2×2 slot (four approach lanes per pile) */
const FORK_LANE_OFFSET = 16;
/** South stop before creeping forward into the slot */
const FORK_APPROACH_SOUTH = 22;
/** How far north (lower Y) the truck creeps to engage the slot */
const FORK_CREEP_NORTH = 10;
/** Fork tine tip X in truck-local space (matches `_drawForklift` tines at x=16) */
const FORK_TINE_TIP_X = 16;
/** ~1.5 truck lengths past the lane before turning into a wrong-side approach */
const FORK_OVERSHOOT = Math.round(FORK_TRUCK_LEN * 1.5);
/** Fork tine deck Y when raised (lowered adds `forkH * FORK_DROP_VIS`) */
const FORK_TINE_Y_BASE = -8;
const FORK_DROP_VIS = 7;
/** Mechanic standoff west/east of each 2×2 slot (four approach lanes per pile) */
const MECH_LANE_OFFSET = 14;
/** South standoff before stepping into the slot */
const MECH_APPROACH_ALONG = 12;
/** How far south of slot center the mech stands to hand off */
const MECH_CREEP_IN = 6;
/** Hand / cargo reach in mech-local space (matches `_drawMechanic`) */
const MECH_HAND_REACH_X = 5;
const MECH_HAND_GRIP_Y = -2;
const MECH_HANDOFF_SPEED = 4.2;

const CARGO_MIN = 8;
const CARGO_MAX = 28;
const PILE_CAP = 4;
/** Per-bay soft cap across south+mid+north inbound piles — don't keep stuffing empty bays */
const INBOUND_SOFT_CAP = 3;

/** Hold / service freight — worn industrial 2.5D (drawn via `_drawCargoItem`). */
const CRATE_VARIANTS = [
  { label: 'CRATE', family: 'cargo', shape: 'crate', variant: 0, w: 10, h: 8, color: '#6a5538', accent: '#c9a020', hp: 30 },
  { label: 'CRATE', family: 'cargo', shape: 'crate', variant: 1, w: 10, h: 8, color: '#3a5548', accent: '#40a878', hp: 30 },
  { label: 'CRATE', family: 'cargo', shape: 'crate', variant: 2, w: 10, h: 8, color: '#3a4a5a', accent: '#58a0c8', hp: 30 },
  { label: 'CRATE', family: 'cargo', shape: 'crate', variant: 3, w: 10, h: 8, color: '#5a3a3a', accent: '#c87050', hp: 30 },
  { label: 'CRATE', family: 'cargo', shape: 'crate', variant: 4, w: 10, h: 8, color: '#4a4a38', accent: '#a8a060', hp: 30 },
  { label: 'CRATE', family: 'cargo', shape: 'crate', variant: 5, w: 10, h: 8, color: '#4a3a52', accent: '#a878c8', hp: 30 },
];

/** Service consumables — distinct silhouettes matching checklist rows. */
const SERVICE_CARGO = [
  { label: 'FUEL', family: 'cargo', shape: 'fuel', w: 8, h: 8, color: '#2a6858', accent: '#40e0a0', hp: 28 },
  { label: 'BULLETS', family: 'cargo', shape: 'bullets', w: 9, h: 6, color: '#4a3428', accent: '#c9a020', hp: 22 },
  { label: 'SHELLS', family: 'cargo', shape: 'shells', w: 9, h: 7, color: '#4a5230', accent: '#d0a048', hp: 24 },
];

const HOLD_CARGO = [...SERVICE_CARGO, ...CRATE_VARIANTS];

/** Ship-mounted upgrades — distinct sci-fi ship parts (top-row pipeline). */
const UPGRADE_KINDS = [
  { label: 'LASER', family: 'upgrade', shape: 'laser', w: 14, h: 7, color: '#50a0c8', hp: 40 },
  { label: 'TURRET', family: 'upgrade', shape: 'turret', w: 11, h: 10, color: '#708898', hp: 45 },
  { label: 'ARMOR', family: 'upgrade', shape: 'armor', w: 12, h: 9, color: '#6a7888', hp: 50 },
  { label: 'THRUSTER', family: 'upgrade', shape: 'thruster', w: 8, h: 12, color: '#5a8aaa', hp: 38 },
  { label: 'ENGINE', family: 'upgrade', shape: 'engine', w: 11, h: 12, color: '#c87840', hp: 55 },
  { label: 'SENSOR', family: 'upgrade', shape: 'sensor', w: 10, h: 9, color: '#60b090', hp: 32 },
];

/** @deprecated alias — hold cargo only; upgrades use UPGRADE_KINDS */
const CARGO_KINDS = HOLD_CARGO;

/** 2×2 slot offsets inside a hardpoint (fill L→R, bottom→top). */
const PILE_SLOTS = [
  { ox: -5.5, oy: 4 },
  { ox: 5.5, oy: 4 },
  { ox: -5.5, oy: -5 },
  { ox: 5.5, oy: -5 },
];

let _cargoSeq = 1;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function padCenters() {
  const s = HANGAR.SIDE_PAD_X;
  return [-s, 0, s];
}

function bayLabels() {
  return ['B1', 'B2', 'B3'];
}

/** Keep board / stair anchors aligned with current pad centers. */
function syncBayAnchors() {
  const pads = padCenters();
  for (let bay = 0; bay < 3; bay++) {
    BAY_COMPUTERS[bay].x = pads[bay];
    STAIRS[bay].x = pads[bay];
  }
}

/**
 * Apply editable bay spacing to runtime constants + live hangar sim.
 * Flavor props are shifted separately via hangar-layout `setHangarSidePadX`.
 * @param {number} sidePadX
 * @param {HangarBay|null} [hangarBay]
 * @param {number} [delta] change from previous spacing (for shifting free agents)
 */
export function applyHangarSidePadX(sidePadX, hangarBay = null, delta = 0) {
  const next = Math.round(sidePadX);
  if (!Number.isFinite(next)) return;
  /** Classify with OLD pad centers before mutating SIDE_PAD_X. */
  const floorMoves = [];
  const agentMoves = [];
  let craneBay = null;
  if (hangarBay && delta) {
    if (hangarBay.floorDrops?.length) {
      for (const drop of hangarBay.floorDrops) {
        const bay = bayIndexFromX(drop.x);
        if (bay === 0 || bay === 2) floorMoves.push({ drop, bay });
      }
    }
    for (const npc of hangarBay.npcs || []) {
      const bay =
        typeof npc.homeBay === 'number'
          ? npc.homeBay
          : typeof npc.bay === 'number'
            ? npc.bay
            : bayIndexFromX(npc.x);
      if (bay === 0 || bay === 2) agentMoves.push({ npc, bay });
    }
    if (hangarBay.crane && Number.isFinite(hangarBay.crane.trolleyX)) {
      craneBay = bayIndexFromX(hangarBay.crane.trolleyX);
      if (craneBay !== 0 && craneBay !== 2) craneBay = null;
    }
  }
  HANGAR.SIDE_PAD_X = next;
  syncBayAnchors();
  hangarBay?._syncSidePadPositions?.(delta, floorMoves, agentMoves, craneBay);
}

/** World X for bay index 0/1/2 (B1/B2/B3). */
export function hangarPadX(bayIndex) {
  return padCenters()[bayIndex] ?? 0;
}

/** Sync runtime SIDE_PAD_X from baked hangar-layout (no flavor shift). */
export function syncHangarSidePadFromLayout(hangarBay = null) {
  applyHangarSidePadX(getHangarSidePadX(), hangarBay, 0);
}

/** Cargo hold Mk ladder — capacity = cols×rows. Player ships cap at Mk.5 (3×3). */
const CARGO_BAY_SPECS = [
  { mk: 0, cols: 0, rows: 0, slots: 0 },
  { mk: 1, cols: 1, rows: 1, slots: 1 },
  { mk: 2, cols: 2, rows: 1, slots: 2 },
  { mk: 3, cols: 2, rows: 2, slots: 4 },
  { mk: 4, cols: 3, rows: 2, slots: 6 },
  { mk: 5, cols: 3, rows: 3, slots: 9 },
  { mk: 6, cols: 4, rows: 3, slots: 12 },
  { mk: 7, cols: 4, rows: 4, slots: 16 },
  { mk: 8, cols: 5, rows: 4, slots: 20 },
  { mk: 9, cols: 5, rows: 5, slots: 25 },
];

/** Visitor / player → cargoMk (large freighter/tanker only above player ceiling). */
const VISITOR_CARGO_MK = {
  scout: 0,
  interceptor: 2,
  patrol: 3,
  gunship: 4,
  hauler: 5,
  freighter: 7,
  tanker: 9,
  player: 5,
};

/** Board hold cell skin — same palette as 2.5D `CRATE_VARIANTS`. */
function pickHoldCrateSkin() {
  const k = pick(CRATE_VARIANTS);
  return { color: k.color, accent: k.accent, variant: k.variant };
}

function holdBlockSkinFromCargo(cargo) {
  if (!cargo?.color) return pickHoldCrateSkin();
  return {
    color: cargo.color,
    accent: cargo.accent || '#c9a020',
    variant: cargo.variant ?? 0,
  };
}

/** Map a board cell back to a crate kind so unload freight matches the square. */
function crateKindFromHoldBlock(block) {
  if (!block) return pick(CRATE_VARIANTS);
  const byVar = CRATE_VARIANTS.find((k) => k.variant === block.variant);
  if (byVar) return byVar;
  const byColor = CRATE_VARIANTS.find((k) => k.color === block.color);
  if (byColor) return byColor;
  return {
    ...CRATE_VARIANTS[0],
    color: block.color || CRATE_VARIANTS[0].color,
    accent: block.accent || CRATE_VARIANTS[0].accent,
    variant: block.variant ?? 0,
  };
}

function randInt(lo, hi) {
  return lo + ((Math.random() * (hi - lo + 1)) | 0);
}

function cargoBaySpec(mk) {
  const m = Math.max(0, Math.min(9, mk | 0));
  return CARGO_BAY_SPECS[m];
}

function cargoMkForVisitor(visitorId, shipDef = null) {
  if (shipDef?.classDef?.cargoMkDefault != null) {
    return Math.max(0, Math.min(9, shipDef.classDef.cargoMkDefault | 0));
  }
  if (visitorId && VISITOR_CARGO_MK[visitorId] != null) return VISITOR_CARGO_MK[visitorId];
  if (visitorId && VISITOR_CATALOG[visitorId]?.cargoMk != null) {
    return VISITOR_CATALOG[visitorId].cargoMk;
  }
  return 5;
}

/**
 * Pack crate-skinned blocks into a cargo grid from free-space fraction (cargoSpace).
 * Higher cargoSpace = emptier hold. Colors match 2.5D hangar crates.
 */
function packCargoHold(mk, cargoSpace) {
  const spec = cargoBaySpec(mk);
  if (!spec.slots) {
    return { mk: 0, slots: 0, cols: 0, rows: 0, cells: [] };
  }
  const occupied = Math.max(0, Math.min(1, 1 - cargoSpace));
  let fill = Math.round(spec.slots * occupied);
  fill = Math.max(0, Math.min(spec.slots, fill));
  const grid = Array.from({ length: spec.rows }, () => Array(spec.cols).fill(false));
  const cells = [];
  const tryPlace = (c, r, w, h, skin) => {
    if (c + w > spec.cols || r + h > spec.rows) return false;
    for (let yy = r; yy < r + h; yy++) {
      for (let xx = c; xx < c + w; xx++) {
        if (grid[yy][xx]) return false;
      }
    }
    for (let yy = r; yy < r + h; yy++) {
      for (let xx = c; xx < c + w; xx++) grid[yy][xx] = true;
    }
    cells.push({ c, r, w, h, ...skin });
    return true;
  };
  let left = fill;
  // 1×1 slots only (one load/unload = one cargo slot)
  for (let r = 0; r < spec.rows && left > 0; r++) {
    for (let c = 0; c < spec.cols && left > 0; c++) {
      if (!grid[r][c] && tryPlace(c, r, 1, 1, pickHoldCrateSkin())) left -= 1;
    }
  }
  return {
    mk: spec.mk,
    slots: spec.slots,
    cols: spec.cols,
    rows: spec.rows,
    cells,
  };
}

function statColorForPct(pct01) {
  if (pct01 >= 0.7) return 'green';
  if (pct01 >= 0.4) return 'yellow';
  return 'red';
}

function cargoSpaceFromHold(hold) {
  if (!hold?.slots) return 1;
  let used = 0;
  for (const c of hold.cells || []) used += (c.w || 1) * (c.h || 1);
  return Math.max(0, Math.min(1, 1 - used / hold.slots));
}

function syncCargoSpace(st) {
  if (!st?.cargoHold) return;
  st.cargoSpace = cargoSpaceFromHold(st.cargoHold);
}

/**
 * Place one free 1×1 crate block into the hold.
 * @param {object} hold
 * @param {{ color?: string, accent?: string, variant?: number }|null} [skinOrCargo]
 * @returns {boolean}
 */
function addCargoHoldBlock(hold, skinOrCargo = null) {
  if (!hold?.slots || !hold.cols || !hold.rows) return false;
  if (!hold.cells) hold.cells = [];
  const grid = Array.from({ length: hold.rows }, () => Array(hold.cols).fill(false));
  for (const b of hold.cells) {
    for (let yy = b.r; yy < b.r + (b.h || 1); yy++) {
      for (let xx = b.c; xx < b.c + (b.w || 1); xx++) {
        if (yy < hold.rows && xx < hold.cols) grid[yy][xx] = true;
      }
    }
  }
  const skin = holdBlockSkinFromCargo(skinOrCargo);
  for (let r = 0; r < hold.rows; r++) {
    for (let c = 0; c < hold.cols; c++) {
      if (!grid[r][c]) {
        hold.cells.push({ c, r, w: 1, h: 1, ...skin });
        return true;
      }
    }
  }
  return false;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** 0→1→0 triangle wave for scanner ping-pong. */
function pingPong01(t) {
  const x = t - Math.floor(t / 2) * 2;
  return x < 1 ? x : 2 - x;
}

/**
 * Per-pick delays for captain pip reveal.
 * Same type as previous → quick double-tap; type change → longer menu browse.
 */
function pipRevealDelays(revealOrder, typeById) {
  const delays = [];
  let prevType = null;
  for (let i = 0; i < revealOrder.length; i++) {
    const type = typeById.get(revealOrder[i]) || '';
    if (i > 0 && type && type === prevType) {
      delays.push(
        rand(HANGAR.BOARD_REVEAL_PIP_GAP_SAME_MIN, HANGAR.BOARD_REVEAL_PIP_GAP_SAME_MAX)
      );
    } else {
      delays.push(
        rand(HANGAR.BOARD_REVEAL_PIP_GAP_DIFF_MIN, HANGAR.BOARD_REVEAL_PIP_GAP_DIFF_MAX)
      );
    }
    prevType = type;
  }
  return delays;
}

/**
 * Remove one cargo block (prefers small).
 * @returns {object|null} removed cell (for matching unload freight) or null
 */
function removeCargoHoldBlock(hold) {
  if (!hold?.cells?.length) return null;
  // Prefer removing a 1×1
  let idx = hold.cells.findIndex((b) => (b.w || 1) * (b.h || 1) === 1);
  if (idx < 0) idx = hold.cells.length - 1;
  const [removed] = hold.cells.splice(idx, 1);
  return removed || null;
}

function bayIndexFromX(x) {
  const pads = padCenters();
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pads.length; i++) {
    const d = Math.abs(pads[i] - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function colMeta(col) {
  const bay = (col / 2) | 0;
  const lane = col % 2 === 0 ? 'in' : 'out';
  return { bay, lane, bayId: bayLabels()[bay] };
}

/**
 * Weighted padMk for a fresh B1/B3 visitor — mostly `peerPadMk` (matches the
 * player's own pad tier, e.g. Mk2 Standard), occasionally Mk1 (UltraLight +
 * Light) for size variety. If the player is already Mk1, there's nothing
 * smaller to roll, so it's always Mk1.
 * @param {number} peerPadMk
 */
function rollVisitorPadMk(peerPadMk) {
  if (peerPadMk <= 1) return 1;
  return Math.random() < HANGAR.VISITOR_PEER_MK_CHANCE ? peerPadMk : 1;
}

function rowRole(row) {
  if (row === ROW.N) return 'upgrade';
  if (row === ROW.M) return 'cargo';
  return 'storage';
}

function thrusterActivity(ship) {
  if (!ship?.thrusters) return { maneuver: 0, engine: 0 };
  const t = ship.thrusters;
  let maneuver = 0;
  for (const k of [
    'aftPort', 'aftStarboard', 'nosePort', 'noseStarboard',
    'portFore', 'portAft', 'starboardFore', 'starboardAft',
  ]) {
    maneuver = Math.max(maneuver, t[k] || 0);
  }
  const engine = Math.max(t.mainEngine || 0, t.afterburner || 0);
  return { maneuver, engine };
}

function rollSidePad(x, bayId, bayIndex, peerPadMk = 2) {
  /**
   * All visitor pads share one roll: mostly the player's pad tier (peer-sized)
   * with an occasional smaller UltraLight/Light ship for variety. Physical discs
   * are Mk2-sized on every bay.
   */
  const padMk = rollVisitorPadMk(peerPadMk);
  const occupied = Math.random() < HANGAR.VISITOR_OCCUPY_CHANCE;
  const visitorId = occupied ? pickVisitorId(padMk) : null;
  const pad = {
    x,
    bayId,
    bayIndex,
    padMk,
    visitorId: null,
    shipDef: null,
    cooldown: occupied
      ? rand(HANGAR.VISITOR_COOLDOWN_BUSY_MIN, HANGAR.VISITOR_COOLDOWN_BUSY_MAX)
      : rand(HANGAR.VISITOR_COOLDOWN_EMPTY_MIN, HANGAR.VISITOR_COOLDOWN_EMPTY_MAX),
    seq: null,
    shipY: 0,
    shipScale: 1,
    shipHover: 0,
    shipAngle: occupied ? FACE_NORTH : FACE_SOUTH,
    /** Turntable facing — empty pads point south; occupied face north */
    padAngle: occupied ? FACE_NORTH : FACE_SOUTH,
    padDrop: 0,
    thrusters: null,
    shipVx: 0,
    shipVy: 0,
    shipState: null,
    service: null,
    /** Request an ambient runway approach (pilot in space view) */
    wantSpaceArrival: false,
  };
  if (visitorId) equipPadVisitor(pad, visitorId);
  return pad;
}

/** Curved request probability — mild deficits rarely ask; emptier curves up hard. */
function needRequestChance(need) {
  const n = Math.max(0, Math.min(1, need));
  return n ** 2.2;
}

/** Board meter bands — red always requests; green never does. */
const STAT_RED = 0.4;
const STAT_GREEN = 0.7;

/** Map need 0–1 → 1–3 work units (caller handles 0 / no-request). */
function unitsFromNeed(need) {
  const n = Math.max(0, Math.min(1, need));
  if (n <= 0) return 0;
  return Math.max(1, Math.min(3, 1 + Math.floor(n * 2)));
}

/**
 * How many service units for a 0–1 meter (fuel/hull/ammo).
 * Red (&lt;0.4): always ≥1. Yellow: curved roll. Green (≥0.7): none.
 * @param {number} meter01
 * @param {number} [bias=1] multiplies deficit before banding
 */
function meterServiceUnits(meter01, bias = 1) {
  const m = Math.max(0, Math.min(1, meter01));
  if (m >= STAT_GREEN) return 0;
  const need = Math.min(1, (1 - m) * Math.max(0.5, bias));
  if (m < STAT_RED) return Math.max(1, unitsFromNeed(need));
  if (Math.random() >= needRequestChance(need)) return 0;
  return unitsFromNeed(need);
}

/** Per Hull pip heal as fraction of full ship health (ship-size tuning later). */
const HULL_PIP_HEAL_MIN = 0.18;
const HULL_PIP_HEAL_MAX = 0.22;
const HULL_PIP_HEAL_AVG = (HULL_PIP_HEAL_MIN + HULL_PIP_HEAL_MAX) / 2;
const HULL_PIP_COUNT_MAX = 5;

function hullPipHealAmount() {
  return HULL_PIP_HEAL_MIN + Math.random() * (HULL_PIP_HEAL_MAX - HULL_PIP_HEAL_MIN);
}

/**
 * How many Hull pips to request — ~one pip per ~20% missing health.
 * Same red/yellow/green request gates as other meters.
 */
function hullRepairPipCount(hull01, bias = 1) {
  const m = Math.max(0, Math.min(1, hull01));
  if (m >= STAT_GREEN) return 0;
  const need = Math.min(1, (1 - m) * Math.max(0.5, bias));
  if (m >= STAT_RED && Math.random() >= needRequestChance(need)) return 0;
  const deficit = Math.max(0, 1 - m);
  let n = Math.max(1, Math.round(deficit / HULL_PIP_HEAL_AVG));
  n = Math.min(HULL_PIP_COUNT_MAX, n);
  if (m < STAT_RED) return Math.max(1, n);
  return n;
}

/** Cargo bring-in / take-out unit count from free or filled slots (board wraps every 5 pips). */
function cargoServiceUnits(slotCount, fraction01, bias = 1) {
  const slots = Math.max(0, slotCount | 0);
  if (slots <= 0) return 0;
  const frac = Math.max(0, Math.min(1, fraction01 * Math.max(0.5, bias)));
  if (frac <= 0.05) return 0;
  const cap = Math.min(slots, 8);
  if (frac < 0.35 && Math.random() >= needRequestChance(frac)) return 0;
  if (frac >= 0.7) {
    return Math.max(1, Math.min(cap, Math.round(slots * frac)));
  }
  if (Math.random() >= needRequestChance(frac)) return 0;
  return Math.max(1, Math.min(cap, Math.round(slots * Math.max(0.35, frac))));
}

/** Light visitor personality — combat leans ammo/hull; freighters lean cargo. */
function visitorServiceBias(visitorId) {
  const combat = ['scout', 'interceptor', 'patrol', 'gunship', 'warden'];
  const cargoHeavy = ['hauler', 'freighter', 'tanker'];
  if (combat.includes(visitorId)) return { ammo: 1.15, hull: 1.1, fuel: 1, cargo: 0.85 };
  if (cargoHeavy.includes(visitorId)) return { ammo: 0.9, hull: 1, fuel: 1, cargo: 1.2 };
  return { ammo: 1, hull: 1, fuel: 1, cargo: 1 };
}

const SERVICE_STAGING_TYPES = [
  'refuel',
  'reloadBullets',
  'reloadShells',
  'loadCargo',
  'upgrade',
];

/** Compact service-board labels (colon added when drawn). Widest locks the circle column. */
const SERVICE_BOARD_LABELS = {
  repair: 'Hull',
  refuel: 'Fuel',
  reloadBullets: 'Bullet',
  reloadShells: 'Shells',
  upgrade: 'Install',
  loadCargo: 'Load',
  unloadCargo: 'Unload',
};
/** Includes colon — circle column starts after this width for every row. */
const SERVICE_BOARD_LABEL_WIDEST = 'Install:';
/** Max status pips per checklist row; overflow repeats the label on the next row. */
const SERVICE_BOARD_PIPS_PER_ROW = 5;

let _serviceSeq = 1;

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function clearVisitorThrusters(pad) {
  if (!pad.thrusters) return;
  for (const k of Object.keys(pad.thrusters)) pad.thrusters[k] = 0;
}

function makeCargo(kind = null) {
  let k;
  if (!kind) {
    k = { ...pick(CRATE_VARIANTS) };
  } else if (kind.label === 'CRATE' && kind.variant == null) {
    k = { ...pick(CRATE_VARIANTS) };
  } else {
    k = { ...kind };
  }
  const cargo = {
    id: _cargoSeq++,
    label: k.label,
    family: k.family || 'cargo',
    shape: k.shape || 'crate',
    variant: k.variant ?? 0,
    w: k.w,
    h: k.h,
    color: k.color,
    accent: k.accent || null,
    hp: k.hp,
    maxHp: k.hp,
    /** Resting 8-dir yaw on piles / floor (carrier overrides while held). */
    restHeading: ((Math.random() * 8) | 0) * CREW_VIS_OCT,
  };
  if (k.catalogItemId) {
    cargo.catalogItemId = k.catalogItemId;
    cargo.catalogCategory = k.catalogCategory;
    cargo.catalogMk = k.catalogMk;
    cargo.catalogTheme = k.catalogTheme;
    cargo.catalogVariant = k.catalogVariant;
  }
  if (k.targetHardpointKey) cargo.targetHardpointKey = k.targetHardpointKey;
  return cargo;
}

/** Build upgrade freight from ItemCatalog (falls back to legacy UPGRADE_KINDS). */
function makeCatalogUpgradeCargo(itemId) {
  const kind = upgradeKindFromItemId(itemId);
  if (kind) return makeCargo(kind);
  return makeCargo(pick(UPGRADE_KINDS));
}

function makeInboundCargo() {
  // Forklift arrivals: mostly generic crates; upgrades from ItemCatalog only
  if (Math.random() < 0.18) {
    const id = pickAmbientCatalogUpgradeId('standard');
    if (id) return makeCatalogUpgradeCargo(id);
  }
  if (Math.random() < 0.12) return makeCargo(pick(SERVICE_CARGO));
  return makeCargo(pick(CRATE_VARIANTS));
}

function pileId(row, col) {
  return `r${row}c${col}`;
}

/** Build 3×6 hardpoint grid (2 columns × 3 bays). */
function buildPileHardpoints() {
  const cols = colXs();
  const piles = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      const meta = colMeta(col);
      piles.push({
        id: pileId(row, col),
        row,
        col,
        bay: meta.bay,
        bayId: meta.bayId,
        lane: meta.lane,
        role: rowRole(row),
        x: cols[col],
        y: ROW_Y[row],
        items: [],
      });
    }
  }
  return piles;
}

export class HangarBay {
  constructor() {
    this.time = 0;
    this.npcs = [];
    this._sparkle = [];
    this._debris = [];
    /** Short-lived deck light stamps left by flying weld sparks */
    this._weldEmberTrail = [];
    this._hazard = { maneuver: 0, engine: 0, weapons: 0 };
    this.sidePads = [];
    this.piles = [];
    this.floorDrops = [];
    this._npcUid = 1;
    this._floorDropSeq = 1;
    this._shipPos = { x: 0, y: 0 };
    /** Last weapon deck-wash point (turret tip / laser muzzle) — not pad center */
    this._weaponWash = { x: 0, y: 0 };
    /** Live player Ship entity (set each hangar update) — owns shipDef loadout */
    this._playerShip = null;
    this._shipAngle = SHIP.SPAWN_ANGLE;
    /** Place → hangar area runtime config (from placeRegistry) */
    this.placeId = 'place.jennings';
    this.areaId = 'area.hangar-main';
    this.hangarConfig = placeRegistry.getHangarRuntimeConfig();
    /** Resolved look skin for active hangar area */
    this.skin = null;
    this.crane = null;
    this._pressure = 0; // <0 need more cargo, >0 need less
    /** Per-bay door beacons — computed each frame by `_syncDoorBeacons` */
    this.bayBeacons = ['off', 'off', 'off'];
    /**
     * Per-bay danger-lane lights: 'idle' | 'danger' | 'incoming' | 'departing' | 'elevator'
     * (incoming/departing = chase; elevator = steady at chase brightness)
     */
    this.bayLaneMode = ['idle', 'idle', 'idle'];
    /** 0 = sealed, 1 = fully open (telescoping leaves) */
    this.doorOpen = [0, 0, 0];
    /** Bay indices under launch/land / visitor ops lock */
    this._opsBays = new Set();
    /** Empty-bay cargo sweep after a visitor leaves (non-player bays) */
    this.bayClearing = [false, false, false];
    /** Pad rim yellow lights: 'off' | 'on' | 'flash' */
    this.padRimMode = ['off', 'off', 'off'];
    /** Dev/sim: bay offline — no traffic, no service, no auto arrivals */
    this.bayOffline = [false, false, false];
    /** Which bay (0/1/2) holds the player ship this session */
    this.playerBayIndex = 1;
    /** Player pad turntable facing (matches docked ship nose; SHIP.SPAWN_ANGLE = north) */
    this.playerPadAngle = SHIP.SPAWN_ANGLE;
    /** Player elevator depth — 0 on deck, 1 fully below (menu arrival). */
    this.playerPadDrop = 0;
    /** True while player ship is still rising from elevator (blocks captain service). */
    this.playerArrivalPending = false;
    /** Dev: player ship seated on player bay (false = empty pad for testing) */
    this.playerPadOccupied = true;
    /**
     * Dev hangar control — bay index whose pad uses the “active” draw style,
     * or null when nothing is selected.
     * @type {number|null}
     */
    this.devControlBayIndex = null;
    /** Dev: player-bay scripted pad spin / door / elev */
    this._playerDevSeq = null;
    /** Player ship flight offsets during Dev door/elev scenes */
    this.playerFlight = {
      shipY: 0,
      shipHover: 0,
      shipScale: 1,
      shipVy: 0,
      shipAngle: null,
    };
    /** Door-header ticker lines per bay [{ text, color }, ...] */
    this.bayTicker = [[], [], []];
    /** Hulls that just left into space — drained by GameEngine → ambient */
    this.pendingSpaceEgress = [];
    /**
     * Space runway reservations driving hangar arrive animations.
     * @type {({ shipId: string|number, isPlayer: boolean }|null)[]}
     */
    this._spaceApproach = [null, null, null];
    /**
     * When true (pilot in space), empty-bay door arrives are requested for
     * ambient runway traffic instead of spawning only inside the hangar.
     */
    this.preferExternalDoorTraffic = false;
    /**
     * False when space LOD has paused the hangar — ambient must not start new
     * mouth approaches against a frozen sim.
     */
    this.spaceTrafficActive = true;
  }

  isPlayerBay(bayIndex) {
    return bayIndex === this.playerBayIndex;
  }

  getPlayerBayIndex() {
    return this.playerBayIndex;
  }

  playerPadWorldX() {
    return hangarPadX(this.playerBayIndex);
  }

  /**
   * Space-view pad signal for one bay.
   * @returns {'green'|'red'|'departing'|'elevator'}
   */
  getBaySignal(bayIndex) {
    const i = ((bayIndex | 0) + 3) % 3;
    if (this.bayOffline[i]) return 'red';
    const lane = this.bayLaneMode[i] || 'idle';
    const pad = this._servicePad(i);
    const seq = this.isPlayerBay(i) ? this._playerDevSeq : pad?.seq;
    const seqKind = seq?.kind || '';
    // Elevator activity → yellow spinning beacon (space view)
    const elevator =
      lane === 'elevator' ||
      seqKind === 'lower' ||
      seqKind === 'raiseLaunch' ||
      seqKind === 'raiseArrive' ||
      seqKind === 'lowerCycle' ||
      seqKind === 'elevLeave' ||
      seqKind === 'elevArrive';
    if (elevator) return 'elevator';
    const departing =
      lane === 'departing' ||
      seqKind === 'depart' ||
      seqKind === 'doorDepart';
    if (departing) return 'departing';
    if (lane === 'incoming' || seqKind === 'arrive' || seqKind === 'doorArrive') {
      return 'red';
    }
    if (this._bayHasShip(i)) return 'red';
    return 'green';
  }

  /** @returns {('green'|'red'|'departing'|'elevator')[]} */
  getBaySignals() {
    return [0, 1, 2].map((i) => this.getBaySignal(i));
  }

  anyBayDeparting() {
    return this.getBaySignals().some((s) => s === 'departing');
  }

  allBaysBlocked() {
    return this.getBaySignals().every((s) => s !== 'green');
  }

  /**
   * Seat the controlled ship on a bay. Swaps player-bay index if needed.
   * @param {{ force?: boolean }} [opts] force — clear a visitor (Dev hijack)
   * @returns {boolean}
   */
  claimEmptyBayForControlled(bayIndex, playerShip, opts = {}) {
    const bi = ((bayIndex | 0) + 3) % 3;
    const force = !!opts.force;
    if (!force && this.getBaySignal(bi) !== 'green' && !this.isPlayerBay(bi)) {
      return false;
    }
    if (this.isPlayerBay(bi)) {
      this.playerPadOccupied = true;
      if (playerShip) this._playerShip = playerShip;
      this.playerBay.x = hangarPadX(bi);
      this.playerBay.visitorId = 'player';
      this.playerBay.seq = null;
      return true;
    }
    const side = this.sidePads.find((p) => p.bayIndex === bi);
    if (!side) return false;
    if (side.visitorId && !force) return false;
    if (side.visitorId) clearPadVisitor(side);

    const oldBi = this.playerBayIndex;
    const labels = bayLabels();
    const peerMk = this._playerPadMk();
    // Old controlled pad becomes an empty side bay
    const vacated = rollSidePad(hangarPadX(oldBi), labels[oldBi], oldBi, peerMk);
    vacated.visitorId = null;
    vacated.shipDef = null;
    vacated.thrusters = null;
    vacated.shipState = null;
    vacated.service = null;
    vacated.seq = null;

    this.sidePads = this.sidePads.filter((p) => p.bayIndex !== bi);
    this.sidePads.push(vacated);

    this.playerBayIndex = bi;
    this.playerBay = {
      x: hangarPadX(bi),
      bayId: labels[bi],
      bayIndex: bi,
      padMk: 2,
      visitorId: 'player',
      shipState: null,
      service: null,
      seq: null,
    };
    this.playerPadOccupied = true;
    if (playerShip) this._playerShip = playerShip;
    this.playerArrivalPending = false;
    return true;
  }

  /** Mark controlled pad empty after launch into space (hangar stays live). */
  clearControlledPadAfterLaunch() {
    this.playerPadOccupied = false;
    if (this.playerBay) {
      this.playerBay.service = null;
      this.playerBay.shipState = null;
      this.playerBay.seq = null;
    }
    this.playerFlight = {
      shipY: 0,
      shipHover: 0,
      shipScale: 1,
      shipVy: 0,
      shipAngle: null,
    };
    this._spaceApproach = [null, null, null];
    this._playerDevSeq = null;
  }

  /** @returns {{ shipDef: object, bayIndex: number, visitorId: string }[]} */
  drainSpaceEgress() {
    const q = this.pendingSpaceEgress || [];
    this.pendingSpaceEgress = [];
    return q;
  }

  /**
   * Accept a space hull onto a free pad as a visitor (AI land). Same shipDef.
   * If a from-space arrive animation is already running, hand off and continue it.
   * @returns {boolean}
   */
  acceptSpaceArrival(bayIndex, shipDef, visitorId = 'patrol') {
    const bi = ((bayIndex | 0) + 3) % 3;
    if (this.isPlayerBay(bi)) return false;
    const pad = this.sidePads.find((p) => p.bayIndex === bi);
    if (!pad) return false;

    // Hangar arrive already started from runway reservation — keep playing it
    if (pad.seq?.kind === 'arrive' && pad.seq.fromSpace) {
      if (shipDef) {
        pad.shipDef = shipDef;
        pad.thrusters = makeVisitorThrusters(shipDef);
      }
      pad.wantSpaceArrival = false;
      this._spaceApproach[bi] = null;
      return true;
    }
    // Arrive finished while the ship was still on the runway
    if (
      pad.visitorId &&
      !pad.seq &&
      this._spaceApproach[bi] &&
      !this._spaceApproach[bi].isPlayer
    ) {
      pad.wantSpaceArrival = false;
      this._spaceApproach[bi] = null;
      return true;
    }

    if (this.getBaySignal(bi) !== 'green') return false;
    if (pad.visitorId || pad.seq) return false;
    equipPadVisitor(pad, visitorId);
    if (shipDef) {
      pad.shipDef = shipDef;
      pad.thrusters = makeVisitorThrusters(shipDef);
    }
    pad.wantSpaceArrival = false;
    // Seat immediately (space handoff already played the mouth cinematic)
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.padAngle = FACE_NORTH;
    pad.shipAngle = FACE_NORTH;
    this._beginCaptainService(pad);
    return true;
  }

  /** Bay indices that want a door fill from space (pilot in space view). */
  getSpaceArrivalRequestLanes() {
    if (!this.preferExternalDoorTraffic || !this.spaceTrafficActive) return [];
    const out = [];
    for (const pad of this.sidePads || []) {
      if (!pad?.wantSpaceArrival) continue;
      if (pad.visitorId || pad.seq) continue;
      if (this.bayOffline[pad.bayIndex]) continue;
      if (this.isPlayerBay(pad.bayIndex)) continue;
      if (this._spaceApproach[pad.bayIndex]) continue;
      out.push(pad.bayIndex);
    }
    return out;
  }

  /** True while player doorArrive was started from a space runway reservation. */
  isSpaceDoorArriveActive() {
    return (
      this._playerDevSeq?.kind === 'doorArrive' && !!this._playerDevSeq.fromSpace
    );
  }

  /**
   * Space→hangar land: drop any headless from-space doorArrive / premature seat
   * so the on-screen land cinematic can own the bay.
   */
  abortPlayerSpaceApproachForLanding() {
    const pb = this.playerBayIndex;
    // Full abandon restore (doors/ops) then land seq re-opens for cinematic
    if (this._playerDevSeq?.fromSpace && !this._spaceApproach[pb]) {
      this._spaceApproach[pb] = { shipId: 'landing', isPlayer: true };
    }
    if (this._spaceApproach[pb]?.isPlayer) {
      this._cancelSpaceApproach(pb);
    }
    this.playerPadOccupied = false;
    if (this.playerBay) {
      this.playerBay.visitorId = null;
      this.playerBay.service = null;
      this.playerBay.shipState = null;
    }
    this._resetPlayerFlight();
  }

  /**
   * Drive hangar arrive animations for active space runway reservations.
   * @param {{ shipId: string|number, lane: number, shipDef?: object, isPlayer?: boolean, visitorId?: string, playerShip?: object }[]} claims
   */
  syncSpaceApproachReservations(claims) {
    const wanted = new Map();
    for (const c of claims || []) {
      if (c?.lane == null || c.shipId == null) continue;
      wanted.set(((c.lane | 0) + 3) % 3, c);
    }

    for (let i = 0; i < 3; i++) {
      const token = this._spaceApproach[i];
      const claim = wanted.get(i);
      if (token && (!claim || claim.shipId !== token.shipId)) {
        this._cancelSpaceApproach(i);
      }
    }

    for (const [lane, claim] of wanted) {
      const token = this._spaceApproach[lane];
      if (token && token.shipId === claim.shipId) continue;
      this._beginSpaceApproach(lane, claim);
    }
  }

  _beginSpaceApproach(lane, claim) {
    const bi = ((lane | 0) + 3) % 3;
    if (claim.isPlayer) {
      // Already finished from-space arrive (or mid doorArrive) — keep claim, don't restart
      if (
        this.isPlayerBay(bi) &&
        this._playerDevSeq?.kind === 'doorArrive' &&
        this._playerDevSeq.fromSpace
      ) {
        this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: true };
        return;
      }
      if (this.isPlayerBay(bi) && this.playerPadOccupied && !this._playerDevSeq) {
        this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: true };
        return;
      }

      if (this.getBaySignal(bi) !== 'green' && !this.isPlayerBay(bi)) return;
      if (!this.isPlayerBay(bi)) {
        const ok = this.claimEmptyBayForControlled(bi, claim.playerShip || null);
        if (!ok) return;
      }
      // Keep pad empty until doorArrive approach phase seats the hull
      this.playerPadOccupied = false;
      if (this.playerBay) this.playerBay.visitorId = null;

      if (this._playerDevSeq) return;

      this.beginOps(bi, 'incoming');
      this._playerDevSeq = {
        kind: 'doorArrive',
        t: 0,
        phase: 'warn',
        fromSpace: true,
      };
      this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: true };
      return;
    }

    if (this.isPlayerBay(bi)) return;
    const pad = this.sidePads.find((p) => p.bayIndex === bi);
    if (!pad) return;
    // Mid / finished from-space arrive — don't restart
    if (pad.seq?.kind === 'arrive' && pad.seq.fromSpace) {
      this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: false };
      return;
    }
    if (pad.visitorId && !pad.seq) {
      this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: false };
      return;
    }
    if (this.getBaySignal(bi) !== 'green') return;
    if (pad.visitorId || pad.seq) return;

    const visitorId = claim.visitorId || 'hauler';
    equipPadVisitor(pad, visitorId);
    if (claim.shipDef) {
      pad.shipDef = claim.shipDef;
      pad.thrusters = makeVisitorThrusters(claim.shipDef);
    }
    pad.wantSpaceArrival = false;
    pad.padAngle = FACE_SOUTH;
    pad.shipAngle = FACE_SOUTH;
    pad.shipY = HANGAR.LAND_START_Y;
    pad.shipHover = 1;
    pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
    pad.shipVy = 0;
    pad.service = null;
    pad.shipState = null;
    this.beginOps(bi, 'incoming');
    this.setDoorOpen(bi, 0);
    pad.seq = { kind: 'arrive', phase: 'warn', t: 0, fromSpace: true };
    this._spaceApproach[bi] = { shipId: claim.shipId, isPlayer: false };
  }

  _cancelSpaceApproach(bayIndex) {
    const bi = ((bayIndex | 0) + 3) % 3;
    const token = this._spaceApproach[bi];
    if (!token) return;
    this._spaceApproach[bi] = null;

    if (token.isPlayer) {
      // Ship left the runway — restore empty pad (close doors, clear ops)
      if (this._playerDevSeq?.fromSpace) this._playerDevSeq = null;
      this.clearOps(bi);
      this.setDoorOpen(bi, 0);
      this.setBeacon(bi, 'off');
      this.setPadRim(bi, 'off');
      this.playerPadOccupied = false;
      this.playerPadAngle = FACE_SOUTH;
      if (this.playerBay) {
        this.playerBay.visitorId = null;
        this.playerBay.service = null;
        this.playerBay.shipState = null;
      }
      this._resetPlayerFlight();
      return;
    }

    const pad = this.sidePads.find((p) => p.bayIndex === bi);
    if (!pad) return;
    // Abort in-progress from-space arrive (not a finished seated visitor)
    if (pad.seq?.fromSpace && pad.seq.kind === 'arrive') {
      clearPadVisitor(pad);
      pad.seq = null;
      pad.service = null;
      pad.shipState = null;
      pad.padAngle = FACE_SOUTH;
      pad.shipAngle = FACE_SOUTH;
      pad.shipY = 0;
      pad.shipHover = 0;
      pad.shipScale = 1;
      this.clearOps(bi);
      this.setDoorOpen(bi, 0);
      this.setBeacon(bi, 'off');
      this.setPadRim(bi, 'off');
    }
  }

  /**
   * Remap pads / piles / bay-tagged agents after sidePadX changes.
   * @param {number} delta
   * @param {{ drop: { x: number }, bay: number }[]} [floorMoves]
   * @param {{ npc: { x: number }, bay: number }[]} [agentMoves]
   * @param {number|null} [craneBay]
   */
  _syncSidePadPositions(delta = 0, floorMoves = [], agentMoves = [], craneBay = null) {
    syncBayAnchors();
    const cols = colXs();
    if (this.piles) {
      for (const pile of this.piles) {
        pile.x = cols[pile.col];
      }
    }
    if (this.playerBay) {
      this.playerBay.x = hangarPadX(this.playerBayIndex);
    }
    if (this.sidePads) {
      for (const pad of this.sidePads) {
        pad.x = hangarPadX(pad.bayIndex);
      }
    }
    if (delta) {
      const shiftX = (bay) => (bay === 0 ? -delta : bay === 2 ? delta : 0);
      for (const { npc, bay } of agentMoves) {
        const dx = shiftX(bay);
        if (dx) npc.x += dx;
      }
      for (const { drop, bay } of floorMoves) {
        const dx = shiftX(bay);
        if (dx) drop.x += dx;
      }
      if (this.crane && (craneBay === 0 || craneBay === 2)) {
        const dx = shiftX(craneBay);
        this.crane.trolleyX += dx;
        if (Number.isFinite(this.crane._prevTX)) this.crane._prevTX += dx;
      }
    }
  }

  /** @param {number|null} bayIndex */
  setDevControlBay(bayIndex) {
    this.devControlBayIndex =
      bayIndex == null || !Number.isFinite(bayIndex) ? null : bayIndex | 0;
  }

  isDevControlBay(bayIndex) {
    return this.devControlBayIndex != null && bayIndex === this.devControlBayIndex;
  }

  /**
   * @param {object|null} [playerShip] — current player Ship (shipDef already applied); used to size visitor peers
   * @param {{ playerBayIndex?: number, placeId?: string, areaId?: string }} [opts]
   */
  reset(playerShip = null, opts = {}) {
    if (playerShip) this._playerShip = playerShip;
    syncHangarSidePadFromLayout(null);
    this._hydrateFromPlace(opts);
    const bayCount = Math.max(1, this.hangarConfig?.bayCount || 3);
    const bayIndex =
      ((opts.playerBayIndex ?? this.playerBayIndex ?? 1) | 0) % bayCount;
    this.playerBayIndex = bayIndex;
    this.time = 0;
    this.npcs = [];
    this._sparkle = [];
    this._debris = [];
    this._weldEmberTrail = [];
    this.floorDrops = [];
    this._npcUid = 1;
    this._floorDropSeq = 1;
    this._hazard = { maneuver: 0, engine: 0, weapons: 0 };
    this._weaponWash = { x: 0, y: 0 };
    const n = Math.max(1, this.hangarConfig?.bayCount || 3);
    this.bayBeacons = Array(n).fill('off');
    this.bayLaneMode = Array(n).fill('idle');
    this.doorOpen = Array(n).fill(0);
    this._opsBays = new Set();
    this.bayClearing = Array(n).fill(false);
    this.padRimMode = Array(n).fill('off');
    this.bayOffline = (this.hangarConfig?.bayOffline || Array(n).fill(false)).slice();
    while (this.bayOffline.length < n) this.bayOffline.push(false);
    this.playerPadAngle = SHIP.SPAWN_ANGLE;
    this.playerPadDrop = 0;
    this.playerArrivalPending = false;
    this.playerPadOccupied = true;
    this._playerDevSeq = null;
    this.playerFlight = {
      shipY: 0,
      shipHover: 0,
      shipScale: 1,
      shipVy: 0,
      shipAngle: null,
    };
    this.bayTicker = Array.from({ length: n }, () => []);
    this.pendingSpaceEgress = [];
    this._spaceApproach = Array(n).fill(null);
    this.preferExternalDoorTraffic = false;
    this.spaceTrafficActive = !!this.hangarConfig?.visitorTraffic;
    const labels = this._bayLabels();
    const playerPadMk = this._configuredPadMk(bayIndex) || 2;
    this.playerBay = {
      x: hangarPadX(bayIndex),
      bayId: labels[bayIndex],
      bayIndex,
      padMk: playerPadMk,
      visitorId: 'player',
      shipState: null,
      service: null,
      seq: null,
    };
    const peerPadMk = this._playerPadMk();
    const bayIndices = Array.from({ length: n }, (_, i) => i);
    this.sidePads = bayIndices
      .filter((i) => i !== bayIndex)
      .map((i) => {
        const pad = rollSidePad(
          hangarPadX(i),
          labels[i],
          i,
          this._configuredPadMk(i) || peerPadMk
        );
        // Prefer configured pad Mk when present (military / mixed yards)
        const cfgMk = this._configuredPadMk(i);
        if (cfgMk) pad.padMk = cfgMk;
        return pad;
      });
    this.piles = buildPileHardpoints();
    this._seedCargo();
    this._resetCrane();
    for (const pad of this.sidePads) {
      if (pad.visitorId) this._beginCaptainService(pad);
    }
    this._initStationCrew();
  }

  /**
   * Load hangar kit + skin from Place registry (Jennings default).
   * @param {{ placeId?: string, areaId?: string }} [opts]
   */
  _hydrateFromPlace(opts = {}) {
    if (opts.placeId) {
      placeRegistry.setActive(opts.placeId, opts.areaId || null);
    }
    this.placeId = placeRegistry.activePlaceId;
    const place = placeRegistry.getActive();
    const hangarArea =
      placeRegistry.getActiveHangarArea() ||
      place?.areas?.[place?.defaultHangarAreaId];
    this.areaId = hangarArea?.id || placeRegistry.activeAreaId;
    this.hangarConfig = placeRegistry.getHangarRuntimeConfig(
      this.placeId,
      this.areaId
    );
    this.skin = resolveHangarSkin(place, hangarArea, null);
  }

  _bayLabels() {
    const n = Math.max(1, this.hangarConfig?.bayCount || 3);
    const ids = this.hangarConfig?.bayIds || [];
    return Array.from({ length: n }, (_, i) => {
      const f = ids[i];
      if (this.hangarConfig && placeRegistry.get(this.placeId)?.areas?.[this.areaId]?.features?.[f]?.label) {
        return placeRegistry.get(this.placeId).areas[this.areaId].features[f].label;
      }
      return bayLabels()[i] || `B${i + 1}`;
    });
  }

  _configuredPadMk(bayIndex) {
    const mk = this.hangarConfig?.padMk?.[bayIndex];
    return mk != null ? mk | 0 : null;
  }

  _bayHasModule(bayIndex, moduleId) {
    const mods = this.hangarConfig?.bayModules?.[bayIndex];
    return hasModule(mods, moduleId);
  }

  hasCrane() {
    return !!this.hangarConfig?.hasCrane;
  }

  playerMayManCrane() {
    return !!(this.hasCrane() && this.hangarConfig?.playerCraneAuthority);
  }

  /** Crane-gated turret swap — false when bay has no crane. */
  canTurretSwap() {
    return canPlayerStartTurretSwap(this.hangarConfig);
  }

  /**
   * Fast-forward visitor traffic on non-player bays before the first visible frame.
   * Player bay is wiped fresh afterward via `_freshPlayerBay`.
   */
  warmStartHeadless(simSeconds = HANGAR.WARMUP_SEC) {
    const step = HANGAR.WARMUP_STEP;
    const targetTime = this.time + simSeconds;
    this._headlessWarmup = true;
    while (this.time < targetTime) {
      const dt = Math.min(step, targetTime - this.time);
      this.update(dt, null, {});
    }
    this._headlessWarmup = false;
    this._freshPlayerBay();
  }

  /** Reset player bay to a clean arrival state after headless warmup. */
  _freshPlayerBay() {
    const pb = this.playerBayIndex;
    this.playerPadDrop = 0;
    this.playerArrivalPending = false;
    this.playerPadOccupied = true;
    this._playerDevSeq = null;
    if (this.playerBay) {
      this.playerBay.x = hangarPadX(pb);
      this.playerBay.bayIndex = pb;
      this.playerBay.bayId = bayLabels()[pb];
      this.playerBay.visitorId = 'player';
      this.playerBay.service = null;
      this.playerBay.shipState = null;
    }
    for (const p of this.piles) {
      if (p.bay === pb) p.items = [];
    }
    this.floorDrops = this.floorDrops.filter((d) => bayIndexFromX(d.x) !== pb);
    this.bayClearing[pb] = false;
    this.clearOps(pb);
    for (const npc of this.npcs) {
      if (npc.kind === 'mechanic' && npc.homeBay === pb) {
        this._clearTaskClaim(npc);
        this._parkMechanicIdle(npc);
      }
      if (npc.kind === 'forklift') {
        const onPlayerBay =
          npc.targetPile?.bay === pb ||
          npc.lingerPile?.bay === pb ||
          npc.cargo?.serviceBay === pb;
        if (onPlayerBay) {
          this._clearTaskClaim(npc);
          npc.cargo = null;
          npc.targetPile = null;
          npc.lingerPile = null;
          npc.targetSlot = null;
          npc.forkPhase = null;
          this._parkForkliftAtHub(npc);
        }
      }
    }
    if (this.crane) {
      const c = this.crane;
      const touchesPlayer =
        c.pickup?.bay === pb ||
        c.dropoff?.bay === pb ||
        (c.pickup?.isFloorDrop && bayIndexFromX(c.pickup.x) === pb);
      if (touchesPlayer) {
        this._applyCraneJob(c, this._pickCraneJob());
      }
    }
  }

  /** World anchor on a bay door face (for LAUNCH button). */
  getBayDoorAnchor(bayIndex = this.playerBayIndex) {
    const cx = padCenters()[bayIndex] ?? 0;
    return {
      x: cx,
      y: -BAY.HALF_H + BAY.DOOR_H * 0.55,
      halfW: BAY.DOOR_HALF,
      doorH: BAY.DOOR_H,
    };
  }

  /**
   * Start departure / arrival ops on a bay: warning beacons, lane mode, crew evac.
   * @param {number} bayIndex
   * @param {'departing'|'incoming'|'elevator'} laneMode
   */
  beginOps(bayIndex, laneMode = 'departing') {
    this._opsBays.add(bayIndex);
    this.bayLaneMode[bayIndex] = laneMode;
    // Arrival flashes rim; departure / elevator / pad motion hold rim on
    this.padRimMode[bayIndex] = laneMode === 'incoming' ? 'flash' : 'on';
    // Player launch/land freezes the crane; visitor ops do not
    if (this.isPlayerBay(bayIndex) && this.crane) this.crane.pause = 99;
    // Divert after freeze so a bay-touching cancel cannot clear the ops pause
    this._divertCraneFromBay(bayIndex, { keepOpsFreeze: this.isPlayerBay(bayIndex) });
    this._evacBayCrew(bayIndex);
  }

  setBeacon(bayIndex, mode) {
    // Door beacons are derived each frame; keep setter for callers/compat
    this.bayBeacons[bayIndex] = mode;
  }

  setLaneMode(bayIndex, mode) {
    this.bayLaneMode[bayIndex] = mode;
  }

  setDoorOpen(bayIndex, amount) {
    this.doorOpen[bayIndex] = Math.max(0, Math.min(1, amount));
  }

  /** Pad rim yellow lights: 'off' | 'on' (steady) | 'flash' (arrival). */
  setPadRim(bayIndex, mode) {
    this.padRimMode[bayIndex] = mode;
  }

  /** B2 turntable facing angle (ship nose when locked to pad). */
  setPlayerPadAngle(angle) {
    this.playerPadAngle = angle;
  }

  _bayHasShip(bayIndex) {
    if (this.isPlayerBay(bayIndex)) return !!this.playerPadOccupied;
    const pad = this._sidePadForBay(bayIndex);
    return !!(pad && pad.visitorId);
  }

  isBayOffline(bayIndex) {
    return !!this.bayOffline[bayIndex];
  }

  isPlayerPadOccupied() {
    return !!this.playerPadOccupied;
  }

  /**
   * Whether the player hull should draw (occupied, or mid door/elev scene).
   * Distinct from playerPadOccupied so thruster control can mute when empty
   * while door/elev still animate the ship.
   */
  isPlayerShipVisible() {
    const s = this._playerDevSeq;
    if (s) {
      if (s.kind === 'doorDepart') {
        return (
          s.phase === 'warn' ||
          s.phase === 'clear' ||
          s.phase === 'doors' ||
          s.phase === 'lift' ||
          s.phase === 'thrust'
        );
      }
      if (s.kind === 'doorArrive') {
        return (
          s.phase === 'approach' ||
          s.phase === 'settle' ||
          s.phase === 'turn' ||
          s.phase === 'doorsClose'
          // awaitIngress / warn / clear / doors: hull not drawn yet
        );
      }
      if (s.kind === 'elevLeave') {
        return s.phase === 'sink' || s.phase === 'warn' || s.phase === 'clear';
      }
      if (s.kind === 'elevArrive') {
        return s.phase === 'rise';
      }
    }
    return !!this.playerPadOccupied;
  }

  /** True while a Dev door/elev/pad scene owns the player bay. */
  isPlayerDevSceneActive() {
    const k = this._playerDevSeq?.kind;
    return !!(
      k &&
      (k === 'doorDepart' ||
        k === 'doorArrive' ||
        k === 'elevLeave' ||
        k === 'elevArrive' ||
        k === 'padSpin')
    );
  }

  isBayOccupied(bayIndex) {
    return this._bayHasShip(bayIndex);
  }

  /** World hit-test for hangar ship selection (player or visitor). */
  pickShipAt(worldX, worldY, hitR = 44) {
    if (this.isPlayerShipVisible()) {
      const px = this.playerPadWorldX();
      const py = this.playerFlight?.shipY || 0;
      if (Math.hypot(worldX - px, worldY - py) <= hitR) {
        return { kind: 'player', bayIndex: this.playerBayIndex };
      }
    }
    for (const pad of this.sidePads) {
      if (!pad.visitorId) continue;
      if ((pad.padDrop || 0) >= 0.02) continue;
      if (!this._visitorArrivalShipVisible(pad)) continue;
      const y = pad.shipY || 0;
      if (Math.hypot(worldX - pad.x, worldY - y) <= hitR) {
        return { kind: 'visitor', bayIndex: pad.bayIndex };
      }
    }
    return null;
  }

  _resetPlayerFlight() {
    this.playerFlight = {
      shipY: 0,
      shipHover: 0,
      shipScale: 1,
      shipVy: 0,
      shipAngle: null,
    };
  }

  _clearPlayerShipThrusters() {
    const ship = this._playerShip;
    if (!ship?.thrusters) return;
    for (const key of Object.keys(ship.thrusters)) {
      if (typeof ship.thrusters[key] === 'number') ship.thrusters[key] = 0;
    }
    ship.thrusters.retroBurn = false;
  }

  _firePlayerManeuverBurst(power) {
    const ship = this._playerShip;
    if (!ship?.thrusters) return;
    this._clearPlayerShipThrusters();
    const keys = [
      'aftPort',
      'aftStarboard',
      'nosePort',
      'noseStarboard',
      'portFore',
      'portAft',
      'starboardFore',
      'starboardAft',
    ];
    for (const key of keys) ship.thrusters[key] = power;
  }

  _firePlayerEngine(power) {
    const ship = this._playerShip;
    if (!ship?.thrusters) return;
    this._clearPlayerShipThrusters();
    ship.thrusters.mainEngine = power;
  }

  _firePlayerNoseBrake(power) {
    const ship = this._playerShip;
    if (!ship?.thrusters) return;
    this._clearPlayerShipThrusters();
    ship.thrusters.nosePort = power;
    ship.thrusters.noseStarboard = power;
  }

  _bayWorkComplete(bayIndex) {
    const pad = this._servicePad(bayIndex);
    if (!pad?.visitorId) return false;
    const svc = pad.service;
    if (!svc) return true;
    // Green / clear-to-depart only after verify scan — never while jobs or settle are live
    if (svc.phase === 'dwell' || svc.phase === 'done' || svc.phase === 'reroll') {
      return true;
    }
    if (
      svc.phase === 'settle' ||
      svc.phase === 'boardReveal' ||
      svc.phase === 'finalScan' ||
      svc.phase === 'active'
    ) {
      return false;
    }
    return this._serviceAllDone(pad) && this._servicePipsSettled(pad);
  }

  _isPadHardwareResting(bayIndex) {
    const door = this.doorOpen[bayIndex] || 0;
    if (door > 0.02) return false;
    if (this.isPlayerBay(bayIndex)) {
      if ((this.playerPadDrop || 0) > 0.02) return false;
      const a = this.playerPadAngle;
      const nearN = Math.abs(Math.atan2(Math.sin(a - FACE_NORTH), Math.cos(a - FACE_NORTH))) < 0.12;
      const nearS = Math.abs(Math.atan2(Math.sin(a - FACE_SOUTH), Math.cos(a - FACE_SOUTH))) < 0.12;
      if (!nearN && !nearS) return false;
      // Elevator/launch ops with closed doors (pad turn / elevator) → not rest
      const pb = this.playerBayIndex;
      if (this._opsBays.has(pb) && this.bayLaneMode[pb] === 'elevator') return false;
      return true;
    }
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return true;
    if ((pad.padDrop || 0) > 0.02) return false;
    if (pad.seq) {
      const k = pad.seq.kind || '';
      if (
        k.includes('turn') ||
        k === 'lower' ||
        k === 'raiseLaunch' ||
        k === 'raiseArrive' ||
        k.startsWith('raise') ||
        k.startsWith('lower')
      ) {
        return false;
      }
    }
    if (this.bayLaneMode[bayIndex] === 'elevator' && this._opsBays.has(bayIndex)) return false;
    return true;
  }

  _isPadRotatingOrElevator(bayIndex) {
    if ((this.doorOpen[bayIndex] || 0) > 0.02) return false;
    if (this.isPlayerBay(bayIndex)) {
      const a = this.playerPadAngle;
      const nearN = Math.abs(Math.atan2(Math.sin(a - FACE_NORTH), Math.cos(a - FACE_NORTH))) < 0.12;
      const nearS = Math.abs(Math.atan2(Math.sin(a - FACE_SOUTH), Math.cos(a - FACE_SOUTH))) < 0.12;
      if (!nearN && !nearS) return true;
      const pb = this.playerBayIndex;
      if (this._opsBays.has(pb) && this.bayLaneMode[pb] === 'elevator') return true;
      return false;
    }
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    if ((pad.padDrop || 0) > 0.02) return true;
    if (pad.seq) {
      const k = pad.seq.kind || '';
      if (k.includes('turn') || k === 'lower' || k.startsWith('raise') || k.startsWith('lower')) {
        return true;
      }
    }
    return this.bayLaneMode[bayIndex] === 'elevator' && this._opsBays.has(bayIndex);
  }

  /**
   * Unified B1–B3 door lights (pilot-facing).
   * off | amber | amberFlash | greenBlink | green | redFlash
   */
  _syncDoorBeacons() {
    for (let i = 0; i < 3; i++) {
      const door = this.doorOpen[i] || 0;
      if (door > 0.02 && door < 0.98) {
        this.bayBeacons[i] = 'redFlash';
        continue;
      }
      if (door >= 0.98) {
        this.bayBeacons[i] = 'green';
        continue;
      }
      // Doors closed
      if (this._isPadRotatingOrElevator(i)) {
        this.bayBeacons[i] = 'amberFlash';
        continue;
      }
      if (!this._bayHasShip(i)) {
        this.bayBeacons[i] = 'off';
        continue;
      }
      if (!this._bayWorkComplete(i)) {
        this.bayBeacons[i] = 'amber';
        continue;
      }
      this.bayBeacons[i] = 'greenBlink';
    }
  }

  /**
   * Pilot door-header ticker (1–2 lines). Bay lifecycle first, then board reveal /
   * service activity.
   */
  _bayActiveJobLines(bayIndex) {
    const i = ((bayIndex | 0) + 3) % 3;
    const lane = this.bayLaneMode[i];
    const door = this.doorOpen[i] || 0;
    const pad = this._servicePad(i);
    const seq = this.isPlayerBay(i) ? this._playerDevSeq : pad?.seq;
    const seqKind = seq?.kind || '';
    const drop = this.isPlayerBay(i)
      ? this.playerPadDrop || 0
      : pad?.padDrop || 0;

    // --- Bay lifecycle (single status line) ---
    if (this.bayOffline[i]) {
      return [{ text: 'BAY DISABLED', color: 'dim' }];
    }

    const elevator =
      lane === 'elevator' ||
      drop > 0.02 ||
      seqKind === 'lower' ||
      seqKind === 'raiseLaunch' ||
      seqKind === 'raiseArrive' ||
      seqKind === 'lowerCycle' ||
      seqKind === 'elevLeave' ||
      seqKind === 'elevArrive' ||
      seqKind === 'padSpin';
    if (elevator) {
      return [{ text: 'ELEVATOR ACTIVE', color: 'amber' }];
    }

    const incoming =
      lane === 'incoming' ||
      seqKind === 'arrive' ||
      seqKind === 'doorArrive' ||
      seqKind === 'approach';
    if (incoming) {
      return [{ text: 'SHIP INCOMING', color: 'red' }];
    }

    const departing =
      lane === 'departing' ||
      seqKind === 'depart' ||
      seqKind === 'doorDepart' ||
      seqKind === 'leave';
    if (departing) {
      return [{ text: 'SHIP DEPARTING', color: 'red' }];
    }

    if (!this._bayHasShip(i)) {
      return [{ text: 'BAY EMPTY', color: 'dim' }];
    }

    // --- Occupied: board reveal / captain service ---
    const svc = pad?.service;
    if (svc?.phase === 'finalScan') {
      return [{ text: 'SCANNING', color: 'blue' }];
    }
    if (svc?.phase === 'boardReveal' && svc.reveal) {
      const stage = svc.reveal.stage;
      if (
        stage === 'preScan' ||
        stage === 'stats' ||
        stage === 'cargo' ||
        stage === 'postScan'
      ) {
        return [{ text: 'SCANNING', color: 'blue' }];
      }
      if (stage === 'pipGap' || stage === 'pips') {
        return [{ text: 'PLEASE SELECT SERVICES', color: 'amber' }];
      }
    }

    const lines = [];

    if (door > 0.02 && door < 0.98) {
      lines.push({ text: 'DOORS MOVING', color: 'red' });
    }

    if (this._bayWorkComplete(i)) {
      if (door >= 0.98) lines.push({ text: 'CLEAR TO DEPART', color: 'green' });
      else if (!lines.length) lines.push({ text: 'AWAITING EXIT', color: 'green' });
      return lines.slice(0, 2);
    }

    // Active crew / service reporting
    for (const npc of this.npcs) {
      if (lines.length >= 2) break;
      if (npc.kind === 'mechanic' && npc.homeBay === i) {
        if (npc.job === 'weld' && npc.state?.startsWith('work')) {
          lines.push({ text: 'REPAIRING HULL', color: 'blue' });
        } else if (npc.job === 'installUpgrade' && npc.state !== 'idleFluff') {
          lines.push({ text: 'INSTALLING UPGRADE', color: 'blue' });
        } else if (npc.job === 'loadShip' && npc.state !== 'idleFluff') {
          lines.push({ text: 'LOADING CARGO', color: 'blue' });
        } else if (npc.job === 'unloadShip' && npc.state !== 'idleFluff') {
          lines.push({ text: 'UNLOADING CARGO', color: 'blue' });
        } else if (npc.job === 'removeUpgrade' && npc.state !== 'idleFluff') {
          lines.push({ text: 'REMOVING UPGRADE', color: 'blue' });
        }
      }
      if (npc.kind === 'forklift' && npc.targetPile?.bay === i) {
        if (npc.job === 'bringIn') lines.push({ text: 'STAGING MATERIALS', color: 'yellow' });
        else if (npc.job === 'takeOut') lines.push({ text: 'CLEARING BAY', color: 'yellow' });
      }
    }

    if (this.crane?.pickup?.bay === i || this.crane?.dropoff?.bay === i) {
      if (this.crane.phase !== 'idle' && this.crane.phase !== 'linger' && lines.length < 2) {
        lines.push({ text: 'STAGING MATERIALS', color: 'yellow' });
      }
    }

    if (this.bayClearing[i] && lines.length < 2) {
      lines.push({ text: 'CLEARING BAY', color: 'yellow' });
    }

    if (svc?.items?.length && lines.length < 2) {
      const pending = svc.items.find((it) => it.status !== 'done');
      if (pending) {
        const map = {
          refuel: 'REFUELING',
          reloadBullets: 'RELOADING BULLETS',
          reloadShells: 'RELOADING SHELLS',
          repair: 'REPAIRING HULL',
          loadCargo: 'LOADING CARGO',
          unloadCargo: 'UNLOADING CARGO',
          upgrade: 'INSTALLING UPGRADE',
        };
        lines.push({
          text: map[pending.type] || 'STAGING MATERIALS',
          color: pending.status === 'staging' ? 'yellow' : 'blue',
        });
      }
    }

    if (!lines.length) lines.push({ text: 'STANDBY', color: 'dim' });
    const seen = new Set();
    return lines.filter((l) => {
      if (seen.has(l.text)) return false;
      seen.add(l.text);
      return true;
    }).slice(0, 2);
  }

  _syncBayTickers() {
    for (let i = 0; i < 3; i++) {
      this.bayTicker[i] = this._bayActiveJobLines(i);
    }
  }

  _boardUnitColor(bayIndex, svc, it) {
    // Done: stay blue until the mech walks away (pipSettled); finalScan holds blue
    if (it.status === 'done') {
      if (svc?.phase === 'finalScan') return 'blue';
      return it.pipSettled ? 'green' : 'blue';
    }

    // Yellow until a bay mechanic has claimed this exact unit (not forklift staging)
    const claimed = this.npcs.some((n) => {
      if (n.kind !== 'mechanic' || n.homeBay !== bayIndex) return false;
      if (n.job === 'idle' || n.state === 'idleFluff') return false;
      const sid = n._activeServiceId ?? n.cargo?.serviceKey;
      return sid != null && sid === it.id;
    });

    if (it.type === 'upgrade') {
      const blockers = svc.items.filter(
        (o) =>
          o !== it &&
          o.status !== 'done' &&
          (o.type === 'refuel' ||
            o.type === 'repair' ||
            o.type === 'reloadBullets' ||
            o.type === 'reloadShells' ||
            o.type === 'loadCargo')
      );
      if (blockers.length && !claimed) return 'grey';
    }

    return claimed ? 'blue' : 'yellow';
  }

  /** Bind checklist unit a mechanic is working so its pip can go blue. */
  _bindActiveServiceForMech(npc) {
    const bay = npc.bay ?? npc.homeBay;
    const items = this._servicePad(bay)?.service?.items || [];
    const taken = this._claimedServiceKeys(npc);
    const firstOpen = (type) =>
      items.find(
        (i) => i.type === type && i.status !== 'done' && !taken.has(i.id)
      )?.id ?? null;

    if (npc.cargo?.serviceKey != null) {
      npc._activeServiceId = npc.cargo.serviceKey;
      return;
    }
    // Keep the per-unit claim from task pick (both mechs load/unload in parallel)
    if (npc._claimServiceItemId != null) {
      const sid = npc._claimServiceItemId;
      if (!String(sid).startsWith('cargo:')) {
        const it = items.find((i) => i.id === sid);
        if (it && it.status !== 'done') {
          npc._activeServiceId = sid;
          return;
        }
      } else {
        npc._activeServiceId = sid;
        return;
      }
    }
    if (npc._activeServiceId != null) {
      const it = items.find((i) => i.id === npc._activeServiceId);
      if (it && it.status !== 'done') return;
    }
    if (npc.job === 'weld') {
      npc._activeServiceId = firstOpen('repair');
    } else if (npc.job === 'unloadShip') {
      npc._activeServiceId = firstOpen('unloadCargo');
    } else if (npc.job === 'installUpgrade' || npc.job === 'removeUpgrade') {
      npc._activeServiceId = firstOpen('upgrade');
    } else if (npc.job === 'loadShip') {
      const pile = this._pileById(npc.targetPile?.id);
      const staged = pile?.items?.find(
        (c) => c.serviceKey != null && !taken.has(c.serviceKey)
      );
      npc._activeServiceId =
        staged?.serviceKey ??
        items.find(
          (i) =>
            (i.type === 'refuel' ||
              i.type === 'reloadBullets' ||
              i.type === 'reloadShells' ||
              i.type === 'loadCargo') &&
            i.status !== 'done' &&
            !taken.has(i.id)
        )?.id ??
        null;
    } else {
      npc._activeServiceId = null;
    }
  }

  /** Green pip only after the mech starts walking away from the finished job. */
  _settleActiveServicePip(npc) {
    const id = npc?._activeServiceId ?? npc?.cargo?.serviceKey;
    if (id == null) return;
    for (const pad of this._allServicePads()) {
      const it = pad.service?.items?.find((i) => i.id === id);
      if (it) {
        it.pipSettled = true;
        return;
      }
    }
  }

  /**
   * Service column rows — one row per job type (chunks of ≤5 pips; overflow repeats label).
   * Install pips share the "Install" label; each unit still maps to a backend service item
   * with targetHardpointKey / catalogItemId for strip→install simulation.
   * During boardReveal, only pips already "ordered" (shownIds) appear.
   */
  _boardTaskRows(bayIndex) {
    const pad = this._servicePad(bayIndex);
    const svc = pad?.service;
    if (!this._bayHasShip(bayIndex) || !svc?.items?.length) {
      return [{ label: 'STANDBY', color: 'dim', status: 'idle', units: [], complete: false }];
    }
    const labelOf = (it) =>
      SERVICE_BOARD_LABELS[it.type] || String(it.type || '?').slice(0, 7);

    const revealing = svc.phase === 'boardReveal' && svc.reveal && svc.reveal.stage !== 'done';
    const shown = revealing ? svc.reveal.shownIds : null;

    const order = [];
    const byType = new Map();
    for (const it of svc.items) {
      if (it.type === 'elevatorTransfer') continue;
      if (shown && !shown.has(it.id)) continue;
      if (!byType.has(it.type)) {
        byType.set(it.type, { type: it.type, label: labelOf(it), units: [] });
        order.push(it.type);
      }
      byType.get(it.type).units.push({
        color: this._boardUnitColor(bayIndex, svc, it),
        status: it.status,
        serviceItemId: it.id,
        targetHardpointKey: it.targetHardpointKey || null,
      });
    }

    const rows = [];
    const chunk = SERVICE_BOARD_PIPS_PER_ROW;
    for (const type of order) {
      const group = byType.get(type);
      for (let i = 0; i < group.units.length; i += chunk) {
        const units = group.units.slice(i, i + chunk);
        const complete = units.length > 0 && units.every((u) => u.color === 'green');
        rows.push({
          label: group.label,
          type: group.type,
          units,
          complete,
          color: complete ? 'green' : 'white',
          status: complete ? 'done' : 'pending',
        });
      }
    }
    if (!rows.length) {
      return [{ label: 'STANDBY', color: 'dim', status: 'idle', units: [], complete: false }];
    }
    return rows;
  }

  _boardHeaderLight(bayIndex) {
    if (!this._bayHasShip(bayIndex)) return 'off';
    if (this._opsBays.has(bayIndex) || (this.doorOpen[bayIndex] || 0) > 0.05) return 'redFlash';
    if (this._bayWorkComplete(bayIndex)) return 'green';
    return 'yellow';
  }

  /**
   * Clear ops on one bay, or all bays when bayIndex is omitted.
   * @param {number} [bayIndex]
   */
  clearOps(bayIndex) {
    const clearOne = (i) => {
      if (!this._opsBays.has(i)) return;
      this._opsBays.delete(i);
      this.bayLaneMode[i] = 'idle';
      this.doorOpen[i] = 0;
      this.padRimMode[i] = 'off';
      // Match beginOps: unfreeze for whichever bay holds the player (not hardcoded B2)
      if (this.isPlayerBay(i) && this.crane) this.crane.pause = 0.2;
    };
    if (bayIndex == null) {
      for (const i of [...this._opsBays]) clearOne(i);
    } else {
      clearOne(bayIndex);
    }
  }

  _sidePadForBay(bayIndex) {
    return this.sidePads.find((p) => p.bayIndex === bayIndex) || null;
  }

  /** Side visitor pad or player bay stub (captain checklist). */
  _servicePad(bayIndex) {
    if (this.isPlayerBay(bayIndex)) return this.playerBay;
    return this._sidePadForBay(bayIndex);
  }

  _allServicePads() {
    return [this.playerBay, ...this.sidePads].filter(Boolean);
  }

  /** Occupied neighbor pad, or player bay while checklist wants inbound. */
  _bayAcceptsCargo(bay) {
    if (this.bayClearing[bay]) return false;
    if (this._opsBays.has(bay)) return false;
    const pad = this._servicePad(bay);
    if (this.isPlayerBay(bay)) {
      // Headless warmup must not stock the player bay (wiped after; steals visitor freight).
      if (this._headlessWarmup) return false;
      if (!pad?.service) return true;
      if (pad.service.phase === 'active') {
        return (
          this._serviceNeedsBringIn(pad).length > 0 ||
          this._serviceNeedsStaging(pad).some((it) => it.status === 'staging')
        );
      }
      return false;
    }
    if (!pad?.visitorId || pad.seq) return false;
    // During captain service, only accept inbound the checklist still needs brought in / lifted
    if (pad.service?.phase === 'active') {
      return (
        this._serviceNeedsBringIn(pad).length > 0 ||
        this._serviceNeedsStaging(pad).some((it) => it.status === 'staging')
      );
    }
    if (pad.service) return false;
    return true;
  }

  _bayNeedsInbound(bay) {
    if (!this._bayAcceptsCargo(bay)) return false;
    const south = this._bayPile(bay, 'in', ROW.S);
    if (!south || south.items.length >= PILE_CAP) return false;
    const pad = this._servicePad(bay);
    if (pad?.service?.phase === 'active') {
      return this._serviceNeedsBringIn(pad).length > 0;
    }
    return this._bayInboundStock(bay) < INBOUND_SOFT_CAP;
  }

  _bayPileCargoCount(bay) {
    let n = 0;
    for (const p of this.piles) {
      if (p.bay === bay) n += p.items.length;
    }
    return n;
  }

  /** Piles + floor drops + carriers still holding this bay's freight. */
  _bayHasResidualCargo(bay) {
    if (this._bayPileCargoCount(bay) > 0) return true;
    if (this.floorDrops?.some((d) => bayIndexFromX(d.x) === bay)) return true;
    for (const n of this.npcs) {
      if (!n.alive || !n.cargo) continue;
      if (n.cargo.serviceBay === bay) return true;
      if (n.bay === bay && n.cargo) return true;
    }
    if (this.crane?.carried) {
      const c = this.crane.carried;
      if (c.serviceBay === bay) return true;
      if (this.crane.dropoff?.bay === bay || this.crane.pickup?.bay === bay) return true;
    }
    return false;
  }

  _updateBayClearing() {
    for (const bay of [0, 1, 2]) {
      if (this.isPlayerBay(bay)) continue;
      if (!this.bayClearing[bay]) continue;
      if (!this._bayHasResidualCargo(bay)) this.bayClearing[bay] = false;
    }
  }

  _startBayClear(bay) {
    if (this.isPlayerBay(bay)) return;
    this.bayClearing[bay] = true;
    // Cancel mechanic jobs aimed at this pad
    for (const npc of this.npcs) {
      if (npc.kind !== 'mechanic') continue;
      if (npc.targetPad && Math.abs(npc.targetPad.x - (padCenters()[bay] || 0)) < 20) {
        this._clearTaskClaim(npc);
        npc.job = 'idle';
        npc.taskMode = 'idle';
        this._beginIdleFluff(npc);
      }
    }
  }

  /**
   * Cancel a crane job that touches a bay (doors / elev / danger).
   * @param {number} bayIndex
   * @param {{ keepOpsFreeze?: boolean }} [opts]
   */
  _divertCraneFromBay(bayIndex, opts = {}) {
    const c = this.crane;
    if (!c) return;
    const touches = (pile) => pile && pile.bay === bayIndex;
    const floorInBay =
      c.pickup?.isFloorDrop && bayIndexFromX(c.pickup.x) === bayIndex;
    if (touches(c.pickup) || touches(c.dropoff) || floorInBay) {
      if (c.pickup?.isFloorDrop && c.pickup.floorDropId) {
        const drop = this.floorDrops.find((d) => d.id === c.pickup.floorDropId);
        if (drop && drop.claimNpc === 'crane') drop.claimNpc = null;
      }
      c.carried = null;
      c.phase = 'idle';
      if (!opts.keepOpsFreeze) c.pause = 0.15;
      // Park on a non-ops bay mid-in (never force B2 — may be the hot bay)
      const parkBay =
        [0, 1, 2].find((b) => b !== bayIndex) ??
        ((bayIndex + 1) % 3);
      c.pickup =
        this._bayPile(parkBay, 'in', ROW.M) ||
        this._bayPile((parkBay + 1) % 3, 'in', ROW.M);
      c.dropoff = c.pickup;
    }
  }

  /** Lit danger rectangle for a bay (matches floor running lights). */
  _dangerRect(bayIndex) {
    const cx = padCenters()[bayIndex] ?? 0;
    return {
      x0: cx - bayLaneHalf(),
      x1: cx + bayLaneHalf(),
      y0: -BAY.HALF_H + BAY.DOOR_H + 6,
      y1: DANGER_ZONE_SOUTH,
    };
  }

  _pointInDangerRect(x, y, bayIndex, pad = DANGER_ZONE_PAD) {
    const r = this._dangerRect(bayIndex);
    return x >= r.x0 - pad && x <= r.x1 + pad && y >= r.y0 - pad && y <= r.y1 + pad;
  }

  _inBayDangerZone(npc, bayIndex) {
    return this._pointInDangerRect(npc.x, npc.y, bayIndex);
  }

  _isBayOpsHot(bayIndex) {
    return this._opsBays.has(bayIndex);
  }

  _pointInAnyHotDanger(x, y, pad = DANGER_ZONE_PAD) {
    for (const bay of this._opsBays) {
      if (this._pointInDangerRect(x, y, bay, pad)) return bay;
    }
    return null;
  }

  _xInAnyHotDanger(x, pad = DANGER_ZONE_PAD) {
    for (const bay of this._opsBays) {
      const r = this._dangerRect(bay);
      if (x >= r.x0 - pad && x <= r.x1 + pad) return true;
    }
    return false;
  }

  /** Axis-aligned segment vs hot danger rects (sample along the path). */
  _segmentHitsAnyHotDanger(x0, y0, x1, y1, exceptBay = null) {
    if (!this._opsBays.size) return false;
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const bay = this._pointInAnyHotDanger(x, y, 2);
      if (bay != null && bay !== exceptBay) return true;
    }
    return false;
  }

  _segmentHitsBayDanger(x0, y0, x1, y1, bayIndex) {
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (this._pointInDangerRect(x, y, bayIndex, 2)) return true;
    }
    return false;
  }

  /** Last safe point on the segment before entering a hot rect. */
  _pointBeforeHotSegment(x0, y0, x1, y1, exceptBay = null) {
    if (!this._segmentHitsAnyHotDanger(x0, y0, x1, y1, exceptBay)) {
      return { x: x1, y: y1 };
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) * 0.5;
      const x = x0 + (x1 - x0) * mid;
      const y = y0 + (y1 - y0) * mid;
      const bay = this._pointInAnyHotDanger(x, y, 2);
      if (bay != null && bay !== exceptBay) hi = mid;
      else lo = mid;
    }
    return { x: x0 + (x1 - x0) * lo, y: y0 + (y1 - y0) * lo };
  }

  /** True when this mechanic is waiting to reclaim a floor drop still inside a hot bay. */
  _shouldHoldForHotDrop(npc) {
    if (npc.state !== 'toFloorDrop') return false;
    const drop = this.floorDrops.find(
      (d) => d.id === npc.floorDropId || d.id === npc.droppedCargoId
    );
    if (!drop) return false;
    return this._pointInAnyHotDanger(drop.x, drop.y, 0) != null;
  }

  /**
   * Next waypoint around hot danger rectangles toward (tx, ty).
   * When zones clear, callers path straight again (shorter through the bay).
   * @param {{ x: number, y: number } | null} prefer sticky prior waypoint
   */
  _skirtAroundHot(sx, sy, tx, ty, exceptBay = null, prefer = null) {
    if (!this._segmentHitsAnyHotDanger(sx, sy, tx, ty, exceptBay)) {
      return { x: tx, y: ty };
    }
    // Stick to a prior skirt point until reached (stops left/right ping-pong)
    if (
      prefer &&
      this._pointInAnyHotDanger(prefer.x, prefer.y, 2) == null &&
      this._npcInBacksplash(prefer.x, prefer.y) == null &&
      !this._segmentHitsAnyHotDanger(sx, sy, prefer.x, prefer.y, exceptBay) &&
      Math.hypot(sx - prefer.x, sy - prefer.y) > 4
    ) {
      // Drop sticky south skirts when the real goal is north of the boards
      const goalSouth = ty >= BACKSPLASH_Y;
      if (goalSouth || prefer.y < BACKSPLASH_Y + BACKSPLASH_BAND) {
        return prefer;
      }
    }

    const margin = DANGER_ZONE_PAD + 10;
    const goalSouth = ty >= BACKSPLASH_Y;
    const candidates = [];
    for (const bay of this._opsBays) {
      if (bay === exceptBay) continue;
      if (!this._segmentHitsBayDanger(sx, sy, tx, ty, bay)) continue;
      const r = this._dangerRect(bay);
      const left = r.x0 - margin;
      const right = r.x1 + margin;
      const south = r.y1 + margin;
      const north = Math.max(r.y0 - margin, -BAY.HALF_H + BAY.DOOR_H + 4);
      // Keep skirt on the goal's side of the blast wall when possible
      const gateSouth = Math.max(south, BACKSPLASH_Y + BACKSPLASH_BAND + 6);
      const gateNorth = Math.min(south - 4, BACKSPLASH_Y - BACKSPLASH_BAND - 6);
      const points = [
        { x: left, y: goalSouth ? gateSouth : gateNorth },
        { x: right, y: goalSouth ? gateSouth : gateNorth },
        { x: left, y: sy },
        { x: right, y: sy },
        { x: left, y: ty },
        { x: right, y: ty },
        { x: left, y: north },
        { x: right, y: north },
      ];
      // Only offer south gates when the goal is actually south
      if (goalSouth) {
        points.push({ x: left, y: south }, { x: right, y: south });
        points.push({ x: left, y: gateSouth }, { x: right, y: gateSouth });
      }
      for (const p of points) {
        if (this._pointInAnyHotDanger(p.x, p.y, 2) != null) continue;
        if (this._npcInBacksplash(p.x, p.y) != null) continue;
        if (this._segmentHitsAnyHotDanger(sx, sy, p.x, p.y, exceptBay)) continue;
        let cost = Math.hypot(p.x - sx, p.y - sy) + Math.hypot(tx - p.x, ty - p.y);
        const pSouth = p.y >= BACKSPLASH_Y;
        if (pSouth !== goalSouth) cost += goalSouth ? 80 : 220;
        if (prefer && Math.hypot(p.x - prefer.x, p.y - prefer.y) < 8) cost -= 40;
        candidates.push({ p, cost });
      }
    }
    if (!candidates.length) {
      for (const bay of this._opsBays) {
        if (bay === exceptBay) continue;
        const r = this._dangerRect(bay);
        const left = r.x0 - margin;
        const right = r.x1 + margin;
        const y = goalSouth
          ? Math.max(r.y1 + margin, BACKSPLASH_Y + BACKSPLASH_BAND + 8)
          : Math.min(r.y1 - 8, BACKSPLASH_Y - BACKSPLASH_BAND - 8);
        for (const p of [
          { x: left, y },
          { x: right, y },
          { x: left, y: ty },
          { x: right, y: ty },
        ]) {
          if (this._pointInAnyHotDanger(p.x, p.y, 2) != null) continue;
          if (this._npcInBacksplash(p.x, p.y) != null) continue;
          return p;
        }
      }
      const side = tx >= sx ? 1 : -1;
      const y = goalSouth
        ? DANGER_ZONE_SOUTH + margin + 8
        : BACKSPLASH_Y - BACKSPLASH_BAND - 12;
      return { x: sx + side * 48, y };
    }
    candidates.sort((a, b) => a.cost - b.cost);
    return candidates[0].p;
  }

  /** Nearest floor point outside a bay's lit danger rectangle. */
  _nearestSafePoint(x, y, bayIndex) {
    const r = this._dangerRect(bayIndex);
    const pad = DANGER_ZONE_PAD + 6;
    const southY = Math.max(r.y1 + pad, BACKSPLASH_Y + BACKSPLASH_BAND + 8);
    const candidates = [
      { x, y: southY },
      { x: r.x0 - pad, y: Math.min(y, r.y1 - 4) },
      { x: r.x1 + pad, y: Math.min(y, r.y1 - 4) },
      { x: r.x0 - pad, y: southY },
      { x: r.x1 + pad, y: southY },
      { x: this._pickCorridorX(x, r.x0 - pad), y: southY },
      { x: this._pickCorridorX(x, r.x1 + pad), y: southY },
    ];
    let best = candidates[0];
    let bestD = Infinity;
    for (const c of candidates) {
      if (this._pointInDangerRect(c.x, c.y, bayIndex, 0)) continue;
      if (this._npcInBacksplash(c.x, c.y) != null) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  _dropFloorCargo(npc) {
    if (!npc.cargo) return null;
    const drop = {
      id: `fd${this._floorDropSeq++}`,
      cargo: npc.cargo,
      x: npc.x + (npc.facing > 0 ? 4 : -4),
      y: npc.y + 2,
      droppedAt: this.time,
      ownerId: npc.uid,
      claimNpc: null,
    };
    this.floorDrops.push(drop);
    npc.droppedCargoId = drop.id;
    npc.cargo = null;
    return drop;
  }

  _abortMechanicForOps(npc) {
    if (npc.state === 'workWeld' || npc.state === 'workShip') {
      npc.hullTarget = null;
      npc._weldGlow = null;
    }
    if (npc.cargo) this._dropFloorCargo(npc);
    this._clearTaskClaim(npc);
  }

  /** Pad still has a workable ship (not mid ops / elevator / empty). */
  _padWorkable(pad) {
    if (!pad) return false;
    const bay = typeof pad.bayIndex === 'number' ? pad.bayIndex : bayIndexFromX(pad.x);
    if (this._isBayOpsHot(bay)) return false;
    const svcPad = this._servicePad(bay);
    if (this.isPlayerBay(bay)) {
      // Player ship is always "here"; deck work only while checklist is active
      if (svcPad?.service && svcPad.service.phase !== 'active') return false;
      return true;
    }
    if (!svcPad?.visitorId) return false;
    if (svcPad.seq) return false;
    if (svcPad.service && svcPad.service.phase !== 'active') return false;
    return true;
  }

  _startClearHot(npc, bayIndex) {
    if (npc.kind !== 'mechanic') return;
    if (npc.state === 'clearHot' || npc.state === 'resumeWait') return;
    if (npc.state === 'emerge' || npc.state === 'descend') return;

    const lane = this.bayLaneMode[bayIndex];
    const dropDrama = lane === 'incoming' || lane === 'departing';
    const hullWork =
      npc.state === 'workWeld' ||
      npc.state === 'workShip' ||
      npc.state === 'toShip' ||
      npc.job === 'weld';

    if (!['clearHot', 'waitHot', 'resumeWait', 'flee', 'flinch'].includes(npc.state)) {
      npc.resumeState = npc.state === 'leaveHatch' ? 'toShip' : npc.state;
      npc._opsResumeJob = npc.job;
      npc._opsResumePad = npc.targetPad;
      npc._opsResumePile = npc.targetPile;
      npc._opsResumeBay = npc.bay;
    }

    if (dropDrama) {
      this._abortMechanicForOps(npc);
      // Don't resume mid-weld / mid-hull after a panic drop
      if (hullWork) {
        npc.resumeState = null;
        npc._opsResumeJob = null;
      }
    } else if (hullWork) {
      // Elevator (etc.): cancel hull work without dropping cargo; re-pick after clear
      npc.hullTarget = null;
      npc._weldGlow = null;
      npc.resumeState = null;
      npc._opsResumeJob = null;
      if (npc.job === 'weld') {
        this._clearTaskClaim(npc);
        npc.job = 'idle';
      }
    }

    npc.clearBay = bayIndex;
    npc.safeSpot = this._nearestSafePoint(npc.x, npc.y, bayIndex);
    npc.state = 'clearHot';
    npc.stateT = 0;
    this._clearBacksplashCross(npc);
  }

  /** Mechanics inside the lit box scramble out. Forklifts ignore bay danger. */
  _evacBayCrew(bayIndex) {
    for (const npc of this.npcs) {
      if (npc.kind !== 'mechanic') continue;
      if (!this._inBayDangerZone(npc, bayIndex)) continue;
      this._startClearHot(npc, bayIndex);
    }
  }

  /** Keep pushing anyone still in the danger zone out during ops. */
  tickEvac(bayIndex) {
    for (const npc of this.npcs) {
      if (npc.kind !== 'mechanic') continue;
      if (!this._inBayDangerZone(npc, bayIndex)) continue;
      if (npc.state === 'clearHot' || npc.state === 'resumeWait') continue;
      this._startClearHot(npc, bayIndex);
    }
  }

  isBayDangerClear(bayIndex) {
    return !this.npcs.some(
      (n) => n.kind === 'mechanic' && n.alive && this._inBayDangerZone(n, bayIndex)
    );
  }

  _resetPadMotion(pad) {
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.shipAngle = pad.visitorId ? FACE_NORTH : FACE_SOUTH;
    pad.padAngle = pad.visitorId ? FACE_NORTH : FACE_SOUTH;
    pad.padDrop = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    if (pad.visitorId) {
      const def = this._ensurePadShipDef(pad);
      pad.thrusters = makeVisitorThrusters(def);
    } else {
      pad.thrusters = null;
      pad.shipDef = null;
    }
    clearVisitorThrusters(pad);
  }

  _fireVisitorManeuverBurst(pad, power) {
    if (!pad.visitorId) return;
    const def = this._ensurePadShipDef(pad);
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(def);
    clearVisitorThrusters(pad);
    const prop = getVisitorPropulsion(def);
    for (const m of prop.thrusters) pad.thrusters[m.key] = power;
  }

  _fireVisitorNoseBrake(pad, power) {
    if (!pad.visitorId) return;
    const def = this._ensurePadShipDef(pad);
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(def);
    clearVisitorThrusters(pad);
    const prop = getVisitorPropulsion(def);
    const noses = prop.thrusters.filter((m) => m.key.startsWith('nose'));
    if (noses.length) {
      for (const m of noses) pad.thrusters[m.key] = power;
    } else {
      // No nose thrusters — hover on laterals + light engine for settle cue
      for (const m of prop.thrusters) pad.thrusters[m.key] = power * 0.55;
      pad.thrusters.mainEngine = power * 0.25;
    }
  }

  _fireVisitorEngine(pad, power) {
    if (!pad.visitorId) return;
    const def = this._ensurePadShipDef(pad);
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(def);
    clearVisitorThrusters(pad);
    pad.thrusters.mainEngine = power;
  }

  _setPadCooldown(pad, busy) {
    pad.cooldown = busy
      ? rand(HANGAR.VISITOR_COOLDOWN_BUSY_MIN, HANGAR.VISITOR_COOLDOWN_BUSY_MAX)
      : rand(HANGAR.VISITOR_COOLDOWN_EMPTY_MIN, HANGAR.VISITOR_COOLDOWN_EMPTY_MAX);
  }

  _finishVisitorLeave(pad, { clearCargo = true } = {}) {
    if (pad?.shipDef && Number.isFinite(pad.bayIndex)) {
      this.pendingSpaceEgress.push({
        shipDef: pad.shipDef,
        bayIndex: pad.bayIndex,
        visitorId: pad.visitorId || 'patrol',
      });
    }
    clearPadVisitor(pad);
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.padDrop = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    pad.padAngle = FACE_SOUTH;
    pad.shipAngle = FACE_SOUTH;
    pad.shipState = null;
    pad.service = null;
    this.clearOps(pad.bayIndex);
    pad.seq = null;
    if (clearCargo) this._startBayClear(pad.bayIndex);
    this._setPadCooldown(pad, false);
  }

  _finishVisitorArrive(pad) {
    pad.padAngle = FACE_NORTH;
    pad.shipAngle = FACE_NORTH;
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    clearVisitorThrusters(pad);
    this.clearOps(pad.bayIndex);
    pad.seq = null;
    if (pad.bayIndex != null) this._spaceApproach[pad.bayIndex] = null;
    this._beginCaptainService(pad);
  }

  /**
   * Dev: restore starter loadout, purge player-bay staging + in-transit freight,
   * drop the old checklist, and roll a fresh captain service.
   */
  rerollPlayerService() {
    const pb = this.playerBayIndex;

    if (this._playerShip) {
      this._playerShip.shipDef = createPlayerStarter();
      this._playerShip.miningLaserRelAngle = 0;
      this._playerShip.miningLaserFiring = false;
      this._playerShip.miningLaserBeamLength = undefined;
      this._playerShip.muzzleFlash = 0;
      this._playerShip.turretRecoil = 0;
      if (typeof this._playerShip.angle === 'number') {
        this._playerShip.turretAngle = this._playerShip.angle;
      }
    }

    // Drop the old checklist entirely (pips / tasks gone — not marked done)
    this.playerBay.service = null;
    this.playerBay.shipState = null;
    this.playerArrivalPending = false;
    this.bayClearing[pb] = false;

    this._purgeBayFreightAndCrew(pb);
    this._beginCaptainService(this.playerBay);
    return true;
  }

  /**
   * Dev: full reset of a neighbor pad (B1/B3) — cancels any in-flight
   * arrival/departure, purges that bay's staging freight + mechanic/forklift
   * claims, drops the old visitor + checklist, then immediately docks a
   * fresh modular ship (new seed/class/theme, locked at create) already
   * seated north — no slow arrival animation.
   * @param {number} bayIndex 0 (B1) or 2 (B3)
   * @returns {boolean} true if a pad existed at that index
   */
  rerollSidePadVisitor(bayIndex) {
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;

    const prevVisitorId = pad.visitorId;

    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    pad.service = null;
    pad.shipState = null;
    clearPadVisitor(pad);

    pad.padMk = this._rollVisitorPadMk();
    let visitorId = pickVisitorId(pad.padMk);
    if (visitorId === prevVisitorId) {
      const retry = pickVisitorId(pad.padMk);
      if (retry) visitorId = retry;
    }
    equipPadVisitor(pad, visitorId);
    this._finishVisitorArrive(pad);
    return true;
  }

  /**
   * Dev: cancel bay work and run a snappy elevator descent → ascent on B1/B3
   * so the transit motion is easy to preview. Keeps the current visitor when
   * present; otherwise equips one. Ship rides down and back up.
   * @param {number} bayIndex 0 (B1) or 2 (B3)
   */
  forceSidePadElevatorCycle(bayIndex) {
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;

    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    pad.service = null;
    pad.shipState = null;
    this.setDoorOpen(bayIndex, 0);

    if (!pad.visitorId) {
      pad.padMk = this._rollVisitorPadMk();
      equipPadVisitor(pad, pickVisitorId(pad.padMk));
    }

    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.padDrop = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    pad.padAngle = FACE_NORTH;
    pad.shipAngle = FACE_NORTH;
    clearVisitorThrusters(pad);
    this.beginOps(pad.bayIndex, 'elevator');
    // kind starts with "lower" so pad-rest / amber-elevator gates already apply
    pad.seq = { kind: 'lowerCycle', phase: 'sink', t: 0 };
    return true;
  }

  // —— Dev Bay Options (multi-bay force tools) ——

  /** @param {number} bayIndex */
  devRerollService(bayIndex) {
    if (this.isPlayerBay(bayIndex)) return this.rerollPlayerService();
    const pad = this._sidePadForBay(bayIndex);
    if (!pad?.visitorId) return false;
    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    pad.service = null;
    pad.shipState = null;
    this._beginCaptainService(pad);
    return true;
  }

  /**
   * Full door ingress/egress: occupied → depart, empty → arrive.
   * B2 uses a door open/close preview (does not leave hangar mode).
   */
  devForceDoor(bayIndex) {
    if (this.bayOffline[bayIndex]) return false;
    if (this.isPlayerBay(bayIndex)) return this._devForcePlayerDoor();
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    if (pad.visitorId) {
      pad.service = null;
      pad.shipState = null;
      this._startVisitorSeq(pad, 'depart');
    } else {
      this._startVisitorSeq(pad, 'arrive');
    }
    return true;
  }

  /**
   * Full elevator scene: occupied → descend and return empty;
   * empty → raise with a ship.
   */
  devForceElev(bayIndex) {
    if (this.bayOffline[bayIndex]) return false;
    if (this.isPlayerBay(bayIndex)) return this._devForcePlayerElev();
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    if (pad.visitorId) {
      pad.service = null;
      pad.shipState = null;
      this._startVisitorSeq(pad, 'lower');
    } else {
      this._startVisitorSeq(pad, 'raiseArrive');
    }
    return true;
  }

  /** Spin pad 360° with danger lane active (2.5D model check). */
  devForcePadSpin(bayIndex) {
    if (this.bayOffline[bayIndex]) return false;
    if (this.isPlayerBay(bayIndex)) {
      const pb = this.playerBayIndex;
      this.clearOps(pb);
      this.beginOps(pb, 'elevator');
      this._playerDevSeq = {
        kind: 'padSpin',
        t: 0,
        startAngle: this.playerPadAngle || FACE_NORTH,
        duration: 2.4,
      };
      return true;
    }
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    this.clearOps(bayIndex);
    this.beginOps(bayIndex, 'elevator');
    pad.seq = {
      kind: 'padSpin',
      phase: 'spin',
      t: 0,
      startAngle: pad.padAngle || FACE_NORTH,
      duration: 2.4,
    };
    return true;
  }

  /** Instant empty (no ship) — clears visitor / vacates player bay. */
  devForceEmpty(bayIndex) {
    if (this.isPlayerBay(bayIndex)) {
      const pb = this.playerBayIndex;
      this.clearOps(pb);
      this._playerDevSeq = null;
      this.playerPadOccupied = false;
      this.playerPadDrop = 0;
      this.playerArrivalPending = false;
      this.playerBay.service = null;
      this.playerBay.shipState = null;
      this.playerBay.visitorId = null;
      this._purgeBayFreightAndCrew(pb);
      this.bayClearing[pb] = false;
      this.clearOps(pb);
      this.setDoorOpen(pb, 0);
      this.playerPadAngle = FACE_SOUTH;
      return true;
    }
    const pad = this._sidePadForBay(bayIndex);
    if (!pad) return false;
    this.clearOps(bayIndex);
    this._purgeBayFreightAndCrew(bayIndex);
    this.bayClearing[bayIndex] = false;
    pad.seq = null;
    this._finishVisitorLeave(pad, { clearCargo: false });
    return true;
  }

  /** Instant occupy — seats a visitor (or restores player on player bay). */
  devForceOccupy(bayIndex) {
    if (this.isPlayerBay(bayIndex)) {
      const pb = this.playerBayIndex;
      this.clearOps(pb);
      this._playerDevSeq = null;
      this.playerPadOccupied = true;
      this.playerPadDrop = 0;
      this.playerArrivalPending = false;
      this.playerBay.visitorId = 'player';
      this.playerPadAngle = FACE_NORTH;
      this.setDoorOpen(pb, 0);
      this.bayClearing[pb] = false;
      this._purgeBayFreightAndCrew(pb);
      this._beginCaptainService(this.playerBay);
      return true;
    }
    return this.rerollSidePadVisitor(bayIndex);
  }

  /** Toggle bay offline for sim (no auto traffic / service). */
  devSetBayOffline(bayIndex, offline) {
    this.bayOffline[bayIndex] = !!offline;
    if (offline) {
      this.clearOps(bayIndex);
      if (this.isPlayerBay(bayIndex)) {
        this._playerDevSeq = null;
      } else {
        const pad = this._sidePadForBay(bayIndex);
        if (pad) pad.seq = null;
      }
      this.setDoorOpen(bayIndex, 0);
      this.bayLaneMode[bayIndex] = 'idle';
      this.padRimMode[bayIndex] = 'off';
    }
    return true;
  }

  /**
   * Reset bay to default warm state.
   * Player bay restores player ship + fresh captain service.
   */
  devResetBay(bayIndex) {
    this.bayOffline[bayIndex] = false;
    this.bayClearing[bayIndex] = false;
    this.clearOps(bayIndex);
    this.setDoorOpen(bayIndex, 0);
    this.bayLaneMode[bayIndex] = 'idle';
    this.padRimMode[bayIndex] = 'off';

    if (this.isPlayerBay(bayIndex)) {
      const pb = this.playerBayIndex;
      this._playerDevSeq = null;
      this.playerPadOccupied = true;
      this.playerPadDrop = 0;
      this.playerArrivalPending = false;
      this.playerPadAngle = FACE_NORTH;
      this.playerBay.visitorId = 'player';
      this.playerBay.service = null;
      this.playerBay.shipState = null;
      if (this._playerShip) {
        this._playerShip.shipDef = createPlayerStarter();
        this._playerShip.miningLaserRelAngle = 0;
        this._playerShip.miningLaserFiring = false;
        this._playerShip.angle = FACE_NORTH;
        this._playerShip.turretAngle = FACE_NORTH;
      }
      this._purgeBayFreightAndCrew(pb);
      this._beginCaptainService(this.playerBay);
      return true;
    }

    return this.rerollSidePadVisitor(bayIndex);
  }

  _devForcePlayerDoor() {
    const pb = this.playerBayIndex;
    this.clearOps(pb);
    this._playerDevSeq = null;
    this._resetPlayerFlight();
    this._clearPlayerShipThrusters();
    const occupied = !!this.playerPadOccupied;
    if (occupied) {
      this.playerPadAngle = FACE_NORTH;
      this.playerFlight.shipAngle = FACE_NORTH;
      this.beginOps(pb, 'departing');
      this._playerDevSeq = { kind: 'doorDepart', t: 0, phase: 'warn' };
    } else {
      this.playerPadAngle = FACE_SOUTH;
      this.playerFlight.shipY = HANGAR.LAND_START_Y;
      this.playerFlight.shipHover = 1;
      this.playerFlight.shipScale = HANGAR.VISITOR_HOVER_SCALE;
      this.playerFlight.shipAngle = FACE_SOUTH;
      this.playerFlight.shipVy = 0;
      this.playerBay.visitorId = 'player';
      this.beginOps(pb, 'incoming');
      this._playerDevSeq = { kind: 'doorArrive', t: 0, phase: 'warn' };
    }
    return true;
  }

  _devForcePlayerElev() {
    const pb = this.playerBayIndex;
    this.clearOps(pb);
    this._playerDevSeq = null;
    this._resetPlayerFlight();
    this._clearPlayerShipThrusters();
    this.beginOps(pb, 'elevator');
    if (this.playerPadOccupied) {
      this.playerPadAngle = FACE_NORTH;
      this.playerFlight.shipAngle = FACE_NORTH;
      this._playerDevSeq = { kind: 'elevLeave', t: 0, phase: 'warn' };
    } else {
      // Empty pad: sink first, then rise with ship (no snap-to-bottom)
      this.playerPadAngle = FACE_SOUTH;
      this.playerPadDrop = 0;
      this._playerDevSeq = { kind: 'elevArrive', t: 0, phase: 'warn' };
    }
    return true;
  }

  _tickPlayerDevSeq(dt) {
    const s = this._playerDevSeq;
    if (!s) return;
    const pb = this.playerBayIndex;
    s.t += dt;
    this.tickEvac(pb);

    if (s.kind === 'padSpin') {
      const u = Math.min(1, s.t / (s.duration || 2.4));
      this.playerPadAngle = (s.startAngle || FACE_NORTH) + u * Math.PI * 2;
      if (u >= 1) {
        this.playerPadAngle = FACE_NORTH;
        this.clearOps(pb);
        this._playerDevSeq = null;
      }
      return;
    }

    if (s.kind === 'doorDepart') {
      this._tickPlayerDoorDepart(s, dt, pb);
      return;
    }
    if (s.kind === 'doorArrive') {
      this._tickPlayerDoorArrive(s, dt, pb);
      return;
    }
    if (s.kind === 'elevLeave') {
      this._tickPlayerElevLeave(s, dt, pb);
      return;
    }
    if (s.kind === 'elevArrive') {
      this._tickPlayerElevArrive(s, dt, pb);
    }
  }

  _tickPlayerDoorDepart(s, dt, pb) {
    const f = this.playerFlight;
    switch (s.phase) {
      case 'warn':
        this._clearPlayerShipThrusters();
        if (s.t > 1.2) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this._clearPlayerShipThrusters();
        if (this.isBayDangerClear(pb) || s.t > 3.2) {
          s.phase = 'doors';
          s.t = 0;
          this.setBeacon(pb, 'open');
        }
        break;
      case 'doors':
        this._clearPlayerShipThrusters();
        this.setDoorOpen(pb, Math.min(1, s.t / HANGAR.VISITOR_DOOR_TIME));
        if (s.t > HANGAR.VISITOR_DOOR_TIME + 0.15) {
          s.phase = 'lift';
          s.t = 0;
        }
        break;
      case 'lift': {
        const liftT = HANGAR.VISITOR_LIFT_TIME;
        const u = smoothstep(s.t / liftT);
        f.shipHover = u;
        f.shipScale = 1 + u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst =
          s.t < liftT * 0.72
            ? HANGAR.HOVER_BURST_POWER
            : HANGAR.HOVER_BURST_POWER *
              Math.max(0, 1 - (s.t - liftT * 0.72) / (liftT * 0.28));
        if (burst > 0.02) this._firePlayerManeuverBurst(burst);
        else this._clearPlayerShipThrusters();
        f.shipAngle = FACE_NORTH;
        this.playerPadAngle = FACE_NORTH;
        if (s.t >= liftT) {
          f.shipHover = 1;
          f.shipScale = HANGAR.VISITOR_HOVER_SCALE;
          s.phase = 'thrust';
          s.t = 0;
          f.shipVy = 0;
        }
        break;
      }
      case 'thrust': {
        const power = Math.min(1.15, 0.4 + s.t * 0.55);
        this._firePlayerEngine(power);
        f.shipVy -= HANGAR.VISITOR_THRUST_ACCEL * dt;
        f.shipY += f.shipVy * dt;
        f.shipHover = 1;
        f.shipScale = HANGAR.VISITOR_HOVER_SCALE;
        f.shipAngle = FACE_NORTH;
        this.playerPadAngle = FACE_NORTH;
        if (f.shipY < HANGAR.LAUNCH_EXIT_Y || s.t > 5) {
          s.phase = 'doorsClose';
          s.t = 0;
          this.playerPadOccupied = false;
          this.playerBay.visitorId = null;
          this.playerBay.service = null;
          this.playerBay.shipState = null;
          this._resetPlayerFlight();
          this._clearPlayerShipThrusters();
          this.setBeacon(pb, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pb, Math.max(0, 1 - s.t / 1.3));
        if (s.t > 1.35) {
          s.phase = 'turnEmpty';
          s.t = 0;
        }
        break;
      case 'turnEmpty': {
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        this.playerPadAngle = FACE_NORTH + (FACE_SOUTH - FACE_NORTH) * u;
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          this.playerPadAngle = FACE_SOUTH;
          this.setDoorOpen(pb, 0);
          this.clearOps(pb);
          this._playerDevSeq = null;
          this._resetPlayerFlight();
        }
        break;
      }
      default:
        break;
    }
  }

  _tickPlayerDoorArrive(s, dt, pb) {
    const f = this.playerFlight;
    switch (s.phase) {
      case 'warn':
        this._clearPlayerShipThrusters();
        if (s.t > 1.2) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this._clearPlayerShipThrusters();
        if (this.isBayDangerClear(pb) || s.t > 3.2) {
          s.phase = 'doors';
          s.t = 0;
        }
        break;
      case 'doors':
        this._clearPlayerShipThrusters();
        this.setDoorOpen(pb, Math.min(1, s.t / HANGAR.VISITOR_DOOR_TIME));
        if (s.t > HANGAR.VISITOR_DOOR_TIME + 0.15) {
          // fromSpace: hold doors open until the captain cuts to hangar —
          // don't seat the hull headlessly (that skipped the land cinematic).
          if (s.fromSpace) {
            s.phase = 'awaitIngress';
            s.t = 0;
            this.setDoorOpen(pb, 1);
            break;
          }
          s.phase = 'approach';
          s.t = 0;
          f.shipVy = HANGAR.VISITOR_APPROACH_SPEED;
          f.shipY = HANGAR.LAND_START_Y;
          f.shipHover = 1;
          f.shipScale = HANGAR.VISITOR_HOVER_SCALE;
          f.shipAngle = FACE_SOUTH;
          this.playerPadAngle = FACE_SOUTH;
          this.playerPadOccupied = true;
          this.playerBay.visitorId = 'player';
        }
        break;
      case 'awaitIngress':
        // Runway reservation prep only — visual approach starts in hangar mode
        this._clearPlayerShipThrusters();
        this.setDoorOpen(pb, 1);
        break;
      case 'approach': {
        if (f.shipY > -70) {
          this._firePlayerNoseBrake(0.9);
          f.shipVy = Math.max(12, f.shipVy - 90 * dt);
        } else {
          this._clearPlayerShipThrusters();
        }
        f.shipY += f.shipVy * dt;
        f.shipAngle = FACE_SOUTH;
        this.playerPadAngle = FACE_SOUTH;
        if (f.shipY > -6) {
          f.shipY = 0;
          f.shipVy = 0;
          s.phase = 'settle';
          s.t = 0;
        }
        break;
      }
      case 'settle': {
        const u = smoothstep(s.t / HANGAR.VISITOR_LIFT_TIME);
        f.shipHover = 1 - u;
        f.shipScale =
          HANGAR.VISITOR_HOVER_SCALE - u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst = s.t < 0.35 ? 0.95 : Math.max(0, 0.5 - (s.t - 0.35));
        if (burst > 0.02) this._firePlayerManeuverBurst(burst);
        else this._clearPlayerShipThrusters();
        f.shipAngle = FACE_SOUTH;
        this.playerPadAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_LIFT_TIME) {
          f.shipHover = 0;
          f.shipScale = 1;
          this._clearPlayerShipThrusters();
          s.phase = 'turn';
          s.t = 0;
        }
        break;
      }
      case 'turn': {
        this.setPadRim(pb, 'on');
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        const angle = FACE_SOUTH + (FACE_NORTH - FACE_SOUTH) * u;
        f.shipAngle = angle;
        this.playerPadAngle = angle;
        this._clearPlayerShipThrusters();
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          f.shipAngle = FACE_NORTH;
          this.playerPadAngle = FACE_NORTH;
          s.phase = 'doorsClose';
          s.t = 0;
          this.setBeacon(pb, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pb, Math.max(0, 1 - s.t / 1.3));
        if (s.t > 1.4) {
          this.setDoorOpen(pb, 0);
          this.clearOps(pb);
          this._playerDevSeq = null;
          this._resetPlayerFlight();
          this.playerPadOccupied = true;
          this.playerBay.visitorId = 'player';
          this.playerPadAngle = FACE_NORTH;
          this._spaceApproach[pb] = null;
          this._beginCaptainService(this.playerBay);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Elevator descent turntable: 180° while sinking (u 0→1, already smoothstepped).
   * Occupied leave: north → south. Empty arrive: south → north.
   * Rise keeps the final heading — no second turn.
   */
  _elevSinkTurn(fromAngle, u) {
    return normalizeAngle(fromAngle + u * Math.PI);
  }

  _tickPlayerElevLeave(s, dt, pb) {
    switch (s.phase) {
      case 'warn':
        this._clearPlayerShipThrusters();
        if (s.t > 1.0) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this._clearPlayerShipThrusters();
        if (this.isBayDangerClear(pb) || s.t > 3.0) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        this.playerPadDrop = u;
        const ang = this._elevSinkTurn(FACE_NORTH, u);
        this.playerPadAngle = ang;
        this.playerFlight.shipAngle = ang;
        this._clearPlayerShipThrusters();
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          // Pad+ship fully black before emptying occupancy
          s.phase = 'below';
          s.t = 0;
          this.playerPadDrop = 1;
          this.playerPadOccupied = false;
          this.playerBay.visitorId = null;
          this.playerBay.service = null;
          this.playerBay.shipState = null;
          this.playerPadAngle = FACE_SOUTH;
          this._resetPlayerFlight();
        }
        break;
      }
      case 'below':
        this.playerPadDrop = 1;
        this.playerPadAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME) {
          s.phase = 'riseEmpty';
          s.t = 0;
        }
        break;
      case 'riseEmpty': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        this.playerPadDrop = 1 - u;
        this.playerPadAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          this.playerPadDrop = 0;
          this.clearOps(pb);
          this._playerDevSeq = null;
        }
        break;
      }
      default:
        break;
    }
  }

  _tickPlayerElevArrive(s, dt, pb) {
    switch (s.phase) {
      case 'warn':
        this._clearPlayerShipThrusters();
        if (s.t > 0.9) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        this._clearPlayerShipThrusters();
        if (this.isBayDangerClear(pb) || s.t > 2.8) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        // Empty pad descends + 180° (south → north); rise keeps north
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        this.playerPadDrop = u;
        this.playerPadAngle = this._elevSinkTurn(FACE_SOUTH, u);
        this._clearPlayerShipThrusters();
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          this.playerPadDrop = 1;
          this.playerPadAngle = FACE_NORTH;
        }
        break;
      }
      case 'below':
        this.playerPadDrop = 1;
        this.playerPadAngle = FACE_NORTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME) {
          s.phase = 'rise';
          s.t = 0;
          this.playerPadOccupied = true;
          this.playerBay.visitorId = 'player';
          this.playerPadAngle = FACE_NORTH;
          this.playerFlight.shipAngle = FACE_NORTH;
        }
        break;
      case 'rise': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        this.playerPadDrop = 1 - u;
        this.playerPadOccupied = true;
        this.playerBay.visitorId = 'player';
        this.playerPadAngle = FACE_NORTH;
        this.playerFlight.shipAngle = FACE_NORTH;
        this._clearPlayerShipThrusters();
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          this.playerPadDrop = 0;
          this.clearOps(pb);
          this._playerDevSeq = null;
          this._resetPlayerFlight();
          this._beginCaptainService(this.playerBay);
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Clear all staging piles, floor drops, and in-transit freight for a bay;
   * park that bay's mechanics and any forklifts/crane jobs touching it.
   */
  _purgeBayFreightAndCrew(bay) {
    for (const p of this.piles) {
      if (p.bay === bay) p.items = [];
    }
    this.floorDrops = this.floorDrops.filter((d) => {
      if (bayIndexFromX(d.x) === bay) return false;
      if (d.cargo?.serviceBay === bay) return false;
      return true;
    });

    for (const npc of this.npcs) {
      if (!npc.alive) continue;

      if (npc.kind === 'mechanic' && (npc.homeBay ?? npc.bay) === bay) {
        npc.mechPhase = null;
        npc.targetSlot = null;
        npc._mechLift = null;
        npc.mechHandT = 0;
        npc.cargo = null;
        npc.hullTarget = null;
        npc.targetPile = null;
        npc.lingerPile = null;
        npc.stripCategory = null;
        npc.stripHardpointKey = null;
        npc.workHardpointKey = null;
        npc.tripsLeft = 0;
        this._clearBoardProgress(npc);
        this._clearTaskClaim(npc);
        this._parkMechanicIdle(npc);
        continue;
      }

      if (npc.kind === 'forklift') {
        const touches =
          npc.cargo?.serviceBay === bay ||
          npc._fetchBay === bay ||
          npc._claimBay === bay ||
          npc.targetPile?.bay === bay ||
          npc.lingerPile?.bay === bay;
        if (!touches) continue;
        npc.cargo = null;
        npc._fetchInbound = false;
        npc._fetchBay = null;
        npc._fetchItemId = null;
        npc.targetPile = null;
        npc.lingerPile = null;
        npc.targetSlot = null;
        npc.forkPhase = null;
        npc._forkWorkT = 0;
        npc._mechLift = null;
        this._clearTaskClaim(npc);
        this._parkForkliftAtHub(npc);
      }
    }

    if (this.crane) {
      const c = this.crane;
      const carriedHere = c.carried?.serviceBay === bay;
      const touches =
        carriedHere ||
        c.pickup?.bay === bay ||
        c.dropoff?.bay === bay ||
        (c.pickup?.isFloorDrop && bayIndexFromX(c.pickup.x) === bay);
      if (carriedHere) c.carried = null;
      if (touches) {
        c.pickup = null;
        c.dropoff = null;
        c.pause = 0;
        this._applyCraneJob(c, this._pickCraneJob());
      }
    }
  }

  /**
   * Pad-Mk tier matching the player's current ship (Standard → Mk2, etc.),
   * clamped to Mk2 — Jennings has no Mk3 bay yet, so a Heavy-flying player
   * still gets Mk1/Mk2-scaled neighbors rather than nothing.
   */
  _playerPadMk() {
    const group = shipDefSwapGroup(this._playerShip?.shipDef);
    return Math.min(2, padMkForSwapGroup(group));
  }

  /** Fresh B1/B3 visitor padMk — mostly peer-sized to the player, sometimes smaller. */
  _rollVisitorPadMk() {
    return rollVisitorPadMk(this._playerPadMk());
  }

  /** Modular loadout for a bay — player Ship.shipDef or visitor pad.shipDef */
  _shipDefForBay(bay) {
    if (this.isPlayerBay(bay)) {
      const def = this._playerShip?.shipDef;
      if (def) return def;
      if (this._playerShip && !this._playerShip.shipDef) {
        this._playerShip.shipDef = createPlayerStarter();
      }
      return this._playerShip?.shipDef || null;
    }
    const pad = this._servicePad(bay);
    return pad?.shipDef || null;
  }

  _ensurePadShipDef(pad) {
    if (!pad) return null;
    if (this.isPlayerBay(pad.bayIndex)) {
      return this._shipDefForBay(this.playerBayIndex);
    }
    // Locked for the visit lifetime — never re-roll cosmetics while docked.
    if (pad.shipDef) return pad.shipDef;
    if (!pad.visitorId || pad.visitorId === 'player') return null;
    pad.shipDef = createVisitorShipDef(pad.visitorId);
    if (!pad.thrusters) pad.thrusters = makeVisitorThrusters(pad.shipDef);
    return pad.shipDef;
  }

  /**
   * Install catalog freight onto its target hardpoint (or an empty matching socket).
   * Turret mounts require a crane (locked choreography — no craneless hand-swap).
   * @returns {boolean} false if target socket still occupied (caller should strip first)
   */
  _installCatalogPart(bay, cargo) {
    const def = this._shipDefForBay(bay);
    if (!def || !cargo) return true; // nothing to bind
    let itemId = cargo.catalogItemId;
    const cat =
      cargo.catalogCategory ||
      categoryFromFreightLabel(cargo.label) ||
      getItem(itemId)?.category;
    if (!cat) return true;
    if (
      isTurretMountCategory(cat, cargo.shape) &&
      !canPerformTurretCraneStage(this.hangarConfig)
    ) {
      return true; // block swap — leave freight staged
    }

    const mounts = def.resolveMounts();
    const targetKey = cargo.targetHardpointKey;
    if (targetKey) {
      const m = mounts[targetKey];
      if (!m) return true; // no such socket — drop the request cleanly
      if (m.item) return false; // exact hardpoint occupied
      if (!itemId) {
        itemId = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
          mk: m.socket.mk || 2,
          playerEquipable: true,
        });
      }
      if (!itemId) return true;
      const result = equipHardpoint(def, targetKey, itemId);
      if (!result.ok && result.reason === 'mk_too_high') {
        const fallback = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
          mk: m.socket.mk || 2,
          playerEquipable: true,
        });
        if (fallback) return equipHardpoint(def, targetKey, fallback).ok;
      }
      return result.ok;
    }

    const empties = emptySocketsForCategory(def, cat);
    if (!empties.length) {
      const hasSocket = Object.values(mounts).some(
        (m) => m.socket.category === cat
      );
      return !hasSocket;
    }
    const slot = empties[0];
    const maxMk = slot.socket.mk || 2;
    if (!itemId) {
      itemId = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
        mk: maxMk,
        playerEquipable: true,
      });
    }
    let item = getItem(itemId);
    if (item && item.mk > maxMk) {
      itemId = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
        mk: maxMk,
        playerEquipable: true,
      });
      item = getItem(itemId);
    }
    if (!itemId) return true;
    const result = equipHardpoint(def, slot.key, itemId);
    if (!result.ok && result.reason === 'mk_too_high') {
      const fallback = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
        mk: maxMk,
        playerEquipable: true,
      });
      if (fallback) return equipHardpoint(def, slot.key, fallback).ok;
    }
    return result.ok;
  }

  /**
   * Exact hardpoint to strip — prefer mechanic hint, else staged inbound targets.
   */
  _stripHardpointForBay(bay, preferKey = null) {
    if (preferKey) return preferKey;
    const def = this._shipDefForBay(bay);
    if (!def) return null;
    const upIn = this._bayPile(bay, 'in', ROW.N);
    for (const c of upIn?.items || []) {
      if (c.family !== 'upgrade' || !c.targetHardpointKey) continue;
      if (needsStripBeforeInstallKey(def, c.targetHardpointKey)) {
        return c.targetHardpointKey;
      }
    }
    return null;
  }

  /**
   * Category to strip for a bay — prefer mechanic hint, else staged inbound
   * parts that still need a free socket (legacy category path).
   */
  _stripCategoryForBay(bay, preferCategory = null) {
    if (preferCategory) return preferCategory;
    const def = this._shipDefForBay(bay);
    if (!def) return null;
    const upIn = this._bayPile(bay, 'in', ROW.N);
    for (const c of upIn?.items || []) {
      if (c.family !== 'upgrade') continue;
      if (c.targetHardpointKey) continue; // handled by exact-key path
      const cat =
        c.catalogCategory ||
        categoryFromFreightLabel(c.label) ||
        getItem(c.catalogItemId)?.category;
      if (cat && needsStripBeforeInstall(def, cat)) return cat;
    }
    return null;
  }

  /** Unequip a hardpoint and return catalog freight cargo (or null). */
  _stripCatalogPart(bay, preferCategory = null, preferKey = null) {
    const def = this._shipDefForBay(bay);
    if (!def) return makeCargo(pick(UPGRADE_KINDS));
    const keyHint = this._stripHardpointForBay(bay, preferKey);
    const cat = keyHint ? null : this._stripCategoryForBay(bay, preferCategory);
    const key = pickStripKey(def, cat, keyHint);
    if (!key) return null;
    const mounts = def.resolveMounts?.() || {};
    const socketCat = mounts[key]?.socket?.category || mounts[key]?.item?.category;
    const itemPeek = getItem(mounts[key]?.item?.id || mounts[key]?.item);
    if (
      isTurretMountCategory(socketCat || itemPeek?.category, itemPeek?.shape) &&
      !canPerformTurretCraneStage(this.hangarConfig)
    ) {
      return null;
    }
    const itemId = unequipHardpoint(def, key);
    if (!itemId) return null;
    const cargo = makeCatalogUpgradeCargo(itemId);
    cargo.strippedFromKey = key;
    return cargo;
  }

  /**
   * Exterior pad hull restore — clears scar ceiling (crew or player; tools assumed).
   * @param {object} [ship]
   */
  exteriorHullRestore(ship = this._playerShip) {
    if (!ship) return null;
    ensureVesselSimState(ship);
    return applyHullHeal(ship, 1, 'exterior');
  }

  /** Roll need meters + captain checklist (visitors + interim B2 ambient). */
  _beginCaptainService(pad) {
    if (!pad?.visitorId) return;
    const shipDef = this._ensurePadShipDef(pad);
    const cargoMk = cargoMkForVisitor(pad.visitorId, pad.shipDef);
    const bias = visitorServiceBias(pad.visitorId);
    const ammoBase = rand(0.05, 1);
    const cargoSpace = rand(0.05, 1);
    const fuel = rand(0.05, 1);
    const hull = rand(0.05, 1);
    const bullets = Math.max(0.05, Math.min(1, ammoBase + rand(-0.12, 0.12)));
    const shells = Math.max(0.05, Math.min(1, ammoBase + rand(-0.12, 0.12)));
    const cargoHold = packCargoHold(cargoMk, cargoSpace);
    const shipState = {
      fuel,
      hull,
      bullets,
      shells,
      ammo: Math.min(bullets, shells),
      cargoSpace: cargoMk > 0 ? cargoSpaceFromHold(cargoHold) : 1,
      // Display-only Mk stubs (1–3); real component tiers TBD later
      hullMk: randInt(1, 3),
      fuelMk: randInt(1, 3),
      bulletsMk: randInt(1, 3),
      shellsMk: randInt(1, 3),
      cargoMk,
      cargoHold,
      _svcStart: { fuel, hull, bullets, shells },
    };
    pad.shipState = shipState;
    const items = [];
    const push = (type, extra = {}) => {
      items.push({
        id: `svc${_serviceSeq++}`,
        type,
        status: 'pending',
        kindLabel: null,
        cargoId: null,
        ...extra,
      });
    };
    const pushN = (n, type, extra = {}) => {
      for (let i = 0; i < n; i++) push(type, extra);
    };

    pushN(meterServiceUnits(shipState.fuel, bias.fuel), 'refuel', {
      kindLabel: 'FUEL',
      priority: 2,
    });
    {
      const hullN = hullRepairPipCount(shipState.hull, bias.hull);
      for (let i = 0; i < hullN; i++) {
        push('repair', { priority: 3, healAmt: hullPipHealAmount() });
      }
    }
    pushN(meterServiceUnits(shipState.bullets, bias.ammo), 'reloadBullets', {
      kindLabel: 'BULLETS',
      priority: 2,
    });
    pushN(meterServiceUnits(shipState.shells, bias.ammo), 'reloadShells', {
      kindLabel: 'SHELLS',
      priority: 2,
    });

    // Cargo: 1 load/unload = 1 slot. Unloads before loads (priority + free-after-unload cap).
    // Empty hold → no unload. Max unloads = filled at landing; max loads = free after those unloads.
    if (cargoMk > 0 && cargoHold?.slots) {
      let used = 0;
      for (const c of cargoHold.cells || []) used += (c.w || 1) * (c.h || 1);
      const freeSlots = Math.max(0, cargoHold.slots - used);
      const filledSlots = used;
      const unloadN =
        filledSlots <= 0
          ? 0
          : Math.min(
              filledSlots,
              cargoServiceUnits(filledSlots, filledSlots / cargoHold.slots, bias.cargo)
            );
      const freeAfterUnload = freeSlots + unloadN;
      const loadN =
        freeAfterUnload <= 0
          ? 0
          : Math.min(
              freeAfterUnload,
              cargoServiceUnits(
                freeAfterUnload,
                freeAfterUnload / cargoHold.slots,
                bias.cargo
              )
            );
      pushN(unloadN, 'unloadCargo', { priority: 1 });
      for (let i = 0; i < loadN; i++) {
        push('loadCargo', { kindLabel: 'CRATE', priority: 2 });
      }
    }

    // Upgrades: exact hardpoint + matching catalog item (forklift fetches that item)
    const upgradeCount = (Math.random() * 3) | 0; // 0–2
    const usedHardpoints = new Set();
    for (let i = 0; i < upgradeCount; i++) {
      const req = pickUpgradeInstallRequest(shipDef, {
        excludeKeys: [...usedHardpoints],
      });
      if (!req) break;
      usedHardpoints.add(req.hardpointKey);
      push('upgrade', {
        kindLabel: req.kindLabel,
        boardLabel: req.boardLabel,
        catalogItemId: req.catalogItemId,
        catalogCategory: req.catalogCategory,
        targetHardpointKey: req.hardpointKey,
        priority: 2,
      });
    }

    const isPlayer = this.isPlayerBay(pad.bayIndex);
    if (!items.length) {
      if (!isPlayer) push('elevatorTransfer', { priority: 0 });
    }

    items.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
    pad.service = {
      items,
      phase: 'boardReveal',
      reveal: this._createBoardReveal(items),
      settleT: 0,
      settleMax: 0,
      dwellT: 0,
      dwellMax: rand(HANGAR.VISITOR_SERVICE_DWELL_MIN, HANGAR.VISITOR_SERVICE_DWELL_MAX),
      rerollT: 0,
      rerollMax: rand(
        HANGAR.PLAYER_SERVICE_REROLL_MIN,
        HANGAR.PLAYER_SERVICE_REROLL_MAX
      ),
      elevatorOnly: items.length === 1 && items[0].type === 'elevatorTransfer',
    };
  }

  /** Pre-scan → stats → cargo → captain-pick pip order for the service board. */
  _createBoardReveal(items) {
    const work = (items || []).filter((it) => it.type !== 'elevatorTransfer');
    const typeById = new Map(work.map((it) => [it.id, it.type]));
    const revealOrder = shuffleInPlace(work.map((it) => it.id));
    return {
      stage: 'preScan',
      t: 0,
      scanT: 0,
      statsShown: 0,
      cargoProgress: 0,
      cargoOn: false,
      shownIds: new Set(),
      revealOrder,
      pipIndex: 0,
      pipDelays: pipRevealDelays(revealOrder, typeById),
      pipWait: 0,
      gapT: 0,
      gapMax: Math.random() * HANGAR.BOARD_REVEAL_PIP_GAP_MAX,
    };
  }

  /** True while corner scanners + ship beams are live (preScan through post-cargo tail). */
  _boardScanLive(reveal) {
    if (!reveal) return false;
    return (
      reveal.stage === 'preScan' ||
      reveal.stage === 'stats' ||
      reveal.stage === 'cargo' ||
      reveal.stage === 'postScan'
    );
  }

  /** Intro board-reveal scan or post-service final scan. */
  _padBoardScanActive(pad) {
    const svc = pad?.service;
    if (!svc) return false;
    if (svc.phase === 'finalScan') return true;
    if (svc.phase === 'boardReveal') return this._boardScanLive(svc.reveal);
    return false;
  }

  /** 0–1 intensity: fade in on preScan, hold through cargo, fade out on postScan tail. */
  _boardScanIntensity(reveal) {
    if (!this._boardScanLive(reveal)) return 0;
    if (reveal.stage === 'preScan') {
      return Math.min(1, (reveal.t || 0) / 0.14);
    }
    if (reveal.stage === 'stats' || reveal.stage === 'cargo') return 1;
    const rem = HANGAR.BOARD_REVEAL_SCAN_TAIL_SEC - (reveal.t || 0);
    return Math.max(0, Math.min(1, rem / 0.22));
  }

  /** Fast completion-scan intensity (~1s total with short fade in/out). */
  _finalScanIntensity(svc) {
    const dur = HANGAR.BOARD_FINAL_SCAN_SEC;
    const t = svc?.finalScanT || 0;
    if (t < 0.1) return t / 0.1;
    if (t > dur - 0.12) return Math.max(0, (dur - t) / 0.12);
    return 1;
  }

  /** scanT driver for beam animation (intro reveal or final scan). */
  _padBoardScanClock(pad) {
    const svc = pad?.service;
    if (!svc) return 0;
    // Same laser sweep rate as the intro pass; finalScan just ends sooner (~1s)
    if (svc.phase === 'finalScan') return svc.finalScanT || 0;
    return svc.reveal?.scanT || 0;
  }

  _padBoardScanAmp(pad) {
    const svc = pad?.service;
    if (!svc) return 0;
    if (svc.phase === 'finalScan') return this._finalScanIntensity(svc);
    if (svc.phase === 'boardReveal') return this._boardScanIntensity(svc.reveal);
    return 0;
  }

  _tickBoardReveal(svc, dt) {
    const r = svc.reveal;
    if (!r || r.stage === 'done') return;

    if (this._boardScanLive(r)) r.scanT = (r.scanT || 0) + dt;

    if (r.stage === 'preScan') {
      r.t += dt;
      if (r.t >= HANGAR.BOARD_REVEAL_PRESCAN_SEC) {
        r.stage = 'stats';
        r.t = 0;
      }
      return;
    }

    if (r.stage === 'stats') {
      r.t += dt;
      const step = HANGAR.BOARD_REVEAL_STATS_SEC / 4;
      r.statsShown = Math.min(4, Math.floor(r.t / step));
      if (r.t >= HANGAR.BOARD_REVEAL_STATS_SEC) {
        r.statsShown = 4;
        r.stage = 'cargo';
        r.t = 0;
        r.cargoProgress = 0;
      }
      return;
    }

    if (r.stage === 'cargo') {
      r.t += dt;
      r.cargoProgress = Math.min(1, r.t / HANGAR.BOARD_REVEAL_CARGO_SEC);
      r.cargoOn = true;
      if (r.t >= HANGAR.BOARD_REVEAL_CARGO_SEC) {
        r.cargoProgress = 1;
        r.stage = 'postScan';
        r.t = 0;
      }
      return;
    }

    if (r.stage === 'postScan') {
      r.t += dt;
      if (r.t >= HANGAR.BOARD_REVEAL_SCAN_TAIL_SEC) {
        if (!r.revealOrder.length) {
          r.stage = 'done';
        } else {
          r.stage = 'pipGap';
          r.gapT = 0;
        }
      }
      return;
    }

    if (r.stage === 'pipGap') {
      r.gapT += dt;
      if (r.gapT >= r.gapMax) {
        r.stage = 'pips';
        r.pipIndex = 0;
        r.pipWait = 0;
        // First pip appears after its delay (hesitation before first pick)
      }
      return;
    }

    if (r.stage === 'pips') {
      if (r.pipIndex >= r.revealOrder.length) {
        r.stage = 'done';
        return;
      }
      r.pipWait += dt;
      const need = r.pipDelays[r.pipIndex] ?? 0.4;
      if (r.pipWait >= need) {
        r.shownIds.add(r.revealOrder[r.pipIndex]);
        r.pipIndex += 1;
        r.pipWait = 0;
        if (r.pipIndex >= r.revealOrder.length) r.stage = 'done';
      }
    }
  }

  _sidePadService(bay) {
    return this._servicePad(bay)?.service || null;
  }

  _serviceNeedsStaging(pad) {
    if (!pad?.service || pad.service.phase !== 'active') return [];
    const unloadPending = pad.service.items.some(
      (it) => it.type === 'unloadCargo' && it.status !== 'done'
    );
    return pad.service.items.filter((it) => {
      if (it.status === 'done') return false;
      if (!SERVICE_STAGING_TYPES.includes(it.type)) return false;
      // Cargo loads wait until unloads finish (hold space + deck order)
      if (unloadPending && it.type === 'loadCargo') return false;
      return it.status === 'pending' || it.status === 'staging' || it.status === 'ready';
    });
  }

  /** Needs a fresh forklift bring-in (not already ordered / sitting on deck). */
  _serviceNeedsBringIn(pad) {
    return this._serviceNeedsStaging(pad).filter((it) => it.status === 'pending');
  }

  /**
   * Checklist freight matches only by serviceKey. Label-only ambient matches were
   * wrong for Load (CRATE): any hangar crate made the unit look already staged,
   * so forklifts never fetched hold cargo.
   */
  _cargoMatchesServiceItem(cargo, item, _bay = null) {
    if (!cargo || !item) return false;
    return cargo.serviceKey != null && cargo.serviceKey === item.id;
  }

  _findServiceCargoInWorld(item, bay) {
    const match = (c) => this._cargoMatchesServiceItem(c, item, bay);
    for (const p of this.piles) {
      if (bay != null && p.bay !== bay) continue;
      if (p.items.some(match)) return true;
    }
    if (this.floorDrops?.some((d) => match(d.cargo))) return true;
    for (const n of this.npcs) {
      if (!n.alive) continue;
      if (match(n.cargo) || match(n._forkLift?.cargo) || match(n._mechLift?.cargo)) {
        return true;
      }
    }
    if (match(this.crane?.carried)) return true;
    return false;
  }

  /** Claimed fetch / in-transit with no physical crate yet — still need a spawn. */
  _serviceItemNeedsSpawn(pad, item) {
    if (!pad || !item || item.status === 'done') return false;
    if (!SERVICE_STAGING_TYPES.includes(item.type)) return false;
    if (item.status !== 'pending' && item.status !== 'staging') return false;
    return !this._findServiceCargoInWorld(item, pad.bayIndex);
  }

  /** Re-open a staging slot that never got (or lost) its crate. */
  _reopenServiceItemIfOrphan(pad, itemId) {
    if (!pad?.service || itemId == null) return;
    const it = pad.service.items?.find((i) => i.id === itemId);
    if (!it || it.status === 'done' || it.status === 'pending') return;
    if (this._findServiceCargoInWorld(it, pad.bayIndex)) return;
    it.status = 'pending';
    it.cargoId = null;
  }

  _makeServiceInboundCargo(pad, preferItemId = null) {
    if (!pad?.service) return null;
    let it = null;
    if (preferItemId != null) {
      it = pad.service.items.find(
        (n) => n.id === preferItemId && this._serviceItemNeedsSpawn(pad, n)
      );
      // Preferred unit unavailable — do not steal another truck's checklist row
      if (!it) return null;
    } else {
      const needs = this._serviceNeedsBringIn(pad).filter((n) =>
        this._serviceItemNeedsSpawn(pad, n)
      );
      if (!needs.length) return null;
      it = pick(needs);
    }
    it.status = 'staging';
    let cargo;
    if (it.type === 'upgrade') {
      let itemId = it.catalogItemId;
      if (!itemId) {
        const cat =
          it.catalogCategory ||
          categoryFromFreightLabel(it.kindLabel) ||
          'smallTurret';
        const def = this._shipDefForBay(pad.bayIndex);
        itemId = pickCatalogItemId(shipDefSwapGroup(def) || 'standard', cat, {
          playerEquipable: true,
        });
      }
      cargo = itemId
        ? makeCatalogUpgradeCargo(itemId)
        : makeCargo(
            UPGRADE_KINDS.find((k) => k.label === it.kindLabel) || pick(UPGRADE_KINDS)
          );
      if (it.catalogCategory) cargo.catalogCategory = it.catalogCategory;
      if (it.targetHardpointKey) cargo.targetHardpointKey = it.targetHardpointKey;
      if (it.boardLabel) cargo.boardLabel = it.boardLabel;
      // Always bind the exact catalog id from the Install request
      if (it.catalogItemId) cargo.catalogItemId = it.catalogItemId;
    } else if (it.type === 'loadCargo' || it.kindLabel === 'CRATE') {
      cargo = makeCargo(pick(CRATE_VARIANTS));
    } else {
      const kind =
        HOLD_CARGO.find((k) => k.label === it.kindLabel) || pick(CRATE_VARIANTS);
      cargo = makeCargo(kind);
    }
    cargo.serviceKey = it.id;
    cargo.serviceBay = pad.bayIndex;
    it.cargoId = cargo.id;
    return cargo;
  }

  /** Prefer the crate this mech claimed; never steal a sibling's unit. */
  _takeServicePileCargo(pile, bay, job, npc = null) {
    if (!pile?.items?.length) return null;
    if (job === 'stageFerry') {
      const preferCargoId = npc?._claimCargoId ?? null;
      if (preferCargoId != null) {
        const idx = pile.items.findIndex((c) => c.id === preferCargoId);
        if (idx >= 0) return this._pileTakeAt(pile, idx);
      }
      const taken = this._claimedServiceKeys(npc);
      const idx = pile.items.findIndex((c) => {
        const tag = c.serviceKey != null ? c.serviceKey : `cargo:${c.id}`;
        return !taken.has(tag) && !taken.has(`cargo:${c.id}`);
      });
      if (idx >= 0) return this._pileTakeAt(pile, idx);
      return this._pilePop(pile);
    }
    const preferCargoId = npc?._claimCargoId ?? null;
    const preferKey = npc?._claimServiceItemId ?? npc?._activeServiceId ?? null;
    if (preferCargoId != null) {
      const idx = pile.items.findIndex((c) => c.id === preferCargoId);
      if (idx >= 0) return this._pileTakeAt(pile, idx);
    }
    if (preferKey != null && !String(preferKey).startsWith('cargo:')) {
      const idx = pile.items.findIndex((c) => c.serviceKey === preferKey);
      if (idx >= 0) return this._pileTakeAt(pile, idx);
    }
    const taken = this._claimedServiceKeys(npc);
    const svc = this._servicePad(bay)?.service;
    if (!svc || svc.phase !== 'active') {
      const idx = pile.items.findIndex((c) => {
        const tag = c.serviceKey != null ? c.serviceKey : `cargo:${c.id}`;
        return !taken.has(tag);
      });
      if (idx >= 0) return this._pileTakeAt(pile, idx);
      return null;
    }
    const wantTypes =
      job === 'installUpgrade'
        ? ['upgrade']
        : ['refuel', 'reloadBullets', 'reloadShells', 'loadCargo'];
    const pending = svc.items.filter(
      (it) =>
        wantTypes.includes(it.type) &&
        it.status !== 'done' &&
        !taken.has(it.id)
    );
    if (!pending.length) return null;
    const idx = pile.items.findIndex(
      (c) =>
        c.serviceKey != null && pending.some((it) => it.id === c.serviceKey)
    );
    if (idx < 0) return null;
    return this._pileTakeAt(pile, idx);
  }

  _completeLoadService(bay, cargo, job) {
    if (cargo?.serviceKey) {
      this._completeServiceKey(cargo.serviceKey, cargo);
      return;
    }
    if (job === 'installUpgrade') {
      this._completeServiceType(bay, 'upgrade', cargo);
      return;
    }
    if (cargo?.label === 'FUEL') this._completeServiceType(bay, 'refuel', cargo);
    else if (cargo?.label === 'BULLETS') {
      this._completeServiceType(bay, 'reloadBullets', cargo);
    } else if (cargo?.label === 'SHELLS') {
      this._completeServiceType(bay, 'reloadShells', cargo);
    } else if (cargo?.label === 'AMMO') {
      // Legacy label from older saves / warmups
      const pad = this._servicePad(bay);
      const item = pad?.service?.items?.find(
        (it) =>
          (it.type === 'reloadBullets' || it.type === 'reloadShells') &&
          it.status !== 'done'
      );
      if (item) this._completeServiceItem(pad, item, cargo);
    } else this._completeServiceType(bay, 'loadCargo', cargo);
  }

  _completeServiceItem(pad, item, cargo = null) {
    if (!item || item.status === 'done') return;
    item.status = 'done';
    item.cargoId = null;
    // Stay blue on the board until the mech walks away (`_settleActiveServicePip`)
    item.pipSettled = false;
    this._applyServiceToShipState(pad, item.type, cargo);
  }

  /** Partial / finalize board readouts when a checklist line finishes. */
  _applyServiceToShipState(pad, type, cargo = null) {
    const st = pad?.shipState;
    const svc = pad?.service;
    if (!st) return;

    const stepMeter = (key) => {
      const items = (svc?.items || []).filter((it) => it.type === type);
      const total = items.length || 1;
      const done = items.filter((it) => it.status === 'done').length;
      const start = st._svcStart?.[key] ?? st[key] ?? 0;
      if (done >= total) st[key] = 1;
      else st[key] = Math.min(1, start + ((1 - start) * done) / total);
    };

    if (type === 'refuel') {
      stepMeter('fuel');
    } else if (type === 'repair') {
      // Hull meter is driven by weld-spot sync (not a one-shot step snap)
      this._syncRepairHullMeter(pad);
    } else if (type === 'reloadBullets') {
      stepMeter('bullets');
      st.ammo = Math.min(st.bullets ?? 1, st.shells ?? 1);
    } else if (type === 'reloadShells') {
      stepMeter('shells');
      st.ammo = Math.min(st.bullets ?? 1, st.shells ?? 1);
    } else if (type === 'loadCargo' && st.cargoMk > 0) {
      if (!st.cargoHold) st.cargoHold = packCargoHold(st.cargoMk, st.cargoSpace ?? 1);
      // Board square inherits the 2.5D crate that just loaded
      addCargoHoldBlock(st.cargoHold, cargo);
      syncCargoSpace(st);
    } else if (type === 'unloadCargo' && st.cargoMk > 0) {
      if (!st.cargoHold) st.cargoHold = packCargoHold(st.cargoMk, st.cargoSpace ?? 0.5);
      removeCargoHoldBlock(st.cargoHold);
      syncCargoSpace(st);
    }
  }

  /**
   * Start lerping a board meter while a mechanic works the hull.
   * @param {'repair'|'refuel'|'reloadBullets'|'reloadShells'|'loadCargo'|'unloadCargo'} type
   */
  _beginBoardProgress(npc, type) {
    if (type === 'repair') {
      this._beginWeldBoardProgress(npc);
      return;
    }
    const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
    const pad = this._servicePad(bay);
    const st = pad?.shipState;
    if (!st || !type) {
      npc._boardProg = null;
      return;
    }
    let from = 0;
    let to = 1;
    const nextStepTo = (key, itemType) => {
      const items = (pad.service?.items || []).filter((it) => it.type === itemType);
      const total = items.length || 1;
      const done = items.filter((it) => it.status === 'done').length;
      const start = st._svcStart?.[key] ?? st[key] ?? 0;
      const cur = st[key] ?? start;
      const nextDone = Math.min(total, done + 1);
      from = cur;
      to = nextDone >= total ? 1 : start + ((1 - start) * nextDone) / total;
    };

    if (type === 'refuel') nextStepTo('fuel', 'refuel');
    else if (type === 'reloadBullets') nextStepTo('bullets', 'reloadBullets');
    else if (type === 'reloadShells') nextStepTo('shells', 'reloadShells');
    else if (type === 'loadCargo') {
      from = st.cargoSpace ?? 1;
      to = Math.max(0, from - 1 / Math.max(1, st.cargoHold?.slots || 6));
    } else if (type === 'unloadCargo') {
      from = st.cargoSpace ?? 0;
      to = Math.min(1, from + 1 / Math.max(1, st.cargoHold?.slots || 6));
    } else {
      npc._boardProg = null;
      return;
    }
    npc._boardProg = {
      type,
      from,
      to,
      dur: Math.max(0.25, npc.stateT || 1),
      bay,
    };
  }

  /**
   * One Hull pip spans several weld spots. Board hull % only advances during
   * a spot's spark animation — paused while walking between spots.
   */
  _beginWeldBoardProgress(npc) {
    const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
    const pad = this._servicePad(bay);
    const st = pad?.shipState;
    if (!st) {
      npc._boardProg = null;
      return;
    }
    const spots = Math.max(1, npc.weldSpotsTotal || npc.tripsLeft || 1);
    if (npc.weldSpotsTotal == null) npc.weldSpotsTotal = spots;
    if (npc.weldSpotIndex == null) npc.weldSpotIndex = 0;
    npc._boardProg = {
      type: 'repair',
      from: 0,
      to: 1,
      dur: Math.max(0.25, npc.stateT || 1),
      bay,
      weld: true,
    };
    this._syncRepairHullMeter(pad);
  }

  /**
   * Hull meter from completed Hull pips + in-progress weld-spot fractions.
   * Each pip heals its `healAmt` (18–22% of full health); walking between spots
   * holds the last completed spot fraction (no creep). Clamped at 100%.
   */
  _syncRepairHullMeter(pad) {
    const st = pad?.shipState;
    if (!st) return;
    const items = (pad.service?.items || []).filter((it) => it.type === 'repair');
    const start = st._svcStart?.hull ?? st.hull ?? 0;
    const healOf = (it) =>
      it?.healAmt != null
        ? it.healAmt
        : HULL_PIP_HEAL_AVG;

    let healed = 0;
    for (const it of items) {
      if (it.status === 'done') healed += healOf(it);
    }

    for (const n of this.npcs) {
      if (!n.alive || n.job !== 'weld') continue;
      const nBay = n.bay ?? n.homeBay;
      if (nBay !== pad.bayIndex) continue;
      const sid = n._activeServiceId ?? n._claimServiceItemId;
      if (sid == null || String(sid).startsWith('cargo:')) continue;
      const it = items.find((i) => i.id === sid);
      if (!it || it.status === 'done') continue;

      const spots = Math.max(1, n.weldSpotsTotal || 1);
      const i = Math.max(0, Math.min(spots, n.weldSpotIndex || 0));
      const prog = n._boardProg;
      let frac;
      if (prog?.type === 'repair' && prog.weld && n.state === 'workWeld') {
        const u = Math.min(1, Math.max(0, 1 - (n.stateT || 0) / (prog.dur || 1)));
        frac = (i + u) / spots;
      } else {
        // Between spots (or approaching): freeze at finished spot count
        frac = i / spots;
      }
      healed += healOf(it) * frac;
    }

    st.hull = Math.min(1, start + healed);
    // Exterior hangar repair clears scar ceiling when fully restored
    if (st.hull >= 0.999 && this.isPlayerBay(pad.bayIndex) && this._playerShip) {
      applyHullHeal(this._playerShip, 1, 'exterior');
    }
  }

  /** Drive board meters toward completion while work animates. */
  _tickBoardProgress(npc) {
    const prog = npc._boardProg;
    if (!prog) return;
    const pad = this._servicePad(prog.bay);
    const st = pad?.shipState;
    if (!st) return;
    if (prog.type === 'repair') {
      this._syncRepairHullMeter(pad);
      return;
    }
    const u = Math.min(1, Math.max(0, 1 - npc.stateT / prog.dur));
    const v = prog.from + (prog.to - prog.from) * u;
    if (prog.type === 'refuel') st.fuel = v;
    else if (prog.type === 'reloadBullets') {
      st.bullets = v;
      st.ammo = Math.min(st.bullets, st.shells ?? 1);
    } else if (prog.type === 'reloadShells') {
      st.shells = v;
      st.ammo = Math.min(st.bullets ?? 1, st.shells);
    } else if (prog.type === 'loadCargo' || prog.type === 'unloadCargo') {
      st.cargoSpace = v;
    }
  }

  _clearBoardProgress(npc) {
    npc._boardProg = null;
  }

  /** Infer which board meter a ship-side job should animate. */
  _boardProgressTypeForJob(npc) {
    if (npc.job === 'weld') return 'repair';
    if (npc.job === 'loadShip' && npc.cargo) {
      if (npc.cargo.label === 'FUEL') return 'refuel';
      if (npc.cargo.label === 'BULLETS' || npc.cargo.label === 'SHELLS' || npc.cargo.label === 'AMMO') {
        for (const pad of this._allServicePads()) {
          const item = pad.service?.items?.find((it) => it.id === npc.cargo.serviceKey);
          if (item?.type === 'reloadShells') return 'reloadShells';
          if (item?.type === 'reloadBullets') return 'reloadBullets';
        }
        if (npc.cargo.label === 'SHELLS') return 'reloadShells';
        return 'reloadBullets';
      }
      if (npc.cargo.family !== 'upgrade') return 'loadCargo';
    }
    if (npc.job === 'unloadShip') return 'unloadCargo';
    return null;
  }

  _completeServiceKey(serviceKey, cargo = null) {
    if (!serviceKey) return;
    for (const pad of this._allServicePads()) {
      const item = pad.service?.items?.find((it) => it.id === serviceKey);
      if (item) {
        this._completeServiceItem(pad, item, cargo);
        return;
      }
    }
  }

  _completeServiceType(bay, type, cargo = null) {
    const pad = this._servicePad(bay);
    const item = pad?.service?.items?.find(
      (it) => it.type === type && it.status !== 'done'
    );
    if (item) this._completeServiceItem(pad, item, cargo);
  }

  /** Player blew up staged freight — re-order the same checklist need. */
  _restageServiceCargo(cargo) {
    if (!cargo?.serviceKey) return;
    for (const pad of this._allServicePads()) {
      const item = pad.service?.items?.find((it) => it.id === cargo.serviceKey);
      if (!item || item.status === 'done') continue;
      item.status = 'pending';
      item.cargoId = null;
      // Don't yank a visitor that's already departing / lowering
      if (pad.seq) return;
      if (
        pad.service.phase === 'dwell' ||
        pad.service.phase === 'done' ||
        pad.service.phase === 'reroll'
      ) {
        pad.service.phase = 'active';
        pad.service.dwellT = 0;
        pad.service.rerollT = 0;
      }
      return;
    }
  }

  _serviceAllDone(pad) {
    const items = pad.service?.items;
    if (!items || !items.length) return true;
    return items.every((it) => it.status === 'done');
  }

  /**
   * Board pips ready for the completion scan: every real service unit is done
   * and the finishing mech has walked away (pip green), not merely status=done.
   */
  _servicePipsSettled(pad) {
    const items = (pad.service?.items || []).filter(
      (it) => it.type !== 'elevatorTransfer'
    );
    if (!items.length) return true;
    return items.every((it) => it.status === 'done' && it.pipSettled);
  }

  _forceSettleServicePips(pad) {
    for (const it of pad.service?.items || []) {
      if (it.status === 'done') it.pipSettled = true;
    }
  }

  _forkFetchClaimedForItem(itemId) {
    if (itemId == null) return false;
    return this.npcs.some(
      (n) => n.alive && n._fetchInbound && n._fetchItemId === itemId
    );
  }

  _syncServiceStaging(pad) {
    if (!pad.service || pad.service.phase !== 'active') return;
    for (const it of pad.service.items) {
      if (it.status === 'done' || it.type === 'repair' || it.type === 'unloadCargo') continue;
      if (!SERVICE_STAGING_TYPES.includes(it.type)) continue;
      const row = it.type === 'upgrade' ? ROW.N : ROW.M;
      const south = this._bayPile(pad.bayIndex, 'in', ROW.S);
      const dest = this._bayPile(pad.bayIndex, 'in', row);
      const match = (c) => this._cargoMatchesServiceItem(c, it, pad.bayIndex);
      const inWorld = this._findServiceCargoInWorld(it, pad.bayIndex);
      const fetchClaimed = this._forkFetchClaimedForItem(it.id);
      // Lost anywhere (including exported / wrong bay then hauled off) → re-order.
      // Keep staging while a forklift is still en route to spawn that crate.
      if (
        (it.status === 'staging' || it.status === 'ready' || it.status === 'active') &&
        !inWorld &&
        !fetchClaimed
      ) {
        it.status = 'pending';
        it.cargoId = null;
        continue;
      }
      if (dest?.items?.some(match)) {
        it.status = 'ready';
      } else if (south?.items?.some(match) || inWorld || fetchClaimed) {
        if (it.status === 'pending') it.status = 'staging';
      }
    }
  }

  /**
   * @param {{ exitOnComplete?: boolean }} opts
   *   Visitors exit after dwell. Player B2 rerolls after a long pause (player owns launch).
   */
  _updateCaptainService(pad, dt, { exitOnComplete = true } = {}) {
    const svc = pad.service;
    if (!svc || !pad.visitorId || pad.seq) return;

    if (svc.phase === 'boardReveal') {
      this._tickBoardReveal(svc, dt);
      if (svc.reveal?.stage !== 'done') return;
      const workItems = svc.items.filter((it) => it.type !== 'elevatorTransfer');
      if (svc.elevatorOnly || (!workItems.length && exitOnComplete)) {
        svc.items.forEach((it) => {
          it.status = 'done';
          it.pipSettled = true;
        });
        svc.phase = 'finalScan';
        svc.finalScanT = 0;
      } else if (!workItems.length) {
        // Player empty roll — board scanned, nothing ordered → wait then reroll
        svc.phase = 'reroll';
        svc.rerollT = 0;
        svc.rerollMax = rand(
          HANGAR.PLAYER_SERVICE_REROLL_MIN,
          HANGAR.PLAYER_SERVICE_REROLL_MAX
        );
      } else {
        svc.phase = 'active';
      }
      return;
    }

    // Legacy settle beat (warmup / mid-session leftovers)
    if (svc.phase === 'settle') {
      svc.settleT += dt;
      if (svc.settleT >= svc.settleMax) {
        if (svc.elevatorOnly) {
          svc.items.forEach((it) => {
            it.status = 'done';
            it.pipSettled = true;
          });
          svc.phase = 'finalScan';
          svc.finalScanT = 0;
        } else {
          svc.phase = 'active';
        }
      }
      return;
    }

    if (svc.phase === 'active') {
      this._syncServiceStaging(pad);
      if (this._serviceAllDone(pad)) {
        svc._allDoneT = (svc._allDoneT || 0) + dt;
        // Wait for finishing mechs to walk away (pips green) before the verify scan.
        // Failsafe: don't hold the bay forever if a settle was missed.
        if (
          this._servicePipsSettled(pad) ||
          svc._allDoneT >= HANGAR.VISITOR_PIP_SETTLE_FAILSAFE_SEC
        ) {
          this._forceSettleServicePips(pad);
          svc.phase = 'finalScan';
          svc.finalScanT = 0;
          svc._allDoneT = 0;
        }
      } else {
        svc._allDoneT = 0;
      }
      return;
    }

    if (svc.phase === 'finalScan') {
      svc.finalScanT = (svc.finalScanT || 0) + dt;
      if (svc.finalScanT < HANGAR.BOARD_FINAL_SCAN_SEC) return;
      // Board goes green after the verify pass, then a short depart beat
      this._forceSettleServicePips(pad);
      svc.phase = 'dwell';
      svc.dwellT = 0;
      svc.dwellMax = rand(
        HANGAR.VISITOR_SERVICE_DWELL_MIN,
        HANGAR.VISITOR_SERVICE_DWELL_MAX
      );
      return;
    }

    if (svc.phase === 'dwell') {
      svc.dwellT += dt;
      if (svc.dwellT < svc.dwellMax) return;
      if (exitOnComplete) {
        // Only leave once the board has finished (scan + green pips + short dwell)
        svc.phase = 'done';
        const forceElev = svc.elevatorOnly;
        const useElev =
          forceElev || Math.random() < HANGAR.VISITOR_ELEVATOR_CHANCE;
        this._startVisitorSeq(pad, useElev ? 'lower' : 'depart');
      } else {
        svc.phase = 'reroll';
        svc.rerollT = 0;
        svc.rerollMax = rand(
          HANGAR.PLAYER_SERVICE_REROLL_MIN,
          HANGAR.PLAYER_SERVICE_REROLL_MAX
        );
      }
      return;
    }

    if (svc.phase === 'reroll') {
      svc.rerollT += dt;
      if (svc.rerollT >= svc.rerollMax) this._beginCaptainService(pad);
    }
  }

  _updateVisitorService(pad, dt) {
    this._updateCaptainService(pad, dt, { exitOnComplete: true });
  }

  _updatePlayerBayService(dt) {
    if (!this.playerBay || this.playerArrivalPending) return;
    if (this.bayOffline[this.playerBayIndex] || !this.playerPadOccupied) return;
    if (this._playerDevSeq) return;
    // Launch / land / elevator ops — no board reveal or scan mid-sequence
    const pb = this.playerBayIndex;
    if (this._opsBays.has(pb)) return;
    const lane = this.bayLaneMode[pb];
    if (lane === 'departing' || lane === 'incoming' || lane === 'elevator') {
      return;
    }
    if (!this.playerBay.service) this._beginCaptainService(this.playerBay);
    this._updateCaptainService(this.playerBay, dt, { exitOnComplete: false });
  }

  _tickVisitorSeq(pad, dt) {
    const s = pad.seq;
    if (!s) return;
    s.t += dt;
    this.tickEvac(pad.bayIndex);

    if (s.kind === 'depart') this._tickVisitorDepart(pad, s, dt);
    else if (s.kind === 'arrive') this._tickVisitorArrive(pad, s, dt);
    else if (s.kind === 'lower') this._tickVisitorLower(pad, s, dt);
    else if (s.kind === 'lowerCycle') this._tickVisitorLowerCycle(pad, s, dt);
    else if (s.kind === 'raiseLaunch') this._tickVisitorRaiseLaunch(pad, s, dt);
    else if (s.kind === 'raiseArrive') this._tickVisitorRaiseArrive(pad, s, dt);
    else if (s.kind === 'padSpin') this._tickVisitorPadSpin(pad, s, dt);
  }

  _tickVisitorPadSpin(pad, s, _dt) {
    const u = Math.min(1, s.t / (s.duration || 2.4));
    pad.padAngle = (s.startAngle || FACE_NORTH) + u * Math.PI * 2;
    if (pad.visitorId) pad.shipAngle = pad.padAngle;
    if (u >= 1) {
      pad.padAngle = FACE_NORTH;
      if (pad.visitorId) pad.shipAngle = FACE_NORTH;
      pad.seq = null;
      this.clearOps(pad.bayIndex);
    }
  }

  _updateVisitorTraffic(dt) {
    for (const pad of this.sidePads) {
      if (pad.seq) {
        this._tickVisitorSeq(pad, dt);
        continue;
      }
      if (this.bayOffline[pad.bayIndex]) continue;
      if (this._opsBays.has(pad.bayIndex)) continue;
      if (this.bayClearing[pad.bayIndex]) {
        pad.cooldown = Math.max(pad.cooldown, 1.5);
        continue;
      }

      if (pad.visitorId) {
        if (!pad.service) this._beginCaptainService(pad);
        this._updateVisitorService(pad, dt);
        continue;
      }

      pad.cooldown -= dt;
      if (pad.cooldown > 0) continue;

      if (this._bayPileCargoCount(pad.bayIndex) > 0) {
        this._startBayClear(pad.bayIndex);
        pad.cooldown = 2;
        continue;
      }

      // Waiting on a space approach — keep the request alive, don't roll elevator
      if (this.preferExternalDoorTraffic && pad.wantSpaceArrival) {
        pad.cooldown = rand(
          HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MIN,
          HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MAX
        );
        continue;
      }

      // Empty bay: door arrive vs elevator raise
      if (Math.random() < HANGAR.VISITOR_EMPTY_ELEVATOR_CHANCE) {
        const kind =
          Math.random() < HANGAR.VISITOR_RAISE_LAUNCH_CHANCE
            ? 'raiseLaunch'
            : 'raiseArrive';
        this._startVisitorSeq(pad, kind);
      } else if (this.preferExternalDoorTraffic) {
        // Pilot is in space — request a runway approach instead of hangar-only arrive
        pad.wantSpaceArrival = true;
        pad.cooldown = rand(
          HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MIN,
          HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MAX
        );
      } else {
        this._startVisitorSeq(pad, 'arrive');
      }
    }
  }

  _startVisitorSeq(pad, kind) {
    pad.shipY = 0;
    pad.shipScale = 1;
    pad.shipHover = 0;
    pad.padDrop = 0;
    pad.shipVx = 0;
    pad.shipVy = 0;
    clearVisitorThrusters(pad);

    if (kind === 'arrive') {
      pad.padMk = this._rollVisitorPadMk();
      equipPadVisitor(pad, pickVisitorId(pad.padMk));
      pad.padAngle = FACE_SOUTH;
      pad.shipAngle = FACE_SOUTH;
      pad.shipY = HANGAR.LAND_START_Y;
      pad.shipHover = 1;
      pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
      pad.shipVy = 0;
      pad.service = null;
      pad.shipState = null;
      this.beginOps(pad.bayIndex, 'incoming');
      this.setDoorOpen(pad.bayIndex, 0);
      pad.seq = { kind, phase: 'warn', t: 0 };
    } else if (kind === 'depart') {
      pad.padAngle = FACE_NORTH;
      pad.shipAngle = FACE_NORTH;
      this.beginOps(pad.bayIndex, 'departing');
      pad.seq = { kind, phase: 'warn', t: 0 };
    } else if (kind === 'lower') {
      pad.padAngle = FACE_NORTH;
      pad.shipAngle = FACE_NORTH;
      this.beginOps(pad.bayIndex, 'elevator');
      pad.seq = { kind, phase: 'warn', t: 0 };
    } else if (kind === 'raiseLaunch' || kind === 'raiseArrive') {
      clearPadVisitor(pad);
      pad.service = null;
      pad.shipState = null;
      pad.padAngle = FACE_SOUTH;
      pad.shipAngle = FACE_SOUTH;
      this.beginOps(pad.bayIndex, 'elevator');
      pad.seq = { kind, phase: 'warn', t: 0 };
    }
  }

  _tickVisitorDepart(pad, s, dt) {
    switch (s.phase) {
      case 'warn':
        clearVisitorThrusters(pad);
        if (s.t > 1.2) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        clearVisitorThrusters(pad);
        if (this.isBayDangerClear(pad.bayIndex) || s.t > 3.2) {
          s.phase = 'doors';
          s.t = 0;
          this.setBeacon(pad.bayIndex, 'open');
        }
        break;
      case 'doors':
        clearVisitorThrusters(pad);
        this.setDoorOpen(pad.bayIndex, Math.min(1, s.t / HANGAR.VISITOR_DOOR_TIME));
        if (s.t > HANGAR.VISITOR_DOOR_TIME + 0.15) {
          s.phase = 'lift';
          s.t = 0;
        }
        break;
      case 'lift': {
        const liftT = HANGAR.VISITOR_LIFT_TIME;
        const u = smoothstep(s.t / liftT);
        pad.shipHover = u;
        pad.shipScale = 1 + u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst =
          s.t < liftT * 0.72
            ? HANGAR.HOVER_BURST_POWER
            : HANGAR.HOVER_BURST_POWER *
              Math.max(0, 1 - (s.t - liftT * 0.72) / (liftT * 0.28));
        if (burst > 0.02) this._fireVisitorManeuverBurst(pad, burst);
        else clearVisitorThrusters(pad);
        if (s.t >= liftT) {
          pad.shipHover = 1;
          pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
          s.phase = 'thrust';
          s.t = 0;
          pad.shipVy = 0;
        }
        break;
      }
      case 'thrust': {
        const power = Math.min(1.15, 0.4 + s.t * 0.55);
        this._fireVisitorEngine(pad, power);
        pad.shipVy -= HANGAR.VISITOR_THRUST_ACCEL * dt;
        pad.shipY += pad.shipVy * dt;
        pad.shipHover = 1;
        pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
        pad.shipAngle = FACE_NORTH;
        pad.padAngle = FACE_NORTH;
        if (pad.shipY < HANGAR.LAUNCH_EXIT_Y || s.t > 5) {
          s.phase = 'doorsClose';
          s.t = 0;
          clearPadVisitor(pad);
          pad.shipY = 0;
          pad.shipHover = 0;
          pad.shipScale = 1;
          pad.shipVy = 0;
          this.setBeacon(pad.bayIndex, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pad.bayIndex, Math.max(0, 1 - s.t / 1.3));
        if (s.t > 1.35) {
          s.phase = 'turnEmpty';
          s.t = 0;
        }
        break;
      case 'turnEmpty': {
        // Pad arrow north → south after departure
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        pad.padAngle = FACE_NORTH + (FACE_SOUTH - FACE_NORTH) * u;
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          pad.padAngle = FACE_SOUTH;
          this._finishVisitorLeave(pad);
        }
        break;
      }
      default:
        break;
    }
  }

  _tickVisitorArrive(pad, s, dt) {
    switch (s.phase) {
      case 'warn':
        clearVisitorThrusters(pad);
        if (s.t > 1.2) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        clearVisitorThrusters(pad);
        if (this.isBayDangerClear(pad.bayIndex) || s.t > 3.2) {
          s.phase = 'doors';
          s.t = 0;
        }
        break;
      case 'doors':
        clearVisitorThrusters(pad);
        this.setDoorOpen(pad.bayIndex, Math.min(1, s.t / HANGAR.VISITOR_DOOR_TIME));
        if (s.t > HANGAR.VISITOR_DOOR_TIME + 0.15) {
          s.phase = 'approach';
          s.t = 0;
          pad.shipVy = HANGAR.VISITOR_APPROACH_SPEED;
        }
        break;
      case 'approach': {
        // Soft brake as we near the pad (nose-south)
        if (pad.shipY > -70) {
          this._fireVisitorNoseBrake(pad, 0.9);
          pad.shipVy = Math.max(12, pad.shipVy - 90 * dt);
        } else {
          clearVisitorThrusters(pad);
        }
        pad.shipY += pad.shipVy * dt;
        pad.shipAngle = FACE_SOUTH;
        pad.padAngle = FACE_SOUTH;
        if (pad.shipY > -6) {
          pad.shipY = 0;
          pad.shipVy = 0;
          s.phase = 'settle';
          s.t = 0;
        }
        break;
      }
      case 'settle': {
        const u = smoothstep(s.t / HANGAR.VISITOR_LIFT_TIME);
        pad.shipHover = 1 - u;
        pad.shipScale = HANGAR.VISITOR_HOVER_SCALE - u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst = s.t < 0.35 ? 0.95 : Math.max(0, 0.5 - (s.t - 0.35));
        if (burst > 0.02) this._fireVisitorManeuverBurst(pad, burst);
        else clearVisitorThrusters(pad);
        pad.shipAngle = FACE_SOUTH;
        pad.padAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_LIFT_TIME) {
          pad.shipHover = 0;
          pad.shipScale = 1;
          clearVisitorThrusters(pad);
          s.phase = 'turn';
          s.t = 0;
        }
        break;
      }
      case 'turn': {
        // Pad + ship: south → north (same as B2 turntable)
        this.setPadRim(pad.bayIndex, 'on');
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        const angle = FACE_SOUTH + (FACE_NORTH - FACE_SOUTH) * u;
        pad.shipAngle = angle;
        pad.padAngle = angle;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          pad.shipAngle = FACE_NORTH;
          pad.padAngle = FACE_NORTH;
          s.phase = 'doorsClose';
          s.t = 0;
          this.setBeacon(pad.bayIndex, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pad.bayIndex, Math.max(0, 1 - s.t / 1.3));
        if (s.t > 1.4) this._finishVisitorArrive(pad);
        break;
      default:
        break;
    }
  }

  _tickVisitorLower(pad, s, dt) {
    switch (s.phase) {
      case 'warn':
        clearVisitorThrusters(pad);
        if (s.t > 1.0) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        clearVisitorThrusters(pad);
        if (this.isBayDangerClear(pad.bayIndex) || s.t > 3.0) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        pad.padDrop = u;
        pad.shipHover = 0;
        const ang = this._elevSinkTurn(FACE_NORTH, u);
        pad.padAngle = ang;
        pad.shipAngle = ang;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          // Fully black (drop = 1) before clearing the hull
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
          pad.padAngle = FACE_SOUTH;
          clearPadVisitor(pad);
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        pad.padAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME) {
          s.phase = 'riseEmpty';
          s.t = 0;
        }
        break;
      case 'riseEmpty': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        pad.padDrop = 1 - u;
        pad.padAngle = FACE_SOUTH;
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          pad.padDrop = 0;
          this._finishVisitorLeave(pad);
        }
        break;
      }
      default:
        break;
    }
  }

  /** Dev-only: ship sinks with the pad, dwells below, then rises back (same visitor). */
  _tickVisitorLowerCycle(pad, s, dt) {
    switch (s.phase) {
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        pad.padDrop = u;
        pad.shipHover = 0;
        pad.shipScale = 1;
        const ang = this._elevSinkTurn(FACE_NORTH, u);
        pad.padAngle = ang;
        pad.shipAngle = ang;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
          pad.padAngle = FACE_SOUTH;
          pad.shipAngle = FACE_SOUTH;
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        // Hidden reorient so the rise returns nose-north with no visible turn
        pad.padAngle = FACE_NORTH;
        pad.shipAngle = FACE_NORTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME) {
          s.phase = 'riseShip';
          s.t = 0;
        }
        break;
      case 'riseShip': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        pad.padDrop = 1 - u;
        pad.shipHover = 0;
        pad.shipScale = 1;
        pad.padAngle = FACE_NORTH;
        pad.shipAngle = FACE_NORTH;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          pad.padDrop = 0;
          this._finishVisitorArrive(pad);
        }
        break;
      }
      default:
        break;
    }
  }

  _tickVisitorRaiseLaunch(pad, s, dt) {
    switch (s.phase) {
      case 'warn':
        if (s.t > 0.9) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        if (this.isBayDangerClear(pad.bayIndex) || s.t > 2.8) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        pad.padDrop = u;
        pad.padAngle = this._elevSinkTurn(FACE_SOUTH, u);
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
          pad.padAngle = FACE_NORTH;
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        pad.padAngle = FACE_NORTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME * 0.85) {
          pad.padMk = this._rollVisitorPadMk();
          equipPadVisitor(pad, pickVisitorId(pad.padMk));
          pad.padAngle = FACE_NORTH;
          pad.shipAngle = FACE_NORTH;
          s.phase = 'riseShip';
          s.t = 0;
        }
        break;
      case 'riseShip': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        pad.padDrop = 1 - u;
        pad.shipHover = 0;
        pad.shipScale = 1;
        pad.padAngle = FACE_NORTH;
        pad.shipAngle = FACE_NORTH;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          pad.padDrop = 0;
          this.setLaneMode(pad.bayIndex, 'departing');
          this.setBeacon(pad.bayIndex, 'warning');
          s.phase = 'doors';
          s.t = 0;
        }
        break;
      }
      case 'doors':
        clearVisitorThrusters(pad);
        this.setDoorOpen(pad.bayIndex, Math.min(1, s.t / 1.1));
        if (s.t > 1.15) {
          this.setBeacon(pad.bayIndex, 'open');
          s.phase = 'lift';
          s.t = 0;
        }
        break;
      case 'lift': {
        const u = smoothstep(s.t / (HANGAR.VISITOR_LIFT_TIME * 0.75));
        pad.shipHover = u;
        pad.shipScale = 1 + u * (HANGAR.VISITOR_HOVER_SCALE - 1);
        const burst = s.t < 0.28 ? HANGAR.HOVER_BURST_POWER : Math.max(0, 0.45 - (s.t - 0.28));
        if (burst > 0.02) this._fireVisitorManeuverBurst(pad, burst);
        else clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_LIFT_TIME * 0.75) {
          s.phase = 'thrust';
          s.t = 0;
          pad.shipVy = 0;
        }
        break;
      }
      case 'thrust': {
        const power = Math.min(1.2, 0.5 + s.t * 0.7);
        this._fireVisitorEngine(pad, power);
        pad.shipVy -= HANGAR.VISITOR_THRUST_ACCEL * 1.15 * dt;
        pad.shipY += pad.shipVy * dt;
        pad.shipHover = 1;
        pad.shipScale = HANGAR.VISITOR_HOVER_SCALE;
        pad.shipAngle = FACE_NORTH;
        pad.padAngle = FACE_NORTH;
        if (pad.shipY < HANGAR.LAUNCH_EXIT_Y || s.t > 4.5) {
          s.phase = 'doorsClose';
          s.t = 0;
          clearPadVisitor(pad);
          pad.shipY = 0;
          pad.shipHover = 0;
          pad.shipScale = 1;
          pad.shipVy = 0;
          this.setBeacon(pad.bayIndex, 'warning');
        }
        break;
      }
      case 'doorsClose':
        this.setDoorOpen(pad.bayIndex, Math.max(0, 1 - s.t / 1.2));
        if (s.t > 1.25) {
          s.phase = 'turnEmpty';
          s.t = 0;
        }
        break;
      case 'turnEmpty': {
        const u = smoothstep(s.t / HANGAR.PAD_TURN_TIME);
        pad.padAngle = FACE_NORTH + (FACE_SOUTH - FACE_NORTH) * u;
        if (s.t >= HANGAR.PAD_TURN_TIME) {
          pad.padAngle = FACE_SOUTH;
          this._finishVisitorLeave(pad, { clearCargo: false });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Elevator raise that settles for captain service (no immediate launch). */
  _tickVisitorRaiseArrive(pad, s, dt) {
    switch (s.phase) {
      case 'warn':
        if (s.t > 0.9) {
          s.phase = 'clear';
          s.t = 0;
        }
        break;
      case 'clear':
        if (this.isBayDangerClear(pad.bayIndex) || s.t > 2.8) {
          s.phase = 'sink';
          s.t = 0;
        }
        break;
      case 'sink': {
        const u = smoothstep(s.t / HANGAR.VISITOR_SINK_TIME);
        pad.padDrop = u;
        pad.padAngle = this._elevSinkTurn(FACE_SOUTH, u);
        if (s.t >= HANGAR.VISITOR_SINK_TIME) {
          s.phase = 'below';
          s.t = 0;
          pad.padDrop = 1;
          pad.padAngle = FACE_NORTH;
        }
        break;
      }
      case 'below':
        pad.padDrop = 1;
        pad.padAngle = FACE_NORTH;
        if (s.t >= HANGAR.VISITOR_BELOW_TIME * 0.85) {
          pad.padMk = this._rollVisitorPadMk();
          equipPadVisitor(pad, pickVisitorId(pad.padMk));
          pad.padAngle = FACE_NORTH;
          pad.shipAngle = FACE_NORTH;
          s.phase = 'riseShip';
          s.t = 0;
        }
        break;
      case 'riseShip': {
        const u = smoothstep(s.t / HANGAR.VISITOR_RISE_TIME);
        pad.padDrop = 1 - u;
        pad.shipHover = 0;
        pad.shipScale = 1;
        pad.padAngle = FACE_NORTH;
        pad.shipAngle = FACE_NORTH;
        clearVisitorThrusters(pad);
        if (s.t >= HANGAR.VISITOR_RISE_TIME) {
          pad.padDrop = 0;
          this._finishVisitorArrive(pad);
        }
        break;
      }
      default:
        break;
    }
  }

  _seedCargo() {
    // Checklist-driven inbound for all bays — don't pre-stock piles
  }

  _pileById(id) {
    return this.piles.find((p) => p.id === id) || null;
  }

  /** Slots occupied by cargo or claimed by another mover on this pile. */
  _pileReservedSlots(pile, exceptNpc = null, { ignoreCraneDrop = false } = {}) {
    const used = new Set();
    if (!pile) return used;
    for (const it of pile.items) {
      if (it.pileSlot != null && it.pileSlot >= 0) used.add(it.pileSlot);
    }
    for (const n of this.npcs) {
      if (!n.alive || n === exceptNpc) continue;
      const onPile =
        n.targetPile?.id === pile.id || n.lingerPile?.id === pile.id;
      if (!onPile) continue;
      if (n.targetSlot != null && n.targetSlot >= 0) used.add(n.targetSlot);
      // In-flight deposits: forklift bring-in + mechanic unload/remove
      if (
        n.cargo?.pileSlot != null &&
        n.cargo.pileSlot >= 0 &&
        (n.job === 'bringIn' ||
          n.job === 'unloadShip' ||
          n.job === 'removeUpgrade')
      ) {
        used.add(n.cargo.pileSlot);
      }
    }
    if (!ignoreCraneDrop) {
      const c = this.crane;
      if (c?.dropoff?.id === pile.id && c._dropSlot != null && c._dropSlot >= 0) {
        used.add(c._dropSlot);
      }
    }
    return used;
  }

  /** First free 2×2 slot index on a pile, or -1 if full (honours in-flight claims). */
  _pileFreeSlot(pile, exceptNpc = null, opts = {}) {
    if (!pile) return -1;
    const used = this._pileReservedSlots(pile, exceptNpc, opts);
    for (let s = 0; s < PILE_SLOTS.length; s++) {
      if (!used.has(s)) return s;
    }
    return -1;
  }

  /** Place cargo into a stable 2×2 slot (does not reshuffle neighbors). */
  _pilePush(pile, cargo, exceptNpc = null) {
    if (!pile || !cargo) return false;
    if (pile.items.length >= PILE_CAP) return false;
    let slot = cargo.pileSlot;
    // Crane placing into its locked drop slot must not treat that reservation as occupied
    const cranePlacing =
      this.crane?.carried === cargo &&
      this.crane.dropoff?.id === pile.id &&
      this.crane._dropSlot != null &&
      cargo.pileSlot === this.crane._dropSlot;
    const used = this._pileReservedSlots(pile, exceptNpc, {
      ignoreCraneDrop: cranePlacing,
    });
    if (slot == null || slot < 0 || slot >= PILE_SLOTS.length || used.has(slot)) {
      slot = this._pileFreeSlot(pile, exceptNpc, {
        ignoreCraneDrop: cranePlacing,
      });
    }
    if (slot < 0) return false;
    cargo.pileSlot = slot;
    // Keep the orientation it arrived with (carrier 8-dir), else leave restHeading
    if (exceptNpc && (exceptNpc.kind === 'forklift' || exceptNpc.kind === 'mechanic')) {
      cargo.restHeading = this._crewVisOctant(exceptNpc) * CREW_VIS_OCT;
    }
    pile.items.push(cargo);
    return true;
  }

  /** Remove last item (crane/forklift default), clearing its slot. */
  _pilePop(pile) {
    if (!pile?.items?.length) return null;
    const cargo = pile.items.pop();
    if (cargo) cargo.pileSlot = null;
    return cargo;
  }

  /** Remove a specific cargo piece without moving others' slots. */
  _pileRemove(pile, cargo) {
    if (!pile || !cargo) return null;
    const idx = pile.items.indexOf(cargo);
    if (idx < 0) return null;
    pile.items.splice(idx, 1);
    cargo.pileSlot = null;
    return cargo;
  }

  /** Remove by index (service pickup); keep remaining slots stable. */
  _pileTakeAt(pile, idx) {
    if (!pile || idx < 0 || idx >= pile.items.length) return null;
    const cargo = pile.items.splice(idx, 1)[0];
    if (cargo) cargo.pileSlot = null;
    return cargo;
  }

  _pileAt(row, col) {
    return this.piles.find((p) => p.row === row && p.col === col) || null;
  }

  _pilesInRow(row) {
    return this.piles.filter((p) => p.row === row);
  }

  _bayPile(bay, lane, row) {
    const col = bay * 2 + (lane === 'out' ? 1 : 0);
    return this._pileAt(row, col);
  }

  _cargoCount() {
    let n = 0;
    for (const p of this.piles) n += p.items.length;
    for (const npc of this.npcs) {
      if (npc.cargo) n++;
    }
    if (this.crane?.carried) n++;
    return n;
  }

  _updatePressure() {
    const n = this._cargoCount();
    if (n < CARGO_MIN) this._pressure = -1;
    else if (n > CARGO_MAX) this._pressure = 1;
    else this._pressure = 0;
  }

  _bayInboundStock(bay) {
    let n = 0;
    for (const row of [ROW.N, ROW.M, ROW.S]) {
      n += this._bayPile(bay, 'in', row)?.items.length || 0;
    }
    return n;
  }

  _anyBayNeedsInbound() {
    for (let bay = 0; bay < 3; bay++) {
      if (this._bayNeedsInbound(bay)) return true;
    }
    return false;
  }

  /**
   * Pending checklist bring-ins that an empty forklift can fetch now.
   * One candidate per service item (not per bay) so multiple trucks stage in parallel.
   */
  _enumerateFetchInCandidates(exceptNpc = null) {
    const claimed = this._claimedTaskKeys(exceptNpc);
    const out = [];
    for (const pad of this._allServicePads()) {
      if (!pad.visitorId) continue;
      const needs = this._serviceNeedsBringIn(pad);
      if (!needs.length) continue;
      const bay = pad.bayIndex;
      if (!this._bayAcceptsCargo(bay)) continue;
      const south = this._bayPile(bay, 'in', ROW.S);
      if (!south || south.items.length >= PILE_CAP) continue;

      let reserved = 0;
      for (const n of this.npcs) {
        if (!n.alive || n === exceptNpc) continue;
        if (n._fetchInbound && n._fetchBay === bay) reserved++;
        else if (
          n.cargo?.serviceBay === bay &&
          (n.job === 'bringIn' || n.state === 'enter' || n.state === 'toPile' || n.state === 'linger')
        ) {
          reserved++;
        }
      }
      let room = PILE_CAP - south.items.length - reserved;
      if (room <= 0) continue;

      for (const it of needs) {
        const key = this._taskClaimKey('fetchIn', null, bay, it.id);
        if (claimed.has(key)) continue;
        if (room <= 0) break;
        out.push({
          bay,
          serviceItemId: it.id,
          targetPile: south,
          pendingCount: needs.length,
        });
        room--;
      }
    }
    return out;
  }

  _fetchableServiceBays(exceptNpc = null) {
    return [
      ...new Set(this._enumerateFetchInCandidates(exceptNpc).map((c) => c.bay)),
    ];
  }

  _canFetchInboundNow(exceptNpc = null) {
    return this._enumerateFetchInCandidates(exceptNpc).length > 0;
  }

  /**
   * Unique claim key: always job + item id or pile quadrant (never pile/bay alone).
   *   checklist / freight item → `${job}:${itemId}`
   *   pile quadrant            → `${job}:${pileId}:${slot|cargoId}`
   */
  _taskClaimKey(job, pile, bay = null, extra = null) {
    if (extra != null && extra !== '') {
      if (job === 'bringIn' || job === 'takeOut') {
        return pile?.id ? `${job}:${pile.id}:${extra}` : `${job}:${extra}`;
      }
      return `${job}:${extra}`;
    }
    // Fallback only if a caller forgot the item/quadrant (should be rare)
    if (pile?.id) return `${job}:${pile.id}:*`;
    if (bay != null) return `${job}:b${bay}:*`;
    return `${job}:*`;
  }

  _claimedTaskKeys(exceptNpc = null) {
    const keys = new Set();
    for (const n of this.npcs) {
      if (!n.alive || n === exceptNpc) continue;
      if (n.claimKey) keys.add(n.claimKey);
    }
    return keys;
  }

  _applyTaskClaim(npc, job, pile, bay = null, extra = null) {
    const ex =
      extra != null
        ? extra
        : job === 'fetchIn'
          ? npc._fetchItemId
          : job === 'loadShip' ||
              job === 'unloadShip' ||
              job === 'installUpgrade' ||
              job === 'weld'
            ? npc._claimServiceItemId ?? npc._activeServiceId
            : job === 'removeUpgrade'
              ? npc.stripHardpointKey ||
                npc.stripCategory ||
                npc._claimServiceItemId ||
                npc._activeServiceId
              : job === 'bringIn'
                ? npc.cargo?.serviceKey || npc.cargo?.id || npc.uid
                : job === 'takeOut'
                  ? npc.targetSlot
                  : job === 'stageFerry'
                    ? npc._claimCargoId != null
                      ? `cargo:${npc._claimCargoId}`
                      : npc._claimServiceItemId
                    : null;
    npc.claimKey = this._taskClaimKey(job, pile, bay, ex);
    if (
      job === 'loadShip' ||
      job === 'unloadShip' ||
      job === 'installUpgrade' ||
      job === 'weld' ||
      job === 'removeUpgrade' ||
      job === 'fetchIn' ||
      job === 'stageFerry'
    ) {
      npc._claimServiceItemId = ex ?? null;
    } else if (job === 'bringIn' || job === 'takeOut') {
      npc._claimServiceItemId = null;
    } else {
      npc._claimServiceItemId = null;
    }
  }

  _clearTaskClaim(npc) {
    npc.claimKey = null;
    npc._activeServiceId = null;
    npc._claimServiceItemId = null;
    npc._claimCargoId = null;
    npc.weldSpotsTotal = null;
    npc.weldSpotIndex = null;
    npc.directFromSouth = false;
  }

  /** Service / cargo claim tags held by other crew (parallel load/unload). */
  _claimedServiceKeys(exceptNpc = null) {
    const keys = new Set();
    for (const n of this.npcs) {
      if (!n.alive || n === exceptNpc) continue;
      if (n._claimServiceItemId != null) keys.add(n._claimServiceItemId);
      if (n._activeServiceId != null) keys.add(n._activeServiceId);
      if (n.cargo?.serviceKey != null) keys.add(n.cargo.serviceKey);
      if (n._mechLift?.cargo?.serviceKey != null) {
        keys.add(n._mechLift.cargo.serviceKey);
      }
      if (n._claimCargoId != null) keys.add(`cargo:${n._claimCargoId}`);
      if (n.cargo?.id != null && n.cargo.serviceKey == null) {
        keys.add(`cargo:${n.cargo.id}`);
      }
    }
    return keys;
  }

  _filterUnclaimed(tasks, exceptNpc = null) {
    const claimed = this._claimedTaskKeys(exceptNpc);
    return tasks.filter((t) => {
      let extra = null;
      if (t.serviceItemId != null) extra = t.serviceItemId;
      else if (t.cargoId != null) {
        extra =
          t.job === 'stageFerry' || t.job === 'bringIn'
            ? t.job === 'stageFerry'
              ? `cargo:${t.cargoId}`
              : t.cargoId
            : t.cargoId;
      } else if (t.job === 'bringIn') {
        extra =
          exceptNpc?.cargo?.serviceKey ||
          exceptNpc?.cargo?.id ||
          exceptNpc?.uid;
      } else if (t.job === 'takeOut') {
        extra = t.targetSlot;
      } else if (t.job === 'removeUpgrade') {
        extra = t.stripHardpointKey || t.stripCategory || null;
      } else if (t.targetSlot != null) {
        extra = t.targetSlot;
      }
      const pile = t.targetPile || t.ferrySource || t.pickup || null;
      const key = this._taskClaimKey(t.job, pile, t.bay, extra);
      return !claimed.has(key);
    });
  }

  /** Start an offscreen inbound fetch for a specific checklist item. */
  _beginForkFetch(npc, pick) {
    this._releaseForkliftPark(npc);
    npc.side = this._forkInboundSide();
    npc._fetchInbound = true;
    npc._fetchBay = pick.bay;
    npc._fetchItemId = pick.serviceItemId ?? null;
    npc.job = 'bringIn';
    npc.targetPile = pick.targetPile;
    this._applyTaskClaim(npc, 'fetchIn', null, pick.bay, pick.serviceItemId);
    // Reserve the checklist unit immediately so parallel same-type rows stay distinct
    if (pick.serviceItemId != null) {
      const pad = this._servicePad(pick.bay);
      const it = pad?.service?.items?.find((i) => i.id === pick.serviceItemId);
      if (it && it.status === 'pending') it.status = 'staging';
    }
    this._forkBeginLeaveHub(npc, this._doorX(npc.side));
    npc.state = 'toDoor';
  }

  /**
   * Staging ferry moves for one bay (S↔N/M, misshelf fixes, outbound lower).
   * Shared by crane and idle bay mechanics.
   */
  _enumerateBayStagingTasks(bay) {
    const tasks = [];
    /** One staging task per cargo item (claim = job + item). */
    const pushItem = (pickup, dropoff, cargo, weight = 1) => {
      if (!pickup || !dropoff || !cargo || pickup.id === dropoff.id) return;
      const full = dropoff.items.length >= PILE_CAP;
      let slot = cargo.pileSlot;
      if (slot == null || slot < 0) {
        this._itemWorldPos(pickup, cargo);
        slot = cargo.pileSlot ?? 0;
      }
      tasks.push({
        pickup,
        dropoff,
        bay,
        weight,
        status: full ? 'blocked' : 'doable',
        clears: pickup.items.length >= PILE_CAP,
        cargoId: cargo.id,
        serviceItemId: cargo.serviceKey ?? `cargo:${cargo.id}`,
        targetSlot: slot,
      });
    };
    const pushAll = (pickup, dropoff, weight = 1, pred = null) => {
      if (!pickup?.items?.length || !dropoff) return;
      for (const c of pickup.items) {
        if (pred && !pred(c)) continue;
        pushItem(pickup, dropoff, c, weight);
      }
    };

    const inS = this._bayPile(bay, 'in', ROW.S);
    const inM = this._bayPile(bay, 'in', ROW.M);
    const inN = this._bayPile(bay, 'in', ROW.N);
    const outS = this._bayPile(bay, 'out', ROW.S);
    const outM = this._bayPile(bay, 'out', ROW.M);
    const outN = this._bayPile(bay, 'out', ROW.N);
    const clearing = !!this.bayClearing[bay];

    if (clearing) {
      pushAll(inS, outS, 16);
      pushAll(inM, outS, 16);
      pushAll(inN, outS, 16);
      pushAll(outM, outS, 16);
      pushAll(outN, outS, 16);
      return tasks;
    }

    if (inS?.items.length && this._bayAcceptsCargo(bay)) {
      const svcPad = this._servicePad(bay);
      const svc = svcPad?.service;
      const svcActive = svc?.phase === 'active';
      if (svcActive) {
        const pending = this._serviceNeedsStaging(svcPad).filter(
          (it) => it.status === 'pending' || it.status === 'staging'
        );
        for (const c of inS.items) {
          const match = pending.some((it) =>
            this._cargoMatchesServiceItem(c, it, bay)
          );
          if (match) {
            const svcBoost = c.serviceKey ? 6 : 0;
            if (c.family === 'upgrade') {
              const nCount = inN?.items.length || 0;
              if (nCount < PILE_CAP) {
                pushItem(inS, inN, c, (nCount === 0 ? 5 : 2) + svcBoost);
              }
            } else {
              const mCount = inM?.items.length || 0;
              if (mCount < PILE_CAP) {
                pushItem(inS, inM, c, (mCount < 2 ? 5 : 1) + svcBoost);
              }
            }
          } else {
            pushItem(inS, outS, c, 10);
          }
        }
      } else {
        for (const c of inS.items) {
          const svcBoost = c.serviceKey ? 6 : 0;
          if (c.family === 'upgrade') {
            const nCount = inN?.items.length || 0;
            if (nCount < PILE_CAP) {
              pushItem(inS, inN, c, (nCount === 0 ? 5 : 2) + svcBoost);
            }
          } else {
            const mCount = inM?.items.length || 0;
            if (mCount < PILE_CAP) {
              pushItem(inS, inM, c, (mCount < 2 ? 5 : 1) + svcBoost);
            }
          }
        }
      }
    }

    const fixMisshelf = (src, prefer, fallback, weight) => {
      if (!src?.items.length) return;
      const srcIsUpgrade = src.role === 'upgrade';
      for (const c of src.items) {
        const wantUpgrade = c.family === 'upgrade';
        if (wantUpgrade === srcIsUpgrade) continue;
        if (prefer && prefer.items.length < PILE_CAP) {
          pushItem(src, prefer, c, weight);
        } else if (fallback && fallback.items.length < PILE_CAP) {
          pushItem(src, fallback, c, weight - 1);
        }
      }
    };
    fixMisshelf(inN, inM, outS, 22);
    fixMisshelf(inM, inN, outS, 22);
    fixMisshelf(outN, outM, outS, 20);
    fixMisshelf(outM, outN, outS, 20);

    pushAll(outN, outS, 4);
    pushAll(outM, outS, 4);

    const safeExportItem = (c) => !c.serviceKey;
    if (inM?.items.length >= PILE_CAP) pushAll(inM, outS, 12, safeExportItem);
    if (inN?.items.length >= PILE_CAP) pushAll(inN, outS, 12, safeExportItem);
    if (outM?.items.length >= PILE_CAP) pushAll(outM, outS, 12);
    if (outN?.items.length >= PILE_CAP) pushAll(outN, outS, 12);

    if (this._pressure > 0) {
      pushAll(inM, outS, 2, safeExportItem);
      pushAll(inN, outS, 2, safeExportItem);
    }
    return tasks;
  }

  /**
   * Crane moves: doable (src has item + dest has room) or blocked (src has item, dest full).
   * Clearing a full pile that others are waiting on is prioritized.
   */
  _enumerateCraneTasks() {
    const tasks = [];
    for (let bay = 0; bay < 3; bay++) {
      for (const t of this._enumerateBayStagingTasks(bay)) tasks.push(t);
    }
    return tasks;
  }

  _pickWeighted(tasks) {
    if (!tasks.length) return null;
    const total = tasks.reduce((s, t) => s + (t.weight || 1), 0);
    let r = Math.random() * total;
    for (const t of tasks) {
      r -= t.weight || 1;
      if (r <= 0) return t;
    }
    return tasks[0];
  }

  /** Trolley pose used when scoring the next crane job (home if not yet spawned). */
  _craneJobOriginXY() {
    if (this.crane) {
      return { x: this.crane.trolleyX, y: this.crane.bridgeY };
    }
    return this._craneHomeXY();
  }

  /**
   * Same-tier crane pick: nearer pickups win among equal weight; higher weight
   * still beats a modest detour via score = weight / (1 + dist / scale).
   */
  _pickCraneTask(tasks) {
    if (!tasks.length) return null;
    const origin = this._craneJobOriginXY();
    let best = null;
    let bestScore = -Infinity;
    for (const t of tasks) {
      const park = this._craneParkXY(t.pickup);
      const dist = Math.hypot(park.x - origin.x, park.y - origin.y);
      const score = (t.weight || 1) / (1 + dist / craneJobDistScale());
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  /**
   * @returns {{ mode: 'work'|'linger'|'idle', pickup?: object, dropoff?: object }}
   */
  _pickCraneJob() {
    // Prefer reclaiming aged unclaimed floor drops (outside hot bays)
    const floorJob = this._pickFloorDropCraneJob();
    if (floorJob) return floorJob;

    const tasks = this._enumerateCraneTasks();
    const mechCargo = this._mechanicStagingCargoIds();
    const free = tasks.filter((t) => {
      // Per-item claims: only skip crates a bay mech already called
      if (t.cargoId != null && mechCargo.has(t.cargoId)) return false;
      return true;
    });
    const doable = free.filter((t) => t.status === 'doable');
    const blocked = free.filter((t) => t.status === 'blocked');
    const blockedDestIds = new Set(blocked.map((t) => t.dropoff.id));

    // 1) Hard priority: empty a pile someone is blocked waiting to drop onto
    const unblock = doable
      .filter((t) => blockedDestIds.has(t.pickup.id))
      .map((t) => ({ ...t, weight: (t.weight || 1) * 4 }));
    if (unblock.length) {
      const chosen = this._pickCraneTask(unblock);
      return {
        mode: 'work',
        pickup: chosen.pickup,
        dropoff: chosen.dropoff,
        cargoId: chosen.cargoId ?? null,
      };
    }

    // 2) Clear at-capacity piles before they cascade into more blocks
    const atCap = doable.filter((t) => t.clears);
    if (atCap.length) {
      const chosen = this._pickCraneTask(atCap);
      return {
        mode: 'work',
        pickup: chosen.pickup,
        dropoff: chosen.dropoff,
        cargoId: chosen.cargoId ?? null,
      };
    }

    // 3) Normal doable work
    let pool = doable;
    if (this._pressure > 0) {
      const out = doable.filter((t) => t.dropoff.lane === 'out' && t.dropoff.row === ROW.S);
      if (out.length) pool = out;
    } else if (this._pressure < 0) {
      const inn = doable.filter((t) => t.pickup.lane === 'in' && t.pickup.row === ROW.S);
      if (inn.length) pool = inn;
    }

    const chosen = this._pickCraneTask(pool);
    if (chosen) {
      return {
        mode: 'work',
        pickup: chosen.pickup,
        dropoff: chosen.dropoff,
        cargoId: chosen.cargoId ?? null,
      };
    }

    // 4) Nothing doable — park at home (recheck soon); don't camp blocked piles
    return { mode: 'idle', pickup: null, dropoff: null };
  }

  /** Cargo ids bay mechs already claimed (ferry or direct-load from south). */
  _mechanicStagingCargoIds() {
    const ids = new Set();
    for (const n of this.npcs) {
      if (n.kind !== 'mechanic' || !n.alive) continue;
      const helping =
        n.job === 'stageFerry' ||
        n.job === 'loadShip' ||
        n.job === 'installUpgrade';
      if (!helping) continue;
      if (n._claimCargoId != null) ids.add(n._claimCargoId);
      if (n.cargo?.id != null) ids.add(n.cargo.id);
      if (n._mechLift?.cargo?.id != null) ids.add(n._mechLift.cargo.id);
    }
    return ids;
  }

  /** @deprecated — pile-wide ferry locks; prefer `_mechanicStagingCargoIds`. */
  _mechanicStagingPileIds() {
    const ids = new Set();
    for (const n of this.npcs) {
      if (n.kind !== 'mechanic' || !n.alive || n.job !== 'stageFerry') continue;
      if (!n.cargo && n.targetPile?.id) ids.add(n.targetPile.id);
      if (n.ferrySource?.id && !n.cargo) ids.add(n.ferrySource.id);
      if (n.cargo && n.ferryDest?.id) ids.add(n.ferryDest.id);
      if (n.cargo && n.targetPile?.id) ids.add(n.targetPile.id);
    }
    return ids;
  }

  /**
   * Crane lost the race for this staging move — a bay mech already has the same crate.
   */
  _craneStagingBeatenByMech(c) {
    if (!c || c.carried || !c.pickup || c.pickup.isFloorDrop) return false;
    const craneCargoId = c._pickupItem?.id ?? null;
    for (const n of this.npcs) {
      if (n.kind !== 'mechanic' || !n.alive) continue;
      if (
        n.job !== 'stageFerry' &&
        n.job !== 'loadShip' &&
        n.job !== 'installUpgrade'
      ) {
        continue;
      }
      if (!(n.cargo || n._mechLift?.cargo || n._claimCargoId != null)) continue;
      const mechCargoId =
        n.cargo?.id ?? n._mechLift?.cargo?.id ?? n._claimCargoId ?? null;
      if (craneCargoId != null && mechCargoId != null) {
        if (craneCargoId === mechCargoId) return true;
        continue;
      }
      // Fallback: same pile path when cargo id unknown
      const srcId = c.pickup.id;
      const nSrc =
        n.ferrySource?.id ||
        (!n.cargo ? n.targetPile?.id : null) ||
        n.targetPile?.id;
      if (nSrc === srcId) return true;
    }
    return false;
  }

  /**
   * Mechanic lost the race for a south-staging pickup — crane already has the same crate.
   */
  _mechStagingBeatenByCrane(npc) {
    if (!npc || npc.cargo || npc._mechLift?.cargo) return false;
    const fromSouth =
      npc.targetPile?.lane === 'in' && npc.targetPile?.row === ROW.S;
    if (npc.job !== 'stageFerry' && !(npc.job === 'loadShip' && fromSouth)) {
      return false;
    }
    const c = this.crane;
    if (!c || c.pickup?.isFloorDrop) return false;
    const active =
      !!c.carried || c.phase === 'lowerPickup' || c.phase === 'raisePickup';
    if (!active) return false;
    const craneCargoId = c.carried?.id ?? c._pickupItem?.id ?? null;
    const mechCargoId = npc._claimCargoId ?? null;
    if (craneCargoId != null && mechCargoId != null) {
      return craneCargoId === mechCargoId;
    }
    const srcId = npc.ferrySource?.id || npc.targetPile?.id;
    if (!srcId || c.pickup?.id !== srcId) return false;
    if (npc.job === 'stageFerry') {
      const destId = npc.ferryDest?.id;
      if (destId && c.dropoff?.id && c.dropoff.id !== destId) return false;
    }
    return true;
  }

  /** Drop a lost staging-ferry assist and return to idle fluff. */
  _abandonMechanicStagingFerry(npc) {
    npc.mechPhase = null;
    npc.targetSlot = null;
    npc._mechLift = null;
    npc.mechHandT = 0;
    this._clearTaskClaim(npc);
    npc.ferryDest = null;
    npc.ferrySource = null;
    this._beginIdleFluff(npc);
  }

  _floorDropClaimedByMechanic(drop) {
    return this.npcs.some(
      (n) =>
        n.kind === 'mechanic' &&
        n.alive &&
        (n.floorDropId === drop.id ||
          (n.droppedCargoId === drop.id &&
            (n.state === 'toFloorDrop' || n.state === 'resumeWait' || n.state === 'clearHot')))
    );
  }

  _pickFloorDropCraneJob() {
    const aged = this.floorDrops.filter((d) => {
      if (this.time - d.droppedAt < FLOOR_DROP_CRANE_AGE) return false;
      if (this._floorDropClaimedByMechanic(d)) return false;
      if (d.claimNpc === 'crane') return true;
      const bay = bayIndexFromX(d.x);
      if (this._isBayOpsHot(bay) && this._pointInDangerRect(d.x, d.y, bay, 0)) return false;
      return true;
    });
    if (!aged.length) return null;
    // Older drops preferred; soft distance bias so he doesn't cross the bay for a 1s-older crate
    const origin = this._craneJobOriginXY();
    let drop = null;
    let bestScore = -Infinity;
    for (const d of aged) {
      const age = Math.max(0.5, this.time - d.droppedAt);
      const parkY = this._clampBridgeY(d.y - TROLLEY_NORTH);
      const parkX = this._clampTrolleyX(d.x);
      const dist = Math.hypot(parkX - origin.x, parkY - origin.y);
      const score = age / (1 + dist / craneJobDistScale());
      if (score > bestScore) {
        bestScore = score;
        drop = d;
      }
    }
    if (!drop) return null;
    drop.claimNpc = 'crane';
    const bay = bayIndexFromX(drop.x);
    const dest = this._findSafePileForCargo(drop.cargo, bay);
    if (!dest) return null;
    return {
      mode: 'work',
      pickup: this._makeFloorPickupProxy(drop),
      dropoff: dest,
    };
  }

  /**
   * Family-safe shelf for a cargo piece. Never parks upgrades on CG pads or
   * hold freight on UP pads. South I/O is last-resort transit only.
   */
  _findSafePileForCargo(cargo, preferBay = null) {
    if (!cargo) return null;
    const fromFinder = this._findCraneDropoffFor(
      cargo,
      preferBay,
      cargo.serviceKey != null ? 'in' : null
    );
    if (fromFinder) return fromFinder;
    const wantRole = cargo.family === 'upgrade' ? 'upgrade' : 'cargo';
    const forceIn = cargo.serviceKey != null;
    const ranked = this.piles
      .filter((p) => {
        if (p.items.length >= PILE_CAP) return false;
        if (!this._pileAcceptsFamily(p, cargo)) return false;
        if (forceIn && p.lane !== 'in') return false;
        if (forceIn && p.row === ROW.S) return false;
        return true;
      })
      .map((p) => {
        let w = 1;
        if (preferBay != null && p.bay === preferBay) w += 8;
        if (p.role === wantRole) w += 6;
        if (p.lane === 'in' && p.role === wantRole) w += 4;
        if (p.lane === 'out' && p.role === wantRole) w += 2;
        if (p.row === ROW.S) w -= 4;
        return { p, w };
      })
      .sort((a, b) => b.w - a.w);
    return ranked[0]?.p || null;
  }

  /** Deposit cargo onto a matching shelf; returns true if parked. */
  _depositCargoSafe(cargo, preferBay = null, exceptNpc = null) {
    const dest = this._findSafePileForCargo(cargo, preferBay);
    if (!dest) return false;
    return this._pilePush(dest, cargo, exceptNpc);
  }

  _makeFloorPickupProxy(drop) {
    return {
      id: `floor:${drop.id}`,
      x: drop.x,
      y: drop.y,
      bay: bayIndexFromX(drop.x),
      items: [drop.cargo],
      isFloorDrop: true,
      floorDropId: drop.id,
      lane: 'out',
      row: ROW.S,
      role: drop.cargo.family === 'upgrade' ? 'upgrade' : 'cargo',
    };
  }

  _applyCraneJob(c, job) {
    if (!job || job.mode === 'idle') {
      const home = this._craneHomeXY();
      c.pickup = { x: home.x, y: home.y + TROLLEY_NORTH, id: 'craneHome' };
      c.dropoff = c.pickup;
      c.phase = 'idle';
      c.pause = 0;
      c.lingerFor = null;
      c._dropSlot = null;
      c._pickupItem = null;
      return;
    }
    c.pickup = job.pickup;
    c.dropoff = job.dropoff;
    c._dropSlot = null;
    c._pickupItem = null;
    if (job.cargoId != null && job.pickup?.items?.length) {
      c._pickupItem =
        job.pickup.items.find((it) => it.id === job.cargoId) || null;
    }
    c.lingerFor = job.mode === 'linger' ? job.dropoff?.id : null;
    if (job.mode === 'linger') {
      c.phase = 'linger';
      c.pause = 0.35;
    } else {
      c.phase = 'travelPickup';
      c.pause = 0.25;
    }
  }

  _resetCrane() {
    if (!this.hasCrane()) {
      this.crane = null;
      return;
    }
    const job = this._pickCraneJob();
    const home = this._craneHomeXY();
    const start = job.mode === 'idle' || !job.pickup
      ? { x: home.x, y: home.y + TROLLEY_NORTH, id: 'craneHome' }
      : job.pickup;
    this.crane = {
      trolleyX: job.mode === 'idle' || !job.pickup ? home.x : start.x,
      bridgeY: job.mode === 'idle' || !job.pickup ? home.y : start.y - TROLLEY_NORTH,
      hoist: HOIST_RAISED,
      hookTargetY: null,
      carried: null,
      claw: CLAW_OPEN,
      levers: { travel: 0, hoist: 0, grip: 0 },
      operator: {
        suit: CRANE_CREW.suit,
        helmet: CRANE_CREW.helmet,
        mask: CRANE_CREW.mask,
        /** Draw yaw — 8-dir head look (smoothed toward task destination) */
        visHeading: Math.PI / 2,
        facing: 1,
      },
      phase: 'idle',
      pickup: start,
      dropoff: job.dropoff || start,
      lingerFor: null,
      pause: 0.2,
      _prevTX: job.mode === 'idle' || !job.pickup ? home.x : start.x,
      _prevBY: job.mode === 'idle' || !job.pickup ? home.y : start.y - TROLLEY_NORTH,
      _prevHoist: HOIST_RAISED,
    };
    this._applyCraneJob(this.crane, job);
  }

  /** True if this pile is a valid shelf for this cargo family. */
  _pileAcceptsFamily(pile, cargo) {
    if (!pile || !cargo) return false;
    // South storage I/O is transit-only — never a final shelf for the wrong family
    // when a matching N/M pad exists; still allowed as last-resort drop.
    if (pile.row === ROW.S) return true;
    if (cargo.family === 'upgrade') return pile.role === 'upgrade';
    return pile.role === 'cargo';
  }

  /** Prefer matching N/M shelves; only use south I/O when those are full. */
  _findCraneDropoffFor(carried, preferBay = null, preferLane = null) {
    if (!carried) return null;
    const homeBay =
      carried.serviceBay != null ? carried.serviceBay : preferBay;
    const wantRole = carried.family === 'upgrade' ? 'upgrade' : 'cargo';
    // Checklist inbound freight (install / load) must stay on the in-lane —
    // never the outbound uninstall / sell pads.
    const forceIn = carried.serviceKey != null;
    const lanePref = forceIn ? 'in' : preferLane;
    const candidates = [];
    for (const p of this.piles) {
      if (p.items.length >= PILE_CAP) continue;
      if (carried.serviceKey != null && homeBay != null && p.bay !== homeBay) continue;
      if (p.row === ROW.S) {
        // Transit only when no service tag (sweep / reclaim)
        if (carried.serviceKey) continue;
        if (p.lane !== 'out') continue;
        candidates.push({ p, w: homeBay === p.bay ? 1.2 : 0.3 });
        continue;
      }
      if (!this._pileAcceptsFamily(p, carried)) continue;
      if (forceIn && p.lane !== 'in') continue;
      if (p.lane === 'in' && p.role === wantRole) {
        let w = homeBay === p.bay ? 10 : 2;
        if (lanePref === 'in') w *= 1.25;
        candidates.push({ p, w });
      } else if (p.lane === 'out' && p.role === wantRole) {
        // Opposite-lane only as last resort for non-service freight
        let w = homeBay === p.bay ? 4 : 1;
        if (lanePref === 'in') w *= 0.15;
        else if (lanePref === 'out') w *= 1.25;
        candidates.push({ p, w });
      }
    }
    if (!candidates.length) return null;
    const total = candidates.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.w;
      if (r <= 0) return c.p;
    }
    return candidates[0].p;
  }

  /** True when a planned crane dropoff is wrong for this cargo (family / lane). */
  _craneDropoffInvalid(dropoff, carried) {
    if (!dropoff || !carried) return true;
    if (dropoff.items.length >= PILE_CAP) return true;
    if (!this._pileAcceptsFamily(dropoff, carried)) return true;
    const wantRole = carried.family === 'upgrade' ? 'upgrade' : 'cargo';
    if (dropoff.row !== ROW.S && dropoff.role !== wantRole) return true;
    // Install / inbound service parts must not land on outbound uninstall pads
    if (carried.serviceKey != null && dropoff.lane === 'out') return true;
    return false;
  }

  /** Preferred shelf lane when retargeting a crane drop (service freight → in). */
  _cranePreferLane(c) {
    if (c?.carried?.serviceKey) return 'in';
    if (c?.pickup?.lane === 'in' || c?.pickup?.lane === 'out') return c.pickup.lane;
    return null;
  }

  /**
   * @param {number} deltaTime
   * @param {object} ship
   * @param {{ firedTurret?: boolean, laserOn?: boolean, muzzleX?: number, muzzleY?: number }} weapons
   */
  update(deltaTime, ship, weapons = {}) {
    this.time += deltaTime;

    if (ship?.position) {
      this._shipPos.x = ship.position.x;
      this._shipPos.y = ship.position.y;
    }
    // Keep last controlled hull ref when ticking headless in space (ship arg null)
    if (ship) this._playerShip = ship;

    const act = thrusterActivity(ship);
    const weaponPulse =
      (weapons.firedTurret ? 1 : 0) + (weapons.laserOn ? 0.55 : 0);
    if (
      weaponPulse > 0 &&
      Number.isFinite(weapons.muzzleX) &&
      Number.isFinite(weapons.muzzleY)
    ) {
      this._weaponWash.x = weapons.muzzleX;
      this._weaponWash.y = weapons.muzzleY;
    }
    this._hazard.maneuver = act.maneuver;
    this._hazard.engine = act.engine;
    this._hazard.weapons = Math.max(
      this._hazard.weapons * Math.exp(-deltaTime * 3.5),
      weaponPulse
    );
    this._shipAngle = ship?.angle ?? SHIP.SPAWN_ANGLE;
    this._syncBayLaneModes();

    this._updatePressure();
    this._updateCrane(deltaTime);
    this._tickPlayerDevSeq(deltaTime);
    this._updateVisitorTraffic(deltaTime);
    if (!this._headlessWarmup) {
      this._updatePlayerBayService(deltaTime);
    }
    this._updateBayClearing();
    this._syncDoorBeacons();
    this._syncBayTickers();

    for (const b of this._opsBays) this.tickEvac(b);

    const hazardLevel =
      this._hazard.maneuver * 0.55 +
      this._hazard.engine * 1.1 +
      this._hazard.weapons * 1.35;

    for (const npc of this.npcs) {
      if (npc.kind === 'mechanic') {
        npc.secSinceLastBayTask = (npc.secSinceLastBayTask || 0) + deltaTime;
        this._updateMechanic(npc, deltaTime, hazardLevel);
      } else {
        this._updateForklift(npc, deltaTime, hazardLevel);
      }
    }
    // Fixed roster — never cull by alive; revive if something goes wrong
    for (const npc of this.npcs) {
      if (!npc.alive) {
        npc.alive = true;
        if (npc.kind === 'mechanic') this._parkMechanicIdle(npc);
        else this._parkForkliftAtHub(npc);
      }
    }

    if (act.engine > 0.2 && Math.random() < act.engine * 0.4) {
      const a = this._shipAngle + Math.PI;
      this._sparkle.push({
        x: this._shipPos.x + Math.cos(a) * rand(14, 24) + rand(-6, 6),
        y: this._shipPos.y + Math.sin(a) * rand(14, 24) + rand(-6, 6),
        life: rand(0.25, 0.55),
        max: 0.55,
        r: rand(1, 2.5),
      });
    }
    if (!this._weldEmberTrail) this._weldEmberTrail = [];
    for (const s of this._sparkle) {
      s.life -= deltaTime;
      if (s.dust || s.weld) {
        const ox = s.x;
        const oy = s.y;
        s.x += (s.vx || 0) * deltaTime;
        s.y += (s.vy || 0) * deltaTime;
        s.vx = (s.vx || 0) * (s.weld ? 0.94 : 0.92);
        s.vy = (s.vy || 0) * (s.weld ? 0.93 : 0.9) + (s.weld ? 28 : 4) * deltaTime;
        // Leave brief ember stamps as sparks travel — underglow trails the slag
        if (s.weld && !s.core) {
          const spd = Math.hypot(s.vx || 0, s.vy || 0);
          const step = Math.hypot(s.x - ox, s.y - oy);
          s._emberAcc = (s._emberAcc || 0) + step;
          if (s._emberAcc > 2.8 || (spd > 40 && Math.random() < deltaTime * 18)) {
            s._emberAcc = 0;
            const lifeA = Math.max(0.15, s.life / (s.max || 0.3));
            this._weldEmberTrail.push({
              x: ox + (s.x - ox) * 0.5,
              y: oy + (s.y - oy) * 0.5,
              life: rand(0.08, 0.16) * lifeA,
              max: 0.16,
              r: (s.r || 1) * 0.85,
              warm: !!s.warm,
              core: false,
              layer: s.layer,
              padX: s.padX,
              padY: s.padY,
              padAngle: s.padAngle,
              bay: s.bay,
            });
          }
        }
      }
    }
    this._sparkle = this._sparkle.filter((s) => s.life > 0);
    for (const e of this._weldEmberTrail) {
      e.life -= deltaTime;
    }
    this._weldEmberTrail = this._weldEmberTrail.filter((e) => e.life > 0);
    // Cap trail so busy multi-bay welds stay cheap
    if (this._weldEmberTrail.length > 80) {
      this._weldEmberTrail.splice(0, this._weldEmberTrail.length - 80);
    }
    // Under-hull weld glow: mid decay + softer flash stutter between emits
    for (const npc of this.npcs) {
      const g = npc._weldGlow;
      if (!g) continue;
      g.intensity = Math.max(0, (g.intensity || 0) - deltaTime * 2.4);
      g.flash = Math.max(0, (g.flash || 0) - deltaTime * 4.5);
      g.surfaceKiss = Math.max(0, (g.surfaceKiss || 0) - deltaTime * 2.2);
      if (g.intensity > 0.15 && Math.random() < deltaTime * 2.25) {
        g.flash = Math.min(0.85, (g.flash || 0) + rand(0.25, 0.55));
        if (Math.random() < 0.35) g.amber = true;
        g.speckleSeed = Math.random();
      }
      if (g.intensity < 0.03 && (g.flash || 0) < 0.03) {
        g.amber = false;
      }
    }
    for (const d of this._debris) {
      d.life -= deltaTime;
      d.x += d.vx * deltaTime;
      d.y += d.vy * deltaTime;
    }
    this._debris = this._debris.filter((d) => d.life > 0);
  }

  /**
   * Turret bolts + mining laser vs real cargo (piles, carriers, crane).
   * @returns {{ hits: number }}
   */
  applyWeaponHits(ship, projectiles, deltaTime) {
    let hits = 0;
    const targets = this._cargoHitTargets();

    for (const proj of projectiles) {
      if (!proj.active) continue;
      for (const t of targets) {
        const dx = proj.position.x - t.x;
        const dy = proj.position.y - t.y;
        const r = this._cargoRadius(t.cargo) + proj.radius;
        if (dx * dx + dy * dy < r * r) {
          if (this._damageCargo(t, proj.damage)) hits++;
          proj.destroy();
          break;
        }
      }
    }

    if (ship?.miningLaserFiring) {
      const origin = ship.getMiningLaserOrigin();
      const angle = ship.getMiningLaserWorldAngle();
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const range = SHIP.MINING_LASER_RANGE;
      const dmg = SHIP.MINING_LASER_DPS * deltaTime;
      let closest = null;
      let closestDist = range;

      for (const t of this._cargoHitTargets()) {
        const hit = this._rayCircle(
          origin.x, origin.y, dx, dy, range,
          t.x, t.y, this._cargoRadius(t.cargo)
        );
        if (hit !== null && hit < closestDist) {
          closestDist = hit;
          closest = t;
        }
      }
      if (closest) {
        ship.miningLaserBeamLength = Math.min(
          ship.miningLaserBeamLength ?? range,
          closestDist
        );
        if (this._damageCargo(closest, dmg)) hits++;
      }
    }

    return { hits };
  }

  _cargoHitTargets() {
    const out = [];
    for (const pile of this.piles) {
      pile.items.forEach((cargo) => {
        const pos = this._itemWorldPos(pile, cargo);
        out.push({ cargo, pile, x: pos.x, y: pos.y, kind: 'pile' });
      });
    }
    if (this.crane?.carried) {
      const hook = this._craneCargoDrawPos();
      out.push({
        cargo: this.crane.carried,
        x: hook.x,
        y: hook.y,
        kind: 'crane',
      });
    }
    for (const npc of this.npcs) {
      if (!npc.cargo) continue;
      out.push({
        cargo: npc.cargo,
        npc,
        x: npc.x + (npc.facing > 0 ? 12 : -12),
        y: npc.y - 6,
        kind: 'npc',
      });
    }
    for (const drop of this.floorDrops) {
      out.push({
        cargo: drop.cargo,
        drop,
        x: drop.x,
        y: drop.y,
        kind: 'floor',
      });
    }
    return out;
  }

  _itemWorldPos(pile, itemOrIndex) {
    // Stable 2×2 slot per item — never remap by array index (that caused shuffling)
    let slotIdx = 0;
    if (itemOrIndex && typeof itemOrIndex === 'object') {
      slotIdx = itemOrIndex.pileSlot;
      if (slotIdx == null || slotIdx < 0 || slotIdx >= PILE_SLOTS.length) {
        slotIdx = this._pileAssignSlotIfMissing(pile, itemOrIndex);
      }
    } else {
      slotIdx = Math.min(itemOrIndex | 0, PILE_SLOTS.length - 1);
    }
    const slot = PILE_SLOTS[slotIdx];
    return {
      x: pile.x + slot.ox,
      y: pile.y + slot.oy,
    };
  }

  _cargoRadius(cargo) {
    return Math.max(cargo.w, cargo.h) * 0.55;
  }

  _damageCargo(target, amount) {
    target.cargo.hp -= amount;
    if (target.cargo.hp > 0) return false;

    const x = target.x;
    const y = target.y;
    this._burstCargo(x, y, target.cargo.color);

    if (target.kind === 'pile' && target.pile) {
      this._pileRemove(target.pile, target.cargo);
      this._restageServiceCargo(target.cargo);
    } else if (target.kind === 'crane' && this.crane) {
      this._restageServiceCargo(this.crane.carried);
      this.crane.carried = null;
      this.crane.phase = 'raiseDropoff';
      this.crane.pause = 0.2;
    } else if (target.kind === 'floor' && target.drop) {
      this._restageServiceCargo(target.drop.cargo);
      this.floorDrops = this.floorDrops.filter((d) => d.id !== target.drop.id);
    } else if (target.kind === 'npc' && target.npc) {
      this._restageServiceCargo(target.npc.cargo);
      target.npc.cargo = null;
      if (target.npc.kind === 'forklift' && target.npc.job === 'takeOut') {
        target.npc.job = 'leave';
        target.npc.state = 'toDoor';
      }
    }
    return true;
  }

  _burstCargo(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(20, 90);
      this._debris.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.3, 0.7),
        max: 0.7,
        r: rand(1, 3),
        color,
      });
    }
  }

  _rayCircle(ox, oy, dx, dy, maxDist, cx, cy, radius) {
    const fx = ox - cx;
    const fy = oy - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrt = Math.sqrt(disc);
    const t1 = (-b - sqrt) / (2 * a);
    const t2 = (-b + sqrt) / (2 * a);
    let t = Infinity;
    if (t1 >= 0) t = Math.min(t, t1);
    if (t2 >= 0) t = Math.min(t, t2);
    if (t === Infinity || t > maxDist) return null;
    return t;
  }

  _clampBridgeY(y) {
    return Math.max(BRIDGE_Y_MIN, Math.min(BRIDGE_Y_MAX, y));
  }

  _clampTrolleyX(x) {
    return Math.max(RUNWAY_X[0] + 8, Math.min(RUNWAY_X[1] - 8, x));
  }

  _moveCraneXY(c, tx, ty, speed, dt) {
    const dx = tx - c.trolleyX;
    const dy = ty - c.bridgeY;
    const dist = Math.hypot(dx, dy);
    if (dist < 2.5) {
      c.trolleyX = tx;
      c.bridgeY = ty;
      return true;
    }
    const step = speed * dt;
    if (step >= dist) {
      c.trolleyX = tx;
      c.bridgeY = ty;
      return true;
    }
    c.trolleyX += (dx / dist) * step;
    c.bridgeY += (dy / dist) * step;
    return false;
  }

  _craneParkXY(pile, slotOrItem = null) {
    if (!pile || pile.id === 'craneHome') {
      return {
        x: this._clampTrolleyX(CRANE_HOME.x),
        y: this._clampBridgeY(CRANE_HOME.y),
      };
    }
    let wx = pile.x;
    let wy = pile.y;
    if (slotOrItem != null && typeof slotOrItem === 'object') {
      const pos = this._itemWorldPos(pile, slotOrItem);
      wx = pos.x;
      wy = pos.y;
    } else if (
      typeof slotOrItem === 'number' &&
      slotOrItem >= 0 &&
      slotOrItem < PILE_SLOTS.length
    ) {
      wx = pile.x + PILE_SLOTS[slotOrItem].ox;
      wy = pile.y + PILE_SLOTS[slotOrItem].oy;
    }
    return {
      x: this._clampTrolleyX(wx),
      y: this._clampBridgeY(wy - TROLLEY_NORTH),
    };
  }

  /** Deck aim under trolley if hoist were fully lowered (cargo center, not hook). */
  _craneAimFloorY(c = this.crane) {
    if (!c) return 0;
    if (c.hookTargetY != null) {
      const cargo = c.carried ?? c._aimCargo;
      return this._craneCargoCenterFromHook(c.hookTargetY, cargo);
    }
    return c.bridgeY + TROLLEY_NORTH;
  }

  /**
   * World point for the operator's current task destination (where the head aims).
   * Pickup while fetching; dropoff once cargo is aboard / delivering; deck aim when idle.
   */
  _craneOperatorLookAt(c = this.crane) {
    if (!c) return { x: 0, y: 0 };
    const phase = c.phase || 'idle';
    const homeish = (p) => !p || p.id?.includes?.('craneHome');
    const towardPickup =
      phase === 'travelPickup' ||
      phase === 'lowerPickup' ||
      phase === 'linger' ||
      (phase === 'raisePickup' && !c.carried);
    const towardDrop =
      phase === 'travelDropoff' ||
      phase === 'lowerDropoff' ||
      phase === 'lingerLoaded' ||
      phase === 'raisePickup' ||
      (phase === 'raiseDropoff' && !!c.dropoff);
    if (towardPickup && !homeish(c.pickup)) {
      return { x: c.pickup.x, y: c.pickup.y };
    }
    if (towardDrop && c.dropoff && !homeish(c.dropoff)) {
      return { x: c.dropoff.x, y: c.dropoff.y };
    }
    if (c.carried && c.dropoff && !homeish(c.dropoff)) {
      return { x: c.dropoff.x, y: c.dropoff.y };
    }
    if (!c.carried && !homeish(c.pickup) && phase !== 'idle' && phase !== 'raiseDropoff') {
      return { x: c.pickup.x, y: c.pickup.y };
    }
    // Idle / home / post-drop — watch the deck aim under the trolley
    return { x: c.trolleyX, y: this._craneAimFloorY(c) };
  }

  /** Smooth 8-dir head yaw toward the current task destination. */
  _updateCraneOperatorLook(dt) {
    const c = this.crane;
    if (!c?.operator) return;
    const op = c.operator;
    const look = this._craneOperatorLookAt(c);
    // Cab seat is east of trolley on the bridge (matches `_drawCraneCabin`)
    const headX = c.trolleyX + 13;
    const headY = c.bridgeY - 3;
    const dx = look.x - headX;
    const dy = look.y - headY;
    if (Math.hypot(dx, dy) < 2) return;
    this._crewSteerVisHeading(op, Math.atan2(dy, dx), dt);
  }

  /** Hook Y so gripped cargo center sits at cy (fingertips reach the box). */
  _craneHookForCargoCenter(cy, cargo = null) {
    const h = cargo?.h ?? 8;
    return cy - (CLAW_FINGER - 1) - h * 0.5;
  }

  /** Cargo center for a hook Y (matches _craneCargoDrawPos). */
  _craneCargoCenterFromHook(hookY, cargo = null) {
    const h = cargo?.h ?? 8;
    return hookY + (CLAW_FINGER - 1) + h * 0.5;
  }

  _cranePeekPickupItem(pile) {
    return this._craneResolvePickupItem(pile);
  }

  /** Which pile item the crane will grip — lowest occupied slot (SW before SE, etc.). */
  _craneResolvePickupItem(pile) {
    if (!pile?.items?.length) return null;
    if (pile.isFloorDrop) return pile.items[0];
    let best = null;
    let bestSlot = PILE_SLOTS.length;
    for (const item of pile.items) {
      let slot = item.pileSlot;
      if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
        slot = this._pileAssignSlotIfMissing(pile, item);
      }
      if (slot < bestSlot) {
        bestSlot = slot;
        best = item;
      }
    }
    return best;
  }

  /** Stable slot for an in-pile item that lost or never had pileSlot. */
  _pileAssignSlotIfMissing(pile, cargo) {
    if (
      cargo?.pileSlot != null &&
      cargo.pileSlot >= 0 &&
      cargo.pileSlot < PILE_SLOTS.length
    ) {
      return cargo.pileSlot;
    }
    const used = new Set(
      pile.items
        .filter((it) => it !== cargo)
        .map((it) => it.pileSlot)
        .filter((s) => s != null && s >= 0)
    );
    for (let s = 0; s < PILE_SLOTS.length; s++) {
      if (!used.has(s)) {
        cargo.pileSlot = s;
        return s;
      }
    }
    cargo.pileSlot = 0;
    return 0;
  }

  _craneLockPickup(c) {
    if (!c?.pickup?.items?.length || c.pickup.isFloorDrop) {
      c._pickupItem = null;
      return null;
    }
    if (c._pickupItem && c.pickup.items.includes(c._pickupItem)) {
      return c._pickupItem;
    }
    c._pickupItem = this._craneResolvePickupItem(c.pickup);
    return c._pickupItem;
  }

  _craneEnsureDropSlot(c) {
    if (!c?.dropoff) {
      c._dropSlot = null;
      return null;
    }
    if (
      c._dropSlot == null ||
      c._dropSlot < 0 ||
      c._dropSlot >= PILE_SLOTS.length ||
      c.dropoff.items.some((it) => it.pileSlot === c._dropSlot)
    ) {
      // Ignore our own prior reservation while choosing a fresh drop slot
      c._dropSlot = this._pileFreeSlot(c.dropoff, null, { ignoreCraneDrop: true });
    }
    return c._dropSlot;
  }

  _craneHomeXY() {
    return {
      x: this._clampTrolleyX(CRANE_HOME.x),
      y: this._clampBridgeY(CRANE_HOME.y),
    };
  }

  /** World position of the hoist hook (south of trolley toward the pile). */
  _craneHookPos() {
    const c = this.crane;
    if (!c) return { x: 0, y: 0 };
    const raisedY = c.bridgeY + 5;
    const targetY = c.hookTargetY ?? raisedY;
    const t = Math.min(1, Math.max(0, c.hoist / HOIST_MAX));
    return {
      x: c.trolleyX,
      y: raisedY + (targetY - raisedY) * t,
    };
  }

  /** Top-center of carried cargo (top edge just above fingertip line). */
  _craneCargoDrawPos() {
    const hook = this._craneHookPos();
    const box = this.crane?.carried;
    if (!box) return { ...hook, top: hook.y + CLAW_FINGER - 1 };
    const top = hook.y + CLAW_FINGER - 1;
    return {
      x: hook.x,
      y: top + box.h / 2,
      top,
    };
  }

  _updateCraneClaw(dt) {
    const c = this.crane;
    if (!c) return;
    // Open while empty; partial close while holding cargo (including lower-to-drop)
    const target = c.carried ? CLAW_GRIP : CLAW_OPEN;
    const rate = c.carried ? 10 : 7;
    c.claw += (target - (c.claw ?? CLAW_OPEN)) * Math.min(1, dt * rate);
  }

  /** Cab levers track real work: XY travel · hoist up/down · claw open/close. */
  _updateCraneLevers(dt) {
    const c = this.crane;
    if (!c) return;
    if (!c.levers) c.levers = { travel: 0, hoist: 0, grip: 0 };

    const dx = c.trolleyX - (c._prevTX ?? c.trolleyX);
    const dy = c.bridgeY - (c._prevBY ?? c.bridgeY);
    const dh = c.hoist - (c._prevHoist ?? c.hoist);
    c._prevTX = c.trolleyX;
    c._prevBY = c.bridgeY;
    c._prevHoist = c.hoist;

    // XY travel lever — pushed forward while the bridge/trolley is moving
    const moveMag = Math.hypot(dx, dy);
    let travelT = 0;
    if (moveMag > 0.04) {
      travelT = Math.min(1, moveMag * 0.45);
    } else if (
      c.phase === 'travelPickup' ||
      c.phase === 'travelDropoff' ||
      c.phase === 'linger' ||
      c.phase === 'lingerLoaded'
    ) {
      // Micro-nudge while settling on target so the stick isn't dead-still mid-job
      travelT = 0.12 + Math.sin(this.time * 7) * 0.04;
    }

    // Hoist lever — forward = arm down, back = arm up
    let hoistT = 0;
    if (Math.abs(dh) > 0.04) {
      hoistT = Math.max(-1, Math.min(1, dh * 0.14));
    } else if (c.phase === 'lowerPickup' || c.phase === 'lowerDropoff') {
      hoistT = 0.92;
    } else if (c.phase === 'raisePickup' || c.phase === 'raiseDropoff') {
      hoistT = -0.92;
    }

    // Grip lever — back = open, forward = closed (tracks claw open→grip)
    const claw = c.claw ?? CLAW_OPEN;
    const span = CLAW_OPEN - CLAW_GRIP;
    const closed01 = Math.max(0, Math.min(1, (CLAW_OPEN - claw) / span));
    const gripT = closed01 * 2 - 1; // -1 open … +1 closed

    const k = Math.min(1, dt * 10);
    c.levers.travel += (travelT - c.levers.travel) * k;
    c.levers.hoist += (hoistT - c.levers.hoist) * k;
    c.levers.grip += (gripT - c.levers.grip) * k;
  }

  _updateCrane(dt) {
    const c = this.crane;
    if (!c) return;
    const moveSpeed = 120;
    const hoistSpeed = 55;
    const near = (a, b, eps = 2.5) => Math.abs(a - b) < eps;

    this._updateCraneClaw(dt);
    this._updateCraneLevers(dt);
    this._updateCraneOperatorLook(dt);

    if (c.pause > 0) {
      c.pause -= dt;
      return;
    }

    c.pickup = this._pileById(c.pickup?.id) || c.pickup;
    c.dropoff = this._pileById(c.dropoff?.id) || c.dropoff;
    // Keep floor-drop proxy cargo in sync if still on the deck
    if (c.pickup?.isFloorDrop && c.pickup.floorDropId) {
      const drop = this.floorDrops.find((d) => d.id === c.pickup.floorDropId);
      if (!drop) {
        this._applyCraneJob(c, this._pickCraneJob());
        return;
      }
      c.pickup.x = drop.x;
      c.pickup.y = drop.y;
      c.pickup.items = [drop.cargo];
    }

    switch (c.phase) {
      case 'idle': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hoist = HOIST_RAISED;
        c.hookTargetY = null;

        // Only leave home for doable work — don't camp blocked jams mid-bay
        const next = this._pickCraneJob();
        if (next && next.mode === 'work') {
          this._applyCraneJob(c, next);
          break;
        }

        // No doable work — return to top-left and wait there
        const park = this._craneHomeXY();
        if (!this._moveCraneXY(c, park.x, park.y, moveSpeed * 0.75, dt)) {
          break;
        }
        c.pause = 0.85;
        break;
      }
      case 'linger': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hookTargetY = null;
        // Dest freed?
        if (c.dropoff && c.dropoff.items.length < PILE_CAP && c.pickup?.items?.length) {
          c.lingerFor = null;
          c.phase = 'travelPickup';
          c.pause = 0.15;
          break;
        }
        // Re-evaluate: take doable work, else go home instead of camping the jam
        const retry = this._pickCraneJob();
        if (retry && retry.mode === 'work') {
          this._applyCraneJob(c, retry);
          break;
        }
        c.lingerFor = null;
        this._applyCraneJob(c, { mode: 'idle' });
        break;
      }
      case 'travelPickup': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hoist = HOIST_RAISED;
        c.hookTargetY = null;
        // Mech already grabbed this staging move — pick something else
        if (this._craneStagingBeatenByMech(c)) {
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        // Dest filled while en route — switch to next doable or linger
        if (c.dropoff && c.dropoff.items.length >= PILE_CAP) {
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        if (!c.pickup?.items?.length) {
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        const pickItem = c.pickup.isFloorDrop
          ? null
          : this._craneLockPickup(c);
        const t = this._craneParkXY(c.pickup, pickItem);
        if (this._moveCraneXY(c, t.x, t.y, moveSpeed, dt)) {
          const cargo = pickItem ?? c.pickup.items?.[0];
          const pos = pickItem
            ? this._itemWorldPos(c.pickup, pickItem)
            : { x: c.pickup.x, y: c.pickup.y };
          c.trolleyX = this._clampTrolleyX(pos.x);
          c._aimCargo = cargo;
          c.hookTargetY = this._craneHookForCargoCenter(pos.y, cargo);
          c.phase = 'lowerPickup';
        }
        break;
      }
      case 'lowerPickup': {
        if (this._craneStagingBeatenByMech(c)) {
          c.hookTargetY = null;
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        const pickItem = c.pickup?.isFloorDrop
          ? null
          : this._craneLockPickup(c);
        const cargo = pickItem ?? c.pickup?.items?.[0];
        if (!cargo && !c.pickup?.isFloorDrop) {
          c.hookTargetY = null;
          this._applyCraneJob(c, this._pickCraneJob());
          break;
        }
        if (pickItem) {
          const pos = this._itemWorldPos(c.pickup, pickItem);
          c.trolleyX = this._clampTrolleyX(pos.x);
          c._aimCargo = cargo;
          c.hookTargetY = this._craneHookForCargoCenter(pos.y, cargo);
        } else if (c.pickup) {
          c._aimCargo = cargo;
          c.hookTargetY = this._craneHookForCargoCenter(c.pickup.y, cargo);
        }
        c.hoist = Math.min(c.hoist + hoistSpeed * dt, HOIST_MAX);
        if (near(c.hoist, HOIST_MAX, 2)) {
          c.hoist = HOIST_MAX;
          if (c.pickup.items.length > 0) {
            if (pickItem && c.pickup.items.includes(pickItem)) {
              c.carried = this._pileRemove(c.pickup, pickItem);
            } else {
              c.carried = this._pilePop(c.pickup);
            }
            c._pickupItem = null;
            c._aimCargo = null;
            if (c.pickup.isFloorDrop && c.pickup.floorDropId) {
              this.floorDrops = this.floorDrops.filter((d) => d.id !== c.pickup.floorDropId);
            }
            c.pause = 0.28;
            c.phase = 'raisePickup';
          } else {
            c.pause = 0.15;
            c.phase = 'raiseDropoff';
          }
        }
        break;
      }
      case 'raisePickup': {
        c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
        if (near(c.hoist, HOIST_RAISED, 2)) {
          c.hoist = HOIST_RAISED;
          c.hookTargetY = null;
          // Re-target if planned dropoff doesn't match what we actually picked up
          if (c.carried && this._craneDropoffInvalid(c.dropoff, c.carried)) {
            const alt = this._findCraneDropoffFor(
              c.carried,
              c.dropoff?.bay ?? c.pickup?.bay,
              this._cranePreferLane(c)
            );
            if (alt) {
              c.dropoff = alt;
              c._dropSlot = null;
            } else {
              c.phase = 'lingerLoaded';
              c.pause = 0.2;
              break;
            }
          }
          c.phase = 'travelDropoff';
        }
        break;
      }
      case 'travelDropoff': {
        if (c.hoist > HOIST_RAISED + 1) {
          c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
          break;
        }
        c.hookTargetY = null;
        if (c.carried && c.dropoff && this._craneDropoffInvalid(c.dropoff, c.carried)) {
          const alt = this._findCraneDropoffFor(
            c.carried,
            c.dropoff.bay,
            this._cranePreferLane(c)
          );
          if (alt) {
            c.dropoff = alt;
            c._dropSlot = null;
          } else {
            c.phase = 'lingerLoaded';
            c.pause = 0.25;
            break;
          }
        }
        if (c.dropoff && c.dropoff.items.length >= PILE_CAP) {
          const alt = this._findCraneDropoffFor(
            c.carried,
            c.dropoff.bay,
            this._cranePreferLane(c)
          );
          if (alt) {
            c.dropoff = alt;
            c._dropSlot = null;
          } else {
            // Linger near intended dropoff with load raised
            c.phase = 'lingerLoaded';
            c.pause = 0.3;
            break;
          }
        }
        const dropSlot = this._craneEnsureDropSlot(c);
        const t = this._craneParkXY(c.dropoff, dropSlot);
        if (this._moveCraneXY(c, t.x, t.y, moveSpeed, dt)) {
          const cargoY =
            dropSlot != null && dropSlot >= 0
              ? c.dropoff.y + PILE_SLOTS[dropSlot].oy
              : c.dropoff.y;
          c.hookTargetY = this._craneHookForCargoCenter(cargoY, c.carried);
          c.phase = 'lowerDropoff';
        }
        break;
      }
      case 'lingerLoaded': {
        const dropSlot = this._craneEnsureDropSlot(c);
        const t = this._craneParkXY(c.dropoff, dropSlot);
        this._moveCraneXY(c, t.x, t.y, moveSpeed * 0.6, dt);
        if (c.dropoff && !this._craneDropoffInvalid(c.dropoff, c.carried)) {
          c.phase = 'travelDropoff';
          c.pause = 0.1;
          break;
        }
        const alt = this._findCraneDropoffFor(
          c.carried,
          c.dropoff?.bay,
          this._cranePreferLane(c)
        );
        if (alt && alt.id !== c.dropoff?.id) {
          c.dropoff = alt;
          c._dropSlot = null;
          c.phase = 'travelDropoff';
          c.pause = 0.1;
          break;
        }
        c.pause = 0.4;
        break;
      }
      case 'lowerDropoff': {
        const dropSlot = this._craneEnsureDropSlot(c);
        const cargoY =
          dropSlot != null && dropSlot >= 0
            ? c.dropoff.y + PILE_SLOTS[dropSlot].oy
            : c.dropoff?.y;
        c.hookTargetY = this._craneHookForCargoCenter(cargoY, c.carried);
        c.hoist = Math.min(c.hoist + hoistSpeed * dt, HOIST_MAX);
        if (near(c.hoist, HOIST_MAX, 2)) {
          c.hoist = HOIST_MAX;
          const canDrop =
            c.carried && c.dropoff && !this._craneDropoffInvalid(c.dropoff, c.carried);
          if (canDrop) {
            if (dropSlot != null && dropSlot >= 0) {
              c.carried.pileSlot = dropSlot;
            }
            this._pilePush(c.dropoff, c.carried);
            c.carried = null;
            c._dropSlot = null;
            c.pause = 0.3;
            c.phase = 'raiseDropoff';
          } else if (c.carried) {
            const alt = this._findCraneDropoffFor(
              c.carried,
              c.dropoff?.bay,
              this._cranePreferLane(c)
            );
            if (alt) {
              c.dropoff = alt;
              c._dropSlot = null;
              c.phase = 'raisePickup';
              c.pause = 0.12;
            } else {
              c.phase = 'raisePickup';
              c._afterRaise = 'lingerLoaded';
              c.pause = 0.12;
            }
          } else {
            c.pause = 0.3;
            c.phase = 'raiseDropoff';
          }
        }
        break;
      }
      case 'raiseDropoff': {
        c.hoist = Math.max(HOIST_RAISED, c.hoist - hoistSpeed * dt);
        if (near(c.hoist, HOIST_RAISED, 2)) {
          c.hoist = HOIST_RAISED;
          c.hookTargetY = null;
          if (c._afterRaise === 'lingerLoaded' && c.carried) {
            c._afterRaise = null;
            c.phase = 'lingerLoaded';
            c.pause = 0.2;
            break;
          }
          c._afterRaise = null;
          this._applyCraneJob(c, this._pickCraneJob());
        }
        break;
      }
      default:
        this._applyCraneJob(c, this._pickCraneJob());
    }
  }

  _enumerateMechanicTasks(bay, pad) {
    const tasks = [];
    const midIn = this._bayPile(bay, 'in', ROW.M);
    const midOut = this._bayPile(bay, 'out', ROW.M);
    const upIn = this._bayPile(bay, 'in', ROW.N);
    const upOut = this._bayPile(bay, 'out', ROW.N);
    const svcPad = this._servicePad(bay);
    const svc = svcPad?.service;
    const svcActive = svc?.phase === 'active';
    const needs = (type) =>
      svcActive && svc.items.some((it) => it.type === type && it.status !== 'done');

    // Hull repair — one task per checklist pip; each pip plays out over several hull spots
    if (needs('repair')) {
      for (const it of svc.items) {
        if (it.type !== 'repair' || it.status === 'done') continue;
        tasks.push({
          job: 'weld',
          targetPad: pad,
          bay,
          targetPile: null,
          serviceItemId: it.id,
          status: 'doable',
          weight: 7,
          clears: false,
          service: true,
          tripsLeft: weldSpotsForPip(),
        });
      }
    }

    // Load — one task per staged crate so both bay mechs can work in parallel
    if (midIn?.items.length) {
      const loadWeight = svcActive ? 9 : midIn.items.length >= PILE_CAP ? 8 : 4;
      const loadClears = midIn.items.length >= PILE_CAP;
      for (const c of midIn.items) {
        if (svcActive) {
          if (c.serviceKey == null) continue;
          const it = svc.items.find(
            (i) => i.id === c.serviceKey && i.status !== 'done'
          );
          if (
            !it ||
            (it.type !== 'refuel' &&
              it.type !== 'reloadBullets' &&
              it.type !== 'reloadShells' &&
              it.type !== 'loadCargo')
          ) {
            continue;
          }
          tasks.push({
            job: 'loadShip',
            targetPad: pad,
            bay,
            targetPile: midIn,
            serviceItemId: c.serviceKey,
            cargoId: c.id,
            status: 'doable',
            weight: loadWeight,
            clears: loadClears,
            tripsLeft: 1,
          });
        } else {
          tasks.push({
            job: 'loadShip',
            targetPad: pad,
            bay,
            targetPile: midIn,
            serviceItemId: `cargo:${c.id}`,
            cargoId: c.id,
            status: 'doable',
            weight: loadWeight,
            clears: loadClears,
            tripsLeft: 1,
          });
        }
      }
    }
    // Install — one task per staged upgrade part
    if (upIn?.items.length) {
      const def = this._shipDefForBay(bay);
      const mounts = def?.resolveMounts?.() || {};
      const instWeight = svcActive ? 9 : upIn.items.length >= PILE_CAP ? 8 : 4;
      const instClears = upIn.items.length >= PILE_CAP;
      for (const c of upIn.items) {
        if (c.family !== 'upgrade') continue;
        if (svcActive) {
          if (c.serviceKey == null && !needs('upgrade')) continue;
          if (c.serviceKey != null) {
            const it = svc.items.find(
              (i) =>
                i.id === c.serviceKey &&
                i.type === 'upgrade' &&
                i.status !== 'done'
            );
            if (!it) continue;
          } else if (!needs('upgrade')) {
            continue;
          }
        }
        let canInstall = true;
        if (c.targetHardpointKey) {
          const m = mounts[c.targetHardpointKey];
          canInstall = !!(m && !m.item);
        } else {
          const cat =
            c.catalogCategory ||
            categoryFromFreightLabel(c.label) ||
            getItem(c.catalogItemId)?.category;
          if (cat && def) canInstall = emptySocketsForCategory(def, cat).length > 0;
        }
        if (!canInstall) continue;
        tasks.push({
          job: 'installUpgrade',
          targetPad: pad,
          bay,
          targetPile: upIn,
          serviceItemId: c.serviceKey ?? `cargo:${c.id}`,
          cargoId: c.id,
          status: 'doable',
          weight: instWeight,
          clears: instClears,
          tripsLeft: 1,
        });
      }
    }

    // Unload — one task per checklist unit (both mechs can pull different boxes)
    if (midOut && needs('unloadCargo')) {
      const unloadItems = svc.items.filter(
        (it) => it.type === 'unloadCargo' && it.status !== 'done'
      );
      const room = Math.max(0, PILE_CAP - midOut.items.length);
      unloadItems.forEach((it, i) => {
        tasks.push({
          job: 'unloadShip',
          targetPad: pad,
          bay,
          targetPile: midOut,
          serviceItemId: it.id,
          status: i < room ? 'doable' : 'blocked',
          weight: 8,
          clears: false,
          tripsLeft: 1,
        });
      });
    }

    // Strip only the exact hardpoint named by a staged Install part (if occupied)
    if (upOut && needs('upgrade')) {
      const def = this._shipDefForBay(bay);
      const staged = (upIn?.items || []).filter((c) => c.family === 'upgrade');
      let stripHardpointKey = null;
      let stripCategory = null;
      for (const c of staged) {
        if (c.targetHardpointKey && needsStripBeforeInstallKey(def, c.targetHardpointKey)) {
          stripHardpointKey = c.targetHardpointKey;
          stripCategory =
            c.catalogCategory ||
            categoryFromFreightLabel(c.label) ||
            getItem(c.catalogItemId)?.category;
          break;
        }
      }
      if (!stripHardpointKey) {
        for (const c of staged) {
          if (c.targetHardpointKey) continue;
          const cat =
            c.catalogCategory ||
            categoryFromFreightLabel(c.label) ||
            getItem(c.catalogItemId)?.category;
          if (cat && needsStripBeforeInstall(def, cat)) {
            stripCategory = cat;
            break;
          }
        }
      }
      if ((stripHardpointKey || stripCategory) && def) {
        const stagedMatch = staged.find(
          (c) =>
            (stripHardpointKey && c.targetHardpointKey === stripHardpointKey) ||
            (stripCategory &&
              !c.targetHardpointKey &&
              (c.catalogCategory ||
                categoryFromFreightLabel(c.label) ||
                getItem(c.catalogItemId)?.category) === stripCategory)
        );
        tasks.push({
          job: 'removeUpgrade',
          targetPad: pad,
          bay,
          targetPile: upOut,
          serviceItemId:
            stagedMatch?.serviceKey ||
            stripHardpointKey ||
            stripCategory ||
            `strip:${bay}`,
          status: upOut.items.length < PILE_CAP ? 'doable' : 'blocked',
          weight: 10,
          clears: false,
          stripCategory,
          stripHardpointKey,
          tripsLeft: 1,
        });
      }
    }
    return tasks;
  }

  /**
   * @returns {{ mode: 'work'|'linger'|'idle', job?, targetPad?, bay?, targetPile? }}
   */
  _pickMechanicTask(npc) {
    const homeBay = npc.homeBay ?? npc.bay ?? 0;
    const pads = this._dockTargets().filter((p) => bayIndexFromX(p.x) === homeBay);
    const servicePad = this._servicePad(homeBay);

    // Already carrying — deliver ferry dest or outbound unload pile
    if (npc.cargo) {
      if (npc.job === 'stageFerry') {
        const dest =
          this._pileById(npc.ferryDest?.id) || npc.ferryDest || null;
        const pad =
          pads[0] ||
          (servicePad
            ? {
                x: servicePad.x,
                y: 0,
                bayId: servicePad.bayId,
                bayIndex: homeBay,
                occupied: true,
              }
            : null);
        if (!pad || !dest) return { mode: 'idle' };
        if (dest.items.length < PILE_CAP) {
          return {
            mode: 'work',
            job: 'stageFerry',
            targetPad: pad,
            bay: homeBay,
            targetPile: dest,
            ferryDest: dest,
            ferrySource: npc.ferrySource || null,
            tripsLeft: 1,
            weight: 5,
          };
        }
        return {
          mode: 'linger',
          job: 'stageFerry',
          targetPad: pad,
          bay: homeBay,
          targetPile: dest,
          ferryDest: dest,
          tripsLeft: 1,
          weight: 3,
        };
      }
      const pad =
        pads[0] ||
        (servicePad
          ? {
              x: servicePad.x,
              y: 0,
              bayId: servicePad.bayId,
              bayIndex: homeBay,
              occupied: true,
            }
          : null);
      if (!pad) return { mode: 'idle' };
      const row = npc.cargo.family === 'upgrade' ? ROW.N : ROW.M;
      const job = npc.cargo.family === 'upgrade' ? 'removeUpgrade' : 'unloadShip';
      const dest = this._bayPile(homeBay, 'out', row);
      if (dest && dest.items.length < PILE_CAP) {
        return {
          mode: 'work',
          job,
          targetPad: pad,
          bay: homeBay,
          targetPile: dest,
          weight: 5,
        };
      }
      if (dest) {
        return {
          mode: 'linger',
          job,
          targetPad: pad,
          bay: homeBay,
          targetPile: dest,
          weight: 3,
        };
      }
      return { mode: 'idle' };
    }

    if (!pads.length && !this.bayClearing[homeBay]) {
      return { mode: 'idle' };
    }

    const all = [];
    if (pads.length) {
      for (const pad of pads) {
        for (const t of this._enumerateMechanicTasks(homeBay, pad)) all.push(t);
      }
    } else if (this.bayClearing[homeBay] && servicePad) {
      const stub = {
        x: servicePad.x,
        y: 0,
        bayId: servicePad.bayId,
        bayIndex: homeBay,
        occupied: false,
      };
      for (const t of this._enumerateMechanicTasks(homeBay, stub)) all.push(t);
    }

    const free = this._filterUnclaimed(all, npc);
    const doable = free.filter((t) => t.status === 'doable');
    const blocked = free.filter((t) => t.status === 'blocked');

    // Strip-before-install must beat install attempts (otherwise weld-loop on full sockets)
    let pool = doable.filter((t) => t.job === 'removeUpgrade');
    if (!pool.length) pool = doable.filter((t) => t.job === 'weld' && t.service);
    if (!pool.length) pool = doable.filter((t) => t.clears);
    if (!pool.length) {
      pool = doable.filter(
        (t) => t.job === 'loadShip' || t.job === 'installUpgrade' || t.job === 'unloadShip'
      );
    }
    if (!pool.length) pool = doable.filter((t) => t.job !== 'weld');
    if (!pool.length) pool = doable;

    const chosen = this._pickWeighted(pool);
    if (chosen) {
      return { mode: 'work', ...chosen };
    }

    const wait = this._pickWeighted(blocked);
    if (wait) {
      return { mode: 'linger', ...wait };
    }

    // Idle helper: bay staging ferry only while the crane is busy elsewhere
    if (this._craneIsBusy()) {
      const ferry = this._pickMechanicStagingFerry(npc, homeBay);
      if (ferry) return ferry;
    }

    return { mode: 'idle' };
  }

  /** True when the overhead crane is mid-job (mechs may help stage their bay). */
  _craneIsBusy() {
    const c = this.crane;
    if (!c) return true;
    if ((c.pause || 0) >= 50) return true; // frozen for bay ops
    return c.phase !== 'idle';
  }

  /** True when the pad ship hold has at least one free 1×1 slot for a Load. */
  _shipHoldHasLoadRoom(pad) {
    const st = pad?.shipState;
    if (!st || !(st.cargoMk > 0)) return false;
    const hold = st.cargoHold;
    if (!hold?.slots) return false;
    let used = 0;
    for (const c of hold.cells || []) used += (c.w || 1) * (c.h || 1);
    return used < hold.slots;
  }

  /**
   * South-in → mid-in service freight the idle mech can walk straight onto the ship
   * (fuel / ammo / hold cargo) instead of mid-staging then loading again.
   * Hold cargo waits on the shelf when the bay is full or unloads are still pending.
   */
  _stagingTaskIsDirectShipLoad(t, bay) {
    if (!t?.pickup || !t.dropoff || t.cargoId == null) return false;
    if (t.pickup.lane !== 'in' || t.pickup.row !== ROW.S) return false;
    if (t.dropoff.lane !== 'in' || t.dropoff.row !== ROW.M) return false;
    const cargo = t.pickup.items?.find((c) => c.id === t.cargoId);
    if (!cargo || cargo.family === 'upgrade') return false;
    const pad = this._servicePad(bay);
    if (!pad?.visitorId || pad.seq || pad.service?.phase !== 'active') {
      return false;
    }
    if (!this._padWorkable(pad)) return false;
    const it = pad.service.items.find(
      (i) =>
        i.id === cargo.serviceKey &&
        i.status !== 'done' &&
        (i.type === 'refuel' ||
          i.type === 'reloadBullets' ||
          i.type === 'reloadShells' ||
          i.type === 'loadCargo')
    );
    if (!it) return false;
    if (it.type === 'loadCargo') {
      const unloadPending = pad.service.items.some(
        (i) => i.type === 'unloadCargo' && i.status !== 'done'
      );
      if (unloadPending) return false;
      if (!this._shipHoldHasLoadRoom(pad)) return false;
    }
    return true;
  }

  /**
   * Idle mechanic staging help for their home bay only.
   * Shipbound fuel/ammo/cargo from south-in loads straight to the pad ship;
   * upgrades and other moves still ferry to the mid/north shelf.
   */
  _pickMechanicStagingFerry(npc, homeBay) {
    const tasks = this._enumerateBayStagingTasks(homeBay);
    const crane = this.crane;
    const craneCargoId = crane?.carried?.id ?? crane?._pickupItem?.id ?? null;
    const free = this._filterUnclaimed(
      tasks
        .filter((t) => t.status === 'doable')
        .filter((t) => {
          if (t.cargoId != null && craneCargoId != null && t.cargoId === craneCargoId) {
            return false;
          }
          return true;
        })
        .map((t) => {
          const sid =
            t.serviceItemId ??
            (t.cargoId != null ? `cargo:${t.cargoId}` : null);
          if (this._stagingTaskIsDirectShipLoad(t, homeBay)) {
            return {
              job: 'loadShip',
              targetPile: t.pickup,
              bay: homeBay,
              status: 'doable',
              weight: (t.weight || 1) + 6,
              clears: t.clears,
              tripsLeft: 1,
              cargoId: t.cargoId,
              serviceItemId: sid,
              targetSlot: t.targetSlot,
              directFromSouth: true,
            };
          }
          return {
            job: 'stageFerry',
            targetPile: t.pickup,
            ferryDest: t.dropoff,
            ferrySource: t.pickup,
            bay: homeBay,
            status: 'doable',
            weight: t.weight || 1,
            clears: t.clears,
            tripsLeft: 1,
            cargoId: t.cargoId,
            serviceItemId: sid,
            targetSlot: t.targetSlot,
          };
        }),
      npc
    );
    // Prefer direct ship loads, then clearing moves, then anything else
    let pool = free.filter((t) => t.job === 'loadShip');
    if (!pool.length) pool = free.filter((t) => t.clears);
    if (!pool.length) pool = free;
    const chosen = this._pickWeighted(pool);
    if (!chosen) return null;
    const svcPad = this._servicePad(homeBay);
    const pad =
      this._dockTargets().find((p) => bayIndexFromX(p.x) === homeBay) ||
      (svcPad
        ? {
            x: svcPad.x,
            y: 0,
            bayId: svcPad.bayId,
            bayIndex: homeBay,
            occupied: true,
          }
        : null);
    if (!pad) return null;
    return {
      mode: 'work',
      ...chosen,
      targetPad: pad,
    };
  }

  _assignMechanicRoute(npc) {
    const pick = this._pickMechanicTask(npc);
    npc.hullTarget = null;
    npc.targetPile = null;
    npc.lingerPile = null;

    if (pick.mode === 'idle' || pick.mode === 'despawn') {
      npc.job = 'idle';
      this._clearTaskClaim(npc);
      return false;
    }

    npc.job = pick.job;
    npc.targetPad = pick.targetPad;
    npc.bay = pick.bay ?? npc.homeBay;
    npc.targetPile = pick.targetPile;
    npc.tripsLeft =
      pick.tripsLeft != null
        ? pick.tripsLeft
        : pick.job === 'removeUpgrade'
          ? 1
          : 2 + ((Math.random() * 3) | 0);
    npc.taskMode = pick.mode;
    npc.stripCategory = pick.stripCategory || null;
    npc.stripHardpointKey = pick.stripHardpointKey || null;
    npc.ferryDest = pick.ferryDest || null;
    npc.ferrySource =
      pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
    npc.directFromSouth = !!pick.directFromSouth;
    npc._claimCargoId = pick.cargoId ?? null;
    if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
    if (pick.mode === 'linger') {
      npc.lingerPile = pick.targetPile;
    }
    this._applyTaskClaim(
      npc,
      pick.job,
      pick.targetPile,
      pick.bay,
      pick.serviceItemId ?? null
    );
    return true;
  }

  _bayWorkPiles(padX, lane, row) {
    const bay = bayIndexFromX(padX);
    const pile = this._bayPile(bay, lane, row);
    return pile ? [pile] : [];
  }

  /** @deprecated — mid inbound of nearest bay */
  _nearbyMidPiles(padX) {
    return this._bayWorkPiles(padX, 'in', ROW.M);
  }

  /** Station roster from hangar Place config (Jennings = 6 mechs + 4 forklifts). */
  _initStationCrew() {
    this.npcs = [];
    const labels = this._bayLabels();
    const n = Math.max(1, this.hangarConfig?.bayCount || 3);
    const mechsPerBay = this.hangarConfig?.mechsPerBay || [2, 2, 2];
    for (let bay = 0; bay < n; bay++) {
      const count = Math.max(0, mechsPerBay[bay] | 0);
      for (let slot = 1; slot <= count; slot++) {
        this._createMechanic(`${labels[bay]}Mechanic${slot}`, bay, slot);
      }
    }
    const forkliftCount = this.hangarConfig?.hasForkliftHub
      ? Math.max(0, this.hangarConfig?.forkliftCount | 0)
      : 0;
    if (forkliftCount > 0) {
      const step = Math.max(1, Math.floor(FORKLIFT_PARK_COUNT / forkliftCount));
      for (let i = 0; i < forkliftCount; i++) {
        const parkIndex = Math.min(i * step, FORKLIFT_PARK_COUNT - 1);
        this._createForklift(`forklift${i + 1}`, parkIndex);
      }
    }
  }

  _createMechanic(id, homeBay, slot) {
    const comp = BAY_COMPUTERS[homeBay];
    const ox = slot === 1 ? -10 : 10;
    const npc = {
      id,
      kind: 'mechanic',
      uid: this._npcUid++,
      alive: true,
      homeBay,
      x: comp.x + ox,
      y: comp.y + 16,
      vx: 0,
      facing: homeBay === 2 ? -1 : 1,
      phase: Math.random() * Math.PI * 2,
      state: 'idleFluff',
      stateT: rand(0.4, 1.2),
      side: homeBay === 0 ? -1 : 1,
      entry: 'apron',
      exit: 'apron',
      stair: STAIRS[homeBay],
      exitStair: STAIRS[homeBay],
      cargo: null,
      droppedCargoId: null,
      floorDropId: null,
      targetPile: null,
      lingerPile: null,
      targetSlot: null,
      mechPhase: null,
      mechHandT: 0,
      _mechLift: null,
      targetPad: null,
      bay: homeBay,
      job: 'idle',
      taskMode: 'idle',
      tripsLeft: 0,
      emergeT: 0,
      exitArmed: true,
      claimKey: null,
      secSinceLastBayTask: rand(5, 40),
      lingerTarget: null,
      gossipWp: null,
      gossipSlot: null,
      lingerFaceRad: null,
      _crossing: false,
      _crossPhase: 0,
      _corridorX: null,
      _crossCool: 0,
      theme: MECH_BAY_THEMES[homeBay] || MECH_BAY_THEMES[0],
      suit: (MECH_BAY_THEMES[homeBay] || MECH_BAY_THEMES[0]).suit,
      helmet: (MECH_BAY_THEMES[homeBay] || MECH_BAY_THEMES[0]).helmet,
      // Draw yaw (8-dir); job/hand math still uses facing ±1
      visHeading: homeBay === 2 ? Math.PI : 0,
      _visOct: homeBay === 2 ? 4 : 0,
      _skirtWp: null,
    };
    if (this._assignMechanicRoute(npc)) {
      this._startMechanicJob(npc);
    } else {
      this._beginIdleFluff(npc);
    }
    this.npcs.push(npc);
  }

  _createForklift(id, parkIndex) {
    const park = FORKLIFT_PARKS[parkIndex] || FORKLIFT_PARKS[0];
    const side = park.x < 0 ? -1 : 1;
    const npc = {
      id,
      kind: 'forklift',
      alive: true,
      parkIndex: park.index,
      x: park.x,
      y: park.y,
      vx: 0,
      facing: park.x <= 0 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
      state: 'atHub',
      stateT: rand(0.5, 2),
      side,
      job: 'idle',
      cargo: null,
      targetPile: null,
      lingerPile: null,
      claimKey: null,
      body: pick(['#c87830', '#b86028', '#d08840', '#c07038']),
      forkH: FORK_RAISED,
      forkPhase: null,
      targetSlot: null,
      _forkLift: null,
      // Draw yaw (8-dir); job/fork math still uses facing ±1
      visHeading: park.x <= 0 ? 0 : Math.PI,
      _visOct: park.x <= 0 ? 0 : 4,
    };
    this.npcs.push(npc);
  }

  _parkMechanicIdle(npc) {
    const comp = BAY_COMPUTERS[npc.homeBay ?? 0];
    npc.x = comp.x + (Math.random() < 0.5 ? -8 : 8);
    npc.y = comp.y + 14;
    npc.cargo = null;
    npc.job = 'idle';
    npc.taskMode = 'idle';
    this._clearTaskClaim(npc);
    this._beginIdleFluff(npc);
  }

  _forkParkTaken(index, exceptNpc = null) {
    if (index == null) return false;
    return this.npcs.some(
      (n) =>
        n.alive &&
        n.kind === 'forklift' &&
        n !== exceptNpc &&
        n.parkIndex === index
    );
  }

  /** Closest empty stall; claim it before pathing so nobody else grabs it. */
  _claimForkliftPark(npc) {
    if (
      npc.parkIndex != null &&
      FORKLIFT_PARKS[npc.parkIndex] &&
      !this._forkParkTaken(npc.parkIndex, npc)
    ) {
      return FORKLIFT_PARKS[npc.parkIndex];
    }
    let best = null;
    let bestD = Infinity;
    for (const park of FORKLIFT_PARKS) {
      if (this._forkParkTaken(park.index, npc)) continue;
      const d = Math.hypot(npc.x - park.x, npc.y - park.y);
      if (d < bestD) {
        bestD = d;
        best = park;
      }
    }
    if (!best) {
      // Every stall claimed — sit at the geometrically nearest anyway
      best = FORKLIFT_PARKS.slice().sort(
        (a, b) =>
          Math.hypot(npc.x - a.x, npc.y - a.y) -
          Math.hypot(npc.x - b.x, npc.y - b.y)
      )[0];
    }
    npc.parkIndex = best.index;
    npc.facing = best.x <= 0 ? 1 : -1;
    return best;
  }

  _releaseForkliftPark(npc) {
    npc.parkIndex = null;
  }

  /** Reserve a stall, then path (or snap) home. */
  _forkGoToHub(npc) {
    const park = this._claimForkliftPark(npc);
    npc.state = 'toHub';
    return park;
  }

  _parkForkliftAtHub(npc) {
    this._forkClearMerge(npc);
    const park = this._claimForkliftPark(npc);
    npc.x = park.x;
    npc.y = park.y;
    npc.facing = park.x <= 0 ? 1 : -1;
    npc.cargo = null;
    npc.job = 'idle';
    this._clearTaskClaim(npc);
    npc.state = 'atHub';
    npc.stateT = rand(0.8, 2.5);
  }

  /** @deprecated — use _initStationCrew */
  _spawnMechanic() {
    /* no-op: fixed roster */
  }

  /** @deprecated — use _initStationCrew */
  _spawnForklift() {
    /* no-op: fixed roster */
  }

  _tryRerouteMechanicFromExit(npc) {
    if (npc.cargo) return false;
    const pick = this._pickMechanicTask(npc);
    if (pick.mode !== 'work' && pick.mode !== 'linger') return false;
    const useful =
      pick.clears ||
      pick.service ||
      pick.job === 'loadShip' ||
      pick.job === 'installUpgrade' ||
      pick.job === 'unloadShip' ||
      pick.job === 'removeUpgrade' ||
      pick.job === 'stageFerry' ||
      pick.mode === 'linger';
    if (!useful) return false;
    npc.tripsLeft = Math.max(
      1,
      pick.tripsLeft != null
        ? pick.tripsLeft
        : pick.job === 'removeUpgrade'
          ? 1
          : npc.tripsLeft || 1
    );
    npc.job = pick.job;
    npc.targetPad = pick.targetPad;
    npc.bay = pick.bay ?? npc.homeBay;
    npc.targetPile = pick.targetPile;
    npc.taskMode = pick.mode;
    npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
    npc.stripCategory = pick.stripCategory || null;
    npc.stripHardpointKey = pick.stripHardpointKey || null;
    npc.ferryDest = pick.ferryDest || null;
    npc.ferrySource =
      pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
    npc.directFromSouth = !!pick.directFromSouth;
    npc._claimCargoId = pick.cargoId ?? null;
    if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
    npc.exitArmed = true;
    npc.exitStair = STAIRS[npc.homeBay] || this._nearestStair(npc.x);
    npc.hullTarget = null;
    this._applyTaskClaim(
      npc,
      pick.job,
      pick.targetPile,
      pick.bay,
      pick.serviceItemId ?? null
    );
    this._startMechanicJob(npc);
    return true;
  }

  _tryRerouteForkliftFromExit(npc) {
    // Already hauling outbound — finish leaving
    if (npc.cargo && npc.job === 'takeOut') return false;
    // Carrying inbound — finish that trip; don't dump it for takeOut
    if (npc.cargo) return false;
    // Empty truck leaving: snag outbound before exiting to fetch inbound
    const pick = this._pickForkliftJob(npc);
    if (pick.mode !== 'work' && pick.mode !== 'linger') return false;
    if (pick.job !== 'takeOut') return false;
    if (!this._forkAssignTakeOut(npc, pick)) return false;
    npc.state = pick.mode === 'linger' ? 'linger' : 'toPile';
    npc.stateT = 0.2;
    return true;
  }

  _nearestStair(x) {
    return STAIRS.slice().sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
  }

  /**
   * One takeOut task per occupied quadrant so multiple trucks can clear the same
   * outbound pad in parallel (mirrors inbound fetchIn / drop-slot claims).
   */
  _enumerateTakeOutSlotTasks(pile, { weight, clears }, exceptNpc = null) {
    if (!pile?.items?.length) return [];
    const claimed = this._claimedTaskKeys(exceptNpc);
    const tasks = [];
    const seen = new Set();
    for (const item of pile.items) {
      let slot = item.pileSlot;
      if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
        slot = this._pileAssignSlotIfMissing(pile, item);
      }
      if (slot == null || slot < 0 || seen.has(slot)) continue;
      seen.add(slot);
      const key = this._taskClaimKey('takeOut', pile, pile.bay, slot);
      if (claimed.has(key)) continue;
      const stolen = this.npcs.some(
        (n) =>
          n !== exceptNpc &&
          n.alive &&
          n.kind === 'forklift' &&
          n.job === 'takeOut' &&
          n.targetPile?.id === pile.id &&
          n.targetSlot === slot
      );
      if (stolen) continue;
      tasks.push({
        job: 'takeOut',
        targetPile: pile,
        targetSlot: slot,
        bay: pile.bay,
        status: 'doable',
        weight,
        clears,
      });
    }
    return tasks;
  }

  /**
   * Forklift tasks: bringIn (south-in room) / takeOut (south-out items).
   * Forklifts can only clear south-row blockages (not mid/upgrade).
   */
  _enumerateForkliftTasks(npc) {
    const tasks = [];
    const south = this._pilesInRow(ROW.S);
    const southIn = south.filter((p) => p.lane === 'in');
    const southOut = south.filter((p) => p.lane === 'out');

    // Who is blocked on south piles? (crane waiting to drop on south-out)
    const craneBlocked = this._enumerateCraneTasks().filter((t) => t.status === 'blocked');
    const blockedSouthOut = new Set(
      craneBlocked.filter((t) => t.dropoff.row === ROW.S && t.dropoff.lane === 'out').map((t) => t.dropoff.id)
    );

    for (const p of southOut) {
      if (!p.items.length) continue;
      const clears = p.items.length >= PILE_CAP || blockedSouthOut.has(p.id) || this.bayClearing[p.bay];
      const weight = clears ? (this.bayClearing[p.bay] ? 18 : 12) : 6;
      tasks.push(...this._enumerateTakeOutSlotTasks(p, { weight, clears }, npc));
    }

    // Empty-bay sweep: haul leftover inbound south stock off-station too
    for (const p of southIn) {
      if (!this.bayClearing[p.bay] || !p.items.length) continue;
      tasks.push(
        ...this._enumerateTakeOutSlotTasks(p, { weight: 18, clears: true }, npc)
      );
    }

    const roomIn = southIn.filter(
      (p) => p.items.length < PILE_CAP && this._bayNeedsInbound(p.bay)
    );
    const roomAnyIn = southIn.filter((p) => p.items.length < PILE_CAP);
    const fullIn = southIn.filter((p) => p.items.length >= PILE_CAP);

    // Service cargo must land on its checklist bay only (never into a clearing bay)
    if (npc.cargo?.serviceBay != null) {
      const bay = npc.cargo.serviceBay;
      if (this.bayClearing[bay] || this._opsBays.has(bay)) {
        // Visit ended — restage is moot; dump to outbound or despawn restage
        this._restageServiceCargo(npc.cargo);
        const out = this._bayPile(bay, 'out', ROW.S) || this._pilesInRow(ROW.S).find((p) => p.lane === 'out');
        const cargoRef = npc.cargo.serviceKey || npc.cargo.id;
        if (out && out.items.length < PILE_CAP) {
          tasks.push({
            job: 'bringIn',
            targetPile: out,
            bay,
            cargoId: npc.cargo.id,
            serviceItemId: cargoRef,
            status: 'doable',
            weight: 16,
            clears: true,
          });
        } else if (roomAnyIn.length) {
          // Ops/clear blocked the service bay — still put the crate down somewhere
          const dest = pick(roomAnyIn);
          tasks.push({
            job: 'bringIn',
            targetPile: dest,
            bay: dest.bay,
            cargoId: npc.cargo.id,
            serviceItemId: cargoRef,
            status: 'doable',
            weight: 10,
            clears: true,
          });
        }
      } else {
        const dest = this._bayPile(bay, 'in', ROW.S);
        if (dest) {
          tasks.push({
            job: 'bringIn',
            targetPile: dest,
            bay,
            cargoId: npc.cargo.id,
            serviceItemId: npc.cargo.serviceKey || npc.cargo.id,
            status: dest.items.length < PILE_CAP ? 'doable' : 'blocked',
            weight: 14,
            clears: false,
          });
        }
      }
    } else if (npc.cargo) {
      // Already carrying: soft-cap must not block deposit (only new fetches).
      const cargoRef = npc.cargo.serviceKey || npc.cargo.id;
      if (roomAnyIn.length) {
        const prefer = roomIn.length ? roomIn : roomAnyIn;
        const dest = pick(prefer);
        tasks.push({
          job: 'bringIn',
          targetPile: dest,
          bay: dest.bay,
          cargoId: npc.cargo.id,
          serviceItemId: cargoRef,
          status: 'doable',
          weight: this._pressure < 0 ? 3 : 1.5,
          clears: false,
        });
      } else if (fullIn.length) {
        const dest = pick(fullIn);
        tasks.push({
          job: 'bringIn',
          targetPile: dest,
          bay: dest.bay,
          cargoId: npc.cargo.id,
          serviceItemId: cargoRef,
          status: 'blocked',
          weight: 2,
          clears: false,
        });
      }
    } else {
      // Empty truck: one fetch task per pending checklist item (parallel staging)
      const fetches = this._enumerateFetchInCandidates(npc);
      for (const f of fetches) {
        tasks.push({
          job: 'fetchIn',
          targetPile: f.targetPile,
          bay: f.bay,
          serviceItemId: f.serviceItemId,
          status: 'doable',
          weight: 5 + Math.min(4, f.pendingCount || 1),
          clears: false,
        });
      }
    }

    return tasks;
  }

  _pickForkliftJob(npc) {
    const tasks = this._filterUnclaimed(this._enumerateForkliftTasks(npc), npc);
    let pool = tasks;
    if (npc.cargo) {
      pool = tasks.filter((t) => t.job === 'bringIn');
    } else {
      const take = tasks.filter((t) => t.job === 'takeOut');
      const fetch = tasks.filter((t) => t.job === 'fetchIn');
      // Empty truck: always prefer outbound before leaving to fetch inbound
      if (take.length) {
        const clearing = take.filter((t) => t.clears);
        pool = clearing.length ? clearing : take;
      } else {
        pool = fetch;
      }
    }

    const doable = pool.filter((t) => t.status === 'doable');
    const blocked = pool.filter((t) => t.status === 'blocked');

    let prefer = doable.filter((t) => t.clears);
    if (!prefer.length) prefer = doable;

    const chosen = this._pickWeighted(prefer);
    if (chosen) return { mode: 'work', ...chosen };

    const wait = this._pickWeighted(blocked);
    if (wait) return { mode: 'linger', ...wait };

    return { mode: 'idle' };
  }

  _hasOutboundCargo() {
    return this._pilesInRow(ROW.S).some(
      (p) => p.lane === 'out' && p.items.length > 0
    );
  }

  /** Spawn inbound for a preferred bay/item, else any open staging need. */
  _makeSmartInboundCargo(preferBay = null, preferItemId = null) {
    const padNeedsSpawn = (p) =>
      !!p?.visitorId &&
      !!p.service?.items?.some((it) => this._serviceItemNeedsSpawn(p, it));

    if (preferBay != null) {
      const preferred = this._servicePad(preferBay);
      if (preferItemId != null) {
        const it = preferred?.service?.items?.find((i) => i.id === preferItemId);
        if (this._serviceItemNeedsSpawn(preferred, it)) {
          return this._makeServiceInboundCargo(preferred, preferItemId);
        }
      }
      if (padNeedsSpawn(preferred)) {
        return this._makeServiceInboundCargo(preferred, preferItemId);
      }
    }

    const pads = this._allServicePads().filter(padNeedsSpawn);
    if (!pads.length) return null;
    return this._makeServiceInboundCargo(pick(pads), preferItemId);
  }

  /** Bind an empty truck to a specific outbound quadrant (claim slot before pathing). */
  _forkAssignTakeOut(npc, pick) {
    if (!npc || !pick?.targetPile) return false;
    npc.job = 'takeOut';
    npc.targetPile = pick.targetPile;
    npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
    npc.cargo = null;
    npc.targetSlot =
      pick.targetSlot != null && pick.targetSlot >= 0
        ? pick.targetSlot
        : this._forkResolveSlot(npc, pick.targetPile);
    if (npc.targetSlot == null || npc.targetSlot < 0) {
      this._clearTaskClaim(npc);
      return false;
    }
    this._forkClearRoute(npc);
    this._applyTaskClaim(
      npc,
      'takeOut',
      pick.targetPile,
      pick.bay ?? pick.targetPile.bay,
      npc.targetSlot
    );
    return true;
  }

  /** Approach / queue point just south of a south-row pile on the forklift road. */
  _forkApproach(pile, slotIdx = null) {
    if (!pile) return { x: 0, y: BAY.PATH_Y, facing: 1 };
    const slot = slotIdx != null ? slotIdx : 0;
    return this._forkApproachForSlot(pile, slot);
  }

  _slotWorld(pile, slotIdx) {
    const s = PILE_SLOTS[slotIdx] || PILE_SLOTS[0];
    return { x: pile.x + s.ox, y: pile.y + s.oy };
  }

  /** West slots (0,2) approach from west; east slots (1,3) from east. */
  _forkLaneWest(slotIdx) {
    return (PILE_SLOTS[slotIdx]?.ox ?? 0) < 0;
  }

  _forkApproachForSlot(pile, slotIdx) {
    const w = this._slotWorld(pile, slotIdx);
    const west = this._forkLaneWest(slotIdx);
    return {
      x: w.x + (west ? -FORK_LANE_OFFSET : FORK_LANE_OFFSET),
      y: Math.max(pile.y + FORK_APPROACH_SOUTH, BAY.PATH_Y - 8),
      facing: west ? 1 : -1,
    };
  }

  /**
   * Wrong-side approach: truck is east of a west-lane stop, or west of an east-lane stop.
   * Same-side → drive straight in; wrong-side → overshoot then turn around.
   */
  _forkNeedsOvershoot(npc, ap) {
    if (!npc || !ap) return false;
    if (ap.facing > 0) return npc.x > ap.x + 4;
    return npc.x < ap.x - 4;
  }

  /** Point past the lane so the truck can reverse onto the correct approach side. */
  _forkOvershootPoint(ap) {
    if (ap.facing > 0) {
      // Dest left / west lane — if we arrived from the east, pass west of the stop,
      // then turn around and approach facing east into the slot.
      return { x: ap.x - FORK_OVERSHOOT, y: ap.y };
    }
    // Dest right / east lane — if we arrived from the west, pass east of the stop,
    // then turn around and approach facing west into the slot.
    return { x: ap.x + FORK_OVERSHOOT, y: ap.y };
  }

  /** Reset / advance overshoot→approach routing for a pile slot. Returns current move target. */
  _forkRouteTarget(npc, pile, slotIdx, ap) {
    const key = `${pile?.id ?? '?'}:${slotIdx}`;
    if (npc._forkRouteKey !== key) {
      npc._forkRouteKey = key;
      npc._forkApPhase = null;
      npc._forkOvershoot = null;
    }
    if (!npc._forkApPhase) {
      if (this._forkNeedsOvershoot(npc, ap)) {
        npc._forkApPhase = 'overshoot';
        npc._forkOvershoot = this._forkOvershootPoint(ap);
      } else {
        npc._forkApPhase = 'approach';
        npc._forkOvershoot = null;
      }
    }
    if (npc._forkApPhase === 'overshoot' && npc._forkOvershoot) {
      return npc._forkOvershoot;
    }
    return ap;
  }

  _forkClearRoute(npc) {
    if (!npc) return;
    npc._forkApPhase = null;
    npc._forkOvershoot = null;
    npc._forkRouteKey = null;
  }

  /**
   * Leaving a stall: short diagonal onto PATH_Y (~1 truck length), then road travel.
   * Not a square 90° — blend north + a little toward destX.
   */
  _forkBeginLeaveHub(npc, destX = null) {
    const dy = Math.max(0, npc.y - BAY.PATH_Y);
    // Already on the roadway — no merge needed
    if (dy < 4) {
      npc._forkMerge = null;
      return;
    }
    const toward = destX != null ? destX - npc.x : 0;
    const dir = Math.sign(toward) || npc.facing || 1;
    // Keep path length ≈ one truck length when possible
    const maxAlong =
      dy >= FORK_TRUCK_LEN
        ? 0
        : Math.sqrt(FORK_TRUCK_LEN * FORK_TRUCK_LEN - dy * dy);
    const along = dir * Math.min(maxAlong, Math.abs(toward) || maxAlong);
    npc._forkMerge = { x: npc.x + along, y: BAY.PATH_Y };
  }

  _forkClearMerge(npc) {
    if (npc) npc._forkMerge = null;
  }

  /** @returns {boolean} true once merge is done / not needed */
  _forkDriveMerge(npc, dt, speed = 40) {
    if (!npc._forkMerge) return true;
    npc._lockFacing = false;
    if (this._moveToward(npc, npc._forkMerge.x, npc._forkMerge.y, speed, dt)) {
      npc._forkMerge = null;
      return true;
    }
    return false;
  }

  _forkCreepForSlot(pile, slotIdx, npc = null) {
    const w = this._slotWorld(pile, slotIdx);
    const ap = this._forkApproachForSlot(pile, slotIdx);
    if (npc) npc.facing = ap.facing;
    let cargo = null;
    if (npc?.job === 'bringIn' && (npc.cargo || npc._forkLift?.cargo)) {
      cargo = npc.cargo || npc._forkLift.cargo;
    } else if (npc?.job === 'takeOut' && pile) {
      cargo = this._forkItemAtSlot(pile, slotIdx);
    }
    const pos = this._forkTruckPosForCargoCenter(
      w.x,
      w.y,
      npc?.facing ?? ap.facing,
      cargo,
      FORK_LOWERED
    );
    // Never back south of the approach lane — tine math can push tall crates past it.
    pos.y = Math.min(pos.y, ap.y - 2);
    return pos;
  }

  /** Item occupying a pile subquadrant (stable slot), not merely last in array. */
  _forkItemAtSlot(pile, slotIdx) {
    if (!pile?.items?.length) return null;
    for (const item of pile.items) {
      let slot = item.pileSlot;
      if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
        slot = this._pileAssignSlotIfMissing(pile, item);
      }
      if (slot === slotIdx) return item;
    }
    return null;
  }

  /** Lowered fork tine geometry in truck-local space (matches `_drawForklift`). */
  _forkTineLocal(forkH = FORK_LOWERED) {
    const forkDrop = forkH * FORK_DROP_VIS;
    return {
      tipX: FORK_TINE_TIP_X,
      tineY: FORK_TINE_Y_BASE + forkDrop * 0.35,
    };
  }

  /** Truck origin so lowered tines sit under cargo center (cx, cy). */
  _forkTruckPosForCargoCenter(cx, cy, facing, cargo = null, forkH = FORK_LOWERED) {
    const face = facing >= 0 ? 1 : -1;
    const tine = this._forkTineLocal(forkH);
    const h = cargo?.h ?? 8;
    return {
      x: cx - face * tine.tipX,
      y: cy + h * 0.5 - tine.tineY,
    };
  }

  /** Cargo center sitting on the current fork height. */
  _forkCargoCenterFromTruck(npc, cargo = null) {
    const c = cargo || npc.cargo || npc._forkLift?.cargo;
    const tine = this._forkTineLocal(npc.forkH ?? FORK_RAISED);
    const h = c?.h ?? 8;
    // Ride the *drawn* fork tips (8-dir visHeading), not logic facing ±1 —
    // otherwise turnarounds snap the box while the prongs swing around.
    const oct = this._crewVisOctant(npc);
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const alongScale = 0.72 + 0.28 * Math.abs(fx);
    const tipAlong = tine.tipX * alongScale;
    return {
      x: npc.x + fx * tipAlong,
      y: npc.y + fy * tipAlong + tine.tineY - h * 0.5,
    };
  }

  /** Slot index for the next forklift pick or place on this pile. */
  _forkResolveSlot(npc, pile) {
    if (!pile) return -1;
    if (npc.job === 'takeOut') {
      // Keep a pre-claimed quadrant if that crate is still there
      if (npc.targetSlot != null && npc.targetSlot >= 0 && npc.targetSlot < PILE_SLOTS.length) {
        const stillThere = pile.items.some((item) => {
          let slot = item.pileSlot;
          if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
            slot = this._pileAssignSlotIfMissing(pile, item);
          }
          return slot === npc.targetSlot;
        });
        if (stillThere) return npc.targetSlot;
      }
      let bestSlot = PILE_SLOTS.length;
      for (const item of pile.items) {
        let slot = item.pileSlot;
        if (slot == null || slot < 0 || slot >= PILE_SLOTS.length) {
          slot = this._pileAssignSlotIfMissing(pile, item);
        }
        // Skip slots another forklift already claimed for takeOut
        const stolen = this.npcs.some(
          (n) =>
            n !== npc &&
            n.alive &&
            n.job === 'takeOut' &&
            n.targetPile?.id === pile.id &&
            n.targetSlot === slot
        );
        if (stolen) continue;
        if (slot < bestSlot) bestSlot = slot;
      }
      if (bestSlot >= PILE_SLOTS.length) return -1;
      return bestSlot;
    }
    if (npc.job === 'bringIn' && npc.cargo) {
      return this._forkClaimDropSlot(npc, pile);
    }
    return 0;
  }

  /**
   * Claim a drop slot as soon as the bring-in job targets a pile.
   * Stays reserved until deposit completes (then the item occupies it).
   */
  _forkClaimDropSlot(npc, pile) {
    if (!npc?.cargo || !pile) return -1;
    const used = this._pileReservedSlots(pile, npc);
    let slot = npc.targetSlot;
    if (slot == null || slot < 0) slot = npc.cargo.pileSlot;
    if (slot != null && slot >= 0 && slot < PILE_SLOTS.length && !used.has(slot)) {
      npc.targetSlot = slot;
      npc.cargo.pileSlot = slot;
      return slot;
    }
    slot = this._pileFreeSlot(pile, npc);
    if (slot < 0) {
      npc.targetSlot = null;
      npc.cargo.pileSlot = null;
      return -1;
    }
    npc.targetSlot = slot;
    npc.cargo.pileSlot = slot;
    return slot;
  }

  /** Bind a bring-in truck to a pile + exclusive drop slot (clears approach route). */
  _forkAssignBringInDest(npc, pile) {
    if (!npc || !pile) return -1;
    const prev = npc.targetPile?.id;
    npc.job = 'bringIn';
    npc.targetPile = pile;
    npc.lingerPile = null;
    if (prev !== pile.id) {
      npc.targetSlot = null;
      if (npc.cargo) npc.cargo.pileSlot = null;
      this._forkClearRoute(npc);
    }
    return this._forkClaimDropSlot(npc, pile);
  }

  _forkBeginPileWork(npc, pile) {
    let slotIdx = npc.targetSlot;
    if (slotIdx == null || slotIdx < 0 || slotIdx >= PILE_SLOTS.length) {
      slotIdx = this._forkResolveSlot(npc, pile);
    } else if (npc.job === 'bringIn' && npc.cargo) {
      // Re-validate claim; keep same slot when still free
      slotIdx = this._forkClaimDropSlot(npc, pile);
    }
    if (slotIdx < 0) {
      this._forkClearRoute(npc);
      if (npc.cargo) this._forkQueueAtDest(npc, pile);
      else {
        this._clearTaskClaim(npc);
        this._forkGoToHub(npc);
      }
      return;
    }
    this._forkClearRoute(npc);
    npc.targetSlot = slotIdx;
    if (npc.job === 'bringIn' && npc.cargo) {
      npc.cargo.pileSlot = slotIdx;
    }
    const ap = this._forkApproachForSlot(pile, slotIdx);
    npc.facing = ap.facing;
    npc.forkH = FORK_RAISED;
    npc.forkPhase = 'lower';
    npc._forkLift = null;
    npc._forkWorkT = 0;
    npc._lockFacing = true;
    npc.state = 'work';
    npc.stateT = 0;
  }

  /** World position of cargo sitting on forks / mid handoff. */
  _forkCargoWorldPos(npc) {
    const lift = npc._forkLift;
    if (lift?.dropping) {
      return { x: lift.x, y: lift.y };
    }
    if (lift) {
      const t = 1 - (npc.forkH ?? FORK_RAISED);
      const carry = this._forkCarryOffset(npc);
      return {
        x: lift.x + (npc.x + carry.x - lift.x) * t,
        y: lift.y + (npc.y + carry.y - lift.y) * t,
      };
    }
    if (npc.cargo) {
      const c = this._forkCarryOffset(npc);
      return { x: npc.x + c.x, y: npc.y + c.y };
    }
    return null;
  }

  /** Cargo center offset from forklift origin (derived from tine geometry). */
  _forkCarryOffset(npc) {
    const center = this._forkCargoCenterFromTruck(npc);
    return { x: center.x - npc.x, y: center.y - npc.y };
  }

  _forkFinishTakeOut(npc) {
    this._clearTaskClaim(npc);
    npc.side = this._forkOutboundSide();
    npc.forkPhase = null;
    npc._forkLift = null;
    npc.targetSlot = null;
    npc.state = 'toDoor';
    npc._haulOff = true;
  }

  _updateForkWork(npc, dt) {
    const pile = this._pileById(npc.targetPile?.id);
    let slotIdx = npc.targetSlot;
    if (slotIdx == null || slotIdx < 0 || slotIdx >= PILE_SLOTS.length) {
      slotIdx = this._forkResolveSlot(npc, pile);
      npc.targetSlot = slotIdx >= 0 ? slotIdx : null;
    }
    if (slotIdx == null || slotIdx < 0) {
      if (npc.cargo) this._forkQueueAtDest(npc, pile);
      else {
        npc.forkPhase = null;
        this._clearTaskClaim(npc);
        this._forkGoToHub(npc);
      }
      return;
    }

    npc._forkWorkT = (npc._forkWorkT || 0) + dt;
    // Watchdog: abort stuck lower/creep animations back to queue or hub
    if (npc._forkWorkT > 5.5) {
      npc.forkPhase = null;
      npc._forkWorkT = 0;
      if (npc._forkLift?.dropping && npc._forkLift.cargo) {
        npc.cargo = npc._forkLift.cargo;
        npc._forkLift = null;
      }
      if (npc.cargo) this._forkQueueAtDest(npc, pile);
      else if (npc.job === 'takeOut' && (npc.cargo || npc._forkLift?.cargo)) {
        if (npc._forkLift?.cargo) {
          npc.cargo = npc._forkLift.cargo;
          npc._forkLift = null;
        }
        this._forkFinishTakeOut(npc);
      } else {
        this._clearTaskClaim(npc);
        npc._forkLift = null;
        this._forkGoToHub(npc);
      }
      return;
    }

    const creep = pile ? this._forkCreepForSlot(pile, slotIdx, npc) : null;
    const back = pile ? this._forkApproachForSlot(pile, slotIdx) : null;

    switch (npc.forkPhase) {
      case 'lower': {
        if (back?.facing) npc.facing = back.facing;
        npc.forkH = Math.min(
          FORK_LOWERED,
          (npc.forkH ?? FORK_RAISED) + dt * FORK_ANIM_SPEED
        );
        if (npc.forkH >= FORK_LOWERED - 0.02) {
          npc.forkH = FORK_LOWERED;
          npc.forkPhase = 'creepIn';
        }
        break;
      }
      case 'creepIn': {
        if (!creep) {
          npc.forkPhase = 'creepOut';
          break;
        }
        if (back?.facing) npc.facing = back.facing;
        if (this._moveToward(npc, creep.x, creep.y, 22, dt)) {
          if (npc.job === 'takeOut' && pile?.items?.length) {
            const item = this._forkItemAtSlot(pile, slotIdx);
            const lifted = item
              ? this._pileRemove(pile, item)
              : this._pilePop(pile);
            if (lifted) {
              if (lifted.serviceKey && pile.lane === 'in') {
                this._restageServiceCargo(lifted);
                lifted.serviceKey = null;
                lifted.serviceBay = null;
              }
              const w = this._slotWorld(pile, slotIdx);
              npc._forkLift = { cargo: lifted, x: w.x, y: w.y };
            }
            npc.forkPhase = 'raise';
          } else if (npc.job === 'bringIn' && npc.cargo && pile) {
            const w = this._slotWorld(pile, slotIdx);
            const from = this._forkCargoCenterFromTruck(npc, npc.cargo);
            npc._forkLift = {
              cargo: npc.cargo,
              dropping: true,
              fromX: from.x,
              fromY: from.y,
              toX: w.x,
              toY: w.y,
              x: from.x,
              y: from.y,
              dropT: 0,
            };
            npc.cargo = null;
            npc.forkPhase = 'drop';
          } else {
            npc.forkPhase = 'creepOut';
          }
        }
        break;
      }
      case 'drop': {
        if (back?.facing) npc.facing = back.facing;
        const lift = npc._forkLift;
        if (pile && lift?.dropping && lift.cargo) {
          lift.dropT = Math.min(1, (lift.dropT || 0) + dt * 4.2);
          const e = lift.dropT * lift.dropT * (3 - 2 * lift.dropT);
          lift.x = lift.fromX + (lift.toX - lift.fromX) * e;
          lift.y = lift.fromY + (lift.toY - lift.fromY) * e;
          if (lift.dropT < 1) break;
          if (pile.lane === 'out' && lift.cargo.serviceKey) {
            lift.cargo.serviceKey = null;
            lift.cargo.serviceBay = null;
          }
          lift.cargo.pileSlot = slotIdx;
          if (this._pilePush(pile, lift.cargo, npc)) {
            npc._forkLift = null;
            npc.forkPhase = 'raise';
          } else {
            npc.cargo = lift.cargo;
            npc._forkLift = null;
            npc.forkPhase = null;
            this._forkQueueAtDest(npc, pile);
          }
        } else if (pile && npc.cargo) {
          // Fallback if drop handoff wasn't armed
          npc.cargo.pileSlot = slotIdx;
          if (this._pilePush(pile, npc.cargo, npc)) {
            npc.cargo = null;
            npc.forkPhase = 'raise';
          } else {
            npc.forkPhase = null;
            this._forkQueueAtDest(npc, pile);
          }
        } else {
          npc.forkPhase = 'raise';
        }
        break;
      }
      case 'raise': {
        npc.forkH = Math.max(
          FORK_RAISED,
          (npc.forkH ?? FORK_LOWERED) - dt * FORK_ANIM_SPEED
        );
        if (npc.forkH <= FORK_RAISED + 0.02) {
          npc.forkH = FORK_RAISED;
          if (npc._forkLift?.cargo) {
            npc.cargo = npc._forkLift.cargo;
            npc._forkLift = null;
          }
          npc.forkPhase = 'creepOut';
        }
        break;
      }
      case 'creepOut': {
        if (!back) {
          npc.forkPhase = null;
          npc._forkWorkT = 0;
          if (npc.job === 'takeOut' && npc.cargo) this._forkFinishTakeOut(npc);
          else if (npc.job === 'bringIn') this._forkAfterBringInDrop(npc);
          else {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
          }
          break;
        }
        npc.facing = back.facing;
        if (this._moveToward(npc, back.x, back.y, 26, dt)) {
          npc.forkPhase = null;
          npc.targetSlot = null;
          npc._forkWorkT = 0;
          if (npc.job === 'takeOut' && npc.cargo) {
            this._forkFinishTakeOut(npc);
          } else if (npc.job === 'bringIn') {
            this._forkAfterBringInDrop(npc);
          } else {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
          }
        }
        break;
      }
      default:
        npc.forkPhase = null;
        npc._forkWorkT = 0;
        this._clearTaskClaim(npc);
        this._forkGoToHub(npc);
    }
  }

  /** Peek which pile item a mechanic would take (no removal). */
  _peekServicePileCargo(pile, bay, job, npc = null) {
    if (!pile?.items?.length) return null;
    if (job === 'stageFerry') {
      const preferCargoId = npc?._claimCargoId ?? null;
      if (preferCargoId != null) {
        const hit = pile.items.find((c) => c.id === preferCargoId);
        if (hit) return hit;
      }
      return pile.items[pile.items.length - 1];
    }
    const preferCargoId = npc?._claimCargoId ?? null;
    const preferKey = npc?._claimServiceItemId ?? npc?._activeServiceId ?? null;
    if (preferCargoId != null) {
      const hit = pile.items.find((c) => c.id === preferCargoId);
      if (hit) return hit;
    }
    if (preferKey != null && !String(preferKey).startsWith('cargo:')) {
      const hit = pile.items.find((c) => c.serviceKey === preferKey);
      if (hit) return hit;
    }
    const taken = this._claimedServiceKeys(npc);
    const svc = this._servicePad(bay)?.service;
    if (!svc || svc.phase !== 'active') {
      return (
        pile.items.find((c) => {
          const tag = c.serviceKey != null ? c.serviceKey : `cargo:${c.id}`;
          return !taken.has(tag);
        }) || null
      );
    }
    const wantTypes =
      job === 'installUpgrade'
        ? ['upgrade']
        : ['refuel', 'reloadBullets', 'reloadShells', 'loadCargo'];
    const pending = svc.items.filter(
      (it) =>
        wantTypes.includes(it.type) &&
        it.status !== 'done' &&
        !taken.has(it.id)
    );
    if (!pending.length) return null;
    const idx = pile.items.findIndex(
      (c) =>
        c.serviceKey != null && pending.some((it) => it.id === c.serviceKey)
    );
    if (idx < 0) return null;
    return pile.items[idx];
  }

  /** West slots (0,2) approach from west; east slots (1,3) from east. */
  _mechApproachForSlot(pile, slotIdx) {
    const w = this._slotWorld(pile, slotIdx);
    const west = this._forkLaneWest(slotIdx);
    return {
      x: w.x + (west ? -MECH_LANE_OFFSET : MECH_LANE_OFFSET),
      y: w.y + MECH_APPROACH_ALONG,
      facing: west ? 1 : -1,
    };
  }

  _mechCreepForSlot(pile, slotIdx, npc = null) {
    const w = this._slotWorld(pile, slotIdx);
    const ap = this._mechApproachForSlot(pile, slotIdx);
    if (npc) npc.facing = ap.facing;
    let cargo = null;
    const ferryPick = npc?.job === 'stageFerry' && !npc.cargo;
    const ferryDrop = npc?.job === 'stageFerry' && !!npc.cargo;
    const loading =
      npc?.job === 'loadShip' || npc?.job === 'installUpgrade' || ferryPick;
    const unloading =
      npc?.job === 'unloadShip' || npc?.job === 'removeUpgrade' || ferryDrop;
    if (unloading && npc?.cargo) cargo = npc.cargo;
    else if (loading && pile?.items?.length) {
      const bay = npc?.bay ?? bayIndexFromX(npc?.targetPad?.x ?? npc?.x ?? 0);
      cargo =
        this._peekServicePileCargo(pile, bay, npc.job, npc) ||
        pile.items[pile.items.length - 1];
    }
    return this._mechPosForCargoCenter(
      w.x,
      w.y,
      npc?.facing ?? ap.facing,
      cargo
    );
  }

  /** Hand / empty-grip point in mech-local space (matches `_drawMechanic`). */
  _mechHandLocal(cargo = null) {
    if (cargo) {
      const h = cargo.h ?? 8;
      return {
        x: MECH_HAND_REACH_X + (cargo.w ?? 8) * 0.2,
        y: -4 - h * 0.35,
      };
    }
    return { x: MECH_HAND_REACH_X, y: MECH_HAND_GRIP_Y };
  }

  /** Mech origin so hands (or carried cargo center) sit on (cx, cy). */
  _mechPosForCargoCenter(cx, cy, facing, cargo = null) {
    const face = facing >= 0 ? 1 : -1;
    const hand = this._mechHandLocal(cargo);
    return {
      x: cx - face * hand.x,
      y: cy - hand.y,
    };
  }

  /** Slot index for the next mechanic pick or place on this pile. */
  _mechResolveSlot(npc, pile) {
    if (!pile) return -1;
    const ferryPick = npc.job === 'stageFerry' && !npc.cargo;
    const ferryDrop = npc.job === 'stageFerry' && !!npc.cargo;
    const loading =
      npc.job === 'loadShip' || npc.job === 'installUpgrade' || ferryPick;
    const unloading =
      npc.job === 'unloadShip' || npc.job === 'removeUpgrade' || ferryDrop;
    if (loading && !npc.cargo) {
      const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
      const peek = this._peekServicePileCargo(pile, bay, npc.job, npc);
      if (peek) {
        let slot = peek.pileSlot;
        if (slot == null || slot < 0) {
          this._itemWorldPos(pile, peek);
          slot = peek.pileSlot ?? 0;
        }
        return slot;
      }
      const top = pile.items[pile.items.length - 1];
      if (top) {
        let slot = top.pileSlot;
        if (slot == null || slot < 0) {
          this._itemWorldPos(pile, top);
          slot = top.pileSlot ?? 0;
        }
        return slot;
      }
      return -1;
    }
    if (unloading && npc.cargo) {
      return this._mechClaimDropSlot(npc, pile);
    }
    return 0;
  }

  /**
   * Claim an outbound drop slot as soon as the unload targets a pile.
   * Stays reserved until deposit (mirrors forklift bring-in).
   */
  _mechClaimDropSlot(npc, pile) {
    if (!npc?.cargo || !pile) return -1;
    const used = this._pileReservedSlots(pile, npc);
    let slot = npc.targetSlot;
    if (slot == null || slot < 0) slot = npc.cargo.pileSlot;
    if (slot != null && slot >= 0 && slot < PILE_SLOTS.length && !used.has(slot)) {
      npc.targetSlot = slot;
      npc.cargo.pileSlot = slot;
      return slot;
    }
    slot = this._pileFreeSlot(pile, npc);
    if (slot < 0) {
      npc.targetSlot = null;
      npc.cargo.pileSlot = null;
      return -1;
    }
    npc.targetSlot = slot;
    npc.cargo.pileSlot = slot;
    return slot;
  }

  _mechCarryOffset(npc) {
    const hand = this._mechHandLocal(npc.cargo || npc._mechLift?.cargo);
    const face = npc.facing >= 0 ? 1 : -1;
    return { x: face * hand.x, y: hand.y };
  }

  _mechCargoCenterFromTruck(npc, cargo = null) {
    const c = cargo || npc.cargo || npc._mechLift?.cargo;
    const hand = this._mechHandLocal(c);
    const face = npc.facing >= 0 ? 1 : -1;
    return {
      x: npc.x + face * hand.x,
      y: npc.y + hand.y,
    };
  }

  _mechCargoWorldPos(npc) {
    const lift = npc._mechLift;
    const t = npc.mechHandT ?? 0;
    if (lift?.cargo && npc.mechPhase === 'handoff') {
      const carry = this._mechCarryOffset(npc);
      const cx = npc.x + carry.x;
      const cy = npc.y + carry.y;
      if (npc.cargo) {
        const pile = this._pileById(npc.targetPile?.id);
        const slot = npc.targetSlot ?? 0;
        const dest = pile ? this._slotWorld(pile, slot) : { x: lift.x, y: lift.y };
        return {
          x: lift.x + (dest.x - lift.x) * t,
          y: lift.y + (dest.y - lift.y) * t,
        };
      }
      return {
        x: lift.x + (cx - lift.x) * t,
        y: lift.y + (cy - lift.y) * t,
      };
    }
    if (npc.cargo) {
      const c = this._mechCarryOffset(npc);
      return { x: npc.x + c.x, y: npc.y + c.y };
    }
    return null;
  }

  _mechBeginPileDrop(npc, pile, slotIdx) {
    const carry = this._mechCarryOffset(npc);
    npc._mechLift = {
      cargo: npc.cargo,
      x: npc.x + carry.x,
      y: npc.y + carry.y,
    };
    npc.mechHandT = 0;
    npc.mechPhase = 'handoff';
    npc.targetSlot = slotIdx;
  }

  _mechCompleteDrop(npc, pile, slotIdx) {
    if (!npc.cargo) return false;
    if (npc.cargo?.unloadServiceBay != null) {
      const ubay = npc.cargo.unloadServiceBay;
      const already = !!npc.cargo._boardUnloadApplied;
      const pad = this._servicePad(ubay);
      const item = pad?.service?.items?.find(
        (it) =>
          it.type === 'unloadCargo' &&
          it.status !== 'done' &&
          (npc._activeServiceId == null || it.id === npc._activeServiceId)
      );
      if (item) {
        item.status = 'done';
        item.cargoId = null;
        item.pipSettled = false;
        npc._activeServiceId = item.id;
        if (!already) this._applyServiceToShipState(pad, 'unloadCargo');
      }
    }
    npc.cargo.pileSlot = slotIdx;
    npc.targetSlot = slotIdx;
    // Pass npc so our own reservation doesn't force a quadrant reassignment
    // (or fail the push and vanish the crate when the pile is nearly full).
    if (!this._pilePush(pile, npc.cargo, npc)) {
      return false;
    }
    npc.cargo = null;
    npc._mechLift = null;
    npc.mechHandT = 0;
    return true;
  }

  _mechAbortPileWork(npc) {
    npc.mechPhase = null;
    npc.targetSlot = null;
    npc._mechLift = null;
    npc.mechHandT = 0;
    const p = this._pileById(npc.targetPile?.id);
    const unloading =
      npc.job === 'unloadShip' ||
      npc.job === 'removeUpgrade' ||
      (npc.job === 'stageFerry' && !!npc.cargo);
    if (unloading && npc.cargo && p && p.items.length >= PILE_CAP) {
      this._beginNextMechanicTrip(npc);
      return;
    }
    if (npc.cargo) {
      const bay = npc.bay ?? bayIndexFromX(npc.x);
      if (!this._depositCargoSafe(npc.cargo, bay, npc)) {
        this._dropFloorCargo(npc);
      } else {
        npc.cargo = null;
      }
    }
    this._beginNextMechanicTrip(npc);
  }

  _mechFinishPileWork(npc) {
    npc.mechPhase = null;
    npc.targetSlot = null;
    npc._mechLift = null;
    npc.mechHandT = 0;
    const loading = npc.job === 'loadShip' || npc.job === 'installUpgrade';
    const unloading = npc.job === 'unloadShip' || npc.job === 'removeUpgrade';
    if (npc.job === 'stageFerry') {
      if (npc.cargo) {
        // Picked up at source — walk to dest staging pile
        const dest = this._pileById(npc.ferryDest?.id) || npc.ferryDest;
        if (!dest) {
          this._depositCargoSafe(npc.cargo, npc.homeBay ?? npc.bay, npc) ||
            this._dropFloorCargo(npc);
          npc.cargo = null;
          this._clearTaskClaim(npc);
          this._beginIdleFluff(npc);
          return;
        }
        npc.targetPile = dest;
        npc.targetSlot = null;
        this._applyTaskClaim(npc, 'stageFerry', dest, npc.bay ?? npc.homeBay);
        npc.state = 'toPile';
        return;
      }
      // No cargo: successful dest drop, or failed pick (crane/someone beat us)
      const destId = npc.ferryDest?.id;
      const atDest = destId && npc.targetPile?.id === destId;
      if (!atDest) {
        this._abandonMechanicStagingFerry(npc);
        return;
      }
      this._clearTaskClaim(npc);
      npc.ferryDest = null;
      npc.ferrySource = null;
      this._noteBayTaskComplete(npc);
      this._beginIdleFluff(npc);
      return;
    }
    if (loading && npc.cargo) {
      npc.hullTarget = null;
      npc.state = 'toShip';
      return;
    }
    if (unloading && !npc.cargo) {
      // Drop finished — walking away from the pile settles the pip green
      this._settleActiveServicePip(npc);
      npc.tripsLeft -= 1;
      if (npc.tripsLeft <= 0) {
        this._noteBayTaskComplete(npc);
        this._beginIdleFluff(npc);
      } else {
        this._beginNextMechanicTrip(npc);
      }
      return;
    }
    this._mechAbortPileWork(npc);
  }

  _updateMechPileWork(npc, dt) {
    const pile = this._pileById(npc.targetPile?.id);
    const slotIdx = npc.targetSlot ?? 0;
    const creep = pile ? this._mechCreepForSlot(pile, slotIdx, npc) : null;
    const back = pile ? this._mechApproachForSlot(pile, slotIdx) : null;
    const ferryPick = npc.job === 'stageFerry' && !npc.cargo;
    const ferryDrop = npc.job === 'stageFerry' && !!npc.cargo;
    const loading =
      npc.job === 'loadShip' || npc.job === 'installUpgrade' || ferryPick;
    const unloading =
      npc.job === 'unloadShip' || npc.job === 'removeUpgrade' || ferryDrop;
    const walk = 27;

    switch (npc.mechPhase) {
      case 'creepIn': {
        if (!creep) {
          npc.mechPhase = 'creepOut';
          break;
        }
        if (back?.facing) npc.facing = back.facing;
        if (this._mechMove(npc, creep.x, creep.y, walk * 0.85, dt)) {
          if (loading && !npc.cargo && pile?.items?.length) {
            const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
            const cargo = this._takeServicePileCargo(pile, bay, npc.job, npc);
            if (cargo) {
              const w = this._slotWorld(pile, slotIdx);
              npc._mechLift = { cargo, x: w.x, y: w.y };
              npc.mechHandT = 0;
              npc.mechPhase = 'handoff';
            } else {
              npc.mechPhase = 'creepOut';
            }
          } else if (unloading && npc.cargo && pile && pile.items.length < PILE_CAP) {
            this._mechBeginPileDrop(npc, pile, slotIdx);
          } else if (unloading && npc.cargo && pile && pile.items.length >= PILE_CAP) {
            npc.mechPhase = 'creepOut';
          } else {
            npc.mechPhase = 'creepOut';
          }
        }
        break;
      }
      case 'handoff': {
        if (back?.facing) npc.facing = back.facing;
        npc.mechHandT = Math.min(
          1,
          (npc.mechHandT ?? 0) + dt * MECH_HANDOFF_SPEED
        );
        if (npc.mechHandT < 1 - 0.02) break;
        npc.mechHandT = 1;
        if (npc._mechLift?.cargo && !npc.cargo) {
          npc.cargo = npc._mechLift.cargo;
          npc._mechLift = null;
          if (npc.cargo?.serviceKey != null) {
            npc._activeServiceId = npc.cargo.serviceKey;
          }
          npc.mechPhase = 'creepOut';
        } else if (unloading && npc.cargo && pile) {
          if (!this._mechCompleteDrop(npc, pile, slotIdx)) {
            // Race / full pile — keep the crate on the deck instead of vanishing
            this._dropFloorCargo(npc);
          }
          npc.mechPhase = 'creepOut';
        } else {
          npc.mechPhase = 'creepOut';
        }
        break;
      }
      case 'creepOut': {
        if (!back) {
          this._mechFinishPileWork(npc);
          break;
        }
        if (back.facing) npc.facing = back.facing;
        if (this._mechMove(npc, back.x, back.y, walk * 0.9, dt)) {
          this._mechFinishPileWork(npc);
        }
        break;
      }
      default:
        this._mechAbortPileWork(npc);
    }
  }

  /** Never park at hub while carrying — queue at dest pile instead. */
  _forkQueueAtDest(npc, pile = null) {
    const dest =
      this._pileById(pile?.id) ||
      this._pileById(npc.targetPile?.id) ||
      this._pileById(npc.lingerPile?.id) ||
      (npc.cargo?.serviceBay != null
        ? this._bayPile(npc.cargo.serviceBay, 'in', ROW.S)
        : null) ||
      this._pilesInRow(ROW.S).find((p) => p.lane === 'in' && p.items.length < PILE_CAP) ||
      this._pilesInRow(ROW.S).find((p) => p.lane === 'in');
    if (dest && npc.targetPile?.id !== dest.id) {
      npc.targetSlot = null;
      if (npc.cargo) npc.cargo.pileSlot = null;
      this._forkClearRoute(npc);
    }
    npc.job = 'bringIn';
    npc.targetPile = dest;
    npc.lingerPile = dest;
    const free = dest ? this._forkClaimDropSlot(npc, dest) : -1;
    npc.forkPhase = null;
    npc.forkH = FORK_RAISED;
    npc._forkLift = null;
    npc._forkWorkT = 0;
    npc._lockFacing = false;
    npc._fetchInbound = false;
    npc._fetchItemId = null;
    npc._haulOff = false;
    this._forkClearRoute(npc);
    if (dest && free >= 0) {
      // Only hold the exclusive bringIn claim when the pile can actually accept cargo.
      const key = this._taskClaimKey('bringIn', dest, dest.bay);
      const others = this._claimedTaskKeys(npc);
      if (!others.has(key)) {
        this._applyTaskClaim(npc, 'bringIn', dest, dest.bay);
      } else if (npc.claimKey !== key) {
        npc.claimKey = null;
      }
    } else {
      // Full / missing dest — release claim so another truck (or crane clear) can proceed
      this._clearTaskClaim(npc);
    }
    npc.state = 'linger';
    npc.stateT = 0.35;
  }

  /** After a successful drop, only fetch again if an unclaimed need remains. */
  _forkAfterBringInDrop(npc) {
    this._clearTaskClaim(npc);
    // Cargo should already be deposited; never silently destroy a still-held crate
    if (npc.cargo) {
      this._forkQueueAtDest(npc);
      return;
    }
    const pick = this._pickForkliftJob(npc);
    if (pick.mode === 'work' && pick.job === 'fetchIn') {
      this._beginForkFetch(npc, pick);
      return;
    }
    if (pick.mode === 'work' || pick.mode === 'linger') {
      if (pick.job === 'takeOut') {
        if (!this._forkAssignTakeOut(npc, pick)) {
          this._forkGoToHub(npc);
          return;
        }
      } else {
        npc.job = pick.job;
        npc.targetPile = pick.targetPile;
        npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
        this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
      }
      npc.state = pick.mode === 'linger' ? 'linger' : 'toPile';
      npc.stateT = 0.3;
      return;
    }
    this._forkGoToHub(npc);
  }

  _doorX(side) {
    return side < 0 ? -BAY.HALF_W : BAY.HALF_W;
  }

  _insideX(side) {
    return side < 0 ? -BAY.HALF_W + 28 : BAY.HALF_W - 28;
  }

  /** Ship-bound inbound always pops in at the west (left) bulkhead. */
  _forkInboundSide() {
    return -1;
  }

  /** Ship-origin outbound always exits via the east (right) bulkhead. */
  _forkOutboundSide() {
    return 1;
  }

  _moveToward(npc, tx, ty, speed, dt) {
    const dx = tx - npc.x;
    const dy = ty - npc.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) {
      npc.x = tx;
      npc.y = ty;
      return true;
    }
    const step = speed * dt;
    if (step >= dist) {
      npc.x = tx;
      npc.y = ty;
      return true;
    }
    npc.x += (dx / dist) * step;
    npc.y += (dy / dist) * step;
    const lockFacing =
      npc.forkPhase ||
      npc.mechPhase ||
      npc._lockFacing ||
      (npc.kind === 'mechanic' &&
        (npc.state === 'toPile' || npc.state === 'workPile' || npc.state === 'linger'));
    if (!lockFacing) {
      // Face along clearly horizontal travel only — tiny X corrections while
      // driving N/S were flipping the truck and causing moonwalks.
      if (Math.abs(dx) >= Math.abs(dy) * 0.45 && Math.abs(dx) > 1.25) {
        const next = Math.sign(dx);
        if (next) npc.facing = next;
      }
    }
    return false;
  }

  /**
   * Final approach: lock fork-into-slot facing only when on the correct side of
   * the lane (west approach from the west, east from the east). Wrong-side lock
   * made trucks moonwalk into the spot after an overshoot.
   */
  _forkSetApproachFacing(npc, ap) {
    if (!ap) {
      npc._lockFacing = false;
      return;
    }
    const dist = Math.hypot(npc.x - ap.x, npc.y - ap.y);
    const correctSide =
      ap.facing > 0 ? npc.x <= ap.x + 3 : npc.x >= ap.x - 3;
    if (dist < 14 && correctSide) {
      npc.facing = ap.facing;
      npc._lockFacing = true;
    } else {
      npc._lockFacing = false;
    }
  }

  _pickSouthPileForFork(wantCargo) {
    const south = this._pilesInRow(ROW.S);
    if (wantCargo) {
      // Export only from outbound (right) columns
      const out = south.filter((p) => p.lane === 'out' && p.items.length > 0);
      return out.length ? pick(out) : null;
    }
    // Import only to inbound (left) columns
    const inn = south.filter((p) => p.lane === 'in' && p.items.length < PILE_CAP);
    return inn.length ? pick(inn) : null;
  }

  _pickMidPile(wantCargo) {
    const mid = this._pilesInRow(ROW.M);
    if (wantCargo) {
      const full = mid.filter((p) => p.lane === 'in' && p.items.length > 0);
      return full.length ? pick(full) : null;
    }
    const room = mid.filter((p) => p.lane === 'out' && p.items.length < PILE_CAP);
    return room.length ? pick(room) : null;
  }

  _dockTargets() {
    const pads = [];
    const pb = this.playerBay;
    if (pb && this._padWorkable(pb)) {
      pads.push({
        x: pb.x,
        y: 0,
        bayId: pb.bayId,
        bayIndex: pb.bayIndex,
        occupied: true,
      });
    }
    for (const p of this.sidePads) {
      if (!this._padWorkable(p)) continue;
      pads.push({
        x: p.x,
        y: 0,
        bayId: p.bayId,
        bayIndex: p.bayIndex,
        occupied: true,
      });
    }
    return pads;
  }

  _updateForklift(npc, dt, hazard) {
    const ox = npc.x;
    const oy = npc.y;
    npc.phase += dt * 8;
    npc.stateT -= dt;

    if (npc.state === 'flinch') {
      npc.x += Math.sin(npc.phase * 4) * 14 * dt;
      npc.y += Math.cos(npc.phase * 5) * 4 * dt;
      if (npc.stateT <= 0) npc.state = npc.resumeState || 'toPile';
      this._forkUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
      return;
    }

    const weaponHot = this._hazard.weapons;
    const hazardX = weaponHot > 0.2 ? this._weaponWash.x : this._shipPos.x;
    const hazardY = weaponHot > 0.2 ? this._weaponWash.y : this._shipPos.y;
    if (
      (npc.state === 'toPile' || npc.state === 'work' || npc.state === 'linger' || npc.state === 'enter' || npc.state === 'atHub') &&
      weaponHot > 0.45 &&
      Math.hypot(npc.x - hazardX, npc.y - hazardY) < 110 &&
      Math.random() < weaponHot * 0.1
    ) {
      npc.resumeState = npc.state;
      npc.state = 'flinch';
      npc.stateT = rand(0.35, 0.7);
      this._forkUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
      return;
    }

    switch (npc.state) {
      case 'atHub': {
        const park = this._claimForkliftPark(npc);
        // Stay put until actually seated in the stall — otherwise a truck still
        // returning near the roadway can "leave" and bounce straight home.
        const atStall = this._moveToward(npc, park.x, park.y, 28, dt);
        if (!atStall || npc.stateT > 0) break;
        // Carrying freight must never idle at hub — queue at dest
        if (npc.cargo) {
          this._releaseForkliftPark(npc);
          this._forkQueueAtDest(npc);
          break;
        }
        const pick = this._pickForkliftJob(npc);
        if (pick.mode === 'work' || pick.mode === 'linger') {
          this._releaseForkliftPark(npc);
          if (pick.job === 'fetchIn') {
            this._beginForkFetch(npc, pick);
            break;
          }
          if (pick.job === 'takeOut') {
            if (!this._forkAssignTakeOut(npc, pick)) {
              this._claimForkliftPark(npc);
              npc.stateT = rand(0.6, 1.8);
              break;
            }
          } else {
            npc.job = pick.job;
            npc.targetPile = pick.targetPile;
            npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
            this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
          }
          const destX =
            pick.targetPile?.x ??
            (pick.bay != null ? this._bayPile(pick.bay, 'in', ROW.S)?.x : null);
          this._forkBeginLeaveHub(npc, destX);
          // Always drive the job — don't linger-redecide at the roadway merge
          npc.state = 'toPile';
          npc.stateT = 0.3;
        } else {
          npc.stateT = rand(0.6, 1.8);
        }
        break;
      }
      case 'enter': {
        const ix = this._insideX(npc.side);
        if (this._moveToward(npc, ix, BAY.PATH_Y, 40, dt)) {
          if (npc.cargo) {
            const pick = this._pickForkliftJob(npc);
            if (pick.mode === 'work' && pick.job === 'bringIn') {
              this._forkAssignBringInDest(npc, pick.targetPile);
              this._applyTaskClaim(npc, 'bringIn', pick.targetPile, pick.bay ?? pick.targetPile?.bay);
              npc.state = 'toPile';
              npc.stateT = 0.4;
            } else if (pick.mode === 'linger') {
              this._forkQueueAtDest(npc, pick.targetPile);
            } else {
              // Dest claimed/full — wait in line at approach, not hub
              this._forkQueueAtDest(npc);
            }
            break;
          }
          const pick = this._pickForkliftJob(npc);
          if (pick.mode === 'idle' || pick.mode === 'despawn') {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
            break;
          }
          if (pick.job === 'fetchIn') {
            this._beginForkFetch(npc, pick);
            break;
          }
          if (pick.job === 'takeOut') {
            if (!this._forkAssignTakeOut(npc, pick)) {
              this._forkGoToHub(npc);
              break;
            }
          } else {
            npc.job = pick.job;
            npc.targetPile = pick.targetPile;
            npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
            this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
          }
          npc.state = pick.mode === 'linger' ? 'linger' : 'toPile';
          npc.stateT = 0.4;
        }
        break;
      }
      case 'toPile': {
        if (!this._forkDriveMerge(npc, dt)) break;
        let p = this._pileById(npc.targetPile?.id);
        if (!p) {
          if (npc.cargo) this._forkQueueAtDest(npc);
          else {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
          }
          break;
        }
        if (npc.job === 'bringIn' && p.items.length >= PILE_CAP) {
          const pick = this._pickForkliftJob(npc);
          if (pick.mode === 'work' && pick.job === 'bringIn') {
            npc.targetPile = pick.targetPile;
            npc.targetSlot = null;
            this._applyTaskClaim(npc, 'bringIn', pick.targetPile, pick.bay ?? pick.targetPile?.bay);
            p = this._pileById(npc.targetPile?.id);
          } else if (pick.mode === 'linger' || npc.cargo) {
            this._forkQueueAtDest(npc, pick.targetPile || p);
            break;
          } else if (pick.mode === 'work' && pick.job === 'fetchIn') {
            this._clearTaskClaim(npc);
            this._beginForkFetch(npc, pick);
            break;
          } else if (pick.mode === 'work') {
            if (pick.job === 'takeOut') {
              if (!this._forkAssignTakeOut(npc, pick)) {
                this._clearTaskClaim(npc);
                this._forkGoToHub(npc);
                break;
              }
            } else {
              npc.job = pick.job;
              npc.targetPile = pick.targetPile;
              npc.targetSlot = null;
              this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
            }
            p = this._pileById(npc.targetPile?.id);
          } else {
            this._clearTaskClaim(npc);
            this._forkGoToHub(npc);
            break;
          }
          if (!p) {
            if (npc.cargo) this._forkQueueAtDest(npc);
            else this._forkGoToHub(npc);
            break;
          }
        }
        if (npc.job === 'bringIn' && npc.cargo) {
          if (npc.targetSlot == null || npc.targetSlot < 0) {
            this._forkClaimDropSlot(npc, p);
          }
        } else if (npc.targetSlot == null || npc.targetSlot < 0) {
          npc.targetSlot = this._forkResolveSlot(npc, p);
        }
        // Empty takeOut with nothing left to claim — don't cruise the roadway then bounce
        if (
          npc.job === 'takeOut' &&
          !npc.cargo &&
          (npc.targetSlot == null || npc.targetSlot < 0)
        ) {
          this._clearTaskClaim(npc);
          this._forkGoToHub(npc);
          break;
        }
        if (npc.job === 'bringIn' && npc.cargo && (npc.targetSlot == null || npc.targetSlot < 0)) {
          this._forkQueueAtDest(npc, p);
          break;
        }
        const slot = npc.targetSlot >= 0 ? npc.targetSlot : 0;
        const ap = this._forkApproach(p, slot);
        const route = this._forkRouteTarget(npc, p, slot, ap);
        if (npc._forkApPhase === 'overshoot') {
          npc._lockFacing = false;
          if (this._moveToward(npc, route.x, route.y, 38, dt)) {
            npc._forkApPhase = 'approach';
            npc._forkOvershoot = null;
          }
          break;
        }
        this._forkSetApproachFacing(npc, ap);
        const arrived = this._moveToward(npc, ap.x, ap.y, 38, dt);
        if (arrived) {
          npc.facing = ap.facing;
          npc._lockFacing = true;
          this._forkBeginPileWork(npc, p);
        }
        break;
      }
      case 'linger': {
        if (!this._forkDriveMerge(npc, dt)) break;
        const p = this._pileById(npc.lingerPile?.id || npc.targetPile?.id);
        if (npc.job === 'bringIn' && npc.cargo && p) {
          if (npc.targetSlot == null || npc.targetSlot < 0) {
            this._forkClaimDropSlot(npc, p);
          }
        } else if (npc.targetSlot == null || npc.targetSlot < 0) {
          npc.targetSlot = p ? this._forkResolveSlot(npc, p) : null;
        }
        const slot = npc.targetSlot >= 0 ? npc.targetSlot : 0;
        const ap = this._forkApproach(p, slot);
        const route = this._forkRouteTarget(npc, p, slot, ap);
        if (npc._forkApPhase === 'overshoot') {
          npc._lockFacing = false;
          this._moveToward(npc, route.x, route.y, 28, dt);
          if (Math.hypot(npc.x - route.x, npc.y - route.y) < 2.5) {
            npc._forkApPhase = 'approach';
            npc._forkOvershoot = null;
          }
        } else {
          this._forkSetApproachFacing(npc, ap);
          this._moveToward(npc, ap.x, ap.y, 28, dt);
        }
        if (npc.stateT > 0) break;
        const pick = this._pickForkliftJob(npc);
        if (npc.cargo) {
          if (pick.mode === 'work' && pick.job === 'bringIn') {
            this._forkAssignBringInDest(npc, pick.targetPile);
            this._applyTaskClaim(npc, 'bringIn', pick.targetPile, pick.bay ?? pick.targetPile?.bay);
            npc.state = 'toPile';
          } else {
            // Stay in line at dest until claim/room opens
            this._forkQueueAtDest(npc, pick.targetPile || p);
            npc.stateT = 0.55;
          }
          break;
        }
        if (pick.mode === 'work') {
          if (pick.job === 'fetchIn') {
            this._clearTaskClaim(npc);
            this._beginForkFetch(npc, pick);
            break;
          }
          if (pick.job === 'takeOut') {
            if (!this._forkAssignTakeOut(npc, pick)) {
              this._clearTaskClaim(npc);
              this._forkGoToHub(npc);
              break;
            }
          } else {
            npc.job = pick.job;
            npc.targetPile = pick.targetPile;
            npc.targetSlot = null;
            npc.lingerPile = null;
            this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
          }
          npc.state = 'toPile';
        } else if (pick.mode === 'linger') {
          if (pick.job === 'takeOut') {
            if (!this._forkAssignTakeOut(npc, pick)) {
              this._clearTaskClaim(npc);
              this._forkGoToHub(npc);
              break;
            }
          } else {
            npc.lingerPile = pick.targetPile;
            npc.targetPile = pick.targetPile;
            this._applyTaskClaim(npc, pick.job, pick.targetPile, pick.bay ?? pick.targetPile?.bay);
          }
          npc.stateT = 0.55;
        } else {
          this._clearTaskClaim(npc);
          this._forkGoToHub(npc);
        }
        break;
      }
      case 'work': {
        if (npc.forkPhase) {
          this._updateForkWork(npc, dt);
          break;
        }
        this._clearTaskClaim(npc);
        this._forkGoToHub(npc);
        break;
      }
      case 'toHub': {
        this._forkClearMerge(npc);
        npc._lockFacing = false;
        if (npc.cargo) {
          this._releaseForkliftPark(npc);
          this._forkQueueAtDest(npc);
          break;
        }
        const park = this._claimForkliftPark(npc);
        if (this._moveToward(npc, park.x, park.y, 40, dt)) {
          npc.facing = park.x <= 0 ? 1 : -1;
          npc.state = 'atHub';
          npc.stateT = rand(0.5, 2);
        }
        break;
      }
      case 'toDoor': {
        if (!this._forkDriveMerge(npc, dt)) break;
        npc._lockFacing = false;
        const rerouteEvery = npc.cargo ? 0.35 : 0.12;
        npc._rerouteT = (npc._rerouteT || 0) + dt;
        if (!npc._haulOff && !npc._fetchInbound && npc._rerouteT >= rerouteEvery) {
          npc._rerouteT = 0;
          if (this._tryRerouteForkliftFromExit(npc)) break;
        }
        // Abandon empty fetch only when the trip is truly dead — not staging quirks
        // (those were bouncing trucks home the instant they merged onto PATH_Y).
        if (npc._fetchInbound && !npc.cargo) {
          const bay = npc._fetchBay;
          const pad = bay != null ? this._servicePad(bay) : null;
          const itemId = npc._fetchItemId;
          const item =
            itemId != null
              ? pad?.service?.items?.find((it) => it.id === itemId)
              : null;
          const bayBlocked =
            bay == null || this.bayClearing[bay] || this._opsBays.has(bay);
          const visitGone =
            !pad?.visitorId ||
            !!pad.seq ||
            pad.service?.phase !== 'active';
          const itemDead = itemId != null && (!item || item.status === 'done');
          const pileFull =
            (this._bayPile(bay, 'in', ROW.S)?.items.length ?? PILE_CAP) >=
            PILE_CAP;
          if (bayBlocked || visitGone || itemDead || pileFull) {
            this._reopenServiceItemIfOrphan(pad, itemId);
            this._clearTaskClaim(npc);
            npc._fetchInbound = false;
            npc._fetchBay = null;
            npc._fetchItemId = null;
            this._forkGoToHub(npc);
            break;
          }
        }
        const doorX = this._doorX(npc.side);
        if (this._moveToward(npc, doorX, BAY.PATH_Y, 40, dt)) {
          npc.state = 'exit';
        }
        break;
      }
      case 'exit': {
        const doorX = this._doorX(npc.side);
        if (this._moveToward(npc, doorX + npc.side * 55, BAY.PATH_Y, 42, dt)) {
          if (npc._haulOff && npc.cargo) {
            // Fake offscreen vanish
            this._restageServiceCargo(npc.cargo);
            npc.cargo = null;
            npc._haulOff = false;
            npc.state = 'enter';
            break;
          }
          if (npc._fetchInbound) {
            const fetchBay = npc._fetchBay;
            const fetchItemId = npc._fetchItemId;
            npc.cargo = this._makeSmartInboundCargo(fetchBay, fetchItemId);
            npc._fetchInbound = false;
            npc._fetchBay = null;
            npc._fetchItemId = null;
            this._clearTaskClaim(npc);
            if (npc.cargo) {
              npc.job = 'bringIn';
              const bay =
                npc.cargo.serviceBay != null ? npc.cargo.serviceBay : fetchBay;
              if (bay != null) {
                const dest = this._bayPile(bay, 'in', ROW.S);
                if (dest) {
                  this._forkAssignBringInDest(npc, dest);
                  this._applyTaskClaim(npc, 'bringIn', dest, bay);
                }
              }
              npc.state = 'enter';
            } else {
              // Spawn failed — reopen the checklist unit so another truck can retry
              this._reopenServiceItemIfOrphan(
                fetchBay != null ? this._servicePad(fetchBay) : null,
                fetchItemId
              );
              npc.job = 'idle';
              npc.state = 'enter';
            }
            break;
          }
          // No cargo fiction needed — return via enter then hub
          npc.state = 'enter';
        }
        break;
      }
      default:
        if (npc.cargo) this._forkQueueAtDest(npc);
        else this._forkGoToHub(npc);
    }

    const pushed = this._padKeepOut(npc.x, npc.y);
    if (pushed && npc.state !== 'flee') {
      npc.x = pushed.x;
      npc.y = Math.max(pushed.y, BAY.PATH_Y - 40);
    }
    this._forkUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
  }

  /**
   * Smooth draw yaw from movement; snap to job facing while locked on a pile.
   * Does not change npc.facing (fork tip / cargo math).
   */
  _forkUpdateVisHeading(npc, moveX, moveY, dt) {
    const moveDist = Math.hypot(moveX, moveY);
    const faceAng = npc.facing >= 0 ? 0 : Math.PI;
    let target = npc.visHeading ?? faceAng;
    if (npc.forkPhase || npc._lockFacing) {
      target = faceAng;
    } else if (moveDist > 0.2) {
      target = Math.atan2(moveY, moveX);
    } else {
      target = faceAng;
    }
    this._crewSteerVisHeading(npc, target, dt);
  }

  /**
   * Mechanic draw yaw — same 8-dir system; locks during pile / hull work.
   * Does not change npc.facing (hand / cargo math).
   */
  _mechUpdateVisHeading(npc, moveX, moveY, dt) {
    const moveDist = Math.hypot(moveX, moveY);
    const faceAng = npc.facing >= 0 ? 0 : Math.PI;
    let target = npc.visHeading ?? faceAng;
    const locked = !!(
      npc.mechPhase ||
      npc._lockFacing ||
      npc.state === 'workPile' ||
      npc.state === 'workShip' ||
      npc.state === 'workWeld'
    );
    if (locked) {
      target = faceAng;
    } else if (moveDist > 0.2) {
      target = Math.atan2(moveY, moveX);
    } else {
      target = faceAng;
    }
    this._crewSteerVisHeading(npc, target, dt);
  }

  _crewSteerVisHeading(npc, target, dt) {
    let cur = npc.visHeading;
    if (cur == null || Number.isNaN(cur)) {
      npc.visHeading = target;
      return;
    }
    let diff = target - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const locked = !!(npc.forkPhase || npc.mechPhase || npc._lockFacing);
    const step = (locked ? CREW_VIS_TURN_LOCK : CREW_VIS_TURN) * dt;
    if (Math.abs(diff) <= step) npc.visHeading = target;
    else npc.visHeading = cur + Math.sign(diff) * step;
    if (npc.visHeading > Math.PI) npc.visHeading -= Math.PI * 2;
    if (npc.visHeading <= -Math.PI) npc.visHeading += Math.PI * 2;
  }

  /** Nearest of 8 ground headings, with hysteresis so flicker stays down. */
  _crewVisOctant(npc) {
    const h = npc.visHeading ?? (npc.facing >= 0 ? 0 : Math.PI);
    let oct = Math.round(h / CREW_VIS_OCT);
    oct = ((oct % 8) + 8) % 8;
    const prev = npc._visOct;
    if (prev != null && prev !== oct) {
      const ang = (o) => {
        let a = o * CREW_VIS_OCT;
        if (a > Math.PI) a -= Math.PI * 2;
        return a;
      };
      const wrap = (d) => {
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
      };
      const dNew = Math.abs(wrap(h - ang(oct)));
      const dOld = Math.abs(wrap(h - ang(prev)));
      if (dNew + 0.14 > dOld) oct = prev;
    }
    npc._visOct = oct;
    return oct;
  }

  _shipLocalToWorld(padX, padY, lx, ly, angle = null) {
    const a = angle ?? this.playerPadAngle ?? SHIP.SPAWN_ANGLE;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      x: padX + lx * cos - ly * sin,
      y: padY + lx * sin + ly * cos,
    };
  }

  /** Hardpoint key for the mechanic's current install/remove job. */
  _upgradeHardpointKeyForNpc(npc, bay) {
    if (npc.job === 'installUpgrade') {
      return npc.cargo?.targetHardpointKey || npc.workHardpointKey || null;
    }
    if (npc.job === 'removeUpgrade') {
      return (
        npc.stripHardpointKey ||
        npc.workHardpointKey ||
        this._stripHardpointForBay(bay, null)
      );
    }
    return null;
  }

  /**
   * Torch tip (+ hand / aim dir) for weld emit and mechanic draw.
   * Aims at hullTarget.workX/Y when present.
   */
  _weldTorchTip(npc, opts = {}) {
    const scale = opts.scale ?? 1;
    const bob = opts.bob ?? 0;
    const duck = opts.duck ?? 0;
    const hand = this._mechHandLocal(null);
    const face = npc.facing >= 0 ? 1 : -1;
    const hx = npc.x + face * hand.x * scale;
    const hy = npc.y + (hand.y + bob - duck * 0.3) * scale;
    const workX = npc.hullTarget?.workX;
    const workY = npc.hullTarget?.workY;
    let ax;
    let ay;
    if (workX != null && workY != null) {
      const dx = workX - hx;
      const dy = workY - hy;
      const len = Math.hypot(dx, dy) || 1;
      ax = dx / len;
      ay = dy / len;
    } else {
      const oct = this._crewVisOctant(npc);
      const heading = oct * CREW_VIS_OCT;
      ax = Math.cos(heading);
      ay = Math.sin(heading);
    }
    const reach = 6.2 * scale;
    return {
      x: hx + ax * reach,
      y: hy + ay * reach - 1.5 * scale,
      handX: hx,
      handY: hy,
      ax,
      ay,
    };
  }

  /**
   * Tip→seam weld burst. Repair always under-ship; install/strip rolls layer per burst.
   * Also pumps under-hull sparky glow at the contact point.
   */
  _emitWeldArc(npc) {
    const tip = this._weldTorchTip(npc);
    const workX = npc.hullTarget?.workX ?? npc.x;
    const workY = npc.hullTarget?.workY ?? npc.y;
    const hardpoint =
      npc.job === 'installUpgrade' || npc.job === 'removeUpgrade';
    const layer = hardpoint
      ? Math.random() < 0.5
        ? 'under'
        : 'over'
      : 'under';

    const pad = npc.targetPad;
    const padX = pad?.x ?? npc.x;
    const padY = pad?.y ?? 0;
    // Nudge wash under the hull footprint toward pad center
    const gx = workX + (padX - workX) * 0.28;
    const gy = workY + (padY - workY) * 0.28;
    const warmBurst = Math.random() < 0.38;
    const bay =
      npc.bay ??
      (typeof pad?.bayIndex === 'number' ? pad.bayIndex : bayIndexFromX(padX));
    const padAngle = this._padAngleForBay(bay);
    const g = npc._weldGlow || (npc._weldGlow = {});
    // Midway punch: readable under hull without the full bright pass
    g.intensity = Math.min(1.18, (g.intensity || 0) + rand(0.58, 0.78));
    g.flash = Math.min(0.85, (g.flash || 0) + rand(0.35, 0.75));
    g.x = gx;
    g.y = gy;
    g.amber = warmBurst;
    g.speckleSeed = Math.random();
    g.padX = padX;
    g.padY = padY;
    g.padAngle = padAngle;
    g.bay = bay;
    // Over-layer bursts also kiss the plating (drawn after ships)
    if (layer === 'over') {
      g.surfaceKiss = Math.min(1, (g.surfaceKiss || 0) + 0.85);
    }

    const dx = workX - tip.x;
    const dy = workY - tip.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const padTag = { padX, padY, padAngle, bay };

    // Arc core at tip
    this._sparkle.push({
      x: tip.x,
      y: tip.y,
      life: rand(0.07, 0.16),
      max: 0.16,
      r: rand(1.4, 2.6),
      weld: true,
      layer,
      core: true,
      vx: nx * rand(8, 20),
      vy: ny * rand(8, 20),
      ...padTag,
    });

    const count = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < count; i++) {
      const speed = rand(45, 95);
      const warm = warmBurst || Math.random() < 0.22;
      this._sparkle.push({
        x: tip.x + rand(-1.2, 1.2),
        y: tip.y + rand(-1.2, 1.2),
        life: rand(0.14, 0.38),
        max: 0.38,
        r: rand(0.65, 1.7),
        weld: true,
        layer,
        warm,
        vx: nx * speed + rand(-38, 38),
        vy: ny * speed + rand(-28, 28),
        ...padTag,
      });
    }

    if (Math.random() < 0.28) {
      this._sparkle.push({
        x: workX + rand(-2.5, 2.5),
        y: workY + rand(-2, 2),
        life: rand(0.28, 0.5),
        max: 0.5,
        r: rand(1.8, 3.2),
        dust: true,
        layer: 'under',
        vx: rand(-10, 10),
        vy: rand(-18, -4),
        ...padTag,
      });
    }
  }

  /** Pad facing for hull projection / clips. */
  _padAngleForBay(bay) {
    if (this.isPlayerBay(bay)) return this.playerPadAngle ?? SHIP.SPAWN_ANGLE;
    const pad = this._servicePad(bay);
    return pad?.padAngle ?? FACE_NORTH;
  }

  /**
   * Project a world point onto the pad ship's elliptical footprint.
   * @returns {{ x, y, inside, outside }} outside = normalized distance past the rim (0 if inside)
   */
  _projectOntoShipHull(padX, padY, angle, wx, wy) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = wx - padX;
    const dy = wy - padY;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const hx = SHIP_EXTENT.LENGTH * 0.48;
    const hy = SHIP_EXTENT.BEAM * 0.48;
    const nx = lx / hx;
    const ny = ly / hy;
    const d = Math.hypot(nx, ny) || 0;
    let plx = lx;
    let ply = ly;
    if (d > 1) {
      plx = (nx / d) * hx;
      ply = (ny / d) * hy;
    }
    const w = this._shipLocalToWorld(padX, padY, plx, ply, angle);
    return {
      x: w.x,
      y: w.y,
      inside: d <= 1,
      outside: Math.max(0, d - 1),
    };
  }

  /**
   * Stand just outside a specific ship hardpoint (install / uninstall weld spot).
   */
  _shipHardpointApproach(pad, hardpointKey) {
    const bay =
      typeof pad.bayIndex === 'number' ? pad.bayIndex : bayIndexFromX(pad.x);
    const angle =
      this.isPlayerBay(bay) ? this.playerPadAngle ?? SHIP.SPAWN_ANGLE : SHIP.SPAWN_ANGLE;
    const def = this._shipDefForBay(bay);
    const socket =
      def?.resolveMounts?.()?.[hardpointKey]?.socket ||
      HARDPOINTS[hardpointKey] ||
      null;
    if (!socket) return this._shipHullApproach(pad, 'upgrade');

    const padY = pad.y ?? 0;
    const onHull = this._shipLocalToWorld(pad.x, padY, socket.x, socket.y, angle);
    const dx = onHull.x - pad.x;
    const dy = onHull.y - padY;
    const len = Math.hypot(dx, dy);

    // Center / near-center mounts (dorsal turret): approach from a beam flank
    if (len < 5) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const stand = this._shipLocalToWorld(
        pad.x,
        padY,
        socket.x * 0.35 + 2,
        side * (SHIP_EXTENT.BEAM * 0.48),
        angle
      );
      return {
        x: stand.x,
        y: stand.y,
        hardpointKey,
        workX: onHull.x,
        workY: onHull.y,
      };
    }

    const standR = len + 3.2;
    return {
      x: pad.x + (dx / len) * standR,
      y: padY + (dy / len) * standR,
      hardpointKey,
      workX: onHull.x,
      workY: onHull.y,
    };
  }

  /**
   * Walk straight up to the hull (not a fixed apron point).
   * Hold cargo prefers the aft; upgrades / weld pick hull stations.
   */
  _shipHullApproach(pad, mode) {
    let lx;
    let ly;
    if (mode === 'weld' || mode === 'upgrade') {
      const station = mode === 'upgrade'
        ? pick(['fore', 'forePort', 'dorsal', 'aftPort', 'aftStbd'])
        : pick(['aft', 'aftPort', 'aftStbd', 'port', 'stbd', 'forePort']);
      switch (station) {
        case 'aft':
          lx = -SHIP_EXTENT.LENGTH * 0.42;
          ly = rand(-6, 6);
          break;
        case 'aftPort':
          lx = -SHIP_EXTENT.LENGTH * 0.32;
          ly = -SHIP_EXTENT.BEAM * 0.38;
          break;
        case 'aftStbd':
          lx = -SHIP_EXTENT.LENGTH * 0.32;
          ly = SHIP_EXTENT.BEAM * 0.38;
          break;
        case 'port':
          lx = rand(-6, 10);
          ly = -SHIP_EXTENT.BEAM * 0.45;
          break;
        case 'stbd':
          lx = rand(-6, 10);
          ly = SHIP_EXTENT.BEAM * 0.45;
          break;
        case 'fore':
          lx = SHIP_EXTENT.LENGTH * 0.36;
          ly = rand(-4, 4);
          break;
        case 'dorsal':
          lx = rand(-4, 8);
          ly = rand(-5, 5);
          break;
        default:
          lx = SHIP_EXTENT.LENGTH * 0.28;
          ly = -SHIP_EXTENT.BEAM * 0.28;
      }
    } else {
      // Cargo: walk up to the stern
      lx = -SHIP_EXTENT.LENGTH * 0.42;
      ly = rand(-7, 7);
    }
    const padY = pad.y ?? 0;
    const bay =
      typeof pad.bayIndex === 'number' ? pad.bayIndex : bayIndexFromX(pad.x);
    const angle =
      this.isPlayerBay(bay) ? this.playerPadAngle ?? SHIP.SPAWN_ANGLE : SHIP.SPAWN_ANGLE;
    const onHull = this._shipLocalToWorld(pad.x, padY, lx, ly, angle);
    const dx = onHull.x - pad.x;
    const dy = onHull.y - padY;
    const len = Math.hypot(dx, dy) || 1;
    // Stand just outside the skin; work point is on the hull contact
    const standR = len + 2.5;
    return {
      x: pad.x + (dx / len) * standR,
      y: padY + (dy / len) * standR,
      workX: onHull.x,
      workY: onHull.y,
    };
  }

  /** Job still makes sense right now (pile stock / dest room / weld pad). */
  _mechanicJobValid(npc) {
    if (npc.job === 'weld') return this._padWorkable(npc.targetPad);
    if (npc.job === 'idle' || npc.taskMode === 'despawn') return false;
    if (npc.job === 'stageFerry') {
      if (this._mechStagingBeatenByCrane(npc)) return false;
      const p = this._pileById(npc.targetPile?.id);
      if (!p) return false;
      if (npc.cargo) return p.items.length < PILE_CAP;
      return p.items.length > 0;
    }
    if (!this._padWorkable(npc.targetPad) &&
        (npc.job === 'loadShip' || npc.job === 'unloadShip' ||
          npc.job === 'installUpgrade' || npc.job === 'removeUpgrade')) {
      // Still OK to walk cargo to a pile if we're not going to the ship
      if (npc.state === 'toPile' || npc.state === 'workPile') {
        /* fall through to pile checks */
      } else if (!npc.cargo) {
        return false;
      }
    }
    const p = this._pileById(npc.targetPile?.id);
    if (!p) return false;
    if (npc.job === 'loadShip' || npc.job === 'installUpgrade') {
      if (
        !npc.cargo &&
        npc.job === 'loadShip' &&
        this._mechStagingBeatenByCrane(npc)
      ) {
        return false;
      }
      return !npc.cargo ? p.items.length > 0 : true;
    }
    if (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') {
      if (npc.cargo) return p.items.length < PILE_CAP;
      // Going to ship to pull freight/parts — outbound must have room
      return p.items.length < PILE_CAP;
    }
    return false;
  }

  _startMechanicJob(npc) {
    npc.hullTarget = null;
    npc.mechPhase = null;
    npc.mechHandT = 0;
    npc._mechLift = null;
    if (npc.taskMode === 'despawn' || npc.taskMode === 'idle' || npc.job === 'idle') {
      this._clearTaskClaim(npc);
      this._beginIdleFluff(npc);
      return;
    }
    if (npc.taskMode === 'linger') {
      npc.lingerPile = npc.targetPile;
      npc.state = 'linger';
      npc.stateT = 0.5;
      return;
    }
    if (!this._mechanicJobValid(npc)) {
      if (npc._revalidating) {
        this._clearTaskClaim(npc);
        this._beginIdleFluff(npc);
        npc._revalidating = false;
        return;
      }
      npc._revalidating = true;
      this._beginNextMechanicTrip(npc);
      npc._revalidating = false;
      return;
    }
    this._bindActiveServiceForMech(npc);
    if (npc.job === 'weld') {
      // Fresh Hull pip → plan 2–3 hull stations; keep plan when resuming mid-pip
      if (npc.weldSpotsTotal == null) {
        const spots = Math.max(1, npc.tripsLeft || weldSpotsForPip());
        npc.weldSpotsTotal = spots;
        npc.weldSpotIndex = 0;
        npc.tripsLeft = spots;
      }
      npc.state = 'toShip';
      return;
    }
    if (
      npc.job === 'loadShip' ||
      npc.job === 'installUpgrade' ||
      npc.job === 'stageFerry'
    ) {
      npc.state = npc.targetPile ? 'toPile' : 'idleFluff';
      if (npc.state === 'idleFluff') this._beginIdleFluff(npc);
    } else if (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') {
      npc.state = npc.cargo ? 'toPile' : 'toShip';
    } else {
      this._clearTaskClaim(npc);
      this._beginIdleFluff(npc);
    }
  }

  _beginNextMechanicTrip(npc) {
    npc.hullTarget = null;
    this._clearSkirtStick(npc);
    this._clearBacksplashCross(npc);
    npc._dodgeCorridorX = null;
    if (npc.job === 'weld') {
      npc.tripsLeft -= 0;
      if (npc.tripsLeft <= 0) {
        this._noteBayTaskComplete(npc);
        this._clearTaskClaim(npc);
        this._beginIdleFluff(npc);
        return;
      }
      npc.state = 'toShip';
      return;
    }

    if (npc.tripsLeft <= 0) {
      this._noteBayTaskComplete(npc);
      this._clearTaskClaim(npc);
      this._beginIdleFluff(npc);
      return;
    }

    const pick = this._pickMechanicTask(npc);
    if (pick.mode === 'idle' || pick.mode === 'despawn') {
      this._noteBayTaskComplete(npc);
      this._clearTaskClaim(npc);
      this._beginIdleFluff(npc);
      return;
    }

    npc.job = pick.job;
    npc.targetPad = pick.targetPad;
    npc.bay = pick.bay ?? npc.homeBay;
    npc.targetPile = pick.targetPile;
    npc.targetSlot = null;
    npc.taskMode = pick.mode;
    npc.lingerPile = pick.mode === 'linger' ? pick.targetPile : null;
    npc.stripCategory = pick.stripCategory || null;
    npc.stripHardpointKey = pick.stripHardpointKey || null;
    npc.ferryDest = pick.ferryDest || null;
    npc.ferrySource = pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
    npc.directFromSouth = !!pick.directFromSouth;
    npc._claimCargoId = pick.cargoId ?? null;
    if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
    if (pick.tripsLeft != null) npc.tripsLeft = pick.tripsLeft;
    npc.exitStair = STAIRS[npc.homeBay] || this._nearestStair(npc.targetPad?.x ?? npc.x);
    this._applyTaskClaim(
      npc,
      pick.job,
      pick.targetPile,
      pick.bay,
      pick.serviceItemId ?? null
    );
    this._startMechanicJob(npc);
  }

  _noteBayTaskComplete(npc) {
    npc.secSinceLastBayTask = 0;
  }

  _beginIdleFluff(npc) {
    this._clearTaskClaim(npc);
    npc.job = 'idle';
    npc.taskMode = 'idle';
    npc.hullTarget = null;
    npc.lingerTarget = null;
    npc.gossipWp = null;
    npc.ferryDest = null;
    npc.ferrySource = null;
    npc.weldSpotsTotal = null;
    npc.weldSpotIndex = null;
    const idleSec = npc.secSinceLastBayTask || 0;
    // Fresh off a job → near-bay; long idle → wing / gossip
    const wingBias = Math.min(1, idleSec / 60);
    const roll = Math.random();
    if (roll < 0.35 + wingBias * 0.35) {
      this._assignGossipLinger(npc);
    } else {
      this._assignPiddleLinger(npc, wingBias);
    }
  }

  _assignPiddleLinger(npc, wingBias = 0.5) {
    const homeBay = npc.homeBay ?? 0;
    const props = getHangarProps();
    const near = props.filter(
      (p) => p.bay === homeBay && p.kind === 'computer'
    );
    // Bay-scoped wing fluff: B1 west, B3 east, B2 center pockets — never south of road
    const wing = props.filter((p) => {
      if (p.kind === 'computer') return false;
      const ly = p.linger?.[0]?.y ?? p.y;
      if (ly >= MECH_LINGER_Y_MAX) return false;
      if (homeBay === 0) return p.bay === 0;
      if (homeBay === 2) return p.bay === 2;
      return p.bay === 1;
    });
    const pool = Math.random() < wingBias && wing.length ? wing : near.length ? near : wing;
    const prop = pool.length ? pick(pool) : BAY_COMPUTERS[homeBay];
    const spots = (prop.linger || [{ x: prop.x, y: prop.y + 12 }])
      .map((s, i) => ({
        ...s,
        id: s.id || `${prop.id}_${i}`,
        _bays: resolveLingerBays(s, prop),
      }))
      .filter((s) => lingerAllowsBay(s._bays, homeBay));
    if (!spots.length) {
      // No bay-legal stand — park near home computer
      const c = BAY_COMPUTERS[homeBay];
      npc.gossipWp = null;
      npc.gossipSlot = null;
      npc.lingerFaceRad = null;
      npc.lingerTarget = {
        x: c.x,
        y: Math.min(c.y + 12, MECH_LINGER_Y_MAX),
        propId: c.id,
        faceDeg: 270,
        faceSlackDeg: 25,
      };
      npc.state = 'idleFluff';
      npc.stateT = rand(2.5, 5.5);
      return;
    }
    const free = spots.filter((s) => {
      const n = this.npcs.filter(
        (o) =>
          o.kind === 'mechanic' &&
          o.alive &&
          o !== npc &&
          (o.state === 'idleFluff' || o.state === 'gossip') &&
          o.lingerTarget &&
          Math.hypot(o.lingerTarget.x - s.x, o.lingerTarget.y - s.y) < 10
      ).length;
      return n === 0;
    });
    const spot = (free.length ? pick(free) : pick(spots)) || spots[0];
    const faceDeg = spot.faceDeg ?? 90;
    const faceSlackDeg = spot.faceSlackDeg ?? 25;
    npc.gossipWp = null;
    npc.gossipSlot = null;
    npc.lingerFaceRad = null;
    npc.lingerTarget = {
      x: spot.x,
      y: Math.min(spot.y, MECH_LINGER_Y_MAX),
      propId: prop.id,
      spotId: spot.id,
      faceDeg,
      faceSlackDeg,
    };
    npc.state = 'idleFluff';
    npc.stateT = rand(2.5, 5.5);
  }

  _gossipRingPose(wp, slotIndex, capacity) {
    const n = Math.max(1, capacity | 0);
    const ang = -Math.PI / 2 + (slotIndex / n) * Math.PI * 2;
    return {
      x: wp.x + Math.cos(ang) * GOSSIP_RING_RADIUS,
      y: Math.min(wp.y + Math.sin(ang) * GOSSIP_RING_RADIUS, MECH_LINGER_Y_MAX),
    };
  }

  _assignGossipLinger(npc) {
    const waypoints = getGossipWaypoints();
    if (!waypoints.length) {
      this._assignPiddleLinger(npc, 0.5);
      return;
    }
    const occupied = waypoints.map((wp) => {
      const taken = new Set();
      for (const o of this.npcs) {
        if (
          o.kind === 'mechanic' &&
          o.alive &&
          o !== npc &&
          (o.state === 'idleFluff' || o.state === 'gossip') &&
          o.gossipWp === wp.id &&
          o.gossipSlot != null
        ) {
          taken.add(o.gossipSlot);
        }
      }
      return { wp, taken, n: taken.size };
    });
    occupied.sort((a, b) => {
      const af = a.n > 0 && a.n < a.wp.capacity ? 0 : 1;
      const bf = b.n > 0 && b.n < b.wp.capacity ? 0 : 1;
      if (af !== bf) return af - bf;
      return b.n - a.n;
    });
    const choice = occupied.find((o) => o.n < o.wp.capacity);
    if (!choice) {
      // All gossip full — piddle instead of stacking
      this._assignPiddleLinger(npc, 0.35);
      return;
    }
    let slotIndex = 0;
    while (choice.taken.has(slotIndex) && slotIndex < choice.wp.capacity) {
      slotIndex++;
    }
    const pose = this._gossipRingPose(choice.wp, slotIndex, choice.wp.capacity);
    npc.gossipWp = choice.wp.id;
    npc.gossipSlot = slotIndex;
    npc.lingerFaceRad = null;
    npc.lingerTarget = {
      x: pose.x,
      y: pose.y,
      propId: choice.wp.id,
      spotId: `${choice.wp.id}_s${slotIndex}`,
    };
    npc.state = 'idleFluff';
    npc.stateT = rand(3, 7);
  }

  /** Step clear of apron rally toward ships (around backsplash). */
  _hatchRally(npc) {
    const stair = npc.stair || npc.exitStair || STAIRS[npc.homeBay] || this._nearestStair(npc.x);
    const x = this._pickCorridorX(stair.x, npc.targetPad?.x ?? stair.x, npc);
    return { x, y: BACKSPLASH_Y - BACKSPLASH_BAND - 24 };
  }

  _backsplashGateY(south) {
    return south
      ? BACKSPLASH_Y + BACKSPLASH_BAND + 10
      : BACKSPLASH_Y - BACKSPLASH_BAND - 10;
  }

  /**
   * Side of the blast wall for pathing. Use the clear gate bands — not the wall
   * midline — so crew standing between gate and wall aren't misclassified and
   * forced into an extra N/S cross (apron ping-pong).
   */
  _backsplashSideSouth(y) {
    if (y >= BACKSPLASH_Y + BACKSPLASH_BAND) return true;
    if (y <= BACKSPLASH_Y - BACKSPLASH_BAND) return false;
    // Inside the Y band of the wall slab: snap to nearer clear side
    return y >= BACKSPLASH_Y;
  }

  /**
   * Walkable corridor X positions past service boards: outer ends + dual
   * wall-hug lanes in each inter-bay gap (uid picks among them).
   */
  _backsplashCorridors() {
    const pads = padCenters();
    const half = BACKSPLASH_HALF_W;
    const margin = BACKSPLASH_BYPASS;
    const laneGap = 6;
    const xs = [pads[0] - half - margin, pads[0] - half - margin - laneGap];
    for (let i = 0; i < pads.length - 1; i++) {
      const leftFace = pads[i] + half + margin;
      const rightFace = pads[i + 1] - half - margin;
      // Two parallel lanes per gap (already hug faces; nudge inward slightly)
      xs.push(leftFace);
      xs.push(Math.min(leftFace + laneGap, (leftFace + rightFace) * 0.5 - 1));
      xs.push(rightFace);
      xs.push(Math.max(rightFace - laneGap, (leftFace + rightFace) * 0.5 + 1));
    }
    xs.push(pads[pads.length - 1] + half + margin);
    xs.push(pads[pads.length - 1] + half + margin + laneGap);
    return xs;
  }

  _pickCorridorX(x, tx = x, npc = null) {
    const corridors = this._backsplashCorridors();
    const uidBias = npc?.uid != null ? npc.uid % 2 : 0;
    let best = corridors[0];
    let bestScore = Infinity;
    for (let i = 0; i < corridors.length; i++) {
      const cx = corridors[i];
      // Prefer corridor near the crew; slight bias toward the target's X
      let score = Math.abs(cx - x) + Math.abs(cx - tx) * 0.25;
      // Prefer uid-stable lane among near-ties so mechs don't all stack
      if ((i % 2) === uidBias) score -= 4;
      // Strongly avoid corridors that sit inside a hot danger lane
      if (this._xInAnyHotDanger(cx, 2)) score += 500;
      if (score < bestScore) {
        bestScore = score;
        best = cx;
      }
    }
    return best;
  }

  _clearBacksplashCross(npc) {
    npc._crossing = false;
    npc._crossPhase = 0;
    npc._corridorX = null;
    npc._crossFromSouth = null;
  }

  _clearSkirtStick(npc) {
    npc._skirtWp = null;
  }

  _npcInBacksplash(x, y) {
    if (Math.abs(y - BACKSPLASH_Y) > BACKSPLASH_BAND) return null;
    for (const cx of padCenters()) {
      if (Math.abs(x - cx) <= BACKSPLASH_HALF_W + MECH_BODY_R) return cx;
    }
    return null;
  }

  /** True if the segment crosses a solid backsplash slab. */
  _segmentHitsBacksplash(x0, y0, x1, y1) {
    const wy = BACKSPLASH_Y;
    const band = BACKSPLASH_BAND;
    const bothNorth = y0 < wy - band && y1 < wy - band;
    const bothSouth = y0 > wy + band && y1 > wy + band;
    if (bothNorth || bothSouth) return false;
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    for (const cx of padCenters()) {
      if (
        maxX >= cx - BACKSPLASH_HALF_W - MECH_BODY_R &&
        minX <= cx + BACKSPLASH_HALF_W + MECH_BODY_R
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Locked corridor cross: near-gate → far-gate at fixed corridor X, then release.
   */
  _continueBacksplashCross(npc, tx, ty, speed, dt) {
    const corridorX = npc._corridorX;
    const gateNear = this._backsplashGateY(npc._crossFromSouth);
    const gateFar = this._backsplashGateY(!npc._crossFromSouth);
    const destSouth = !npc._crossFromSouth;

    if (npc._crossPhase <= 1) {
      npc._crossPhase = 1;
      if (Math.hypot(npc.x - corridorX, npc.y - gateNear) > 3) {
        this._moveToward(npc, corridorX, gateNear, speed, dt);
        return false;
      }
      npc._crossPhase = 2;
    }

    if (npc._crossPhase === 2) {
      if (Math.hypot(npc.x - corridorX, npc.y - gateFar) > 3) {
        this._moveToward(npc, corridorX, gateFar, speed, dt);
        return false;
      }
      npc._crossPhase = 3;
    }

    if (npc._crossPhase >= 3) {
      const clearY = gateFar;
      const onDest = destSouth ? npc.y >= clearY - 1 : npc.y <= clearY + 1;
      if (!onDest || Math.abs(npc.x - corridorX) > 4) {
        this._moveToward(npc, corridorX, clearY, speed, dt);
        return false;
      }
      this._clearBacksplashCross(npc);
      npc._crossCool = 0.4;
    }

    return this._moveToward(npc, tx, ty, speed, dt);
  }

  _beginBacksplashCross(npc, tx, ty) {
    npc._crossing = true;
    npc._crossPhase = 1;
    npc._corridorX = this._pickCorridorX(npc.x, tx, npc);
    npc._crossFromSouth = this._backsplashSideSouth(npc.y);
  }

  /**
   * Same-side wall dodge via nearest corridor (no N/S reverse).
   * If still inside the board Y slab, clear to a gate Y before sliding X
   * so sprites don't skim through the board face.
   */
  _sameSideDodge(npc, tx, ty, speed, dt) {
    if (
      npc._dodgeCorridorX == null ||
      Math.abs(npc.x - npc._dodgeCorridorX) < 2
    ) {
      npc._dodgeCorridorX = this._pickCorridorX(npc.x, tx, npc);
    }
    const corridorX = npc._dodgeCorridorX;
    const inBand = Math.abs(npc.y - BACKSPLASH_Y) <= BACKSPLASH_BAND;
    if (inBand) {
      const clearY = this._backsplashGateY(this._backsplashSideSouth(ty));
      if (Math.abs(npc.y - clearY) > 3) {
        this._moveToward(npc, npc.x, clearY, speed, dt);
        return false;
      }
    }
    if (Math.abs(npc.x - corridorX) > 4) {
      const slideY = inBand
        ? this._backsplashGateY(this._backsplashSideSouth(ty))
        : npc.y;
      this._moveToward(npc, corridorX, slideY, speed, dt);
      return false;
    }
    npc._dodgeCorridorX = null;
    return this._moveToward(npc, tx, ty, speed, dt);
  }

  /** True when mechanic is on a cargo pile job (may chord across pad). */
  _isPileApproachState(npc) {
    return (
      npc.state === 'toPile' ||
      npc.state === 'workPile' ||
      npc.state === 'linger'
    );
  }

  /**
   * Mechanic pathing around solid backsplash walls via inter-bay corridors.
   * Hot danger rectangles are skirted (not crossed). Exception: reclaiming a
   * floor drop still inside a hot bay — hold at the edge until it clears.
   * When ops end, the direct path is used again automatically.
   * Arrival is only true for the real goal — never for a skirt/hold waypoint.
   */
  _mechMove(npc, tx, ty, speed, dt) {
    const wy = BACKSPLASH_Y;
    const goalX = tx;
    const goalY = ty;
    let diverted = false;
    const pileJob = this._isPileApproachState(npc);

    // Don't fight an in-progress corridor cross with skirt redirects
    if (!npc._crossing && this._opsBays.size) {
      let exceptBay = npc.state === 'clearHot' ? npc.clearBay : null;
      // Pile jobs may re-enter own hot bay only when reclaiming; otherwise skirt neighbors only
      if (pileJob && npc.state === 'toFloorDrop') {
        exceptBay = npc.homeBay;
      }

      if (this._shouldHoldForHotDrop(npc)) {
        const drop = this.floorDrops.find(
          (d) => d.id === npc.floorDropId || d.id === npc.droppedCargoId
        );
        const edge = this._pointBeforeHotSegment(
          npc.x, npc.y, drop.x, drop.y + 6, exceptBay
        );
        if (Math.hypot(npc.x - edge.x, npc.y - edge.y) <= 2.5) return false;
        tx = edge.x;
        ty = edge.y;
        diverted = true;
        this._clearSkirtStick(npc);
      } else if (this._segmentHitsAnyHotDanger(npc.x, npc.y, goalX, goalY, exceptBay)) {
        const wp = this._skirtAroundHot(
          npc.x, npc.y, goalX, goalY, exceptBay, npc._skirtWp
        );
        npc._skirtWp = { x: wp.x, y: wp.y };
        tx = wp.x;
        ty = wp.y;
        diverted = true;
        if (Math.hypot(npc.x - wp.x, npc.y - wp.y) <= 3) {
          // Reached sticky skirt — clear so the next hop can replan
          this._clearSkirtStick(npc);
        }
      } else {
        this._clearSkirtStick(npc);
      }
    } else if (!this._opsBays.size) {
      this._clearSkirtStick(npc);
    }

    if (npc._crossCool > 0) npc._crossCool -= dt;

    // When diverted, path against the skirt waypoint (not the ship) so we don't
    // start a N/S wall cross toward the goal while the skirt pulls south again.
    const pathX = diverted ? tx : goalX;
    const pathY = diverted ? ty : goalY;

    if (npc._crossing) {
      return this._continueBacksplashCross(npc, goalX, goalY, speed, dt);
    }

    // Embedded in a wall — eject to clear Y + corridor (same-side) or full cross
    if (this._npcInBacksplash(npc.x, npc.y) != null) {
      const wantSouth = this._backsplashSideSouth(pathY);
      const npcSouth = this._backsplashSideSouth(npc.y);
      if (wantSouth === npcSouth) {
        const clearY = this._backsplashGateY(wantSouth);
        const corridorX = this._pickCorridorX(npc.x, pathX, npc);
        this._moveToward(npc, corridorX, clearY, speed, dt);
        return false;
      }
      this._beginBacksplashCross(npc, pathX, pathY);
      if (pathY < wy - 4) npc._crossFromSouth = true;
      else if (pathY > wy + 4) npc._crossFromSouth = false;
      return this._continueBacksplashCross(npc, pathX, pathY, speed, dt);
    }

    const npcSouth = this._backsplashSideSouth(npc.y);
    const tgtSouth = this._backsplashSideSouth(pathY);
    const oppositeSides = npcSouth !== tgtSouth;
    const clips = this._segmentHitsBacksplash(npc.x, npc.y, pathX, pathY);

    let arrived = false;
    if (!oppositeSides) {
      if (clips) arrived = this._sameSideDodge(npc, pathX, pathY, speed, dt);
      else arrived = this._moveToward(npc, pathX, pathY, speed, dt);
    } else if (npc._crossCool > 0) {
      const corridorX = this._pickCorridorX(npc.x, pathX, npc);
      const destGate = this._backsplashGateY(tgtSouth);
      this._moveToward(npc, corridorX, destGate, speed, dt);
      arrived = false;
    } else {
      this._beginBacksplashCross(npc, pathX, pathY);
      arrived = this._continueBacksplashCross(npc, pathX, pathY, speed, dt);
    }

    // Skirt / hold waypoints must not count as reaching the real destination
    if (diverted) return false;
    return arrived;
  }

  /**
   * Auto danger on the player bay when engines/thrusters blast; preserve incoming/departing/elevator.
   */
  _syncBayLaneModes() {
    const pb = this.playerBayIndex;
    for (let i = 0; i < 3; i++) {
      const mode = this.bayLaneMode[i];
      if (mode === 'incoming' || mode === 'departing' || mode === 'elevator') continue;
      if (this._opsBays.has(i)) continue;
      if (i === pb) {
        const hot =
          this._hazard.engine > 0.28 || this._hazard.maneuver > 0.5;
        this.bayLaneMode[i] = hot ? 'danger' : 'idle';
      }
    }
  }

  _updateMechanic(npc, dt, hazard) {
    const ox = npc.x;
    const oy = npc.y;
    try {
    npc.phase += dt * 8;
    npc.stateT -= dt;

    if (npc.state === 'flinch') {
      npc.x += Math.sin(npc.phase * 2) * 8 * dt;
      if (npc.stateT <= 0) {
        npc.state = npc.resumeState || 'toShip';
        npc.stateT = 0;
      }
      return;
    }
    if (npc.state === 'flee') {
      // Player thruster/weapon retreat — south of hatch, then resume (unchanged).
      const stair = npc.exitStair || this._nearestStair(npc.x);
      const safeX = stair.x;
      const safeY = stair.y + 22;
      if (this._mechMove(npc, safeX, safeY, 58, dt)) {
        const resume = npc.resumeState || 'toShip';
        npc.state = resume === 'toExit' || resume === 'descend' ? 'toShip' : resume;
        npc.hullTarget = null;
        npc.stateT = 0.2;
        npc.exitArmed = false;
      }
      return;
    }
    if (npc.state === 'clearHot') {
      let bay = npc.clearBay;
      if (bay == null || !this._inBayDangerZone(npc, bay)) {
        bay = this._pointInAnyHotDanger(npc.x, npc.y);
      }
      if (bay != null && this._inBayDangerZone(npc, bay)) {
        npc.clearBay = bay;
        npc.safeSpot = this._nearestSafePoint(npc.x, npc.y, bay);
        this._mechMove(npc, npc.safeSpot.x, npc.safeSpot.y, 62, dt);
        if (this._pointInAnyHotDanger(npc.x, npc.y) == null) {
          npc.state = 'resumeWait';
          npc.stateT = rand(0.15, 0.55);
        }
        return;
      }
      npc.state = 'resumeWait';
      npc.stateT = rand(0.15, 0.55);
      return;
    }
    if (npc.state === 'resumeWait') {
      if (npc.stateT > 0) return;
      this._resumeAfterOpsClear(npc);
      return;
    }
    if (npc.state === 'toFloorDrop') {
      const drop = this.floorDrops.find((d) => d.id === npc.floorDropId || d.id === npc.droppedCargoId);
      if (!drop) {
        npc.droppedCargoId = null;
        npc.floorDropId = null;
        this._beginNextMechanicTrip(npc);
        return;
      }
      if (this._mechMove(npc, drop.x, drop.y + 6, 30, dt)) {
        npc.cargo = drop.cargo;
        this.floorDrops = this.floorDrops.filter((d) => d.id !== drop.id);
        npc.droppedCargoId = null;
        npc.floorDropId = null;
        this._decideAfterReclaimDrop(npc);
      }
      return;
    }

    if (
      ['toPile', 'toShip', 'workPile', 'workShip', 'workWeld', 'leaveHatch', 'linger'].includes(npc.state) &&
      hazard > 0.55 &&
      Math.hypot(npc.x - this._shipPos.x, npc.y - this._shipPos.y) < 70 &&
      Math.random() < hazard * 0.035
    ) {
      npc.resumeState = npc.state === 'leaveHatch' ? 'toShip' : npc.state;
      if (hazard > 1.15) {
        npc.state = 'flee';
        npc.stateT = rand(0.8, 1.2);
      } else {
        npc.state = 'flinch';
        npc.stateT = rand(0.35, 0.55);
      }
      return;
    }

    const walk = 27;

    switch (npc.state) {
      case 'emerge':
      case 'leaveHatch': {
        // Stairs removed — treat as idle fluff / job start
        npc.exitArmed = true;
        if (npc.taskMode === 'despawn' || npc.job === 'idle' || npc.taskMode === 'idle') {
          this._beginIdleFluff(npc);
        } else {
          this._startMechanicJob(npc);
        }
        break;
      }
      case 'idleFluff': {
        // Interrupt for real bay work
        const wake = this._pickMechanicTask(npc);
        if (wake.mode === 'work' || wake.mode === 'linger') {
          npc.job = wake.job;
          npc.targetPad = wake.targetPad;
          npc.bay = wake.bay ?? npc.homeBay;
          npc.targetPile = wake.targetPile;
          npc.targetSlot = null;
          npc.taskMode = wake.mode;
          npc.lingerPile = wake.mode === 'linger' ? wake.targetPile : null;
          npc.ferryDest = wake.ferryDest || null;
          npc.ferrySource =
            wake.ferrySource || (wake.job === 'stageFerry' ? wake.targetPile : null);
          npc.directFromSouth = !!wake.directFromSouth;
          npc.tripsLeft =
            wake.tripsLeft != null
              ? wake.tripsLeft
              : 2 + ((Math.random() * 3) | 0);
          npc._claimCargoId = wake.cargoId ?? null;
          if (wake.serviceItemId != null) npc._activeServiceId = wake.serviceItemId;
          this._applyTaskClaim(
            npc,
            wake.job,
            wake.targetPile,
            wake.bay,
            wake.serviceItemId ?? null
          );
          this._startMechanicJob(npc);
          break;
        }
        const tgt = npc.lingerTarget;
        if (tgt) {
          // Never route idle fluff across the forklift road
          const lx = tgt.x;
          const ly = Math.min(tgt.y, MECH_LINGER_Y_MAX);
          if (npc.y > MECH_LINGER_Y_MAX) {
            this._mechMove(npc, npc.x, MECH_LINGER_Y_MAX - 4, walk * 0.9, dt);
          } else {
            this._mechMove(npc, lx, ly, walk * 0.85, dt);
          }
          if (npc.y > MECH_LINGER_Y_MAX) npc.y = MECH_LINGER_Y_MAX;
          if (Math.hypot(npc.x - lx, npc.y - ly) < 4) {
            npc.x += Math.sin(npc.phase) * 0.12;
            if (npc.gossipWp) {
              // Face huddle centroid (or waypoint center if alone)
              let cx = lx;
              let cy = ly;
              let n = 0;
              let sx = 0;
              let sy = 0;
              for (const o of this.npcs) {
                if (
                  o !== npc &&
                  o.kind === 'mechanic' &&
                  o.alive &&
                  o.gossipWp === npc.gossipWp
                ) {
                  sx += o.x;
                  sy += o.y;
                  n++;
                }
              }
              if (n > 0) {
                cx = sx / n;
                cy = sy / n;
              } else {
                const wp = getGossipWaypoints().find((w) => w.id === npc.gossipWp);
                if (wp) {
                  cx = wp.x;
                  cy = wp.y;
                }
              }
              const ang = Math.atan2(cy - npc.y, cx - npc.x);
              npc.visHeading = ang;
              npc.facing = Math.cos(ang) >= 0 ? 1 : -1;
            } else if (tgt.faceDeg != null) {
              if (npc.lingerFaceRad == null) {
                const slack = ((tgt.faceSlackDeg ?? 0) * Math.PI) / 180;
                const base = (tgt.faceDeg * Math.PI) / 180;
                npc.lingerFaceRad = base + (Math.random() * 2 - 1) * slack;
              }
              this._crewSteerVisHeading(npc, npc.lingerFaceRad, dt);
              npc.facing = Math.cos(npc.visHeading ?? 0) >= 0 ? 1 : -1;
            }
          }
        }
        if (npc.stateT <= 0) {
          this._beginIdleFluff(npc);
        }
        break;
      }
      case 'enterDoor': {
        const ix = this._insideX(npc.side);
        if (this._moveToward(npc, ix, BAY.PATH_Y, walk, dt)) {
          npc.exitArmed = true;
          this._beginNextMechanicTrip(npc);
        }
        break;
      }
      case 'toPile': {
        const p = this._pileById(npc.targetPile?.id);
        if (!p) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        // Crane got this south-staging crate first — drop the assist / direct-load
        if (
          !npc.cargo &&
          this._mechStagingBeatenByCrane(npc)
        ) {
          this._abandonMechanicStagingFerry(npc);
          break;
        }
        if (
          (npc.job === 'stageFerry' ||
            (npc.job === 'loadShip' && npc.directFromSouth)) &&
          !npc.cargo &&
          !p.items.length
        ) {
          this._abandonMechanicStagingFerry(npc);
          break;
        }
        const unloading =
          npc.job === 'unloadShip' ||
          npc.job === 'removeUpgrade' ||
          (npc.job === 'stageFerry' && !!npc.cargo);
        if (unloading && p.items.length >= PILE_CAP && npc.cargo) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        if (unloading && npc.cargo) {
          // Re-validate / lock claim each frame so approach lane matches deposit
          npc.targetSlot = this._mechClaimDropSlot(npc, p);
        } else if (npc.targetSlot == null) {
          npc.targetSlot = this._mechResolveSlot(npc, p);
        }
        if (npc.targetSlot < 0) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        const slot = npc.targetSlot;
        const ap = this._mechApproachForSlot(p, slot);
        npc.facing = ap.facing;
        if (this._mechMove(npc, ap.x, ap.y, walk, dt)) {
          npc.targetSlot = slot;
          npc.mechPhase = 'creepIn';
          npc.mechHandT = 0;
          npc._mechLift = null;
          npc.state = 'workPile';
          npc.stateT = 0;
        }
        break;
      }
      case 'linger': {
        const p = this._pileById(npc.lingerPile?.id || npc.targetPile?.id);
        const slot = npc.targetSlot ?? (p ? this._mechResolveSlot(npc, p) : 0);
        const ap = p ? this._mechApproachForSlot(p, slot >= 0 ? slot : 0) : null;
        const tx = ap ? ap.x : npc.x;
        const ty = ap ? ap.y : npc.y;
        if (ap?.facing) npc.facing = ap.facing;
        this._mechMove(npc, tx, ty, walk * 0.7, dt);
        npc.x += Math.sin(npc.phase) * 0.15;
        if (npc.stateT > 0) break;
        // Recheck: dest free → work; else other doable; else keep lingering / despawn
        const pick = this._pickMechanicTask(npc);
        if (pick.mode === 'work') {
          npc.job = pick.job;
          npc.targetPad = pick.targetPad;
          npc.bay = pick.bay;
          npc.targetPile = pick.targetPile;
          npc.targetSlot = null;
          npc.taskMode = 'work';
          npc.lingerPile = null;
          npc.stripCategory = pick.stripCategory || null;
          npc.stripHardpointKey = pick.stripHardpointKey || null;
          npc.ferryDest = pick.ferryDest || null;
          npc.ferrySource =
            pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
          npc.directFromSouth = !!pick.directFromSouth;
          npc._claimCargoId = pick.cargoId ?? null;
          if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
          if (pick.tripsLeft != null) npc.tripsLeft = pick.tripsLeft;
          this._applyTaskClaim(
            npc,
            pick.job,
            pick.targetPile,
            pick.bay,
            pick.serviceItemId ?? null
          );
          this._startMechanicJob(npc);
        } else if (pick.mode === 'linger') {
          npc.job = pick.job;
          npc.targetPad = pick.targetPad;
          npc.bay = pick.bay;
          npc.targetPile = pick.targetPile;
          npc.targetSlot = null;
          npc.lingerPile = pick.targetPile;
          npc.stripCategory = pick.stripCategory || null;
          npc.stripHardpointKey = pick.stripHardpointKey || null;
          npc.ferryDest = pick.ferryDest || null;
          npc.ferrySource =
            pick.ferrySource || (pick.job === 'stageFerry' ? pick.targetPile : null);
          npc.directFromSouth = !!pick.directFromSouth;
          npc._claimCargoId = pick.cargoId ?? null;
          if (pick.serviceItemId != null) npc._activeServiceId = pick.serviceItemId;
          if (pick.tripsLeft != null) npc.tripsLeft = pick.tripsLeft;
          this._applyTaskClaim(
            npc,
            pick.job,
            pick.targetPile,
            pick.bay,
            pick.serviceItemId ?? null
          );
          npc.stateT = 0.55;
        } else {
          this._clearTaskClaim(npc);
          this._beginIdleFluff(npc);
        }
        break;
      }
      case 'workPile': {
        if (
          !npc.cargo &&
          !npc._mechLift?.cargo &&
          this._mechStagingBeatenByCrane(npc)
        ) {
          this._abandonMechanicStagingFerry(npc);
          break;
        }
        if (npc.mechPhase) {
          this._updateMechPileWork(npc, dt);
          break;
        }
        this._mechAbortPileWork(npc);
        break;
      }
      case 'toShip': {
        const pad = npc.targetPad;
        if (!pad || !this._padWorkable(pad) || !this._mechanicJobValid(npc)) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        // Load/install must carry a part — never walk to the hull empty-handed
        if (
          (npc.job === 'loadShip' || npc.job === 'installUpgrade') &&
          !npc.cargo
        ) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        // Unload/remove only if outbound still has room
        if (
          (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') &&
          !npc.cargo &&
          !this._mechanicJobValid(npc)
        ) {
          this._beginNextMechanicTrip(npc);
          break;
        }
        if (!npc.hullTarget) {
          const bay =
            npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
          if (npc.job === 'installUpgrade' || npc.job === 'removeUpgrade') {
            const hpKey = this._upgradeHardpointKeyForNpc(npc, bay);
            npc.workHardpointKey = hpKey;
            npc.hullTarget = hpKey
              ? this._shipHardpointApproach(pad, hpKey)
              : this._shipHullApproach(pad, 'upgrade');
          } else {
            const mode = npc.job === 'weld' ? 'weld' : 'cargo';
            npc.hullTarget = this._shipHullApproach(pad, mode);
          }
        }
        // Face the hardpoint / hull work spot while approaching
        if (npc.hullTarget?.workX != null) {
          npc.facing = npc.hullTarget.workX >= npc.x ? 1 : -1;
        }
        if (this._mechMove(npc, npc.hullTarget.x, npc.hullTarget.y, walk, dt)) {
          if (npc.job === 'weld') {
            npc.state = 'workWeld';
            npc.stateT = rand(1.1, 1.9);
            this._beginBoardProgress(npc, 'repair');
          } else {
            npc.state = 'workShip';
            npc.stateT = npc.job === 'installUpgrade' || npc.job === 'removeUpgrade'
              ? rand(1.2, 1.9)
              : rand(0.7, 1.1);
            this._beginBoardProgress(npc, this._boardProgressTypeForJob(npc));
          }
        }
        break;
      }
      case 'workWeld': {
        if (!this._padWorkable(npc.targetPad)) {
          npc.hullTarget = null;
          npc._weldGlow = null;
          this._clearBoardProgress(npc);
          this._beginNextMechanicTrip(npc);
          break;
        }
        if (npc.hullTarget?.workX != null) {
          npc.facing = npc.hullTarget.workX >= npc.x ? 1 : -1;
        }
        this._tickBoardProgress(npc);
        if (Math.random() < 0.55) this._emitWeldArc(npc);
        if (npc.stateT > 0) break;
        const weldBay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);
        const pad = this._servicePad(weldBay);
        // Finish this spot's fraction, then pause meter while walking to the next
        npc.weldSpotIndex = (npc.weldSpotIndex || 0) + 1;
        npc.tripsLeft -= 1;
        this._clearBoardProgress(npc);
        this._syncRepairHullMeter(pad);
        npc.hullTarget = null;
        npc._weldGlow = null;

        if (npc.tripsLeft <= 0 || weldBay !== npc.homeBay) {
          // Last spot of this Hull pip — mark done only now (hull already at pip end)
          if (npc._activeServiceId != null || npc._claimServiceItemId != null) {
            this._completeServiceKey(
              npc._activeServiceId ?? npc._claimServiceItemId
            );
          } else {
            this._completeServiceType(weldBay, 'repair');
          }
          this._syncRepairHullMeter(pad);
          this._noteBayTaskComplete(npc);
          this._settleActiveServicePip(npc);
          npc.tripsLeft = 0;
          npc.weldSpotIndex = 0;
          npc.weldSpotsTotal = null;
          this._clearTaskClaim(npc);
          this._beginIdleFluff(npc);
        } else {
          // Walk to next hull station — board % holds until sparks resume
          npc.state = 'toShip';
        }
        break;
      }
      case 'workShip': {
        if (!this._padWorkable(npc.targetPad)) {
          npc.hullTarget = null;
          npc._weldGlow = null;
          this._clearBoardProgress(npc);
          this._beginNextMechanicTrip(npc);
          break;
        }
        const upgrading =
          npc.job === 'installUpgrade' || npc.job === 'removeUpgrade';
        if (upgrading && npc.hullTarget?.workX != null) {
          npc.facing = npc.hullTarget.workX >= npc.x ? 1 : -1;
        }
        this._tickBoardProgress(npc);
        const freightJob =
          npc.job === 'loadShip' || npc.job === 'unloadShip';
        if (upgrading && Math.random() < 0.6) {
          this._emitWeldArc(npc);
        } else if (freightJob && Math.random() < 0.4) {
          // Soft dust puff while seating / pulling hold freight
          const wx = npc.hullTarget?.workX ?? npc.x;
          const wy = npc.hullTarget?.workY ?? npc.y;
          this._sparkle.push({
            x: wx + rand(-5, 5),
            y: wy + rand(-3, 4),
            life: rand(0.25, 0.55),
            max: 0.55,
            r: rand(1.6, 3.4),
            dust: true,
            vx: rand(-6, 6),
            vy: rand(-2, 8),
          });
        }
        if (npc.stateT > 0) break;
        const bay = npc.bay ?? bayIndexFromX(npc.targetPad?.x ?? npc.x);

        if ((npc.job === 'loadShip' || npc.job === 'installUpgrade') && npc.cargo) {
          if (npc.job === 'installUpgrade') {
            const ok = this._installCatalogPart(bay, npc.cargo);
            if (!ok) {
              // Socket still occupied — return part to UP-in and strip first
              const failedCat =
                npc.cargo.catalogCategory ||
                categoryFromFreightLabel(npc.cargo.label) ||
                getItem(npc.cargo.catalogItemId)?.category;
              const failedKey = npc.cargo.targetHardpointKey || null;
              const upIn = this._bayPile(bay, 'in', ROW.N);
              if (upIn && upIn.items.length < PILE_CAP) {
                upIn.items.push(npc.cargo);
                npc.cargo = null;
                npc.stripCategory = failedCat || npc.stripCategory;
                npc.stripHardpointKey = failedKey || npc.stripHardpointKey;
                this._clearBoardProgress(npc);
                this._beginNextMechanicTrip(npc);
                break;
              }
            }
          }
          if (npc.cargo?.serviceKey != null) {
            npc._activeServiceId = npc.cargo.serviceKey;
          }
          this._completeLoadService(bay, npc.cargo, npc.job);
          this._clearBoardProgress(npc);
          this._noteBayTaskComplete(npc);
          npc.cargo = null;
          npc.tripsLeft -= 1;
          npc.hullTarget = null;
          npc._weldGlow = null;
          // Walking away from the pad settles the pip green
          this._settleActiveServicePip(npc);
          if (npc.tripsLeft <= 0) {
            this._clearTaskClaim(npc);
            this._beginIdleFluff(npc);
          } else this._beginNextMechanicTrip(npc);
        } else if ((npc.job === 'loadShip' || npc.job === 'installUpgrade') && !npc.cargo) {
          this._clearBoardProgress(npc);
          this._beginNextMechanicTrip(npc);
        } else if (npc.job === 'unloadShip' && !npc.cargo) {
          const dest = this._bayPile(bay, 'out', ROW.M);
          if (!dest || dest.items.length >= PILE_CAP) {
            this._clearBoardProgress(npc);
            this._beginNextMechanicTrip(npc);
            break;
          }
          // Reflect unload on the board as soon as the crate leaves the ship —
          // physical freight matches the square that disappeared
          const pad = this._servicePad(bay);
          let unloadedBlock = null;
          if (pad?.shipState?.cargoMk > 0) {
            if (!pad.shipState.cargoHold) {
              pad.shipState.cargoHold = packCargoHold(
                pad.shipState.cargoMk,
                pad.shipState.cargoSpace ?? 0.4
              );
            }
            unloadedBlock = removeCargoHoldBlock(pad.shipState.cargoHold);
            syncCargoSpace(pad.shipState);
          }
          npc.cargo = makeCargo(crateKindFromHoldBlock(unloadedBlock));
          npc.cargo.unloadServiceBay = bay;
          npc.cargo._boardUnloadApplied = true;
          npc.targetPile = dest;
          npc.targetSlot = null;
          npc.hullTarget = null;
          this._clearBoardProgress(npc);
          this._applyTaskClaim(
            npc,
            'unloadShip',
            npc.targetPile,
            bay,
            npc._claimServiceItemId ?? npc._activeServiceId
          );
          npc.state = 'toPile';
        } else if (npc.job === 'removeUpgrade' && !npc.cargo) {
          this._clearBoardProgress(npc);
          const dest = this._bayPile(bay, 'out', ROW.N);
          if (!dest || dest.items.length >= PILE_CAP) {
            this._beginNextMechanicTrip(npc);
            break;
          }
          const stripped = this._stripCatalogPart(
            bay,
            npc.stripCategory,
            npc.stripHardpointKey
          );
          if (!stripped) {
            // Don't weld-loop forever if strip can't resolve a part
            npc._stripFailCount = (npc._stripFailCount || 0) + 1;
            if (npc._stripFailCount >= 2) {
              npc._stripFailCount = 0;
              this._clearTaskClaim(npc);
              this._beginIdleFluff(npc);
            } else {
              this._beginNextMechanicTrip(npc);
            }
            break;
          }
          npc._stripFailCount = 0;
          npc.cargo = stripped;
          npc.targetPile = dest;
          npc.targetSlot = null;
          npc.hullTarget = null;
          npc._weldGlow = null;
          this._applyTaskClaim(npc, 'removeUpgrade', npc.targetPile, bay);
          npc.state = 'toPile';
        } else {
          this._clearBoardProgress(npc);
          npc._weldGlow = null;
          this._beginNextMechanicTrip(npc);
        }
        break;
      }
      case 'toExit':
      case 'descend':
      case 'exitDoor': {
        // Stairs removed — dump cargo if any and idle on apron
        this._clearTaskClaim(npc);
        if (npc.cargo) {
          const bay = npc.homeBay ?? bayIndexFromX(npc.x);
          if (!this._depositCargoSafe(npc.cargo, bay)) {
            this._dropFloorCargo(npc);
          } else {
            npc.cargo = null;
          }
        }
        if (this._tryRerouteMechanicFromExit(npc)) break;
        this._beginIdleFluff(npc);
        break;
      }
      default:
        this._beginIdleFluff(npc);
    }

    if (
      npc.state === 'toShip' ||
      npc.state === 'workShip' ||
      npc.state === 'workWeld' ||
      npc.state === 'toPile' ||
      npc.state === 'workPile' ||
      npc.state === 'linger' ||
      npc.state === 'toFloorDrop' ||
      npc.state === 'flinch' ||
      npc.state === 'clearHot' ||
      npc.state === 'leaveHatch' ||
      npc.state === 'idleFluff' ||
      npc.state === 'gossip' ||
      npc.state === 'flee' ||
      npc.state === 'resumeWait'
    ) {
      return;
    }
    // Mechanics walk over pads freely — keep-out only for any leftover states
    // (forklifts still use _padKeepOut in their own update).
    } finally {
      if (npc.state === 'idleFluff' && npc.lingerFaceRad != null) {
        this._crewSteerVisHeading(npc, npc.lingerFaceRad, dt);
      } else if (npc.state === 'idleFluff' && npc.gossipWp) {
        // Keep inward facing set in idleFluff arrive; light steer only
        if (npc.visHeading != null) {
          this._crewSteerVisHeading(npc, npc.visHeading, dt);
        } else {
          this._mechUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
        }
      } else {
        this._mechUpdateVisHeading(npc, npc.x - ox, npc.y - oy, dt);
      }
    }
  }

  _resumeAfterOpsClear(npc) {
    const drop =
      this.floorDrops.find((d) => d.id === npc.droppedCargoId) ||
      this.floorDrops.find((d) => d.ownerId === npc.uid && !d.claimNpc);
    if (drop) {
      drop.claimNpc = npc.uid;
      npc.floorDropId = drop.id;
      npc.droppedCargoId = drop.id;
      npc.state = 'toFloorDrop';
      npc.stateT = 0;
      return;
    }

    const resume = npc.resumeState;
    npc.resumeState = null;
    npc.clearBay = null;
    npc.safeSpot = null;

    // Never resume mid-weld / mid-hull in thin air — revalidate or re-pick
    let next = resume;
    if (next === 'workWeld' || next === 'workShip') next = 'toShip';

    if (next && !['toExit', 'descend', 'clearHot', 'resumeWait', 'flee', 'flinch'].includes(next)) {
      if (npc._opsResumeJob) npc.job = npc._opsResumeJob;
      if (npc._opsResumePad) npc.targetPad = npc._opsResumePad;
      if (npc._opsResumePile) npc.targetPile = npc._opsResumePile;
      if (npc._opsResumeBay != null) npc.bay = npc._opsResumeBay;
      npc.hullTarget = null;
      if (!this._mechanicJobValid(npc) || !this._padWorkable(npc.targetPad)) {
        this._beginNextMechanicTrip(npc);
        return;
      }
      npc.state = next;
      npc.stateT = 0.15;
      return;
    }
    this._beginNextMechanicTrip(npc);
  }

  _decideAfterReclaimDrop(npc) {
    // Carrying again — deliver to ship, park on outbound pile, or re-pick
    if (npc.job === 'loadShip' || npc.job === 'installUpgrade') {
      if (npc.targetPad) {
        npc.state = 'toShip';
        npc.hullTarget = null;
        return;
      }
    }
    if (npc.job === 'unloadShip' || npc.job === 'removeUpgrade') {
      const bay = npc.bay ?? bayIndexFromX(npc.x);
      const row = npc.cargo?.family === 'upgrade' ? ROW.N : ROW.M;
      const dest = this._bayPile(bay, 'out', row);
      if (dest && dest.items.length < PILE_CAP) {
        npc.targetPile = dest;
        npc.targetSlot = null;
        npc.state = 'toPile';
        return;
      }
    }
    // Sensible default: put it on a matching-family pile, then re-pick work
    const bay = npc.bay ?? bayIndexFromX(npc.x);
    const dest = this._findSafePileForCargo(npc.cargo, bay);
    if (dest && dest.items.length < PILE_CAP) {
      npc.targetPile = dest;
      npc.targetSlot = null;
      npc.job = npc.cargo?.family === 'upgrade' ? 'removeUpgrade' : 'unloadShip';
      npc.state = 'toPile';
      return;
    }
    this._beginNextMechanicTrip(npc);
  }

  _padKeepOut(x, y, radius = BAY.PAD_R + 14) {
    const pads = padCenters().map((px) => ({ x: px, y: 0 }));
    for (const p of pads) {
      const dx = x - p.x;
      const dy = y - p.y;
      const clear = radius;
      if (dx * dx + dy * dy < clear * clear) {
        const a = Math.atan2(dy, dx);
        return {
          x: p.x + Math.cos(a) * clear,
          y: p.y + Math.sin(a) * clear,
        };
      }
    }
    return null;
  }

  render(ctx, space = null) {
    this.renderDeck(ctx, space);
    this.renderCrew(ctx);
    this.renderWeldUnder(ctx);
    this.renderElevatorTransits(ctx);
    this.renderVisitors(ctx);
    this.renderOverhead(ctx);
  }

  /**
   * Pre-ship weld FX: under-layer sparks + under-hull sparky glow.
   * Ships drawn after this occlude repair / under-burst sparks.
   */
  renderWeldUnder(ctx) {
    this._drawWeldUnderGlow(ctx);
    this._drawSparkles(ctx, 'under');
  }

  /** Pads, cargo, floor — below crew and ships. */
  renderDeck(ctx, space = null) {
    this._drawBayShell(ctx);
    if (space) {
      this._drawViewportSpace(ctx, space);
      this._drawOpenDoorSpace(ctx, space);
    }
    this._drawViewportFrames(ctx);
    this._drawFloor(ctx);
    this._drawBayDangerLights(ctx);
    this._drawSetDressing(ctx);
    this._drawForkliftHub(ctx);
    this._drawServiceDisplayBoards(ctx);
    this._drawBayDoors(ctx);
    this._drawBayBeacons(ctx);
    this._drawDoorTickers(ctx);
    this._drawCargoPiles(ctx);

    // Shaft well under the player pad (rim peeks around the pad edge)
    const px = this.playerPadWorldX();
    const pb = this.playerBayIndex;
    this._drawElevationShaft(ctx, px, 0);
    if ((this.playerPadDrop || 0) < 0.02) {
      this._drawDockPad(ctx, px, 0, this.playerBay?.bayId || bayLabels()[pb], {
        active: this.isDevControlBay(pb),
        occupied: !!this.playerPadOccupied,
        angle: this.playerPadAngle,
        rimMode: this.padRimMode[pb] || 'off',
      });
    }

    for (const pad of this.sidePads) {
      const drop = pad.padDrop || 0;
      this._drawElevationShaft(ctx, pad.x, 0);
      if (drop < 0.02) {
        this._drawDockPad(ctx, pad.x, 0, pad.bayId, {
          active: this.isDevControlBay(pad.bayIndex),
          occupied: !!pad.visitorId,
          angle: pad.padAngle ?? FACE_NORTH,
          rimMode: this.padRimMode[pad.bayIndex] || 'off',
        });
      }
      // Transit pad+ship drawn later (clipped) so deck dressing stays around the hole
    }
  }

  /**
   * True when an NPC stands north of a service display (should be drawn under it).
   */
  _npcBehindServiceBoard(npc) {
    if (npc.y >= SERVICE_BOARD_BOTTOM - 2) return false;
    if (npc.y < SERVICE_BOARD_TOP - 14) return false;
    for (const cx of padCenters()) {
      if (Math.abs(npc.x - cx) <= BACKSPLASH_HALF_W + 6) return true;
    }
    return false;
  }

  _drawNpc(ctx, npc) {
    if (npc.kind === 'mechanic') this._drawMechanic(ctx, npc);
    else this._drawForklift(ctx, npc);
  }

  /** Crew on the deck — drawn under ships so hulls occlude them. */
  renderCrew(ctx) {
    const behind = [];
    const front = [];
    for (const npc of this.npcs) {
      if (!this._npcVisibleThroughBulkheads(npc)) continue;
      if (this._npcBehindServiceBoard(npc)) behind.push(npc);
      else front.push(npc);
    }
    for (const npc of behind) this._drawNpc(ctx, npc);
    // Redraw displays so their 2.5D height occludes northern crew
    this._drawServiceDisplayBoards(ctx);
    for (const npc of front) this._drawNpc(ctx, npc);
    this._drawBulkheadDoors(ctx);
  }

  /**
   * Elevator pad+ship while descending/ascending — clipped to the shaft opening
   * so the rest of the hangar occludes anything outside the circle.
   */
  renderElevatorTransits(ctx, hooks = {}) {
    const playerDrop = this.playerPadDrop || 0;
    if (playerDrop >= 0.02) {
      this._drawPlayerElevatorTransit(ctx, hooks.drawPlayerShip);
      this._drawElevationShaftRim(ctx, this.playerPadWorldX(), 0);
    }
    for (const pad of this.sidePads) {
      if ((pad.padDrop || 0) < 0.02) continue;
      this._drawElevatorTransit(ctx, pad);
      this._drawElevationShaftRim(ctx, pad.x, 0);
    }
  }

  /** Door arrive: hide hull until bay doors are open (green) and approach begins. */
  _visitorArrivalShipVisible(pad) {
    const s = pad.seq;
    if (!s || s.kind !== 'arrive') return true;
    return (
      s.phase === 'approach' ||
      s.phase === 'settle' ||
      s.phase === 'turn' ||
      s.phase === 'doorsClose'
    );
  }

  /** North lip of bay doors — ships with y < this are outside (space side). */
  getDoorLipY() {
    return -BAY.HALF_H + BAY.DOOR_H;
  }

  /**
   * Visitor ships on B1/B3 (+ optional player ship via hooks).
   * Elevator-transit visitors are drawn clipped inside the shaft.
   * Outside ships draw first, then north-wall occlusion (windows + open doors
   * stay clear), then door leaves/frames, then inside ships.
   *
   * @param {{ beforeOcclusion?: (ctx: CanvasRenderingContext2D) => void,
   *           afterOcclusion?: (ctx: CanvasRenderingContext2D) => void }} [hooks]
   */
  renderVisitors(ctx, hooks = {}) {
    const doorLip = this.getDoorLipY();
    const outside = [];
    const inside = [];
    for (const pad of this.sidePads) {
      if (!pad.visitorId) continue;
      if (!this._visitorArrivalShipVisible(pad)) continue;
      if ((pad.padDrop || 0) >= 0.02) continue; // shaft pass owns these
      const y = pad.shipY || 0;
      if (y < doorLip - 2) outside.push(pad);
      else inside.push(pad);
    }
    for (const pad of outside) this._drawVisitor(ctx, pad);
    if (hooks.beforeOcclusion) hooks.beforeOcclusion(ctx);
    this._drawNorthWallOcclusion(ctx);
    this._drawViewportFrames(ctx);
    // Leaves/jambs only — floor sill/hazard stays under ships from the deck pass
    this._drawBayDoors(ctx, { leavesOnly: true });
    this._drawBayBeacons(ctx, { wallOnly: true });
    this._drawDoorTickers(ctx);
    // Wall art sits on the north wall face — must paint after occlusion restamp
    this._drawWallArt(ctx);
    for (const pad of inside) this._drawVisitor(ctx, pad);
    if (hooks.afterOcclusion) hooks.afterOcclusion(ctx);
    // Ship scan beams sit on top of hulls (pods are drawn on the boards)
    this._drawShipBoardScans(ctx);
  }

  /**
   * 2.5D depth curve for the static elevator-shaft well drawing.
   * `t` is depth progress (0 = deck lip, 1 = virtual shaft floor).
   * Floor center sits south of the pad opening (`south > PAD_R` at t=1) so
   * the bottom never enters view — only descending circular walls are seen.
   * Transit pad/ship motion uses its own south/scale/fade (not this curve).
   */
  _shaftDepthAt(t) {
    const tt = Math.min(1, Math.max(0, t));
    // VP / floor well below the southern lip (clip is ±PAD_R)
    const south = tt * BAY.PAD_R * 1.85;
    const scaleX = 1 - tt * 0.72;
    return {
      south,
      scaleX,
      scaleY: scaleX * (1 - tt * 0.35),
      alpha: Math.max(0, 1 - tt * 0.9),
    };
  }

  /**
   * 2.5D elevator shaft. Inner opening radius = pad radius (exact match).
   * Rim sits just outside the pad circumference; interior is the deep well.
   */
  _drawElevationShaft(ctx, cx, cy) {
    this._drawElevationShaftWell(ctx, cx, cy);
    this._drawElevationShaftRim(ctx, cx, cy);
  }

  /** Dark well — clipped to pad circle; rings/lines converge toward an off-screen south VP. */
  _drawElevationShaftWell(ctx, cx, cy) {
    const r = BAY.PAD_R;
    const deep = this._shaftDepthAt(1);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    // Depth gradient: steel-blue at the north lip → void toward south (away/below)
    const grad = ctx.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, '#2a3848');
    grad.addColorStop(0.4, '#1a2430');
    grad.addColorStop(0.75, '#0a1018');
    grad.addColorStop(1, '#020408');
    ctx.fillStyle = grad;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // Soft falloff toward the off-screen floor VP (only the southern wash is visible)
    const radial = ctx.createRadialGradient(
      0, deep.south, r * 0.05,
      0, r * 0.25, r * 1.35
    );
    radial.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
    radial.addColorStop(0.45, 'rgba(0, 0, 0, 0.45)');
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // Wall guide lines converge on the off-screen south VP
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.1;
    for (const lx of [-r * 0.55, 0, r * 0.55]) {
      ctx.beginPath();
      ctx.moveTo(lx, -r * 0.95);
      ctx.lineTo(lx * 0.08, deep.south);
      ctx.stroke();
    }

    // Depth rings as circular walls — deeper = smaller, flatter, more southern.
    // Centers past the lip clip to arcs; the t=1 floor itself is never drawn.
    for (const [t, alpha] of [
      [0.16, 0.32],
      [0.32, 0.4],
      [0.48, 0.48],
      [0.62, 0.56],
      [0.76, 0.64],
      [0.88, 0.72],
    ]) {
      const d = this._shaftDepthAt(t);
      const rr = r * d.scaleX;
      const ry = r * d.scaleY;
      // Skip rings wholly south of the opening (no visible arc)
      if (d.south - ry > r * 0.98) continue;
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.ellipse(0, d.south, rr, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Subtle face highlight on the north lip of each ring
      ctx.strokeStyle = `rgba(90, 120, 145, ${0.14 * (1 - t)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(0, d.south, rr, ry, 0, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Textured rim just outside the pad circumference. */
  _drawElevationShaftRim(ctx, cx, cy) {
    const r = BAY.PAD_R;
    const rim = 3.5;
    ctx.save();
    ctx.translate(cx, cy);

    // Annulus: outer rim disk minus pad hole
    ctx.beginPath();
    ctx.arc(0, 0, r + rim, 0, Math.PI * 2);
    ctx.arc(0, 0, r, 0, Math.PI * 2, true);
    ctx.fillStyle = '#1a2836';
    ctx.fill('evenodd');

    // Cross-hatch / mesh on the rim face
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r + rim, 0, Math.PI * 2);
    ctx.arc(0, 0, r, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.6;
    for (let i = -r - rim; i < r + rim; i += 2.2) {
      ctx.beginPath();
      ctx.moveTo(i, -r - rim);
      ctx.lineTo(i + (r + rim) * 2, r + rim);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i, r + rim);
      ctx.lineTo(i + (r + rim) * 2, -r - rim);
      ctx.stroke();
    }
    ctx.restore();

    // Inner lip (matches pad outline exactly)
    ctx.strokeStyle = 'rgba(100, 130, 150, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Outer rim edge
    ctx.strokeStyle = 'rgba(60, 85, 105, 0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r + rim, 0, Math.PI * 2);
    ctx.stroke();

    // Top bevel highlight on north of rim
    ctx.strokeStyle = 'rgba(140, 170, 190, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r + rim * 0.55, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Descending/ascending pad + ship, clipped to the shaft opening so the rest
   * of the hangar occludes anything outside the circle.
   * Motion: south drift + uniform shrink; depth read = fade-to-black (not alpha).
   */
  _drawElevatorTransit(ctx, pad) {
    const drop = pad.padDrop || 0;
    const r = BAY.PAD_R;
    const south = drop * 48;
    const sc = 1 - drop * 0.55;

    ctx.save();
    ctx.beginPath();
    ctx.arc(pad.x, 0, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(pad.x, south);
    ctx.scale(sc, sc);

    this._drawDockPad(ctx, 0, 0, pad.bayId, {
      active: this.isDevControlBay(pad.bayIndex),
      occupied: !!pad.visitorId,
      angle: pad.padAngle ?? FACE_NORTH,
      skipShadow: true,
      rimMode: this.padRimMode[pad.bayIndex] || 'off',
    });

    if (pad.visitorId) {
      const hover = pad.shipHover || 0;
      const angle = pad.shipAngle ?? FACE_NORTH;
      ctx.save();
      ctx.translate(0, hover * 2);
      ctx.scale(pad.shipScale || 1, pad.shipScale || 1);
      ctx.rotate(angle);
      const def = pad.shipDef || this._ensurePadShipDef(pad);
      if (!def) {
        ctx.restore();
        this._fadeElevatorTransitToBlack(ctx, drop, r);
        ctx.restore();
        return;
      }
      drawVisitorShip(
        ctx,
        {
          shipDef: def,
          thrusters: pad.thrusters,
          velocity: { x: pad.shipVx || 0, y: pad.shipVy || 0 },
          angle,
          angularVelocity: 0,
          miningLaserFiring: false,
          muzzleFlash: 0,
          getTurretLocalAngle: () => 0,
        },
        null,
        hangarShipView(angle)
      );
      ctx.restore();
    }

    this._fadeElevatorTransitToBlack(ctx, drop, r);
    ctx.restore();
  }

  /** Player ship rising from the elevator shaft (clipped like visitor transits). */
  _drawPlayerElevatorTransit(ctx, drawPlayerShip) {
    const drop = this.playerPadDrop || 0;
    const px = this.playerPadWorldX();
    const pb = this.playerBayIndex;
    const r = BAY.PAD_R;
    const south = drop * 48;
    const sc = 1 - drop * 0.55;

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, 0, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(px, south);
    ctx.scale(sc, sc);

    this._drawDockPad(ctx, 0, 0, this.playerBay?.bayId || bayLabels()[pb], {
      active: this.isDevControlBay(pb),
      occupied: !!this.playerPadOccupied,
      angle: this.playerPadAngle,
      skipShadow: true,
      rimMode: this.padRimMode[pb] || 'off',
    });

    if (this.playerPadOccupied && drawPlayerShip) {
      drawPlayerShip(ctx);
    }

    this._fadeElevatorTransitToBlack(ctx, drop, r);
    ctx.restore();
  }

  /**
   * Fade-to-black veil in local transit space (drop 0 → 1).
   * Flat black across the pad disc, then soft falloff past the rim so ship
   * overhangs darken without a hard circular edge.
   */
  _fadeElevatorTransitToBlack(ctx, drop, padR) {
    const t = Math.max(0, Math.min(1, drop));
    if (t < 0.01) return;

    const outer = padR * 1.7;
    const padStop = Math.min(0.98, padR / outer);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, outer);
    // Pure black through the pad silhouette
    grad.addColorStop(0, `rgba(0, 0, 0, ${t})`);
    grad.addColorStop(padStop, `rgba(0, 0, 0, ${t})`);
    // Feather: still dark just past the rim, then clear
    grad.addColorStop(Math.min(1, padStop + 0.12), `rgba(0, 0, 0, ${t * 0.55})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, outer, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Redraw north wall solid mass so departing ships are occluded except through
   * viewport windows and open bay-door apertures.
   */
  _drawNorthWallOcclusion(ctx) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;
    const centers = padCenters();
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -h - 40;
    const doorTop = -h;
    const doorH = BAY.DOOR_H;
    const dh = BAY.DOOR_HALF;

    const holes = [];
    for (let i = 0; i < centers.length; i++) {
      const cx = centers[i];
      holes.push({ lo: cx - vpW / 2, hi: cx + vpW / 2, y0: vpY, y1: vpY + vpH });
      const open = this.doorOpen[i] || 0;
      if (open > 0.05) {
        const gapHalf = this._bayDoorGapHalf(open);
        holes.push({
          lo: cx - gapHalf,
          hi: cx + gapHalf,
          y0: doorTop,
          y1: doorTop + doorH,
        });
      }
    }

    const wallX = -w - 100;
    const wallW = w * 2 + 200;
    const wallY = -h - 80;
    const wallH = 80 + BAY.DOOR_H;

    // Evenodd clip: solid wall minus windows and open door apertures.
    // (Band-scan fills break when viewport + door holes stack in Y.)
    ctx.save();
    ctx.beginPath();
    ctx.rect(wallX, wallY, wallW, wallH);
    for (const hole of holes) {
      ctx.rect(hole.lo, hole.y0, hole.hi - hole.lo, hole.y1 - hole.y0);
    }
    ctx.clip('evenodd');

    ctx.fillStyle = '#101820';
    ctx.fillRect(wallX, wallY, wallW, wallH);
    ctx.fillStyle = '#182430';
    ctx.fillRect(-w - 50, -h - 50, w * 2 + 100, 50 + BAY.DOOR_H);
    this._drawWallPanels(ctx, -w - 50, -h - 50, w * 2 + 100, 50 + BAY.DOOR_H, [], vpY, vpH);
    ctx.restore();
  }

  /** Overhead gantry + FX above deck actors. */
  renderOverhead(ctx) {
    this._drawOverhead(ctx);
    // Plating wash under over-layer sparks (after ships, before spark streaks)
    this._drawWeldHullWashes(ctx);
    this._drawSparkles(ctx, 'overhead');
    this._drawSparkles(ctx, 'over');
    this._drawDebris(ctx);
    this._drawHazardWash(ctx);
  }

  _drawBayShell(ctx) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;
    const centers = padCenters();
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -h - 40;
    const EXT = 2200;

    ctx.fillStyle = '#06090e';
    ctx.fillRect(-EXT, -EXT, EXT * 2, EXT * 2);

    const northY = -h - 80;
    const northH = 80 + BAY.DOOR_H;
    const vpGaps = centers.map((cx) => ({
      lo: cx - vpW / 2,
      hi: cx + vpW / 2,
    }));

    const fillNorthBand = (y, bandH, fill) => {
      ctx.fillStyle = fill;
      let cursor = -w - 100;
      for (const g of vpGaps) {
        if (g.lo > cursor) ctx.fillRect(cursor, y, g.lo - cursor, bandH);
        if (vpY > y) ctx.fillRect(g.lo, y, g.hi - g.lo, Math.min(vpY - y, bandH));
        const belowTop = vpY + vpH;
        const belowH = y + bandH - belowTop;
        if (belowH > 0) ctx.fillRect(g.lo, belowTop, g.hi - g.lo, belowH);
        cursor = Math.max(cursor, g.hi);
      }
      if (cursor < w + 100) ctx.fillRect(cursor, y, w + 100 - cursor, bandH);
    };

    // Deep outer bulk (station hull beyond the bay)
    fillNorthBand(northY, northH, '#101820');
    // Mid shell with slight warm grit
    fillNorthBand(-h - 50, 50 + BAY.DOOR_H, '#182430');

    // Side / south outer bulk — 2.5D lip (darker “underside” + face)
    ctx.fillStyle = '#0e1620';
    ctx.fillRect(-w - 58, -h - 50, 58, (h + 50) * 2);
    ctx.fillRect(w, -h - 50, 58, (h + 50) * 2);
    ctx.fillRect(-w - 58, h, (w + 58) * 2, 58);
    ctx.fillStyle = '#1a2836';
    ctx.fillRect(-w - 50, -h - 50, 50, (h + 50) * 2);
    ctx.fillRect(w, -h - 50, 50, (h + 50) * 2);
    ctx.fillRect(-w - 50, h, (w + 50) * 2, 50);
    // Top edge highlight on bulk lips
    ctx.fillStyle = 'rgba(90, 120, 140, 0.22)';
    ctx.fillRect(-w - 50, -h - 50, 50, 2);
    ctx.fillRect(w, -h - 50, 50, 2);
    ctx.fillRect(-w - 50, h, (w + 50) * 2, 2);

    // Interior deck mass (base before plate detail)
    ctx.fillStyle = '#1e2c38';
    ctx.fillRect(-w, -h + BAY.DOOR_H, w * 2, h * 2 - BAY.DOOR_H);

    // North wall face panels (between / around viewport glass)
    this._drawWallPanels(ctx, -w - 50, -h - 50, w * 2 + 100, 50 + BAY.DOOR_H, vpGaps, vpY, vpH);
    // Side wall paneling
    this._drawSideWallDetail(ctx, -1);
    this._drawSideWallDetail(ctx, 1);

    ctx.strokeStyle = '#4a6578';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-w, -h, w * 2, h * 2);
    // Inner shadow line for depth
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w + 2, -h + 2, w * 2 - 4, h * 2 - 4);

    // Corner columns (2.5D posts)
    for (const [cx, cy] of [
      [-w, -h + BAY.DOOR_H],
      [w, -h + BAY.DOOR_H],
      [-w, h],
      [w, h],
    ]) {
      this._drawCornerColumn(ctx, cx, cy);
    }
  }

  _drawWallPanels(ctx, x0, y0, width, height, vpGaps, vpY, vpH) {
    const panelW = 28;
    for (let x = x0; x < x0 + width - 4; x += panelW) {
      const px = x + 2;
      const pw = panelW - 4;
      // Skip glass openings
      let blocked = false;
      for (const g of vpGaps) {
        if (px + pw > g.lo && px < g.hi && y0 < vpY + vpH && y0 + height > vpY) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      // Panel face + top bevel (2.5D)
      ctx.fillStyle = '#1c2a36';
      ctx.fillRect(px, y0 + 4, pw, height - 8);
      ctx.fillStyle = 'rgba(110, 140, 160, 0.18)';
      ctx.fillRect(px, y0 + 4, pw, 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(px, y0 + height - 8, pw, 2);
      ctx.strokeStyle = 'rgba(60, 85, 105, 0.55)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(px, y0 + 4, pw, height - 8);

      // Rivets
      ctx.fillStyle = 'rgba(140, 160, 175, 0.35)';
      for (const ry of [y0 + 10, y0 + height - 12]) {
        ctx.beginPath();
        ctx.arc(px + 3, ry, 0.9, 0, Math.PI * 2);
        ctx.arc(px + pw - 3, ry, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Horizontal stringers
    ctx.strokeStyle = 'rgba(70, 95, 115, 0.45)';
    ctx.lineWidth = 1.5;
    for (const sy of [y0 + 14, y0 + height * 0.55]) {
      ctx.beginPath();
      ctx.moveTo(x0 + 4, sy);
      ctx.lineTo(x0 + width - 4, sy);
      ctx.stroke();
    }

    // Grime streaks
    ctx.fillStyle = 'rgba(20, 14, 8, 0.12)';
    for (let i = 0; i < 7; i++) {
      const gx = x0 + 18 + i * 92;
      ctx.fillRect(gx, y0 + 8, 3 + (i % 3), height - 16);
    }
  }

  _drawSideWallDetail(ctx, side) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;
    const xFace = side < 0 ? -w : w - 18;
    const wallTop = -h + BAY.DOOR_H;
    const wallBot = h;

    // Vertical ribbing
    for (let i = 0; i < 3; i++) {
      const wx = side < 0 ? -w + 4 + i * 5 : w - 8 - i * 5;
      ctx.fillStyle = i === 1 ? '#243444' : '#1a2834';
      ctx.fillRect(wx, wallTop + 4, 4, wallBot - wallTop - 8);
      ctx.fillStyle = 'rgba(100, 130, 150, 0.15)';
      ctx.fillRect(wx, wallTop + 4, 4, 1.5);
    }

    // Side observation ports (skip bulkhead door band)
    for (let i = 0; i < 3; i++) {
      const wy = -30 + i * 48;
      if (Math.abs(wy - BAY.PATH_Y) < BAY.BULK_DOOR_HALF + 10) continue;
      const wx = side < 0 ? -w + 8 : w - 22;
      // Frame depth
      ctx.fillStyle = '#121a22';
      ctx.fillRect(wx - 1, wy + 1, 18, 22);
      ctx.fillStyle = '#2a3848';
      ctx.fillRect(wx - 2, wy - 2, 18, 22);
      ctx.strokeStyle = '#7a9bb0';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(wx - 2, wy - 2, 18, 22);
      ctx.fillStyle = 'rgba(6, 10, 18, 0.82)';
      ctx.fillRect(wx, wy, 14, 18);
      ctx.strokeStyle = '#4a6070';
      ctx.strokeRect(wx, wy, 14, 18);
      // Glass sheen
      ctx.fillStyle = 'rgba(120, 180, 220, 0.06)';
      ctx.fillRect(wx + 1, wy + 1, 5, 16);
    }

    // Wall conduits
    const pipeX = side < 0 ? -w + 22 : w - 26;
    ctx.strokeStyle = '#3a4a58';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pipeX, wallTop + 10);
    ctx.lineTo(pipeX, BAY.PATH_Y - BAY.BULK_DOOR_HALF - 8);
    ctx.moveTo(pipeX, BAY.PATH_Y + BAY.BULK_DOOR_HALF + 8);
    ctx.lineTo(pipeX, wallBot - 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180, 100, 60, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pipeX + side * 5, wallTop + 20);
    ctx.lineTo(pipeX + side * 5, wallBot - 30);
    ctx.stroke();
    // Couplings
    ctx.fillStyle = '#5a6a78';
    for (const cy of [wallTop + 40, 20, 90]) {
      if (Math.abs(cy - BAY.PATH_Y) < BAY.BULK_DOOR_HALF + 6) continue;
      ctx.fillRect(pipeX - 2, cy, 8, 4);
    }

    // Stencil hazard strip on wall base
    ctx.fillStyle = '#c9a020';
    for (let y = wallTop + 6; y < wallBot - 4; y += 10) {
      if (Math.abs(y - BAY.PATH_Y) < BAY.BULK_DOOR_HALF + 4) continue;
      ctx.fillRect(xFace, y, 3, 5);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(xFace, y + 5, 3, 5);
      ctx.fillStyle = '#c9a020';
    }
  }

  _drawCornerColumn(ctx, cx, cy) {
    ctx.fillStyle = '#0a1016';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(cx - 5, cy - 14, 10, 16);
    ctx.fillStyle = 'rgba(120, 150, 170, 0.25)';
    ctx.fillRect(cx - 5, cy - 14, 10, 2);
    ctx.fillStyle = '#1a2834';
    ctx.fillRect(cx - 3, cy - 12, 6, 12);
    ctx.strokeStyle = '#6a8498';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 5, cy - 14, 10, 16);
  }

  /** Outside the bay, only the door throat is visible; walls hide the rest. */
  _npcVisibleThroughBulkheads(npc) {
    const w = BAY.HALF_W;
    // Anyone still on the deck stays visible (stairs, ships, piles)
    if (Math.abs(npc.x) <= w - 2) return true;
    const doorLo = BAY.PATH_Y - BAY.BULK_DOOR_HALF;
    const doorHi = BAY.PATH_Y + BAY.BULK_DOOR_HALF;
    return npc.y >= doorLo - 4 && npc.y <= doorHi + 4;
  }

  /** Interior bulkheads on L/R of the human path — open doorways; walls occlude NPCs. */
  _drawBulkheadDoors(ctx) {
    const w = BAY.HALF_W;
    const thick = BAY.BULK_THICK;
    const doorLo = BAY.PATH_Y - BAY.BULK_DOOR_HALF;
    const doorHi = BAY.PATH_Y + BAY.BULK_DOOR_HALF;
    const wallTop = -BAY.HALF_H + BAY.DOOR_H;
    const wallBot = BAY.HALF_H;

    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -w - thick : w;
      // Wall panels above and below door (cover NPCs behind solid bulkhead)
      ctx.fillStyle = '#15202c';
      ctx.fillRect(x0, wallTop, thick, Math.max(0, doorLo - wallTop));
      ctx.fillRect(x0, doorHi, thick, Math.max(0, wallBot - doorHi));
      // Panel seams
      ctx.strokeStyle = 'rgba(70, 95, 115, 0.4)';
      ctx.lineWidth = 0.8;
      for (let y = wallTop + 12; y < doorLo - 4; y += 16) {
        ctx.beginPath();
        ctx.moveTo(x0 + 2, y);
        ctx.lineTo(x0 + thick - 2, y);
        ctx.stroke();
      }

      const deepX = side < 0 ? -w - thick - 120 : w + thick;
      ctx.fillStyle = '#0a1018';
      ctx.fillRect(deepX, wallTop, 120, Math.max(0, doorLo - wallTop));
      ctx.fillRect(deepX, doorHi, 120, Math.max(0, wallBot - doorHi));

      // Door frame with depth lip
      ctx.fillStyle = '#0e1620';
      ctx.fillRect(x0 - 3, doorLo - 5, thick + 6, doorHi - doorLo + 10);
      ctx.fillStyle = '#2e3e4e';
      ctx.fillRect(x0 - 2, doorLo - 4, thick + 4, 4);
      ctx.fillRect(x0 - 2, doorHi, thick + 4, 4);
      ctx.fillRect(x0 - 2, doorLo, 3, doorHi - doorLo);
      ctx.fillRect(x0 + thick - 1, doorLo, 3, doorHi - doorLo);
      ctx.fillStyle = 'rgba(130, 160, 180, 0.2)';
      ctx.fillRect(x0 - 2, doorLo - 4, thick + 4, 1.5);

      ctx.strokeStyle = '#7a9bb0';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x0 - 2, doorLo - 4, thick + 4, doorHi - doorLo + 8);

      // Caution jamb stripes
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? '#c9a020' : '#1a1a1a';
        ctx.fillRect(x0 + 2, doorLo + 4 + i * 11, thick - 4, 9);
      }

      ctx.fillStyle = 'rgba(100, 180, 255, 0.06)';
      ctx.fillRect(x0, doorLo, thick, doorHi - doorLo);

      ctx.fillStyle = 'rgba(100, 180, 255, 0.4)';
      ctx.font = '4px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        side < 0 ? 'INT · L' : 'INT · R',
        side < 0 ? -w - thick / 2 : w + thick / 2,
        doorLo - 7
      );
    }
  }

  _drawViewportFrames(ctx) {
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -BAY.HALF_H - 40;
    for (const cx of padCenters()) {
      const x = cx - vpW / 2;
      const y = vpY;
      const t = 3;
      // Frame only — never fill the glass (ships must read through windows)
      ctx.fillStyle = '#1e2a36';
      ctx.fillRect(x - t, y - t, vpW + t * 2, t);
      ctx.fillRect(x - t, y + vpH, vpW + t * 2, t);
      ctx.fillRect(x - t, y, t, vpH);
      ctx.fillRect(x + vpW, y, t, vpH);
      ctx.fillStyle = 'rgba(120, 150, 170, 0.25)';
      ctx.fillRect(x - t, y - t, vpW + t * 2, 1.5);
      ctx.strokeStyle = '#8aabbc';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - t, y - t, vpW + t * 2, vpH + t * 2);
      ctx.strokeStyle = '#4a6070';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1, y - 1, vpW + 2, vpH + 2);
      ctx.fillStyle = '#9aaab8';
      for (const [bx, by] of [
        [x - 1, y - 1],
        [x + vpW - 1, y - 1],
        [x - 1, y + vpH - 1],
        [x + vpW - 1, y + vpH - 1],
      ]) {
        ctx.beginPath();
        ctx.arc(bx, by, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawViewportSpace(ctx, space) {
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -BAY.HALF_H - 40;
    const pads = padCenters();
    const { starfield, nebulaField, spaceX, spaceY, time, nebulae } = space;

    // One continuous space pass behind the north wall; each window clips a
    // different slice (not three re-centered copies of the same chunk).
    const left = pads[0] - vpW / 2;
    const right = pads[pads.length - 1] + vpW / 2;
    const midX = (left + right) / 2;
    const midY = vpY + vpH / 2;
    const cover = Math.hypot(right - left, vpH) / 2 + 40;

    ctx.save();
    ctx.beginPath();
    for (const cx of pads) {
      ctx.rect(cx - vpW / 2, vpY, vpW, vpH);
    }
    ctx.clip();

    ctx.translate(midX, midY);
    nebulaField.renderProcedural(ctx, spaceX, spaceY, time, cover, 0.55);
    starfield.render(ctx, spaceX, spaceY, cover, time, 0.55);
    if (nebulae?.length) {
      ctx.save();
      ctx.translate(-spaceX, -spaceY);
      ctx.scale(0.12, 0.12);
      ctx.translate(spaceX, spaceY);
      nebulaField.renderWorldNebulae(ctx, nebulae, time);
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Same space chunk as `_drawViewportSpace` (identical mid/cover/camera), clipped
   * only to open bay-door apertures so doors and windows share one field.
   */
  _drawOpenDoorSpace(ctx, space) {
    const vpW = BAY.VIEWPORT_W;
    const vpH = BAY.VIEWPORT_H;
    const vpY = -BAY.HALF_H - 40;
    const pads = padCenters();
    const { starfield, nebulaField, spaceX, spaceY, time, nebulae } = space;

    // Match window backdrop anchor exactly — doors peek into the same chunk
    const left = pads[0] - vpW / 2;
    const right = pads[pads.length - 1] + vpW / 2;
    const midX = (left + right) / 2;
    const midY = vpY + vpH / 2;
    const doorTop = -BAY.HALF_H;
    const doorH = BAY.DOOR_H;
    const dh = BAY.DOOR_HALF;
    // Cover must reach door bottoms (south of window mid) without changing windows
    const cover = Math.max(
      Math.hypot(right - left, vpH) / 2 + 40,
      Math.hypot(right - left, (doorTop + doorH - midY) * 2) / 2 + 40
    );

    ctx.save();
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < pads.length; i++) {
      const open = this.doorOpen[i] || 0;
      if (open <= 0.05) continue;
      any = true;
      const cx = pads[i];
      const gapHalf = this._bayDoorGapHalf(open);
      ctx.rect(cx - gapHalf, doorTop, gapHalf * 2, doorH);
    }
    if (!any) {
      ctx.restore();
      return;
    }
    ctx.clip();

    ctx.translate(midX, midY);
    nebulaField.renderProcedural(ctx, spaceX, spaceY, time, cover, 0.55);
    starfield.render(ctx, spaceX, spaceY, cover, time, 0.55);
    if (nebulae?.length) {
      ctx.save();
      ctx.translate(-spaceX, -spaceY);
      ctx.scale(0.12, 0.12);
      ctx.translate(spaceX, spaceY);
      nebulaField.renderWorldNebulae(ctx, nebulae, time);
      ctx.restore();
    }
    // Space-view apron pavement in the lower door aperture (ships draw above)
    this._drawDoorApronPavement(ctx, cover);
    ctx.restore();
  }

  /**
   * Pavement band matching the station apron — lower ~1/3 of the open door view.
   * Called inside the door-space clip + translated mid frame.
   */
  _drawDoorApronPavement(ctx, cover) {
    const bandH = cover * 0.55;
    const y0 = cover * 0.22;
    ctx.fillStyle = '#05080c';
    ctx.fillRect(-cover, y0, cover * 2, bandH);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + bandH);
    g.addColorStop(0, 'rgba(100, 180, 255, 0.1)');
    g.addColorStop(0.45, 'rgba(20, 28, 36, 0.55)');
    g.addColorStop(1, 'rgba(5, 8, 12, 0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(-cover, y0, cover * 2, bandH);
    ctx.strokeStyle = 'rgba(201, 160, 32, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]);
    for (const t of [-cover / 3, cover / 3]) {
      ctx.beginPath();
      ctx.moveTo(t, y0 + 4);
      ctx.lineTo(t, y0 + bandH - 4);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /** Single bay-door leaf width (each of the two leaves per bay). */
  _bayDoorLeafW() {
    return BAY.DOOR_HALF - 1.5;
  }

  /** One of three equal segments per telescoping leaf. */
  _bayDoorSegW() {
    return this._bayDoorLeafW() / 3;
  }

  /** Nested stack pitch + how far the pack tucks into the jamb when open. */
  _bayDoorTelescoping() {
    const segW = this._bayDoorSegW();
    const nestPitch = 2.2;
    const nestSpan = segW + 2 * nestPitch;
    /** Pull the whole nest into the jamb column so the door frame clears fully. */
    const jambTuck = 6;
    return { segW, nestPitch, nestSpan, jambTuck };
  }

  /** Half-width of the open door aperture (matches telescoping leaf inner edges). */
  _bayDoorGapHalf(open) {
    const { jambTuck } = this._bayDoorTelescoping();
    // Closed: center seam (~1.5). Open: past the jamb so the full bay mouth is clear.
    return 1.5 + open * (BAY.DOOR_HALF - 1.5 + jambTuck);
  }

  _drawDoorSegmentPanel(ctx, x, y, w, h) {
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(120, 150, 170, 0.12)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x, y + h - 3, w, 3);
    ctx.strokeStyle = '#6a8498';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(50, 70, 85, 0.7)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x + 3, y + 4, w - 6, h * 0.4);
    ctx.strokeRect(x + 3, y + h * 0.5, w - 6, h * 0.38);
    ctx.fillStyle = 'rgba(150, 170, 185, 0.4)';
    for (const ry of [y + 6, y + h - 6]) {
      ctx.beginPath();
      ctx.arc(x + 4, ry, 0.8, 0, Math.PI * 2);
      ctx.arc(x + w - 4, ry, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Three-segment telescoping leaf — all panels move, nest, and tuck into the
   * bay's own jamb (outer panel included) so the mouth opens as wide as a full
   * slide without spilling into the neighboring bay.
   * @param {-1|1} side west (-1) or east (+1) leaf
   */
  _drawTelescopingLeaf(ctx, cx, doorTop, doorH, open, side) {
    const dh = BAY.DOOR_HALF;
    const lw = this._bayDoorLeafW();
    const { segW, nestPitch, nestSpan, jambTuck } = this._bayDoorTelescoping();
    const baseLx = side < 0 ? cx - dh : cx + 1.5;

    for (let k = 0; k < 3; k++) {
      const closedX = baseLx + k * segW;
      // Nested pack: outer→inner with nestPitch. Fully open, pack sits in the jamb.
      const openX =
        side < 0
          ? baseLx - jambTuck - nestSpan + k * nestPitch
          : baseLx + lw + jambTuck + k * nestPitch;
      const segX = closedX + (openX - closedX) * open;
      this._drawDoorSegmentPanel(ctx, segX, doorTop, segW, doorH);
    }
  }

  /**
   * @param {{ leavesOnly?: boolean }} [opts]
   *   leavesOnly — wall hardware only (leaves, jambs). Floor sill / hazard paint
   *   stays in the deck pass so it never restamps over arriving ships.
   */
  _drawBayDoors(ctx, opts = {}) {
    const leavesOnly = !!opts.leavesOnly;
    const h = BAY.HALF_H;
    const doorTop = -h;
    const doorH = BAY.DOOR_H;
    const dh = BAY.DOOR_HALF;
    const labels = bayLabels();

    padCenters().forEach((cx, i) => {
      const open = this.doorOpen[i] || 0;
      const dh = BAY.DOOR_HALF;
      const gapHalf = this._bayDoorGapHalf(open);

      // Dark pocket only while sealed — open apertures show shared spacefield
      if (!leavesOnly && open <= 0.05) {
        ctx.fillStyle = '#0a1018';
        ctx.fillRect(cx - dh - 6, doorTop - 2, dh * 2 + 12, doorH + 8);
      }

      // Telescoping leaves — three segments per side, collapse into own jamb
      this._drawTelescopingLeaf(ctx, cx, doorTop, doorH, open, -1);
      this._drawTelescopingLeaf(ctx, cx, doorTop, doorH, open, 1);

      if (open < 0.15) {
        ctx.strokeStyle = 'rgba(20, 30, 40, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, doorTop + 2);
        ctx.lineTo(cx, doorTop + doorH - 2);
        ctx.stroke();
      }

      // Jamb columns (wall) — safe to restamp over ships at the aperture edges
      for (const px of [cx - dh - 8, cx + dh]) {
        ctx.fillStyle = '#121a22';
        ctx.fillRect(px + 1, doorTop - 2, 8, doorH + 10);
        ctx.fillStyle = '#2a3848';
        ctx.fillRect(px, doorTop - 4, 8, doorH + 10);
        ctx.fillStyle = 'rgba(120, 150, 170, 0.2)';
        ctx.fillRect(px, doorTop - 4, 8, 2);
      }

      // Deck threshold + label — deck pass only (floor caution lives in _drawFloor)
      if (leavesOnly) return;

      ctx.fillStyle = '#243444';
      ctx.fillRect(cx - dh - 8, doorTop + doorH, dh * 2 + 16, 7);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(cx - dh - 8, doorTop + doorH + 5, dh * 2 + 16, 2);

      ctx.fillStyle = 'rgba(100, 180, 255, 0.18)';
      for (const y of [-120, -95, -72]) {
        ctx.beginPath();
        ctx.moveTo(cx, y - 7);
        ctx.lineTo(cx - 5, y + 5);
        ctx.lineTo(cx + 5, y + 5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(100, 180, 255, 0.5)';
      ctx.font = '5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${labels[i]} · SPACE`, cx, doorTop + doorH + 12);
    });
  }

  /**
   * Per-bay door beacons (pilot-facing).
   * Modes: off | amber | amberFlash | greenBlink | green | redFlash
   */
  _drawBayBeacons(ctx, opts = {}) {
    const wallOnly = !!opts.wallOnly;
    const doorTop = -BAY.HALF_H;
    padCenters().forEach((cx, i) => {
      const mode = this.bayBeacons[i] || 'off';
      let on = false;
      let color = '255, 170, 40';
      let glow = 0.08;
      if (mode === 'off') {
        on = false;
        glow = 0.05;
        color = '80, 90, 100';
      } else if (mode === 'amber') {
        on = true;
        glow = 0.55;
        color = '255, 170, 40';
      } else if (mode === 'amberFlash') {
        on = Math.sin(this.time * 10 + i) > 0;
        glow = on ? 0.85 : 0.12;
        color = '255, 170, 40';
      } else if (mode === 'greenBlink') {
        on = Math.sin(this.time * 5 + i) > 0;
        glow = on ? 0.8 : 0.15;
        color = '60, 220, 100';
      } else if (mode === 'green') {
        on = true;
        glow = 0.9;
        color = '40, 230, 90';
      } else if (mode === 'redFlash') {
        on = Math.sin(this.time * 12 + i) > 0;
        glow = on ? 0.9 : 0.12;
        color = '255, 50, 45';
      } else {
        // Legacy fallbacks
        on = mode !== 'idle';
        glow = 0.4;
      }

      for (const dx of [-BAY.DOOR_HALF - 4, BAY.DOOR_HALF + 4]) {
        const bx = cx + dx;
        const by = doorTop - 10;
        ctx.fillStyle = '#2a3848';
        ctx.fillRect(bx - 3, by - 2, 6, 5);
        ctx.strokeStyle = '#6a8498';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(bx - 3, by - 2, 6, 5);
        ctx.fillStyle = `rgba(${color}, ${0.2 + glow * 0.8})`;
        ctx.beginPath();
        ctx.arc(bx, by + 1, 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (glow > 0.2) {
          ctx.fillStyle = `rgba(${color}, ${glow * 0.2})`;
          ctx.beginPath();
          ctx.ellipse(bx, by + 8, 10, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!wallOnly && (mode === 'redFlash' || mode === 'amberFlash' || mode === 'green')) {
        const a = mode === 'green' ? 0.08 : on ? 0.07 : 0.02;
        ctx.fillStyle = `rgba(${color}, ${a})`;
        ctx.beginPath();
        ctx.ellipse(cx, doorTop + BAY.DOOR_H + 28, 36, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  _drawDoorTickers(ctx) {
    // Pilot channel: between viewport windows and bay doors, between door lights
    const vpY = -BAY.HALF_H - 40;
    const vpH = BAY.VIEWPORT_H;
    const doorTop = -BAY.HALF_H;
    const lightX = BAY.DOOR_HALF + 4;
    const y = vpY + vpH + 5;
    const h = Math.min(10, doorTop - 2 - y);
    const colorMap = {
      red: '#ff5048',
      amber: '#ffb028',
      yellow: '#e8c040',
      blue: '#58b0ff',
      green: '#40e070',
      dim: '#7a8898',
    };
    padCenters().forEach((cx, i) => {
      const lines = this.bayTicker[i] || [];
      const w = lightX * 2 - 12;
      ctx.fillStyle = '#0c1218';
      ctx.strokeStyle = '#4a6070';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.rect(cx - w / 2, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - w / 2 + 1, y + 1, w - 2, h - 2);
      ctx.clip();
      const texts = lines.length ? lines : [{ text: 'STANDBY', color: 'dim' }];
      const innerW = w - 4;
      texts.forEach((line, li) => {
        const raw = line.text || 'STANDBY';
        ctx.fillStyle = colorMap[line.color] || colorMap.dim;
        ctx.font = '4.2px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ty = y + h / 2 + (texts.length > 1 ? (li === 0 ? -2.2 : 2.2) : 0);
        const textW = ctx.measureText(raw).width;
        let drawX = cx;
        if (textW > innerW) {
          // Marquee only when the line doesn't fit the ticker box
          const overflow = textW - innerW;
          const scroll = Math.sin(this.time * 0.7 + i + li) * (overflow * 0.5);
          drawX = cx - scroll;
        }
        ctx.fillText(raw, drawX, ty);
      });
      ctx.restore();
    });
  }

  _drawFloor(ctx) {
    const w = BAY.HALF_W;
    const h = BAY.HALF_H;
    const deckTop = -h + BAY.DOOR_H + 2;
    const deckBot = h - 2;
    const deckLeft = -w + 2;
    const deckRight = w - 2;

    ctx.fillStyle = '#243442';
    ctx.fillRect(deckLeft, deckTop, deckRight - deckLeft, deckBot - deckTop);

    const tile = 36;
    for (let y = deckTop; y < deckBot; y += tile) {
      for (let x = deckLeft; x < deckRight; x += tile) {
        const tw = Math.min(tile - 1, deckRight - x);
        const th = Math.min(tile - 1, deckBot - y);
        const shade = ((Math.floor(x / tile) + Math.floor(y / tile)) & 1) ? 0.03 : 0;
        ctx.fillStyle = `rgba(30, 42, 54, ${0.35 + shade})`;
        ctx.fillRect(x, y, tw, th);
        ctx.fillStyle = 'rgba(110, 140, 160, 0.08)';
        ctx.fillRect(x, y, tw, 1.2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.fillRect(x, y + th - 1.2, tw, 1.2);
        ctx.fillRect(x + tw - 1.2, y, 1.2, th);
      }
    }

    const stains = [
      [-90, 50, 28, 14, 0.14],
      [70, -20, 22, 11, 0.12],
      [200, 90, 30, 16, 0.15],
      [-210, 100, 24, 12, 0.13],
      [40, 160, 40, 10, 0.1],
      [-40, -50, 18, 20, 0.11],
      [160, 40, 16, 26, 0.1],
    ];
    for (const [sx, sy, sw, sh, a] of stains) {
      ctx.fillStyle = `rgba(18, 12, 6, ${a})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, sw, sh, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(40, 55, 30, ${a * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(sx + 4, sy + 2, sw * 0.45, sh * 0.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 3;
    for (const tx of [-240, -80, 80, 240]) {
      ctx.beginPath();
      ctx.moveTo(tx - 6, BAY.PATH_Y - 14);
      ctx.quadraticCurveTo(tx, BAY.PATH_Y + 6, tx + 10, BAY.PATH_Y + 16);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(100, 180, 255, 0.035)';
    ctx.fillRect(-w + 4, BAY.PATH_Y - 18, w * 2 - 8, 36);
    ctx.strokeStyle = 'rgba(200, 160, 40, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(-w + 10, BAY.PATH_Y - 18);
    ctx.lineTo(w - 10, BAY.PATH_Y - 18);
    ctx.moveTo(-w + 10, BAY.PATH_Y + 18);
    ctx.lineTo(w - 10, BAY.PATH_Y + 18);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(100, 180, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 12]);
    for (const cx of padCenters()) {
      ctx.beginPath();
      ctx.moveTo(cx, -h + BAY.DOOR_H + 16);
      ctx.lineTo(cx, h - 40);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const cx of padCenters()) {
      this._drawCautionBox(ctx, cx - 42, -h + BAY.DOOR_H + 8, 84, 14);
    }
    for (const cx of padCenters()) {
      this._drawFloorChevron(ctx, cx - 55, 55, -1);
      this._drawFloorChevron(ctx, cx + 55, 55, 1);
    }
  }

  _drawCautionBox(ctx, x, y, w, h) {
    for (let i = 0; i < Math.ceil(w / 8); i++) {
      ctx.fillStyle = i % 2 ? '#c9a020' : '#1a1a14';
      ctx.fillRect(x + i * 8, y, Math.min(8, w - i * 8), h);
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, h);
  }

  _drawFloorChevron(ctx, x, y, dir) {
    ctx.fillStyle = 'rgba(201, 160, 32, 0.28)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * 10, y - 6);
    ctx.lineTo(x + dir * 10, y + 6);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Industrial hangar set dressing — readable 2.5D props (height screen-up).
   * Bay danger lanes stay clear of everything except apron-flank tools/terminals.
   */
  _drawSetDressing(ctx) {
    // Far→near by screen Y — single prop list (yard/desk/shelf via category)
    const props = getHangarProps()
      // Wall posters paint on the north wall after occlusion (see `_drawWallArt`)
      .filter((p) => p.kind !== 'computer' && p.kind !== 'wallPoster')
      .slice()
      .sort((a, b) => a.y - b.y);
    for (const prop of props) this._drawHangarProp(ctx, prop);

    // South-of-road bulk fuel (no linger) — clear of hub stalls
    this._drawPropFuelFarm(ctx, -310, 176, 0);
    this._drawPropFuelFarm(ctx, 302, 182, 1);
    this._drawPropExtinguisher(ctx, -328, BAY.PATH_Y - 46);
    this._drawPropExtinguisher(ctx, 322, BAY.PATH_Y - 40);
    this._drawPropFloorDrain(ctx, -132, 168);
    this._drawPropFloorDrain(ctx, 148, 162);

    ctx.fillStyle = 'rgba(201, 160, 32, 0.35)';
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    const pads = padCenters();
    ctx.fillText('KEEP CLEAR', pads[0], DANGER_ZONE_SOUTH - 8);
    ctx.fillText('KEEP CLEAR', pads[2], DANGER_ZONE_SOUTH - 8);
  }

  _drawHangarProp(ctx, prop) {
    const v = prop.variant ?? 0;
    const facing = ((prop.facing | 0) % 8 + 8) % 8;
    const px = prop.x;
    const py = prop.y;
    ctx.save();
    ctx.translate(px, py);
    if (facing) ctx.rotate(facing * (Math.PI / 4));
    const x = 0;
    const y = 0;
    switch (prop.kind) {
      case 'workbench':
        this._drawPropWorkbench(ctx, x, y, v);
        break;
      case 'bayTerminal':
        this._drawPropBayTerminal(ctx, x, y, v);
        break;
      case 'partsRack':
        this._drawPropPartsRack(ctx, x, y, v);
        break;
      case 'drumStack':
        this._drawPropDrumStack(ctx, x, y, v);
        break;
      case 'suitLocker':
        this._drawPropSuitLocker(ctx, x, y, v);
        break;
      case 'pallet':
        this._drawPropPallet(ctx, x, y, v);
        break;
      case 'diagCart':
        this._drawPropDiagCart(ctx, x, y, v);
        break;
      case 'cableSpool':
        this._drawPropCableSpool(ctx, x, y, v);
        break;
      case 'breakCrate':
        this._drawPropBreakCrate(ctx, x, y, v);
        break;
      case 'weldScreen':
        this._drawPropWeldScreen(ctx, x, y, v);
        break;
      case 'bottleRack':
        this._drawPropBottleRack(ctx, x, y, v);
        break;
      case 'shiftBoard':
        this._drawPropShiftBoard(ctx, x, y, v);
        break;
      case 'wallPoster':
        this._drawPropWallPoster(ctx, x, y, v);
        break;
      case 'forkCharger':
        this._drawPropForkCharger(ctx, x, y, v);
        break;
      case 'forkTireRack':
        this._drawPropForkTireRack(ctx, x, y, v);
        break;
      case 'forkCones':
        this._drawPropForkCones(ctx, x, y, v);
        break;
      case 'forkCrate':
        this._drawPropForkCrate(ctx, x, y, v);
        break;
      default:
        break;
    }
    ctx.restore();
  }

  /**
   * 2.5D box: footprint on deck, height screen-up, far faces first.
   * Top is inset north slightly so the near lip reads as thickness.
   */
  _propBox(ctx, x, y, halfW, halfD, h, cols) {
    const inset = Math.min(1.6, h * 0.08);
    const nw = { x: x - halfW, y: y - halfD };
    const ne = { x: x + halfW, y: y - halfD };
    const se = { x: x + halfW, y: y + halfD };
    const sw = { x: x - halfW, y: y + halfD };
    const tnw = { x: nw.x + inset * 0.15, y: nw.y - h + inset };
    const tne = { x: ne.x - inset * 0.15, y: ne.y - h + inset };
    const tse = { x: se.x - inset * 0.15, y: se.y - h };
    const tsw = { x: sw.x + inset * 0.15, y: sw.y - h };

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + halfD * 0.4 + 2.2,
      halfW * 1.2,
      halfD * 0.55 + 1.8,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Far (north) wall
    ctx.fillStyle = cols.far || '#1a2430';
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y);
    ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(tne.x, tne.y);
    ctx.lineTo(tnw.x, tnw.y);
    ctx.closePath();
    ctx.fill();

    // Side walls — draw lower-Y (farther) side first
    const leftFirst = (nw.y + sw.y) / 2 <= (ne.y + se.y) / 2;
    const sides = leftFirst
      ? [
          [nw, sw, tsw, tnw, cols.sideL || cols.side],
          [ne, se, tse, tne, cols.sideR || cols.side],
        ]
      : [
          [ne, se, tse, tne, cols.sideR || cols.side],
          [nw, sw, tsw, tnw, cols.sideL || cols.side],
        ];
    for (const [a, b, tb, ta, col] of sides) {
      ctx.fillStyle = col || cols.side || '#243040';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(tb.x, tb.y);
      ctx.lineTo(ta.x, ta.y);
      ctx.closePath();
      ctx.fill();
    }

    // Near (south) wall — last so it sits in front
    ctx.fillStyle = cols.near || '#2a3848';
    ctx.beginPath();
    ctx.moveTo(sw.x, sw.y);
    ctx.lineTo(se.x, se.y);
    ctx.lineTo(tse.x, tse.y);
    ctx.lineTo(tsw.x, tsw.y);
    ctx.closePath();
    ctx.fill();

    // Top deck
    ctx.fillStyle = cols.top || '#4a5868';
    ctx.beginPath();
    ctx.moveTo(tnw.x, tnw.y);
    ctx.lineTo(tne.x, tne.y);
    ctx.lineTo(tse.x, tse.y);
    ctx.lineTo(tsw.x, tsw.y);
    ctx.closePath();
    ctx.fill();
    if (cols.stroke) {
      ctx.strokeStyle = cols.stroke;
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }
    // Near lip highlight
    ctx.strokeStyle = 'rgba(220, 230, 240, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tsw.x, tsw.y);
    ctx.lineTo(tse.x, tse.y);
    ctx.stroke();
    return { nw, ne, se, sw, tnw, tne, tse, tsw, h };
  }

  _propDrum(ctx, x, y, r, h, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 3.5, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = color;
    ctx.fillRect(x - r, y - h + 3, r * 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x - r, y - h + 3, r * 0.5, h);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + r * 0.3, y - h + 3, r * 0.4, h);
    // Top ellipse
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y - h + 3, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 200, 120, 0.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - r, y - h * 0.35);
    ctx.lineTo(x + r, y - h * 0.35);
    ctx.moveTo(x - r, y - h * 0.62);
    ctx.lineTo(x + r, y - h * 0.62);
    ctx.stroke();
  }

  _drawPropWorkbench(ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    this._propBox(ctx, x, y, 14, 7, 9, {
      top: '#5a6a78',
      far: '#1a2834',
      near: '#2a3a48',
      side: '#243444',
      sideL: '#1e303c',
      sideR: '#2a4050',
      stroke: '#9aacbc',
    });
    // Hazard stripe on near lip
    ctx.fillStyle = 'rgba(201, 160, 32, 0.55)';
    ctx.fillRect(x - 12, y + 5.5 - 9, 24, 1.4);
    ctx.fillStyle = 'rgba(20, 14, 8, 0.35)';
    ctx.fillRect(x - 8, y - 1 - 9, 7, 2);
    if (v === 0) {
      // Arc welder bottle + leads
      this._propBox(ctx, x + 10, y + 1, 2.8, 2.8, 8, {
        top: '#c85840',
        far: '#802820',
        near: '#a03828',
        side: '#903028',
      });
      ctx.strokeStyle = '#c0c8d0';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 10);
      ctx.quadraticCurveTo(x + 2, y - 16, x + 8, y - 14);
      ctx.stroke();
      ctx.fillStyle = `rgba(160, 220, 255, 0.55)`;
      ctx.beginPath();
      ctx.arc(x + 9, y - 14.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineCap = 'butt';
    } else if (v === 1) {
      // Open tool tray
      this._propBox(ctx, x - 4, y - 1, 6, 4, 2.5, {
        top: '#3a4550',
        far: '#1a2228',
        near: '#2a343c',
        side: '#222c34',
      });
      ctx.strokeStyle = '#d0d8e0';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 10);
      ctx.lineTo(x + 11, y - 17);
      ctx.moveTo(x + 5, y - 10);
      ctx.lineTo(x + 12, y - 14);
      ctx.stroke();
    } else {
      // Bench vise
      this._propBox(ctx, x - 1, y - 1, 5, 3.5, 5, {
        top: '#7a8490',
        far: '#3a4450',
        near: '#5a6470',
        side: '#4a5460',
      });
      ctx.strokeStyle = '#b8c0c8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x + 9, y - 13, 4.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#c9a020';
      ctx.fillRect(x + 10, y - 8, 3, 2);
    }
  }

  _drawPropBayTerminal(ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    // Slim pedestal
    this._propBox(ctx, x, y, 3.5, 3.2, 7, {
      top: '#3a4854',
      far: '#141c24',
      near: '#243038',
      side: '#1a2430',
      stroke: '#6a7a88',
    });
    if (v === 0) {
      this._propBox(ctx, x, y - 1, 6.5, 2.4, 12, {
        top: '#1a2834',
        far: '#0a1018',
        near: '#152028',
        side: '#0e181f',
        stroke: '#5a7080',
      });
      ctx.fillStyle = 'rgba(60, 170, 220, 0.45)';
      ctx.fillRect(x - 4.2, y - 1 - 10.5, 8.4, 6.5);
    } else if (v === 1) {
      this._propBox(ctx, x, y - 2, 5.5, 2, 8, {
        top: '#1a2834',
        far: '#0a1018',
        near: '#152028',
        side: '#0e181f',
      });
      this._propBox(ctx, x, y - 2, 5.2, 1.8, 16, {
        top: '#1a2834',
        far: '#0a1018',
        near: '#152028',
        side: '#0e181f',
      });
      ctx.fillStyle = 'rgba(100, 210, 160, 0.4)';
      ctx.fillRect(x - 3.4, y - 2 - 14.5, 6.8, 4.2);
      ctx.fillStyle = 'rgba(80, 170, 230, 0.42)';
      ctx.fillRect(x - 3.6, y - 2 - 7.5, 7.2, 4.2);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 7.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      const h = 11;
      ctx.fillStyle = '#152028';
      ctx.beginPath();
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x - 5, y - h);
      ctx.lineTo(x + 5, y - h);
      ctx.lineTo(x + 7, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(90, 190, 240, 0.4)';
      ctx.fillRect(x - 3.6, y - h + 2, 7.2, 5.5);
      ctx.fillStyle = '#c9a020';
      ctx.beginPath();
      ctx.arc(x - 2.2, y - 3.2, 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#40a060';
      ctx.beginPath();
      ctx.arc(x + 2.2, y - 3.2, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPropPartsRack(ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    this._propBox(ctx, x, y, 12, 6.5, 24, {
      top: '#3a4854',
      far: '#101820',
      near: '#1e2a36',
      side: '#162028',
      stroke: '#7a90a0',
    });
    for (let i = 0; i < 3; i++) {
      const sy = y - 4 - i * 6.5;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 11, sy, 22, 1.4);
      if (v === 0) {
        this._propBox(ctx, x - 5, sy + 3.2, 4, 3.2, 4, {
          top: '#5a6a50',
          far: '#2a3830',
          near: '#3a4a40',
          side: '#304038',
        });
        this._propBox(ctx, x + 5, sy + 3.2, 4, 3.2, 3.6, {
          top: '#5a4a38',
          far: '#2a2018',
          near: '#3a3020',
          side: '#322818',
        });
      } else if (v === 1) {
        ctx.fillStyle = '#5a4030';
        ctx.beginPath();
        ctx.ellipse(x - 4, sy + 1.5, 4.2, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a5060';
        ctx.beginPath();
        ctx.ellipse(x + 5, sy + 1.5, 3.6, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#9aa8b4';
        ctx.beginPath();
        ctx.arc(x - 4, sy - 0.5, 3.4, 0, Math.PI * 2);
        ctx.fill();
        this._propBox(ctx, x + 4.5, sy + 2.5, 3.8, 2.8, 4.5, {
          top: '#4a5a48',
          far: '#243028',
          near: '#354438',
          side: '#2c3830',
        });
      }
    }
  }

  _drawPropDrumStack(ctx, x, y, variant = 0) {
    const v = ((variant % 2) + 2) % 2;
    if (v === 0) {
      this._propDrum(ctx, x - 7, y + 1, 5.8, 14, '#4a5a40');
      this._propDrum(ctx, x + 7, y + 3, 5.4, 13, '#3a4a58');
    } else {
      this._propDrum(ctx, x - 8, y + 2, 5.2, 12, '#5a4a38');
      this._propDrum(ctx, x + 2, y - 1, 5.6, 14, '#4a5a48');
      this._propDrum(ctx, x + 11, y + 4, 4.8, 11, '#3a4858');
    }
  }

  _drawPropSuitLocker(ctx, x, y, variant = 0) {
    const v = ((variant % 2) + 2) % 2;
    const halfW = v === 0 ? 8.5 : 7;
    const h = v === 0 ? 22 : 26;
    this._propBox(ctx, x, y, halfW, 5.5, h, {
      top: '#3a4a58',
      far: '#101820',
      near: '#243040',
      side: '#1a2834',
      stroke: '#8aa0b0',
    });
    ctx.strokeStyle = 'rgba(160, 180, 200, 0.5)';
    ctx.lineWidth = 0.9;
    if (v === 0) {
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x, y + 4 - h);
      ctx.stroke();
      ctx.fillStyle = '#c9a020';
      ctx.beginPath();
      ctx.arc(x - 3.2, y - h * 0.38, 1.35, 0, Math.PI * 2);
      ctx.arc(x + 3.2, y - h * 0.38, 1.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#c9a020';
      ctx.beginPath();
      ctx.arc(x + halfW - 2.8, y - h * 0.42, 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x - 4, y - h * 0.55 + i * 2.8, 8, 1.1);
      }
    }
  }

  _drawPropPallet(ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    this._propBox(ctx, x, y, 13, 8.5, 3.2, {
      top: '#6a5a38',
      far: '#2a2010',
      near: '#4a3a20',
      side: '#3a2e18',
      stroke: 'rgba(200, 170, 80, 0.4)',
    });
    if (v === 0) {
      // Thruster nozzle crate
      this._propBox(ctx, x - 2, y - 1, 8, 5.5, 10, {
        top: '#4a5a68',
        far: '#1a2834',
        near: '#2a3a48',
        side: '#223040',
      });
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(x - 2, y - 1 - 10, 4, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (v === 1) {
      this._propBox(ctx, x, y - 1, 9, 5.5, 11, {
        top: '#3a5a48',
        far: '#1a3020',
        near: '#2a4030',
        side: '#243828',
      });
      ctx.fillStyle = 'rgba(80, 180, 220, 0.3)';
      ctx.fillRect(x - 6, y - 1 - 10, 12, 3);
    } else {
      this._propBox(ctx, x - 4, y, 6.5, 5, 8, {
        top: '#5a4a30',
        far: '#2a2010',
        near: '#3a3020',
        side: '#322818',
      });
      this._propBox(ctx, x + 5.5, y - 2, 5.5, 4.5, 6, {
        top: '#2a3848',
        far: '#101820',
        near: '#1e2a36',
        side: '#162028',
      });
    }
  }

  _drawPropDiagCart(ctx, x, y, variant = 0) {
    const v = ((variant % 2) + 2) % 2;
    this._propBox(ctx, x, y, 11, 6.5, 10, {
      top: '#3a4a58',
      far: '#101820',
      near: '#243040',
      side: '#1a2834',
      stroke: '#8aa0b0',
    });
    this._propBox(ctx, x + (v === 0 ? 3 : -3), y - 2, 5.5, 2.2, 9, {
      top: '#1a2834',
      far: '#0a1018',
      near: '#152028',
      side: '#0e181f',
    });
    ctx.fillStyle =
      v === 0 ? 'rgba(80, 210, 160, 0.45)' : 'rgba(80, 170, 230, 0.45)';
    ctx.fillRect(x + (v === 0 ? 3 : -3) - 3.5, y - 2 - 8, 7, 5);
    for (const [ox, oy] of [
      [-8, 4.5],
      [8, 4.5],
      [-8, -3.5],
      [8, -3.5],
    ]) {
      ctx.fillStyle = '#121212';
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy + 2.2, 2.6, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy + 1.8, 1.2, 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPropCableSpool(ctx, x, y, _variant = 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Axle stand
    this._propBox(ctx, x - 9, y + 2, 1.5, 3, 10, {
      top: '#5a6878',
      far: '#2a343c',
      near: '#3a4850',
      side: '#323c44',
    });
    this._propBox(ctx, x + 9, y + 2, 1.5, 3, 10, {
      top: '#5a6878',
      far: '#2a343c',
      near: '#3a4850',
      side: '#323c44',
    });
    // Spool
    ctx.fillStyle = '#5a4030';
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2818';
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 4, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6a40';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 8, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawPropBreakCrate(ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 10, 7, 7, {
      top: '#6a5a38',
      far: '#2a2010',
      near: '#4a3a20',
      side: '#3a2e18',
      stroke: 'rgba(200, 170, 80, 0.35)',
    });
    // Thermos + mugs
    this._propBox(ctx, x - 3, y - 1, 2.2, 2.2, 5, {
      top: '#4a5868',
      far: '#1a2430',
      near: '#2a3848',
      side: '#223040',
    });
    ctx.fillStyle = '#c05040';
    ctx.beginPath();
    ctx.arc(x + 4, y - 5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawPropWeldScreen(ctx, x, y, _variant = 0) {
    // Curtain frame
    this._propBox(ctx, x - 8, y + 2, 1.2, 2.5, 16, {
      top: '#5a6878',
      far: '#2a343c',
      near: '#3a4850',
      side: '#323c44',
    });
    this._propBox(ctx, x + 8, y + 2, 1.2, 2.5, 16, {
      top: '#5a6878',
      far: '#2a343c',
      near: '#3a4850',
      side: '#323c44',
    });
    ctx.fillStyle = 'rgba(180, 90, 40, 0.55)';
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 14);
    ctx.lineTo(x + 8, y - 14);
    ctx.lineTo(x + 8, y + 1);
    ctx.lineTo(x - 8, y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(40, 20, 10, 0.25)';
    for (let i = -6; i <= 6; i += 4) {
      ctx.fillRect(x + i - 0.6, y - 13, 1.2, 12);
    }
  }

  _drawPropBottleRack(ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 9, 5, 4, {
      top: '#3a4550',
      far: '#141c24',
      near: '#243038',
      side: '#1a2430',
      stroke: '#6a7a88',
    });
    for (const ox of [-5, 0, 5]) {
      this._propBox(ctx, x + ox, y - 1, 2.2, 2.2, 14, {
        top: ox === 0 ? '#c8d0d8' : '#6a8a9a',
        far: '#2a3840',
        near: '#4a5a68',
        side: '#3a4a58',
      });
      ctx.fillStyle = ox === 0 ? '#4090c0' : '#c05040';
      ctx.beginPath();
      ctx.arc(x + ox, y - 1 - 14, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPropShiftBoard(ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 2.5, 2.5, 6, {
      top: '#4a5868',
      far: '#1a2430',
      near: '#2a3848',
      side: '#223040',
    });
    this._propBox(ctx, x, y - 2, 9, 2, 12, {
      top: '#2a343c',
      far: '#101820',
      near: '#1e2830',
      side: '#162028',
      stroke: '#7a90a0',
    });
    // Blank slate face (no stenciled copy)
    ctx.fillStyle = 'rgba(200, 195, 175, 0.28)';
    ctx.fillRect(x - 6, y - 2 - 10, 12, 8);
  }

  /**
   * Decor painted on the north wall face (after `_drawNorthWallOcclusion`).
   * Layout `y` = south edge of the poster (near the door lip).
   */
  _drawWallArt(ctx) {
    const props = getHangarProps().filter((p) => p.kind === 'wallPoster');
    // Stable order west→east so overlapping tape reads consistently
    props.sort((a, b) => a.x - b.x);
    for (const prop of props) {
      ctx.save();
      // North-wall mounts ignore facing — art is flat on the wall band
      this._drawPropWallPoster(ctx, prop.x, prop.y, prop.variant ?? 0);
      ctx.restore();
    }
  }

  /**
   * Wall art — scrap-framed poster taped to the north wall (not a floor prop).
   * Higher-fidelity face art; still canvas primitives (no PNG).
   * variant 0 = pilot + bot crew portrait.
   * `y` = south edge of the paper (hangs north into the wall band).
   */
  _drawPropWallPoster(ctx, x, y, variant = 0) {
    const v = ((variant % 3) + 3) % 3;
    const fw = 13; // half-width of paper
    const fh = 30; // face height into the wall (−Y / further north)
    const faceTop = y - fh;
    const faceBot = y;

    // Slight crooked hang — someone slapped it up mid-shift
    ctx.save();
    ctx.translate(x, y - fh * 0.5);
    ctx.rotate(-0.04);
    ctx.translate(-x, -(y - fh * 0.5));

    // Paper / print face (flat on the wall — no floor `_propBox`)
    const px0 = x - fw;
    const py0 = faceTop;
    const pw = fw * 2;
    const ph = faceBot - faceTop;

    // Scrap metal backing flush to the wall panel
    ctx.fillStyle = '#2a3238';
    ctx.fillRect(px0 - 1.6, py0 - 1.6, pw + 3.2, ph + 3.2);
    ctx.strokeStyle = '#6a7884';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(px0 - 1.6, py0 - 1.6, pw + 3.2, ph + 3.2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(px0, py0, pw, ph);
    ctx.clip();

    if (v === 0) {
      this._drawPosterArtCrew(ctx, px0, py0, pw, ph);
    } else {
      // Reserved future wall-art variants — warm blank print for now
      const g = ctx.createLinearGradient(px0, py0, px0, py0 + ph);
      g.addColorStop(0, '#2a3038');
      g.addColorStop(1, '#1a2028');
      ctx.fillStyle = g;
      ctx.fillRect(px0, py0, pw, ph);
      ctx.fillStyle = 'rgba(201,160,32,0.35)';
      ctx.fillRect(px0 + 2, py0 + ph * 0.45, pw - 4, 1.2);
    }

    // Print wear — scratches / grit (engine-drawn, not a texture PNG)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.4;
    for (let i = 0; i < 7; i++) {
      const sx = px0 + 1.5 + ((i * 37) % (pw - 3));
      const sy = py0 + 2 + ((i * 53) % (ph - 4));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 2.5 + (i % 3), sy + 0.4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(px0, py0 + ph * 0.72, pw, ph * 0.28);

    ctx.restore();

    // Metal lip around the print
    ctx.strokeStyle = 'rgba(140, 155, 170, 0.7)';
    ctx.lineWidth = 0.9;
    ctx.strokeRect(px0 - 0.4, py0 - 0.4, pw + 0.8, ph + 0.8);

    // Duct-tape corners + bolts — "mechanic put it there"
    const tape = (tx, ty, ang) => {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(180, 160, 90, 0.72)';
      ctx.fillRect(-3.2, -1.1, 6.4, 2.2);
      ctx.fillStyle = 'rgba(120, 100, 50, 0.35)';
      ctx.fillRect(-3.2, -0.2, 6.4, 0.5);
      ctx.restore();
    };
    tape(px0 + 1.5, py0 + 1.8, -0.35);
    tape(px0 + pw - 1.5, py0 + 2.0, 0.4);
    tape(px0 + 2.0, py0 + ph - 1.6, 0.25);
    tape(px0 + pw - 1.8, py0 + ph - 1.8, -0.3);

    ctx.fillStyle = '#8a98a4';
    for (const [bx, by] of [
      [px0 - 0.2, py0 - 0.2],
      [px0 + pw + 0.2, py0 - 0.2],
      [px0 - 0.2, py0 + ph + 0.2],
      [px0 + pw + 0.2, py0 + ph + 0.2],
    ]) {
      ctx.beginPath();
      ctx.arc(bx, by, 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a3238';
      ctx.beginPath();
      ctx.arc(bx, by, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a98a4';
    }

    // Torn bottom edge nick
    ctx.fillStyle = '#1a2028';
    ctx.beginPath();
    ctx.moveTo(px0 + pw * 0.55, py0 + ph);
    ctx.lineTo(px0 + pw * 0.62, py0 + ph + 1.4);
    ctx.lineTo(px0 + pw * 0.7, py0 + ph);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Procedural crew portrait: bubble-helm pilot + waist-high cyan-eye bot.
   * Interprets the reference in hangar draw language (shapes, industrial palette).
   */
  _drawPosterArtCrew(ctx, x, y, w, h) {
    // Background hangar depth
    const sky = ctx.createLinearGradient(x, y, x, y + h);
    sky.addColorStop(0, '#1a222c');
    sky.addColorStop(0.45, '#141a22');
    sky.addColorStop(0.78, '#0e1218');
    sky.addColorStop(1, '#181410');
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h);

    // Soft structural silhouettes
    ctx.fillStyle = 'rgba(40, 50, 62, 0.55)';
    ctx.fillRect(x + w * 0.05, y + h * 0.08, w * 0.18, h * 0.55);
    ctx.fillRect(x + w * 0.78, y + h * 0.12, w * 0.16, h * 0.5);
    ctx.fillStyle = 'rgba(60, 70, 80, 0.25)';
    ctx.fillRect(x + w * 0.35, y + h * 0.05, w * 0.12, h * 0.35);

    // Warm weld / lamp bokeh
    const orbs = [
      [0.18, 0.22, 1.8, 'rgba(220,150,40,0.55)'],
      [0.42, 0.14, 1.3, 'rgba(240,180,60,0.4)'],
      [0.72, 0.28, 2.1, 'rgba(200,120,40,0.45)'],
      [0.88, 0.18, 1.1, 'rgba(255,200,80,0.35)'],
      [0.55, 0.35, 0.9, 'rgba(180,90,30,0.35)'],
      [0.28, 0.4, 1.0, 'rgba(100,180,220,0.2)'],
    ];
    for (const [u, vv, r, col] of orbs) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x + w * u, y + h * vv, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Deck reflection band
    const floor = ctx.createLinearGradient(x, y + h * 0.72, x, y + h);
    floor.addColorStop(0, 'rgba(30,28,24,0)');
    floor.addColorStop(0.35, 'rgba(40,36,30,0.55)');
    floor.addColorStop(1, 'rgba(20,18,14,0.9)');
    ctx.fillStyle = floor;
    ctx.fillRect(x, y + h * 0.7, w, h * 0.3);
    ctx.fillStyle = 'rgba(220,160,60,0.08)';
    ctx.fillRect(x, y + h * 0.78, w, 0.6);

    const cx = x + w * 0.56;
    const botX = x + w * 0.28;
    const ground = y + h * 0.9;

    // --- Bot (left, waist-high) ---
    this._drawPosterBot(ctx, botX, ground, h * 0.38);

    // --- Pilot ---
    this._drawPosterPilot(ctx, cx, ground, h * 0.78);

    // Foreground rim light / vignette
    const vig = ctx.createRadialGradient(
      x + w * 0.5,
      y + h * 0.42,
      w * 0.2,
      x + w * 0.5,
      y + h * 0.5,
      w * 0.72
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(x, y, w, h);
  }

  _drawPosterBot(ctx, cx, groundY, tall) {
    const s = tall / 22;
    const gy = groundY;

    // Legs
    ctx.fillStyle = '#8a8e92';
    ctx.fillRect(cx - 4.2 * s, gy - 9 * s, 2.6 * s, 9 * s);
    ctx.fillRect(cx + 1.4 * s, gy - 9 * s, 2.6 * s, 9 * s);
    ctx.fillStyle = '#5a4030';
    ctx.fillRect(cx - 4.4 * s, gy - 3.2 * s, 2.8 * s, 1.4 * s);
    ctx.fillRect(cx + 1.2 * s, gy - 3.2 * s, 2.8 * s, 1.4 * s);

    // Torso plates
    ctx.fillStyle = '#c8ccd0';
    ctx.beginPath();
    ctx.moveTo(cx - 5.5 * s, gy - 10 * s);
    ctx.lineTo(cx + 5.5 * s, gy - 10 * s);
    ctx.lineTo(cx + 4.5 * s, gy - 18 * s);
    ctx.lineTo(cx - 4.5 * s, gy - 18 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a8acb0';
    ctx.fillRect(cx - 4 * s, gy - 16.5 * s, 8 * s, 2.2 * s);
    // Rust streaks matching pilot orange
    ctx.fillStyle = 'rgba(180, 90, 40, 0.55)';
    ctx.fillRect(cx - 5 * s, gy - 14 * s, 1.4 * s, 4 * s);
    ctx.fillRect(cx + 3.2 * s, gy - 15 * s, 1.6 * s, 3.5 * s);
    ctx.fillStyle = 'rgba(60, 50, 40, 0.35)';
    ctx.fillRect(cx - 2 * s, gy - 12 * s, 4 * s, 0.7 * s);

    // Arms
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = 1.6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 5 * s, gy - 16 * s);
    ctx.lineTo(cx - 7.5 * s, gy - 11 * s);
    ctx.lineTo(cx - 6.5 * s, gy - 8.5 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 5 * s, gy - 16 * s);
    ctx.lineTo(cx + 7 * s, gy - 12 * s);
    ctx.stroke();
    ctx.fillStyle = '#707478';
    ctx.beginPath();
    ctx.arc(cx - 6.5 * s, gy - 8.2 * s, 1.3 * s, 0, Math.PI * 2);
    ctx.fill();

    // Domed head + cyan eyes
    ctx.fillStyle = '#d0d4d8';
    ctx.beginPath();
    ctx.ellipse(cx, gy - 20.2 * s, 5.2 * s, 4.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b0b4b8';
    ctx.beginPath();
    ctx.ellipse(cx, gy - 18.8 * s, 5.4 * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye glow
    const eyeY = gy - 20.4 * s;
    for (const ex of [cx - 2.1 * s, cx + 2.1 * s]) {
      ctx.fillStyle = 'rgba(40, 200, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(ex, eyeY, 2.4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#20e8ff';
      ctx.beginPath();
      ctx.arc(ex, eyeY, 1.55 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8ffff';
      ctx.beginPath();
      ctx.arc(ex - 0.35 * s, eyeY - 0.35 * s, 0.45 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPosterPilot(ctx, cx, groundY, tall) {
    const s = tall / 40;
    const gy = groundY;

    // Boots / legs
    ctx.fillStyle = '#2a2e32';
    ctx.fillRect(cx - 4.5 * s, gy - 14 * s, 3.6 * s, 14 * s);
    ctx.fillRect(cx + 0.8 * s, gy - 14 * s, 3.6 * s, 14 * s);
    // Orange knee plates
    ctx.fillStyle = '#c86828';
    ctx.fillRect(cx - 4.8 * s, gy - 11 * s, 4 * s, 3.2 * s);
    ctx.fillRect(cx + 0.6 * s, gy - 11 * s, 4 * s, 3.2 * s);
    ctx.fillStyle = 'rgba(80,40,16,0.35)';
    ctx.fillRect(cx - 4.8 * s, gy - 9.6 * s, 4 * s, 0.7 * s);
    ctx.fillRect(cx + 0.6 * s, gy - 9.6 * s, 4 * s, 0.7 * s);

    // Torso suit
    ctx.fillStyle = '#3a4048';
    ctx.beginPath();
    ctx.moveTo(cx - 7 * s, gy - 14 * s);
    ctx.lineTo(cx + 7 * s, gy - 14 * s);
    ctx.lineTo(cx + 6.2 * s, gy - 26 * s);
    ctx.lineTo(cx - 6.2 * s, gy - 26 * s);
    ctx.closePath();
    ctx.fill();
    // Camo flecks
    ctx.fillStyle = 'rgba(50,58,66,0.7)';
    for (let i = 0; i < 8; i++) {
      const fx = cx + ((i % 4) - 1.5) * 2.4 * s;
      const fy = gy - (16 + (i % 3) * 3) * s;
      ctx.fillRect(fx, fy, 1.4 * s, 1.1 * s);
    }

    // Chest strap
    ctx.strokeStyle = '#6a4a30';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(cx + 5.5 * s, gy - 25 * s);
    ctx.lineTo(cx - 5.5 * s, gy - 16 * s);
    ctx.stroke();

    // Utility belt
    ctx.fillStyle = '#5a4030';
    ctx.fillRect(cx - 6.5 * s, gy - 15.5 * s, 13 * s, 2.2 * s);
    ctx.fillStyle = '#8a7050';
    ctx.fillRect(cx - 5.5 * s, gy - 15.2 * s, 2.4 * s, 2.6 * s);
    ctx.fillRect(cx - 1.5 * s, gy - 15.2 * s, 2.2 * s, 2.4 * s);
    ctx.fillRect(cx + 2.5 * s, gy - 15.2 * s, 2.8 * s, 2.8 * s);

    // Arms
    ctx.fillStyle = '#3a4048';
    ctx.beginPath();
    ctx.moveTo(cx - 6.2 * s, gy - 25 * s);
    ctx.lineTo(cx - 10 * s, gy - 18 * s);
    ctx.lineTo(cx - 8.5 * s, gy - 16 * s);
    ctx.lineTo(cx - 5.5 * s, gy - 22 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 6.2 * s, gy - 25 * s);
    ctx.lineTo(cx + 9.5 * s, gy - 19 * s);
    ctx.lineTo(cx + 8 * s, gy - 17 * s);
    ctx.lineTo(cx + 5.5 * s, gy - 22 * s);
    ctx.closePath();
    ctx.fill();

    // Orange shoulder plates
    ctx.fillStyle = '#d07030';
    ctx.beginPath();
    ctx.ellipse(cx - 5.8 * s, gy - 25.5 * s, 3.2 * s, 2.2 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 5.8 * s, gy - 25.5 * s, 3.2 * s, 2.2 * s, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,200,120,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx - 5.5 * s, gy - 26 * s, 1.6 * s, 0.8 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Rag in right hand
    ctx.fillStyle = '#c4a878';
    ctx.beginPath();
    ctx.moveTo(cx - 9.5 * s, gy - 16.5 * s);
    ctx.lineTo(cx - 12 * s, gy - 14 * s);
    ctx.lineTo(cx - 10.5 * s, gy - 13 * s);
    ctx.lineTo(cx - 8.2 * s, gy - 15.5 * s);
    ctx.closePath();
    ctx.fill();

    // Gloves
    ctx.fillStyle = '#1a1e22';
    ctx.beginPath();
    ctx.arc(cx - 9 * s, gy - 16.2 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.arc(cx + 9 * s, gy - 18 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
    // Wrist computer
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(cx + 7.2 * s, gy - 19.5 * s, 2.4 * s, 1.3 * s);
    ctx.fillStyle = 'rgba(80,200,220,0.55)';
    ctx.fillRect(cx + 7.5 * s, gy - 19.2 * s, 1.6 * s, 0.6 * s);

    // Guitar neck over left shoulder
    ctx.fillStyle = '#6a4a28';
    ctx.save();
    ctx.translate(cx + 4 * s, gy - 27 * s);
    ctx.rotate(-0.55);
    ctx.fillRect(-1 * s, -10 * s, 2 * s, 12 * s);
    ctx.fillStyle = '#8a6a40';
    ctx.fillRect(-2.2 * s, -12 * s, 4.4 * s, 2.4 * s);
    ctx.fillStyle = '#c9a020';
    ctx.fillRect(-1.6 * s, -11.5 * s, 0.5 * s, 1.4 * s);
    ctx.fillRect(1.1 * s, -11.5 * s, 0.5 * s, 1.4 * s);
    ctx.restore();

    // Neck ring / helmet base
    ctx.fillStyle = '#1a1e22';
    ctx.beginPath();
    ctx.ellipse(cx, gy - 27.2 * s, 5.5 * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a020';
    ctx.beginPath();
    ctx.arc(cx - 3.2 * s, gy - 27.2 * s, 0.55 * s, 0, Math.PI * 2);
    ctx.arc(cx + 3.2 * s, gy - 27.2 * s, 0.55 * s, 0, Math.PI * 2);
    ctx.fill();

    // Bubble helmet glass
    const hx = cx;
    const hy = gy - 32.5 * s;
    const hr = 6.8 * s;
    const glass = ctx.createRadialGradient(
      hx - hr * 0.25,
      hy - hr * 0.3,
      hr * 0.1,
      hx,
      hy,
      hr
    );
    glass.addColorStop(0, 'rgba(210,230,240,0.35)');
    glass.addColorStop(0.55, 'rgba(140,170,190,0.22)');
    glass.addColorStop(1, 'rgba(40,60,80,0.35)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,200,220,0.55)';
    ctx.lineWidth = 0.7 * s;
    ctx.stroke();

    // Face inside helmet
    ctx.fillStyle = '#c8a890';
    ctx.beginPath();
    ctx.ellipse(hx, hy + 0.6 * s, 3.4 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hair
    ctx.fillStyle = '#2a2420';
    ctx.beginPath();
    ctx.ellipse(hx, hy - 1.8 * s, 3.3 * s, 2.2 * s, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Eyes / brow / stubble cue
    ctx.fillStyle = '#1a1814';
    ctx.fillRect(hx - 2.2 * s, hy - 0.2 * s, 1.5 * s, 0.55 * s);
    ctx.fillRect(hx + 0.7 * s, hy - 0.2 * s, 1.5 * s, 0.55 * s);
    ctx.strokeStyle = 'rgba(60,40,30,0.5)';
    ctx.lineWidth = 0.45 * s;
    ctx.beginPath();
    ctx.moveTo(hx - 1.8 * s, hy + 2.2 * s);
    ctx.quadraticCurveTo(hx, hy + 2.8 * s, hx + 1.8 * s, hy + 2.2 * s);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,30,24,0.25)';
    ctx.fillRect(hx - 2.4 * s, hy + 1.2 * s, 4.8 * s, 1.6 * s);

    // Helmet specular
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.arc(hx - hr * 0.15, hy - hr * 0.25, hr * 0.55, -2.4, -0.9);
    ctx.stroke();
  }

  _drawPropForkCharger(ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 8, 6, 12, {
      top: '#3a4a38',
      far: '#142018',
      near: '#2a3a28',
      side: '#1e2e20',
      stroke: '#7a9a70',
    });
    ctx.fillStyle = 'rgba(80, 200, 120, 0.45)';
    ctx.fillRect(x - 4, y - 9, 8, 3);
    ctx.fillStyle = '#c9a020';
    ctx.beginPath();
    ctx.arc(x + 5, y - 11, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Cable to deck
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 4);
    ctx.quadraticCurveTo(x - 14, y + 4, x - 8, y + 8);
    ctx.stroke();
  }

  _drawPropForkTireRack(ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 7, 5, 5, {
      top: '#3a4550',
      far: '#141c24',
      near: '#243038',
      side: '#1a2430',
    });
    for (let i = 0; i < 3; i++) {
      const ty = y - 6 - i * 5.5;
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(x, ty, 6.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.ellipse(x, ty, 2.8, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5a5a5a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, ty, 6.5, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawPropForkCones(ctx, x, y, _variant = 0) {
    for (const [ox, oy] of [
      [-5, 2],
      [4, 0],
      [0, 5],
    ]) {
      const cx = x + ox;
      const cy = y + oy;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 3, 3.5, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d08020';
      ctx.beginPath();
      ctx.moveTo(cx - 3.5, cy + 2);
      ctx.lineTo(cx, cy - 10);
      ctx.lineTo(cx + 3.5, cy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1a1a14';
      ctx.fillRect(cx - 2.5, cy - 3, 5, 1.5);
    }
  }

  _drawPropForkCrate(ctx, x, y, _variant = 0) {
    this._propBox(ctx, x, y, 9, 6, 8, {
      top: '#5a4a30',
      far: '#2a2010',
      near: '#3a3020',
      side: '#322818',
      stroke: 'rgba(200, 170, 80, 0.35)',
    });
  }

  _drawPropFuelFarm(ctx, x, y, variant = 0) {
    const v = ((variant % 2) + 2) % 2;
    this._propDrum(
      ctx,
      x,
      y,
      v === 0 ? 11 : 9.5,
      v === 0 ? 22 : 18,
      v === 0 ? '#3a4a38' : '#3a4850'
    );
    ctx.fillStyle = '#6a7888';
    ctx.fillRect(x + 8, y - 10, 5, 3);
    ctx.fillStyle = '#c05040';
    ctx.beginPath();
    ctx.arc(x + 14, y - 8.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    const s = x < 0 ? -1 : 1;
    const baseY = Math.max(y + 8, BAY.PATH_Y + 20);
    ctx.lineCap = 'round';
    for (const pass of [
      { color: 'rgba(40, 30, 20, 0.55)', w: 3.2 },
      { color: 'rgba(90, 70, 40, 0.7)', w: 1.8 },
    ]) {
      ctx.strokeStyle = pass.color;
      ctx.lineWidth = pass.w;
      ctx.beginPath();
      ctx.moveTo(x - s * 4, y + 2);
      ctx.quadraticCurveTo(x - s * 18, baseY - 4, x - s * 10, baseY + 6);
      ctx.quadraticCurveTo(x - s * 2, baseY + 12, x - s * 16, baseY + 4);
      ctx.stroke();
    }
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(x - s * 12 - 3, baseY + 4, 8, 4);
    ctx.lineCap = 'butt';
  }

  _drawPropExtinguisher(ctx, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 5, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a03028';
    ctx.fillRect(x - 3, y - 9, 6, 13);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x - 3, y - 9, 2, 13);
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(x - 2, y - 11, 4, 2);
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 9);
    ctx.lineTo(x + 7, y - 4);
    ctx.stroke();
  }

  _drawPropFloorDrain(ctx, x, y) {
    ctx.fillStyle = '#121820';
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a5a68';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70, 90, 105, 0.55)';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y + i * 1.4);
      ctx.lineTo(x + 6, y + i * 1.4);
      ctx.stroke();
    }
  }

  _drawCargoPiles(ctx) {
    const pileHidden = new Set();
    for (const n of this.npcs) {
      if (n.kind === 'forklift' && n._forkLift?.cargo?.id) {
        pileHidden.add(n._forkLift.cargo.id);
      }
      if (n.kind === 'mechanic' && n._mechLift?.cargo?.id) {
        pileHidden.add(n._mechLift.cargo.id);
      }
    }
    for (const pile of this.piles) {
      // Hardpoint pad — role tint (sized for 2×2 slots)
      const roleColor =
        pile.role === 'upgrade' ? 'rgba(80, 160, 200, 0.22)'
          : pile.role === 'cargo' ? 'rgba(180, 160, 80, 0.18)'
            : 'rgba(90, 120, 140, 0.2)';
      ctx.strokeStyle = roleColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(pile.x - 13, pile.y - 10, 26, 22);

      // Tiny lane / role mark
      ctx.fillStyle = pile.lane === 'in'
        ? 'rgba(100, 200, 140, 0.35)'
        : 'rgba(200, 120, 100, 0.35)';
      ctx.font = '3px sans-serif';
      ctx.textAlign = 'center';
      const tag =
        pile.role === 'upgrade' ? (pile.lane === 'in' ? 'UP·IN' : 'UP·OUT')
          : pile.role === 'cargo' ? (pile.lane === 'in' ? 'CG·IN' : 'CG·OUT')
            : (pile.lane === 'in' ? 'ST·IN' : 'ST·OUT');
      ctx.fillText(tag, pile.x, pile.y + 15);

      pile.items.forEach((item) => {
        if (pileHidden.has(item.id)) return;
        const pos = this._itemWorldPos(pile, item);
        this._drawCargoItem(ctx, item, pos.x, pos.y, 1, item.restHeading);
      });
    }

    // Panic drops — crates on the deck until crew or crane reclaim them
    for (const drop of this.floorDrops) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(drop.x, drop.y + drop.cargo.h * 0.45, drop.cargo.w * 0.55, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      this._drawCargoItem(ctx, drop.cargo, drop.x, drop.y, 0.92, drop.cargo.restHeading);
    }
  }

  /** Resolve 8-dir basis for cargo draw (matches forklift / mech foreshortening). */
  _cargoOctBasis(headingRad) {
    let oct = Math.round((headingRad || 0) / CREW_VIS_OCT);
    oct = ((oct % 8) + 8) % 8;
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    return {
      oct,
      heading,
      fx,
      fy,
      rx: -fy,
      ry: fx,
      alongScale: 0.72 + 0.28 * Math.abs(fx),
      acrossScale: 0.72 + 0.28 * Math.abs(fy),
    };
  }

  /**
   * Worn industrial 2.5D freight. Optional `headingRad` follows carrier visHeading;
   * piles / floor use `item.restHeading`. Footprint stays near legacy w×h.
   */
  _drawCargoItem(ctx, item, cx, cy, scale = 1, headingRad = null) {
    if (!item) return;
    const heading =
      headingRad != null && Number.isFinite(headingRad)
        ? headingRad
        : item.restHeading ?? 0;
    const b = this._cargoOctBasis(heading);
    const s = scale;
    const len = item.w * s * 0.92;
    const wid = item.h * s * 0.52;
    const tall = item.h * s * 0.42;
    const g = (along, across, up = 0) => ({
      x: cx + b.fx * along * b.alongScale + b.rx * across * b.acrossScale,
      y: cy + b.fy * along * b.alongScale + b.ry * across * b.acrossScale - up,
    });

    ctx.save();

    // Soft deck shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + tall * 0.15, len * 0.42, wid * 0.28, b.heading * 0.15, 0, Math.PI * 2);
    ctx.fill();

    const shape = item.shape || (item.family === 'upgrade' ? 'laser' : 'crate');
    if (shape === 'fuel') this._drawCargoFuel(ctx, item, g, len, wid, tall, b);
    else if (shape === 'bullets') this._drawCargoBullets(ctx, item, g, len, wid, tall, b);
    else if (shape === 'shells') this._drawCargoShells(ctx, item, g, len, wid, tall, b);
    else if (shape === 'laser') this._drawCargoLaser(ctx, item, g, len, wid, tall, b);
    else if (shape === 'turret') this._drawCargoTurret(ctx, item, g, len, wid, tall, b);
    else if (shape === 'armor') this._drawCargoArmor(ctx, item, g, len, wid, tall, b);
    else if (shape === 'thruster') this._drawCargoThruster(ctx, item, g, len, wid, tall, b);
    else if (shape === 'engine') this._drawCargoEngine(ctx, item, g, len, wid, tall, b);
    else if (shape === 'sensor') this._drawCargoSensor(ctx, item, g, len, wid, tall, b);
    else if (item.family === 'upgrade') this._drawCargoLaser(ctx, item, g, len, wid, tall, b);
    else this._drawCargoCrate(ctx, item, g, len, wid, tall, b);

    ctx.restore();
  }

  /** Draw a closed / open industrial box shell (far faces first). */
  _drawCargoBoxFaces(ctx, g, hl, hw, H, fill, fillDark, fillTop) {
    const corners = [
      g(-hl, -hw, 0),
      g(hl, -hw, 0),
      g(hl, hw, 0),
      g(-hl, hw, 0),
    ];
    const tops = [
      g(-hl, -hw, H),
      g(hl, -hw, H),
      g(hl, hw, H),
      g(-hl, hw, H),
    ];
    const faces = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ].map(([i, j], idx) => ({
      i,
      j,
      y: (corners[i].y + corners[j].y + tops[i].y + tops[j].y) / 4,
      idx,
    }));
    faces.sort((a, b) => a.y - b.y);
    for (let f = 0; f < faces.length; f++) {
      const { i, j } = faces[f];
      ctx.fillStyle = f < 2 ? fillDark : fill;
      ctx.beginPath();
      ctx.moveTo(corners[i].x, corners[i].y);
      ctx.lineTo(corners[j].x, corners[j].y);
      ctx.lineTo(tops[j].x, tops[j].y);
      ctx.lineTo(tops[i].x, tops[i].y);
      ctx.closePath();
      ctx.fill();
    }
    // Top plate
    ctx.fillStyle = fillTop;
    ctx.beginPath();
    ctx.moveTo(tops[0].x, tops[0].y);
    ctx.lineTo(tops[1].x, tops[1].y);
    ctx.lineTo(tops[2].x, tops[2].y);
    ctx.lineTo(tops[3].x, tops[3].y);
    ctx.closePath();
    ctx.fill();
    return { corners, tops };
  }

  _drawCargoCrate(ctx, item, g, len, wid, tall) {
    const hl = len * 0.5;
    const hw = wid * 0.5;
    const H = tall;
    const fill = item.color || '#6a5538';
    const fillDark = '#2a2218';
    const fillTop = item.accent ? this._cargoMix(fill, item.accent, 0.25) : '#7a6848';
    const { tops } = this._drawCargoBoxFaces(ctx, g, hl, hw, H, fill, fillDark, fillTop);

    // Corner wear / banding
    ctx.strokeStyle = 'rgba(20, 12, 6, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(tops[0].x, tops[0].y);
    ctx.lineTo(tops[1].x, tops[1].y);
    ctx.lineTo(tops[2].x, tops[2].y);
    ctx.lineTo(tops[3].x, tops[3].y);
    ctx.closePath();
    ctx.stroke();

    // Hazard / stencil stripe on lid
    const a = item.accent || '#c9a020';
    const s0 = g(-hl * 0.7, -hw * 0.15, H + 0.2);
    const s1 = g(hl * 0.7, hw * 0.15, H + 0.2);
    ctx.strokeStyle = a;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Latch nub
    const latch = g(hl * 0.15, 0, H + 0.4);
    ctx.fillStyle = '#8a9aa8';
    ctx.fillRect(latch.x - 1.2, latch.y - 0.7, 2.4, 1.4);

    // Scuff
    const sc = g(-hl * 0.2, hw * 0.2, H * 0.55);
    ctx.fillStyle = 'rgba(20, 12, 6, 0.28)';
    ctx.fillRect(sc.x - 1.5, sc.y - 0.8, 3.2, 1.6);
  }

  _drawCargoFuel(ctx, item, g, len, wid, tall) {
    const hl = len * 0.5;
    const hw = wid * 0.5;
    const wall = tall * 0.55;
    const fill = item.color || '#2a6858';
    const fillDark = '#142820';
    // Open-top crate walls
    this._drawCargoBoxFaces(ctx, g, hl, hw, wall, fill, fillDark, '#1a3028');

    // Inner floor
    const floor = [
      g(-hl * 0.82, -hw * 0.78, 1.2),
      g(hl * 0.82, -hw * 0.78, 1.2),
      g(hl * 0.82, hw * 0.78, 1.2),
      g(-hl * 0.82, hw * 0.78, 1.2),
    ];
    ctx.fillStyle = '#0e1814';
    ctx.beginPath();
    ctx.moveTo(floor[0].x, floor[0].y);
    ctx.lineTo(floor[1].x, floor[1].y);
    ctx.lineTo(floor[2].x, floor[2].y);
    ctx.lineTo(floor[3].x, floor[3].y);
    ctx.closePath();
    ctx.fill();

    // Sci-fi fuel cells (cylinders standing in the crate)
    const accent = item.accent || '#40e0a0';
    const cells = [
      [-0.35, -0.28],
      [0.35, -0.28],
      [-0.35, 0.28],
      [0.35, 0.28],
      [0, 0],
    ];
    const cellH = tall * 0.85;
    for (const [ua, uc] of cells) {
      const base = g(ua * hl * 1.1, uc * hw * 1.1, wall * 0.15);
      const top = g(ua * hl * 1.1, uc * hw * 1.1, wall * 0.15 + cellH);
      ctx.strokeStyle = '#3a7060';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(top.x, top.y, 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#a0ffe0';
      ctx.beginPath();
      ctx.arc(top.x, top.y, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Collar ring
      ctx.strokeStyle = '#8aa8a0';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(base.x, base.y - cellH * 0.15, 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /**
   * Open military ammo can — walls + foam floor + upright hinged lid + hardware.
   * Matches the concept sheet look (olive/brown metal, rivets, handles, stencil).
   * @returns {{ H: number, hl: number, hw: number, foamZ: number }}
   */
  _drawAmmoCanOpen(ctx, g, len, wid, tall, opts = {}) {
    const hl = len * 0.5;
    const hw = wid * 0.5;
    const H = tall * (opts.wallH ?? 0.78);
    const fill = opts.fill || '#4a3428';
    const fillDark = opts.fillDark || '#241810';
    const fillMid = opts.fillMid || this._cargoMix(fill, '#2a2018', 0.35);
    const lidFill = opts.lidFill || this._cargoMix(fill, '#1a1410', 0.25);
    const stencil = opts.stencil || '7.62';
    const stencilColor = opts.stencilColor || 'rgba(200, 190, 150, 0.55)';

    const corners = [
      g(-hl, -hw, 0),
      g(hl, -hw, 0),
      g(hl, hw, 0),
      g(-hl, hw, 0),
    ];
    const tops = [
      g(-hl, -hw, H),
      g(hl, -hw, H),
      g(hl, hw, H),
      g(-hl, hw, H),
    ];
    // Side walls only (open top) — far faces first
    const faces = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ].map(([i, j], idx) => ({
      i,
      j,
      y: (corners[i].y + corners[j].y + tops[i].y + tops[j].y) / 4,
      idx,
    }));
    faces.sort((a, b) => a.y - b.y);
    for (let f = 0; f < faces.length; f++) {
      const { i, j } = faces[f];
      ctx.fillStyle = f < 2 ? fillDark : fill;
      ctx.beginPath();
      ctx.moveTo(corners[i].x, corners[i].y);
      ctx.lineTo(corners[j].x, corners[j].y);
      ctx.lineTo(tops[j].x, tops[j].y);
      ctx.lineTo(tops[i].x, tops[i].y);
      ctx.closePath();
      ctx.fill();
    }

    // Foam / insert floor
    const foamZ = H * 0.28;
    const foam = [
      g(-hl * 0.86, -hw * 0.78, foamZ),
      g(hl * 0.86, -hw * 0.78, foamZ),
      g(hl * 0.86, hw * 0.78, foamZ),
      g(-hl * 0.86, hw * 0.78, foamZ),
    ];
    ctx.fillStyle = opts.foam || '#1a1610';
    ctx.beginPath();
    ctx.moveTo(foam[0].x, foam[0].y);
    ctx.lineTo(foam[1].x, foam[1].y);
    ctx.lineTo(foam[2].x, foam[2].y);
    ctx.lineTo(foam[3].x, foam[3].y);
    ctx.closePath();
    ctx.fill();

    // Inner wall lip (rim) so the open top reads as a can
    const rimIn = [
      g(-hl * 0.92, -hw * 0.88, H),
      g(hl * 0.92, -hw * 0.88, H),
      g(hl * 0.92, hw * 0.88, H),
      g(-hl * 0.92, hw * 0.88, H),
    ];
    ctx.strokeStyle = fillMid;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(tops[0].x, tops[0].y);
    ctx.lineTo(tops[1].x, tops[1].y);
    ctx.lineTo(tops[2].x, tops[2].y);
    ctx.lineTo(tops[3].x, tops[3].y);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180, 160, 120, 0.22)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(rimIn[0].x, rimIn[0].y);
    ctx.lineTo(rimIn[1].x, rimIn[1].y);
    ctx.lineTo(rimIn[2].x, rimIn[2].y);
    ctx.lineTo(rimIn[3].x, rimIn[3].y);
    ctx.closePath();
    ctx.stroke();

    // Corner rivets
    const rivets = [
      [-0.92, -0.88],
      [0.92, -0.88],
      [0.92, 0.88],
      [-0.92, 0.88],
    ];
    for (const [ua, uc] of rivets) {
      const p = g(ua * hl, uc * hw, H * 0.55);
      ctx.fillStyle = '#8a8070';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2418';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    // Recessed carry handles on left / right faces
    for (const side of [-1, 1]) {
      const h0 = g(side * hl * 0.98, -hw * 0.28, H * 0.42);
      const h1 = g(side * hl * 0.98, hw * 0.28, H * 0.42);
      ctx.strokeStyle = '#1a1410';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(h0.x, h0.y);
      ctx.lineTo(h1.x, h1.y);
      ctx.stroke();
      ctx.strokeStyle = '#6a6050';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(h0.x, h0.y - 0.35);
      ctx.lineTo(h1.x, h1.y - 0.35);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // Latch on near face
    const latch = g(0, hw * 0.98, H * 0.62);
    ctx.fillStyle = '#7a8890';
    ctx.beginPath();
    ctx.ellipse(latch.x, latch.y, 1.5, 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a3038';
    ctx.beginPath();
    ctx.ellipse(latch.x, latch.y, 0.55, 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stencil on near face
    const mark = g(0, hw * 0.62, H * 0.48);
    ctx.fillStyle = stencilColor;
    ctx.font = 'bold 3.6px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stencil, mark.x, mark.y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Upright hinged lid on far edge (~90°, concept-sheet style)
    const lidH = tall * 0.95;
    const lid = [
      g(-hl * 0.94, -hw * 0.98, H + 0.15),
      g(hl * 0.94, -hw * 0.98, H + 0.15),
      g(hl * 0.88, -hw * 1.08, H + lidH),
      g(-hl * 0.88, -hw * 1.08, H + lidH),
    ];
    ctx.fillStyle = lidFill;
    ctx.beginPath();
    ctx.moveTo(lid[0].x, lid[0].y);
    ctx.lineTo(lid[1].x, lid[1].y);
    ctx.lineTo(lid[2].x, lid[2].y);
    ctx.lineTo(lid[3].x, lid[3].y);
    ctx.closePath();
    ctx.fill();
    // Lid underside shadow + hinge nubs
    ctx.fillStyle = 'rgba(10, 8, 4, 0.35)';
    ctx.beginPath();
    ctx.moveTo(lid[0].x, lid[0].y);
    ctx.lineTo(lid[1].x, lid[1].y);
    ctx.lineTo(g(hl * 0.7, -hw * 1.02, H + lidH * 0.35).x, g(hl * 0.7, -hw * 1.02, H + lidH * 0.35).y);
    ctx.lineTo(g(-hl * 0.7, -hw * 1.02, H + lidH * 0.35).x, g(-hl * 0.7, -hw * 1.02, H + lidH * 0.35).y);
    ctx.closePath();
    ctx.fill();
    for (const t of [-0.55, 0.55]) {
      const hn = g(t * hl, -hw * 0.98, H + 0.2);
      ctx.fillStyle = '#6a6050';
      ctx.beginPath();
      ctx.arc(hn.x, hn.y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lid rim highlight
    ctx.strokeStyle = 'rgba(200, 180, 130, 0.28)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(lid[2].x, lid[2].y);
    ctx.lineTo(lid[3].x, lid[3].y);
    ctx.stroke();

    // Wear scuffs on near face
    const sc = g(-hl * 0.35, hw * 0.55, H * 0.7);
    ctx.fillStyle = 'rgba(20, 12, 6, 0.3)';
    ctx.fillRect(sc.x - 1.8, sc.y - 0.5, 3.6, 1.1);

    return { H, hl, hw, foamZ };
  }

  /** Belt-ammo can — brown military box, two linked rows of tip-up 7.62 rounds. */
  _drawCargoBullets(ctx, item, g, len, wid, tall) {
    const fill = item.color || '#4a3428';
    const { H, hl, hw, foamZ } = this._drawAmmoCanOpen(ctx, g, len, wid, tall, {
      fill,
      fillDark: '#241810',
      fillMid: '#3a2a20',
      lidFill: '#3a2820',
      foam: '#14100c',
      stencil: '7.62',
      stencilColor: 'rgba(200, 190, 150, 0.55)',
      wallH: 0.82,
    });

    const accent = item.accent || '#c9a020';
    const brass = '#b89040';
    const brassHi = '#e0c878';
    const tipCol = '#3a4048';
    const rows = [-0.32, 0.32];
    const cols = 7;
    // Sort rounds far→near so nearer bullets occlude
    const rounds = [];
    for (let r = 0; r < rows.length; r++) {
      for (let i = 0; i < cols; i++) {
        const t = (i / (cols - 1)) * 2 - 1;
        const ax = t * hl * 0.72;
        const ay = rows[r] * hw;
        rounds.push({ ax, ay, r, i, depth: ay });
      }
    }
    rounds.sort((a, b) => a.depth - b.depth);

    // Belt links under each row
    for (const row of rows) {
      const a0 = g(-hl * 0.72, row * hw, foamZ + 0.8);
      const a1 = g(hl * 0.72, row * hw, foamZ + 0.8);
      ctx.strokeStyle = '#5a5548';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.stroke();
      ctx.strokeStyle = '#8a8070';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y - 0.4);
      ctx.lineTo(a1.x, a1.y - 0.4);
      ctx.stroke();
    }

    for (const rd of rounds) {
      const base = g(rd.ax, rd.ay, foamZ + 0.4);
      const mid = g(rd.ax, rd.ay, H * 0.55);
      const tip = g(rd.ax, rd.ay, H + tall * 0.18);
      // Brass casing
      ctx.strokeStyle = brass;
      ctx.lineWidth = 2.15;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(mid.x, mid.y);
      ctx.stroke();
      ctx.strokeStyle = brassHi;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(base.x - 0.45, base.y);
      ctx.lineTo(mid.x - 0.45, mid.y);
      ctx.stroke();
      // Case mouth
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, 1.05, 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      // Dark tip
      ctx.strokeStyle = tipCol;
      ctx.lineWidth = 1.55;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.fillStyle = '#5a6870';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 0.55, 0, Math.PI * 2);
      ctx.fill();
      // Primer
      ctx.fillStyle = '#d0a848';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y + 0.15, 0.75, 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Link clip between neighbors
      if (rd.i < cols - 1) {
        const nx = ((rd.i + 1) / (cols - 1)) * 2 - 1;
        const nBase = g(nx * hl * 0.72, rd.ay, foamZ + 1.0);
        ctx.strokeStyle = '#6a6558';
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y - 0.3);
        ctx.lineTo(nBase.x, nBase.y - 0.3);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }

  /** Large-shell crate — olive military box, 3×2 tip-up 40mm artillery rounds. */
  _drawCargoShells(ctx, item, g, len, wid, tall) {
    const fill = item.color || '#4a5230';
    const { H, hl, hw, foamZ } = this._drawAmmoCanOpen(ctx, g, len, wid, tall, {
      fill,
      fillDark: '#252818',
      fillMid: '#3a4228',
      lidFill: '#3a4224',
      foam: '#141810',
      stencil: '40mm',
      stencilColor: 'rgba(200, 190, 150, 0.55)',
      wallH: 0.72,
    });

    const accent = item.accent || '#d0a048';
    const slots = [
      [-0.55, -0.28],
      [0, -0.28],
      [0.55, -0.28],
      [-0.55, 0.38],
      [0, 0.38],
      [0.55, 0.38],
    ];
    // Pocket rings in foam
    for (const [ua, uc] of slots) {
      const p = g(ua * hl * 0.9, uc * hw * 0.85, foamZ + 0.15);
      ctx.strokeStyle = '#0c1008';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 2.4, 1.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const sorted = slots
      .map(([ua, uc]) => ({ ua, uc, depth: uc }))
      .sort((a, b) => a.depth - b.depth);

    for (const { ua, uc } of sorted) {
      const ax = ua * hl * 0.9;
      const ay = uc * hw * 0.85;
      const base = g(ax, ay, foamZ + 0.35);
      const mid = g(ax, ay, H + tall * 0.12);
      const tip = g(ax, ay, H + tall * 0.68);
      // Brass casing body
      ctx.strokeStyle = '#8a6a30';
      ctx.lineWidth = 4.6;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(mid.x, mid.y);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(base.x - 0.7, base.y);
      ctx.lineTo(mid.x - 0.7, mid.y);
      ctx.stroke();
      // Case mouth rim
      ctx.fillStyle = '#c8a060';
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, 2.25, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a4830';
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, 1.35, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Dark ogive / warhead
      ctx.strokeStyle = '#2e343c';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.fillStyle = '#5a6878';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
      // Band stripe on casing
      const band = g(ax, ay, foamZ + (H - foamZ) * 0.55);
      ctx.strokeStyle = 'rgba(40, 36, 28, 0.55)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(band.x, band.y, 2.1, 1.05, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Primer disc
      ctx.fillStyle = '#d0a848';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y + 0.25, 1.7, 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a5028';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y + 0.25, 0.55, 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  /** Laser cannon — long emitter barrel + heatsink housing + mount. */
  _drawCargoLaser(ctx, item, g, len, wid, tall) {
    const accent = item.color || '#50a0c8';
    const metal = '#4a5868';
    const metalDark = '#1a2430';
    // Mount plate
    this._drawCargoBoxFaces(ctx, g, len * 0.22, wid * 0.42, tall * 0.35, metal, metalDark, '#6a7888');
    // Main housing
    const gH = (a, c, u = 0) => g(a - len * 0.08, c, u + tall * 0.2);
    this._drawCargoBoxFaces(
      ctx,
      gH,
      len * 0.28,
      wid * 0.28,
      tall * 0.55,
      metal,
      metalDark,
      this._cargoMix(metal, accent, 0.3)
    );
    // Emitter barrel along forward
    const b0 = g(-len * 0.05, 0, tall * 0.55);
    const b1 = g(len * 0.48, 0, tall * 0.6);
    ctx.strokeStyle = metalDark;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.stroke();
    // Emitter tip glow
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(b1.x, b1.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#c0f0ff';
    ctx.beginPath();
    ctx.arc(b1.x, b1.y, 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Cooling fins
    for (let i = -1; i <= 1; i++) {
      const f0 = g(-len * 0.2, i * wid * 0.35, tall * 0.35);
      const f1 = g(-len * 0.38, i * wid * 0.4, tall * 0.7);
      ctx.strokeStyle = '#8a9aa8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /** Ball turret — cupola on ring base with twin barrels. */
  _drawCargoTurret(ctx, item, g, len, wid, tall) {
    const accent = item.color || '#708898';
    const metal = '#4a5560';
    const metalDark = '#1e2830';
    // Ring base
    const base = g(0, 0, 0);
    ctx.fillStyle = metalDark;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + 1, len * 0.38, wid * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, len * 0.34, wid * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // Cupola
    const cup = g(0, 0, tall * 0.55);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(cup.x, cup.y, len * 0.22, wid * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = metalDark;
    ctx.beginPath();
    ctx.ellipse(cup.x, cup.y - tall * 0.08, len * 0.14, wid * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Twin barrels forward
    for (const ac of [-wid * 0.12, wid * 0.12]) {
      const t0 = g(len * 0.05, ac, tall * 0.5);
      const t1 = g(len * 0.48, ac * 0.6, tall * 0.55);
      ctx.strokeStyle = '#2a343c';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.stroke();
      ctx.fillStyle = '#8a9aa8';
      ctx.beginPath();
      ctx.arc(t1.x, t1.y, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  /** Armor plate panel — layered shield segment. */
  _drawCargoArmor(ctx, item, g, len, wid, tall) {
    const accent = item.color || '#6a7888';
    const metalDark = '#2a343c';
    // Sloped plate footprint
    const p0 = g(-len * 0.4, -wid * 0.4, tall * 0.15);
    const p1 = g(len * 0.42, -wid * 0.35, tall * 0.25);
    const p2 = g(len * 0.38, wid * 0.4, tall * 0.2);
    const p3 = g(-len * 0.42, wid * 0.38, tall * 0.12);
    const t0 = g(-len * 0.38, -wid * 0.35, tall * 0.85);
    const t1 = g(len * 0.4, -wid * 0.3, tall * 0.95);
    const t2 = g(len * 0.35, wid * 0.35, tall * 0.9);
    const t3 = g(-len * 0.4, wid * 0.32, tall * 0.8);
    // Far/near faces
    const faces = [
      [p0, p1, t1, t0],
      [p1, p2, t2, t1],
      [p2, p3, t3, t2],
      [p3, p0, t0, t3],
    ].sort(
      (a, b) =>
        (a[0].y + a[1].y + a[2].y + a[3].y) / 4 -
        (b[0].y + b[1].y + b[2].y + b[3].y) / 4
    );
    for (let i = 0; i < faces.length; i++) {
      const [a, b2, c, d] = faces[i];
      ctx.fillStyle = i < 2 ? metalDark : accent;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = this._cargoMix(accent, '#c0d0e0', 0.25);
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t3.x, t3.y);
    ctx.closePath();
    ctx.fill();
    // Rivet row
    for (let i = -2; i <= 2; i++) {
      const r = g(i * len * 0.12, 0, tall * 0.9);
      ctx.fillStyle = '#c9a020';
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Maneuver thruster — mount flange + nozzle bell. */
  _drawCargoThruster(ctx, item, g, len, wid, tall) {
    const accent = item.color || '#5a8aaa';
    const metal = '#4a5868';
    const metalDark = '#1a2430';
    // Flange / mount
    this._drawCargoBoxFaces(ctx, g, len * 0.28, wid * 0.35, tall * 0.4, metal, metalDark, '#6a7888');
    // Nozzle body along +along (exhaust aft = -along visually: use +along as nozzle mouth)
    const n0 = g(-len * 0.05, 0, tall * 0.45);
    const n1 = g(len * 0.42, 0, tall * 0.35);
    ctx.strokeStyle = metalDark;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(n0.x, n0.y);
    ctx.lineTo(n1.x, n1.y);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(n0.x, n0.y);
    ctx.lineTo(n1.x, n1.y);
    ctx.stroke();
    // Bell flare at mouth
    ctx.fillStyle = metalDark;
    ctx.beginPath();
    ctx.ellipse(n1.x, n1.y, 3.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Throat glow
    ctx.fillStyle = 'rgba(120, 200, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(n1.x, n1.y, 1.6, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Feed lines
    for (const ac of [-wid * 0.25, wid * 0.25]) {
      const f0 = g(-len * 0.2, ac, tall * 0.55);
      const f1 = g(len * 0.1, ac * 0.4, tall * 0.4);
      ctx.strokeStyle = '#8a9aa8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /** Main engine — bulky core + intake + exhaust cluster. */
  _drawCargoEngine(ctx, item, g, len, wid, tall) {
    const accent = item.color || '#c87840';
    const metal = '#4a4848';
    const metalDark = '#221e1c';
    // Core housing
    this._drawCargoBoxFaces(
      ctx,
      g,
      len * 0.32,
      wid * 0.38,
      tall * 0.85,
      metal,
      metalDark,
      this._cargoMix(metal, accent, 0.35)
    );
    // Intake scoop (aft / -along)
    const i0 = g(-len * 0.45, -wid * 0.25, tall * 0.3);
    const i1 = g(-len * 0.45, wid * 0.25, tall * 0.3);
    const i2 = g(-len * 0.45, wid * 0.2, tall * 0.75);
    const i3 = g(-len * 0.45, -wid * 0.2, tall * 0.75);
    ctx.fillStyle = '#0a1018';
    ctx.beginPath();
    ctx.moveTo(i0.x, i0.y);
    ctx.lineTo(i1.x, i1.y);
    ctx.lineTo(i2.x, i2.y);
    ctx.lineTo(i3.x, i3.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Exhaust nozzles forward
    for (const ac of [-wid * 0.22, 0, wid * 0.22]) {
      const e0 = g(len * 0.28, ac, tall * 0.4);
      const e1 = g(len * 0.48, ac, tall * 0.35);
      ctx.strokeStyle = metalDark;
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e0.x, e0.y);
      ctx.lineTo(e1.x, e1.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 160, 60, 0.55)';
      ctx.beginPath();
      ctx.arc(e1.x, e1.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Status light
    const lite = g(0, wid * 0.15, tall * 0.95);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(lite.x, lite.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'butt';
  }

  /** Sensor array — dish on mast / mount. */
  _drawCargoSensor(ctx, item, g, len, wid, tall) {
    const accent = item.color || '#60b090';
    const metal = '#4a5868';
    const metalDark = '#1a2830';
    // Pedestal
    this._drawCargoBoxFaces(ctx, g, len * 0.18, wid * 0.22, tall * 0.45, metal, metalDark, '#6a7888');
    // Mast
    const m0 = g(0, 0, tall * 0.45);
    const m1 = g(0, 0, tall * 0.85);
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m0.x, m0.y);
    ctx.lineTo(m1.x, m1.y);
    ctx.stroke();
    // Dish (tilted ellipse facing forward)
    const dish = g(len * 0.08, 0, tall * 0.9);
    ctx.fillStyle = metalDark;
    ctx.beginPath();
    ctx.ellipse(dish.x, dish.y, len * 0.32, wid * 0.28, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this._cargoMix(accent, '#a0e0c8', 0.2);
    ctx.beginPath();
    ctx.ellipse(dish.x - 0.4, dish.y - 0.3, len * 0.26, wid * 0.22, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(dish.x, dish.y, len * 0.32, wid * 0.28, 0.35, 0, Math.PI * 2);
    ctx.stroke();
    // Feed horn
    const horn = g(len * 0.22, 0, tall * 0.88);
    ctx.fillStyle = '#c8d0d8';
    ctx.beginPath();
    ctx.arc(horn.x, horn.y, 1.3, 0, Math.PI * 2);
    ctx.fill();
    // Side secondary antenna
    const a0 = g(-len * 0.1, wid * 0.25, tall * 0.5);
    const a1 = g(-len * 0.15, wid * 0.4, tall * 1.05);
    ctx.strokeStyle = '#8a9aa8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y);
    ctx.lineTo(a1.x, a1.y);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(a1.x, a1.y, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'butt';
  }

  /** Cheap hex mix for accents. */
  _cargoMix(a, b, t) {
    const parse = (hex) => {
      const h = hex.replace('#', '');
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    };
    try {
      const A = parse(a);
      const B = parse(b);
      const m = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
      return `rgb(${m(0)},${m(1)},${m(2)})`;
    } catch {
      return a;
    }
  }

  /**
   * @param {object} opts
   * @param {boolean} [opts.active] — Dev control highlight (selected ship’s pad)
   * @param {boolean} [opts.occupied]
   * @param {number} [opts.angle]
   * @param {boolean} [opts.skipShadow]
   * @param {string} [opts.rimMode]
   */
  _drawDockPad(ctx, cx, cy, label, opts = {}) {
    const active = !!opts.active;
    const angle = opts.angle ?? SHIP.SPAWN_ANGLE;
    const skipShadow = !!opts.skipShadow;
    const rimMode = opts.rimMode || 'off';
    ctx.save();
    ctx.translate(cx, cy);

    // Soft contact shadow (2.5D) — skip while sunk in the shaft
    if (!skipShadow) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 4, BAY.PAD_R + 2, BAY.PAD_R * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.rotate(angle);

    ctx.fillStyle = active ? '#10161c' : '#141a22';
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R, 0, Math.PI * 2);
    ctx.fill();

    // Concentric wear rings
    ctx.strokeStyle = active ? 'rgba(50, 80, 100, 0.35)' : 'rgba(40, 60, 75, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R * 0.32, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = active ? 'rgba(90, 140, 170, 0.5)' : 'rgba(60, 90, 110, 0.38)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, BAY.PAD_R, 0, Math.PI * 2);
    ctx.stroke();

    // Outer rim: 6 dark separators + 6 yellow caution lights
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x0 = Math.cos(a) * (BAY.PAD_R - 1);
      const y0 = Math.sin(a) * (BAY.PAD_R - 1);
      const x1 = Math.cos(a) * (BAY.PAD_R + 2.5);
      const y1 = Math.sin(a) * (BAY.PAD_R + 2.5);
      if (i % 2 === 0) {
        ctx.strokeStyle = 'rgba(20, 20, 16, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        continue;
      }
      let lit = 0.2;
      if (rimMode === 'on') lit = 0.95;
      else if (rimMode === 'flash') {
        lit = Math.sin(this.time * 10 + i) > 0 ? 0.95 : 0.14;
      }
      ctx.strokeStyle = `rgba(201, 160, 32, ${0.3 + lit * 0.7})`;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (lit > 0.45) {
        const mx = (x0 + x1) * 0.5;
        const my = (y0 + y1) * 0.5;
        ctx.fillStyle = `rgba(255, 220, 80, ${(lit - 0.45) * 0.55})`;
        ctx.beginPath();
        ctx.ellipse(mx, my, 4.5, 3.2, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.lineCap = 'butt';

    // Nose chevron — reads turntable facing (local +X = pad forward)
    ctx.fillStyle = active
      ? 'rgba(100, 180, 255, 0.55)'
      : 'rgba(120, 140, 160, 0.28)';
    ctx.beginPath();
    ctx.moveTo(BAY.PAD_R * 0.72, 0);
    ctx.lineTo(BAY.PAD_R * 0.42, -5);
    ctx.lineTo(BAY.PAD_R * 0.42, 5);
    ctx.closePath();
    ctx.fill();

    if (active) {
      const pulse = 0.04 + 0.03 * Math.sin(this.time * 2.2);
      ctx.fillStyle = `rgba(70, 160, 200, ${pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Un-rotate for upright bay label
    ctx.rotate(-angle);

    ctx.fillStyle = active
      ? 'rgba(100, 180, 255, 0.45)'
      : 'rgba(120, 140, 160, 0.35)';
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, BAY.PAD_R + 9);

    ctx.restore();
  }

  _drawVisitor(ctx, pad) {
    const drop = pad.padDrop || 0;
    const south = drop * 52;
    const sc = (1 - drop * 0.42) * (pad.shipScale || 1);
    const alpha = 1 - drop * 0.8;
    const hover = pad.shipHover || 0;
    const y = (pad.shipY || 0) + south + hover * 2;
    const angle = pad.shipAngle ?? FACE_NORTH;

    // Ground shadow (shrinks / fades as pad descends or ship lifts)
    if (drop < 0.85 && Math.abs(pad.shipY || 0) < 40) {
      ctx.save();
      ctx.translate(pad.x, south + 4 + hover * 5);
      ctx.fillStyle = `rgba(0, 0, 0, ${(0.18 + hover * 0.28) * (1 - drop)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14 + hover * 4, 8 + hover * 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pad.x, y);
    ctx.scale(sc, sc * (1 - drop * 0.1));
    ctx.rotate(angle);

    const def = pad.shipDef || this._ensurePadShipDef(pad);
    if (!def) {
      ctx.restore();
      return;
    }
    const turretAngle =
      typeof pad.turretAngle === 'number' ? pad.turretAngle : angle;
    drawVisitorShip(
      ctx,
      {
        shipDef: def,
        thrusters: pad.thrusters,
        velocity: { x: pad.shipVx || 0, y: pad.shipVy || 0 },
        angle,
        angularVelocity: 0,
        turretAngle,
        miningLaserRelAngle: pad.miningLaserRelAngle || 0,
        miningLaserFiring: !!pad.miningLaserFiring,
        miningLaserBeamLength: pad.miningLaserBeamLength,
        muzzleFlash: pad.muzzleFlash || 0,
        turretRecoil: pad.turretRecoil || 0,
        getTurretLocalAngle: () => turretAngle - angle,
      },
      null,
      hangarShipView(angle)
    );
    ctx.restore();
  }

  /** @deprecated Stairs removed from hangar. */
  _drawStairsLegacy(ctx) {
    for (const s of STAIRS) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(s.x - 12, s.y - 8, 24, 18);
    }
  }

  /**
   * Black/yellow danger-zone running lights: verticals from bay doors → former
   * stair line, plus a horizontal closer. Yellow cells glow by bayLaneMode;
   * incoming/departing chase along the verticals.
   */
  _drawBayDangerLights(ctx) {
    const y0 = -BAY.HALF_H + BAY.DOOR_H + 6;
    const y1 = DANGER_ZONE_SOUTH;
    padCenters().forEach((cx, bay) => {
      const mode = this.bayLaneMode[bay] || 'idle';
      const lane = bayLaneHalf();
      this._drawDangerStripV(ctx, cx - lane, y0, y1, mode);
      this._drawDangerStripV(ctx, cx + lane, y0, y1, mode);
      this._drawDangerStripH(ctx, cx - lane, cx + lane, y1, mode);
    });
  }

  _dangerYellowLit(mode, along, t) {
    if (mode === 'idle') return 0.22;
    if (mode === 'danger') return 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5));
    if (mode === 'elevator') {
      // Steady at arrive/depart peak brightness — no chase / blink
      return 0.95;
    }
    // Chase pulse along strip axis (along increases south / +Y for verticals)
    const period = 36;
    let phase;
    if (mode === 'incoming') {
      // Flow south (doors → pad): bright band moves +along
      phase = ((along + t * 28) % period + period) % period;
    } else if (mode === 'departing') {
      // Flow north (pad → doors)
      phase = ((along - t * 28) % period + period) % period;
    } else {
      return 0.35;
    }
    return phase < 12 ? 0.95 : 0.18;
  }

  _drawDangerStripV(ctx, x, y0, y1, mode) {
    const seg = 7;
    const t = this.time;
    const half = 1.6;
    for (let y = y0, i = 0; y < y1 - 1; y += seg, i++) {
      const h = Math.min(seg, y1 - y);
      if (i % 2 === 1) {
        ctx.fillStyle = '#141410';
        ctx.fillRect(x - half, y, half * 2, h);
        continue;
      }
      const lit = this._dangerYellowLit(mode, y - y0, t);
      ctx.fillStyle = `rgba(201, 160, 32, ${0.35 + lit * 0.65})`;
      ctx.fillRect(x - half, y, half * 2, h);
      if (lit > 0.45) {
        ctx.fillStyle = `rgba(255, 220, 80, ${(lit - 0.45) * 0.45})`;
        ctx.beginPath();
        ctx.ellipse(x, y + h * 0.5, 5.5, h * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawDangerStripH(ctx, x0, x1, y, mode) {
    const seg = 7;
    const t = this.time;
    const half = 1.6;
    for (let x = x0, i = 0; x < x1 - 1; x += seg, i++) {
      const w = Math.min(seg, x1 - x);
      if (i % 2 === 1) {
        ctx.fillStyle = '#141410';
        ctx.fillRect(x, y - half, w, half * 2);
        continue;
      }
      let lit = 0.22;
      if (mode === 'danger' || mode === 'incoming' || mode === 'departing') {
        lit = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5 + x * 0.05));
      } else if (mode === 'elevator') {
        // Match active-mode peak, steady (no pulse)
        lit = 0.9;
      }
      ctx.fillStyle = `rgba(201, 160, 32, ${0.35 + lit * 0.65})`;
      ctx.fillRect(x, y - half, w, half * 2);
      if (lit > 0.45) {
        ctx.fillStyle = `rgba(255, 220, 80, ${(lit - 0.45) * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y, w * 0.7, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Top-down 2D cargo cell on the service board — lid view of a 2.5D hangar crate
   * (body color, accent stripe, latch, scuff). Uses the same CRATE_VARIANTS palette.
   */
  _drawServiceBoardCargoBlock(ctx, x, y, w, h, block) {
    if (w < 0.8 || h < 0.8) return;
    const fill = block?.color || '#6a5538';
    const accent = block?.accent || '#c9a020';
    const fillTop = this._cargoMix(fill, accent, 0.25);
    const fillDark = '#2a2218';

    // Crate body (side bevel peek)
    ctx.fillStyle = fillDark;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.82);

    // Lid top
    ctx.fillStyle = fillTop;
    ctx.fillRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.72);

    // Corner rim
    ctx.strokeStyle = 'rgba(20, 12, 6, 0.45)';
    ctx.lineWidth = Math.max(0.35, Math.min(w, h) * 0.08);
    ctx.strokeRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.78);

    // Hazard / stencil stripe (matches `_drawCargoCrate` lid stripe)
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(0.45, Math.min(w, h) * 0.14);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.18, y + h * 0.58);
    ctx.lineTo(x + w * 0.82, y + h * 0.42);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Latch nub
    const lw = Math.max(0.6, w * 0.22);
    const lh = Math.max(0.35, h * 0.12);
    ctx.fillStyle = '#8a9aa8';
    ctx.fillRect(x + w * 0.5 - lw * 0.5, y + h * 0.2, lw, lh);

    // Scuff
    ctx.fillStyle = 'rgba(20, 12, 6, 0.28)';
    ctx.fillRect(x + w * 0.22, y + h * 0.62, w * 0.32, h * 0.16);
  }

  /**
   * Per-bay pad status boards — fixed northern lip; height grows south into apron.
   * Columns: ship stats | cargo grid | service checklist + bay footer.
   */
  _drawServiceDisplayBoards(ctx) {
    const top = SERVICE_BOARD_TOP;
    const hw = BACKSPLASH_HALF_W;
    const wallH = SERVICE_BOARD_H;
    const bottom = SERVICE_BOARD_BOTTOM;
    const colorMap = {
      green: '#3ce070',
      blue: '#4aa8ff',
      yellow: '#e8c040',
      red: '#ff5048',
      grey: '#8a9098',
      dim: '#6a7888',
      white: '#d0dce8',
    };

    padCenters().forEach((cx, bay) => {
      const x0 = cx - hw;
      const w = hw * 2;
      const faceY = top;
      const pad = this._servicePad(bay);
      const hasShip = this._bayHasShip(bay);
      const st = hasShip ? pad?.shipState : null;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(x0 - 1, bottom + 2, w + 2, 5);

      ctx.fillStyle = '#1a2228';
      ctx.fillRect(x0, bottom - 4, w, 8);
      ctx.fillStyle = '#0a1014';
      ctx.fillRect(x0, faceY, w, wallH - 2);
      ctx.fillStyle = 'rgba(120, 150, 170, 0.25)';
      ctx.fillRect(x0, faceY, w, 2);
      ctx.fillStyle = 'rgba(40, 50, 60, 0.5)';
      ctx.fillRect(x0, bottom - 4, w, 2);
      ctx.strokeStyle = '#5a7080';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0, faceY, w, wallH + 2);

      ctx.fillStyle = '#2a3848';
      ctx.fillRect(x0 - 2, faceY - 1, 4, wallH + 6);
      ctx.fillRect(x0 + w - 2, faceY - 1, 4, wallH + 6);
      ctx.fillStyle = '#c9a020';
      ctx.fillRect(x0 - 2, faceY - 1, 4, 2);
      ctx.fillRect(x0 + w - 2, faceY - 1, 4, 2);

      const padInner = 3;
      const contentX = x0 + padInner;
      const contentW = w - padInner * 2;
      const colGap = 2;
      const colW = (contentW - colGap * 2) / 3;
      const footerH = 7;
      const bodyTop = faceY + 3;
      const bodyBot = bottom - footerH - 2;
      const bodyH = bodyBot - bodyTop;

      const col0 = contentX;
      const col1 = contentX + colW + colGap;
      const col2 = contentX + (colW + colGap) * 2;

      ctx.strokeStyle = 'rgba(80, 120, 150, 0.45)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(col1 - colGap / 2, bodyTop);
      ctx.lineTo(col1 - colGap / 2, bodyBot);
      ctx.moveTo(col2 - colGap / 2, bodyTop);
      ctx.lineTo(col2 - colGap / 2, bodyBot);
      ctx.stroke();

      const svc = pad?.service;
      const reveal = svc?.phase === 'boardReveal' ? svc.reveal : null;
      const statsShown =
        !hasShip || !st
          ? 0
          : reveal && reveal.stage !== 'done'
            ? reveal.statsShown | 0
            : 4;
      const cargoRevealOn =
        !reveal || reveal.stage === 'done' || reveal.cargoOn || reveal.stage === 'cargo';
      const cargoProgress =
        !reveal || reveal.stage === 'done' ? 1 : Math.max(0, reveal.cargoProgress || 0);

      ctx.fillStyle = colorMap.white;
      ctx.font = '3.2px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('SHIP STATS', col0 + 1, bodyTop + 4);

      const statRows = hasShip && st
        ? [
            { label: `Hull (Mk.${st.hullMk ?? 1})`, v: st.hull },
            { label: `Fuel (Mk.${st.fuelMk ?? 1})`, v: st.fuel },
            { label: `Bullets (Mk.${st.bulletsMk ?? 1})`, v: st.bullets ?? st.ammo },
            { label: `Shells (Mk.${st.shellsMk ?? 1})`, v: st.shells ?? st.ammo },
          ]
        : [
            { label: 'Hull', v: null },
            { label: 'Fuel', v: null },
            { label: 'Bullets', v: null },
            { label: 'Shells', v: null },
          ];
      statRows.forEach((row, ri) => {
        const ty = bodyTop + 10 + ri * 5.5;
        if (ri >= statsShown || row.v == null) {
          ctx.fillStyle = colorMap.dim;
          ctx.font = '3.1px monospace';
          ctx.fillText(`${row.label}: --`, col0 + 1, ty);
        } else {
          const pct = Math.round(row.v * 100);
          ctx.fillStyle = colorMap[statColorForPct(row.v)] || colorMap.dim;
          ctx.font = '3.1px monospace';
          ctx.fillText(`${row.label}: ${pct}%`, col0 + 1, ty);
        }
      });

      const hold = st?.cargoHold;
      const cargoMk = st?.cargoMk ?? 0;
      if (!hasShip || !st) {
        ctx.fillStyle = colorMap.dim;
        ctx.font = '3.2px monospace';
        ctx.fillText('CARGO', col1 + 1, bodyTop + 4);
        ctx.fillText('--', col1 + 1, bodyTop + 12);
      } else if (!cargoRevealOn) {
        ctx.fillStyle = colorMap.dim;
        ctx.font = '3.2px monospace';
        ctx.fillText('CARGO', col1 + 1, bodyTop + 4);
        ctx.fillText('--', col1 + 1, bodyTop + 12);
      } else if (!cargoMk || !hold?.slots) {
        ctx.fillStyle = colorMap.white;
        ctx.font = '3.2px monospace';
        ctx.fillText('CARGO', col1 + 1, bodyTop + 4);
        ctx.fillStyle = colorMap.dim;
        ctx.font = '3px monospace';
        ctx.fillText('NO CARGO BAY', col1 + 1, bodyTop + 14);
      } else {
        const freePct = Math.round((st.cargoSpace ?? 0) * 100);
        ctx.fillStyle = colorMap.white;
        ctx.font = '3.2px monospace';
        ctx.fillText(`CARGO (Mk.${cargoMk})`, col1 + 1, bodyTop + 4);
        if (cargoProgress >= 0.25) {
          ctx.font = '2.8px monospace';
          ctx.fillStyle = '#a8b8c8';
          ctx.fillText(`Room: ${freePct}% (${hold.slots} Slots)`, col1 + 1, bodyTop + 9);
        }

        const gridTop = bodyTop + 12;
        const gridBot = bodyBot - 1;
        const gridH = Math.max(8, gridBot - gridTop);
        const gridW = colW - 2;
        const cell = Math.min(gridW / hold.cols, gridH / hold.rows);
        const gw = cell * hold.cols;
        const gh = cell * hold.rows;
        const gx = col1 + (colW - gw) / 2;
        const gy = gridTop + (gridH - gh) / 2;

        if (cargoProgress >= 0.35) {
          ctx.strokeStyle = 'rgba(100, 120, 140, 0.55)';
          ctx.lineWidth = 0.5;
          for (let r = 0; r < hold.rows; r++) {
            for (let c = 0; c < hold.cols; c++) {
              ctx.strokeRect(gx + c * cell, gy + r * cell, cell - 0.4, cell - 0.4);
            }
          }
        }
        const blocks = hold.cells || [];
        const showN = Math.floor(blocks.length * cargoProgress);
        for (let bi = 0; bi < showN; bi++) {
          const block = blocks[bi];
          this._drawServiceBoardCargoBlock(
            ctx,
            gx + block.c * cell + 0.25,
            gy + block.r * cell + 0.25,
            (block.w || 1) * cell - 0.7,
            (block.h || 1) * cell - 0.7,
            block
          );
        }
      }

      const hl = this._boardHeaderLight(bay);
      let hc = '80,90,100';
      let hg = 0.15;
      if (hl === 'yellow') {
        hc = '232,192,64';
        hg = 0.7;
      } else if (hl === 'green') {
        hc = '60,224,112';
        hg = 0.75;
      } else if (hl === 'redFlash') {
        hc = '255,60,50';
        hg = Math.sin(this.time * 10 + bay) > 0 ? 0.9 : 0.15;
      }
      ctx.fillStyle = `rgba(${hc}, ${hg})`;
      ctx.beginPath();
      ctx.arc(col2 + 4, bodyTop + 3.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colorMap.white;
      ctx.font = '3.2px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Service', col2 + 8, bodyTop + 4.5);

      const rows = this._boardTaskRows(bay);
      const maxRows = Math.max(1, Math.floor((bodyH - 10) / 4.5));
      // Tight left so ≥5 pips fit; label column locked to widest name
      const circR = 1.2;
      const circGap = 2.85;
      const checkW = 3.2;
      const rowFont = '3px monospace';
      ctx.font = rowFont;
      const labelColW = ctx.measureText(SERVICE_BOARD_LABEL_WIDEST).width;
      const nameX = col2 + checkW;
      const circStart = nameX + labelColW + 1.1;

      rows.slice(0, maxRows).forEach((row, ri) => {
        const ty = bodyTop + 11 + ri * 4.5;
        ctx.font = rowFont;
        ctx.textAlign = 'left';

        if (!row.units?.length) {
          ctx.fillStyle = colorMap[row.color] || colorMap.dim;
          ctx.fillText(row.label, col2 + 1, ty);
          return;
        }

        if (row.complete) {
          ctx.fillStyle = colorMap.green;
          ctx.fillText('✓', col2 + 0.4, ty);
        }

        ctx.fillStyle = row.complete ? colorMap.green : colorMap.white;
        ctx.fillText(`${row.label}:`, nameX, ty);

        const cy = ty - 1.0;
        const n = Math.min(row.units.length, SERVICE_BOARD_PIPS_PER_ROW);
        for (let i = 0; i < n; i++) {
          const u = row.units[i];
          const cxDot = circStart + circR + i * circGap;
          ctx.fillStyle = colorMap[u.color] || colorMap.dim;
          ctx.beginPath();
          ctx.arc(cxDot, cy, circR, 0, Math.PI * 2);
          ctx.fill();
          if (u.color === 'grey' || u.color === 'yellow') {
            ctx.strokeStyle = 'rgba(180, 200, 220, 0.35)';
            ctx.lineWidth = 0.4;
            ctx.stroke();
          }
        }
      });

      // Corner ship-scanners are permanent board hardware (glow while scanning)
      const scanAmp =
        hasShip && this._padBoardScanActive(pad) ? this._padBoardScanAmp(pad) : 0;
      this._drawBoardScannerPod(ctx, x0 + 3.5, faceY - 1.5, scanAmp, bay, 0);
      this._drawBoardScannerPod(ctx, x0 + w - 3.5, faceY - 1.5, scanAmp, bay, 1);

      ctx.fillStyle = '#c98020';
      ctx.font = 'bold 5.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bayLabels()[bay], cx, bottom - 2);
    });
  }

  /**
   * Small sensor head on the board's top corner — dormant steel, green when live.
   * @param {number} side 0=left 1=right
   */
  _drawBoardScannerPod(ctx, x, y, intensity, bay, side) {
    const on = intensity > 0.02;
    const pulse = on
      ? 0.72 + 0.28 * Math.sin(this.time * 14 + bay * 1.7 + side * 2.1)
      : 0;
    const glow = intensity * pulse;

    // Stem into board lip
    ctx.fillStyle = '#1c2830';
    ctx.fillRect(x - 1.2, y, 2.4, 3.2);
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(x - 2.2, y - 1.6, 4.4, 2.8);

    // Lens / emitter
    ctx.beginPath();
    ctx.arc(x, y - 2.4, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = on ? `rgba(40, 90, 60, ${0.55 + glow * 0.35})` : '#243038';
    ctx.fill();
    ctx.strokeStyle = on ? `rgba(90, 220, 140, ${0.35 + glow * 0.5})` : '#4a6070';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    if (on) {
      ctx.beginPath();
      ctx.arc(x, y - 2.4, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120, 255, 170, ${0.45 + glow * 0.5})`;
      ctx.fill();
      // Soft corona
      ctx.beginPath();
      ctx.arc(x, y - 2.4, 3.6 + glow * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(60, 220, 120, ${0.08 + glow * 0.14})`;
      ctx.fill();
    }
  }

  /** World pose + loose hull box for ship-scan beams. */
  _shipScanTarget(bay) {
    if (!this._bayHasShip(bay)) return null;
    const pad = this._servicePad(bay);
    const cx = padCenters()[bay] ?? 0;
    let sy = 0;
    let angle = FACE_NORTH;
    let def = pad?.shipDef || null;
    if (this.isPlayerBay(bay) && this._playerShip) {
      const ship = this._playerShip;
      sy = ship.position?.y ?? 0;
      angle = typeof ship.angle === 'number' ? ship.angle : FACE_NORTH;
      def = ship.shipDef || def;
    } else if (pad) {
      sy = pad.shipY || 0;
      angle = pad.shipAngle ?? FACE_NORTH;
      def = def || this._ensurePadShipDef(pad);
    }
    const ext = def?.hullExtents?.();
    const halfLen = Math.max(16, ((ext?.forward || 22) + (ext?.aft || 20)) * 0.52);
    const halfBeam = Math.max(10, halfLen * 0.42);
    return { cx, cy: sy, angle, halfLen, halfBeam };
  }

  /**
   * Green scan lines from board-corner scanners sweeping the pad ship.
   * Drawn after hulls so beams read on top of paint.
   */
  _drawShipBoardScans(ctx) {
    padCenters().forEach((cx, bay) => {
      const pad = this._servicePad(bay);
      if (!this._padBoardScanActive(pad)) return;
      const amp = this._padBoardScanAmp(pad);
      if (amp < 0.02) return;
      const target = this._shipScanTarget(bay);
      if (!target) return;

      const boardX0 = cx - BACKSPLASH_HALF_W;
      const boardW = BACKSPLASH_HALF_W * 2;
      const faceY = SERVICE_BOARD_TOP;
      const emitters = [
        { x: boardX0 + 3.5, y: faceY - 3.8, side: 0 },
        { x: boardX0 + boardW - 3.5, y: faceY - 3.8, side: 1 },
      ];
      const scanT = this._padBoardScanClock(pad);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Raster bar: sweeps nose↔aft across the hull (barcode-reader feel)
      const rasterU = pingPong01(scanT * 1.15);
      const c = Math.cos(target.angle);
      const s = Math.sin(target.angle);
      // Ship local +X is forward; hangar nose is typically north (−Y world when angle=SPAWN)
      const along = (rasterU * 2 - 1) * target.halfLen;
      const rx = target.cx + c * along;
      const ry = target.cy + s * along;
      const bx = -s * target.halfBeam * 1.15;
      const by = c * target.halfBeam * 1.15;
      this._strokeScanSegment(
        ctx,
        rx - bx,
        ry - by,
        rx + bx,
        ry + by,
        amp * 0.85,
        2.4
      );
      this._strokeScanSegment(
        ctx,
        rx - bx,
        ry - by,
        rx + bx,
        ry + by,
        amp,
        0.85
      );

      // Ghost trailing rasters
      for (const trail of [-0.12, 0.12]) {
        const u2 = pingPong01(scanT * 1.15 + trail);
        const along2 = (u2 * 2 - 1) * target.halfLen;
        const rx2 = target.cx + c * along2;
        const ry2 = target.cy + s * along2;
        this._strokeScanSegment(
          ctx,
          rx2 - bx,
          ry2 - by,
          rx2 + bx,
          ry2 + by,
          amp * 0.28,
          1.4
        );
      }

      // Corner lasers ping-pong aim points across the hull
      for (const em of emitters) {
        const phase = em.side * 0.5;
        for (let k = 0; k < 3; k++) {
          const u = pingPong01(scanT * (1.35 + k * 0.17) + phase + k * 0.22);
          const v = pingPong01(scanT * (0.9 + k * 0.11) + phase * 1.3 + 0.4);
          // Aim in ship-local frame, then to world
          const lx = (u * 2 - 1) * target.halfLen * 0.95;
          const ly = (v * 2 - 1) * target.halfBeam * 0.9;
          const ax = target.cx + c * lx - s * ly;
          const ay = target.cy + s * lx + c * ly;
          // Overshoot slightly past the aim so lines rake the silhouette
          const dx = ax - em.x;
          const dy = ay - em.y;
          const len = Math.hypot(dx, dy) || 1;
          const ox = ax + (dx / len) * 6;
          const oy = ay + (dy / len) * 6;
          const beamAmp = amp * (0.55 + 0.2 * (1 - k * 0.25));
          this._strokeScanSegment(ctx, em.x, em.y, ox, oy, beamAmp * 0.45, 2.8);
          this._strokeScanSegment(ctx, em.x, em.y, ox, oy, beamAmp, 0.7);
          // Contact spark on hull
          ctx.beginPath();
          ctx.arc(ax, ay, 1.2 + amp * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(160, 255, 200, ${0.15 * beamAmp})`;
          ctx.fill();
        }
      }

      ctx.restore();
    });
  }

  _strokeScanSegment(ctx, x0, y0, x1, y1, amp, width) {
    if (amp < 0.02) return;
    ctx.strokeStyle = `rgba(70, 230, 130, ${0.22 * amp})`;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = `rgba(180, 255, 210, ${0.35 * amp})`;
    ctx.lineWidth = Math.max(0.45, width * 0.28);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  _drawForkliftHub(ctx) {
    const y = FORKLIFT_HUB_Y;
    const hw = FORKLIFT_HUB_HALF_W;
    const padH = FORKLIFT_PARK_SPOT_H + 14;
    const x0 = -hw;
    const y0 = y - padH / 2;

    // Worn deck patch — no individual stall marks (logic still uses FORKLIFT_PARKS)
    ctx.fillStyle = 'rgba(36, 44, 52, 0.62)';
    ctx.fillRect(x0, y0, FORKLIFT_HUB_W, padH);
    ctx.fillStyle = 'rgba(18, 14, 8, 0.12)';
    ctx.beginPath();
    ctx.ellipse(-hw * 0.35, y + 2, 40, 8, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hw * 0.4, y - 3, 28, 6, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Same dashed yellow paint as the roadway — skip the north edge (road already has it)
    ctx.strokeStyle = 'rgba(200, 160, 40, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, y0 + padH);
    ctx.lineTo(x0 + FORKLIFT_HUB_W, y0 + padH);
    ctx.lineTo(x0 + FORKLIFT_HUB_W, y0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Faded industrial stencils — a few placements, not a clean title
    const stencils = [
      { text: 'FORKLIFT PARKING', x: -hw * 0.55, y: y - 4, rot: -0.04, size: 4.2 },
      { text: 'FORKLIFT ONLY', x: hw * 0.2, y: y + 5, rot: 0.03, size: 3.6 },
      { text: 'CREW VEHICLES', x: hw * 0.55, y: y - 6, rot: -0.02, size: 3.2 },
      { text: 'PARK HERE', x: -hw * 0.15, y: y + 7, rot: 0.05, size: 3.4 },
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of stencils) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = 'rgba(201, 160, 32, 0.22)';
      ctx.font = `bold ${s.size}px sans-serif`;
      ctx.fillText(s.text, 0.6, 0.5);
      ctx.fillStyle = 'rgba(160, 150, 110, 0.38)';
      ctx.fillText(s.text, 0, 0);
      ctx.restore();
    }
    // Chargers / tire racks / cones live in FORKLIFT_YARD_PROPS (2.5D set dressing)
  }

  /**
   * Manned cab on the trolley — worn industrial booth; operator watches the job target.
   */
  _drawCraneCabin(ctx, c, tx, by) {
    const op = c.operator || CRANE_CREW;
    const lev = c.levers || { travel: 0, hoist: 0, grip: 0 };
    const cabX = tx + 13;
    const cabY = by;
    const w = 15;
    const h = 13;

    // Cab shadow on bridge
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cabX, cabY + h / 2 + 2, w * 0.55, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cab body — 2.5D shell
    ctx.fillStyle = '#1a2834';
    ctx.fillRect(cabX - w / 2, cabY - h / 2 + 2, w, h - 2);
    ctx.fillStyle = CRANE_CREW.suitDark;
    ctx.fillRect(cabX - w / 2, cabY - h / 2 + 2, 3, h - 2);
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(cabX - w / 2, cabY - h / 2, w, h);
    ctx.fillStyle = '#4a5a68';
    ctx.fillRect(cabX - w / 2, cabY - h / 2, w, 2.5);
    ctx.strokeStyle = '#9aacbc';
    ctx.lineWidth = 1;
    ctx.strokeRect(cabX - w / 2, cabY - h / 2, w, h);
    // Hazard stripe on roof
    ctx.fillStyle = CRANE_CREW.stripe;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(cabX - w / 2 + 1, cabY - h / 2 + 0.4, w - 2, 1.4);
    ctx.globalAlpha = 1;
    // Wear scuff
    ctx.fillStyle = 'rgba(20, 12, 6, 0.3)';
    ctx.fillRect(cabX + 2, cabY - 1, 4, 5);

    // Glass viewport
    ctx.fillStyle = 'rgba(50, 110, 150, 0.38)';
    ctx.strokeStyle = 'rgba(160, 200, 220, 0.55)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.rect(cabX - 5.8, cabY - 4.8, 11.6, 7);
    ctx.fill();
    ctx.stroke();

    // Operator body (seated)
    const headX = cabX;
    const headY = cabY - 3.0;
    ctx.fillStyle = op.suit || CRANE_CREW.suit;
    ctx.fillRect(cabX - 2.4, cabY - 1.2, 4.8, 4.5);
    ctx.fillStyle = CRANE_CREW.stripe;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(cabX - 2.4, cabY - 0.2, 4.8, 1.1);
    ctx.globalAlpha = 1;

    // Head — 8-dir look at current task destination; helmet + distinct facemask
    const oct = this._crewVisOctant(op);
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const faceCam = fy; // +Y south / toward camera → full mask

    // Helmet shell
    ctx.fillStyle = op.helmet || CRANE_CREW.helmet;
    ctx.beginPath();
    ctx.arc(headX, headY, 2.35, 0, Math.PI * 2);
    ctx.fill();
    // Helmet rim wear
    ctx.strokeStyle = 'rgba(40, 28, 16, 0.4)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.arc(headX, headY, 2.35, 0.35, Math.PI * 1.15);
    ctx.stroke();
    // Brow stripe
    ctx.strokeStyle = CRANE_CREW.stripe;
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.moveTo(headX - 1.6, headY - 1.55);
    ctx.lineTo(headX + 1.6, headY - 1.55);
    ctx.stroke();

    // Facemask — dark plate offset toward look dir (hidden when facing fully away)
    if (faceCam > -0.55) {
      const maskScale = 0.55 + 0.45 * Math.max(0, Math.min(1, (faceCam + 0.55) / 1.55));
      const mx = headX + fx * (1.15 * maskScale);
      const my = headY + fy * (0.95 * maskScale);
      const mask = op.mask || CRANE_CREW.mask;
      // Mask body
      ctx.fillStyle = mask;
      ctx.beginPath();
      ctx.ellipse(mx, my, 1.55 * maskScale, 1.4 * maskScale, heading, 0, Math.PI * 2);
      ctx.fill();
      // Mask rim (metal lip — reads separate from helmet)
      ctx.strokeStyle = CRANE_CREW.maskRim;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(mx, my, 1.55 * maskScale, 1.4 * maskScale, heading, 0, Math.PI * 2);
      ctx.stroke();
      // Visor glass inset in the mask
      ctx.fillStyle = CRANE_CREW.visor;
      ctx.beginPath();
      ctx.ellipse(
        mx + fx * 0.2,
        my + fy * 0.15,
        1.05 * maskScale,
        0.78 * maskScale,
        heading,
        0,
        Math.PI * 2
      );
      ctx.fill();
      // Cheek vents (mask detail, not helmet)
      ctx.fillStyle = 'rgba(120, 140, 160, 0.35)';
      const rx = -fy;
      const ry = fx;
      ctx.fillRect(mx + rx * 0.95 * maskScale - 0.35, my + ry * 0.95 * maskScale - 0.5, 0.7, 1.0);
      ctx.fillRect(mx - rx * 0.95 * maskScale - 0.35, my - ry * 0.95 * maskScale - 0.5, 0.7, 1.0);
    } else {
      // Back of helmet when looking north
      ctx.fillStyle = 'rgba(40, 32, 24, 0.35)';
      ctx.beginPath();
      ctx.arc(headX + fx * 0.4, headY + fy * 0.4, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Console shelf
    ctx.fillStyle = '#141c26';
    ctx.fillRect(cabX - 5.5, cabY + 2.4, 11, 2.6);
    ctx.strokeStyle = '#6a7a88';
    ctx.lineWidth = 0.65;
    ctx.strokeRect(cabX - 5.5, cabY + 2.4, 11, 2.6);

    // Three levers: XY travel · hoist up/down · claw open/close
    const baseY = cabY + 2.65;
    const levers = [
      { x: cabX - 3.4, t: lev.travel, color: '#c8a050', label: 'XY' },
      { x: cabX, t: lev.hoist, color: '#70b0d0', label: 'Z' },
      { x: cabX + 3.4, t: lev.grip, color: '#d08070', label: 'C' },
    ];
    for (const L of levers) {
      const throwAmt = Math.max(-1, Math.min(1, L.t || 0));
      const a = throwAmt * 0.72;
      const tipX = L.x + Math.sin(a) * 3.6;
      const tipY = baseY - Math.cos(a) * 3.6;
      // Gate slot
      ctx.strokeStyle = 'rgba(90, 100, 110, 0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(L.x - Math.sin(0.72) * 1.6, baseY - Math.cos(0.72) * 1.6);
      ctx.lineTo(L.x + Math.sin(0.72) * 1.6, baseY - Math.cos(0.72) * 1.6);
      ctx.stroke();
      // Stick
      ctx.strokeStyle = '#c8d0d8';
      ctx.lineWidth = 1.35;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(L.x, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      // Knob
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // Pivot
      ctx.fillStyle = '#3a4450';
      ctx.beginPath();
      ctx.arc(L.x, baseY, 1.05, 0, Math.PI * 2);
      ctx.fill();
      // Tiny legend on console
      ctx.fillStyle = 'rgba(180, 190, 200, 0.55)';
      ctx.font = '4px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(L.label, L.x, baseY + 3.6);
    }
    ctx.lineCap = 'butt';
    ctx.textAlign = 'left';
  }

  _drawOverhead(ctx) {
    const c = this.crane;
    const [rx0, rx1] = RUNWAY_X;

    // Runway rails
    ctx.strokeStyle = 'rgba(90, 120, 140, 0.75)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rx0, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx0, BRIDGE_Y_MAX + 8);
    ctx.moveTo(rx1, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx1, BRIDGE_Y_MAX + 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160, 180, 200, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rx0 - 1.5, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx0 - 1.5, BRIDGE_Y_MAX + 8);
    ctx.moveTo(rx1 + 1.5, BRIDGE_Y_MIN - 8);
    ctx.lineTo(rx1 + 1.5, BRIDGE_Y_MAX + 8);
    ctx.stroke();

    // Runway structural ties
    ctx.strokeStyle = 'rgba(70, 95, 115, 0.45)';
    ctx.lineWidth = 2;
    for (let y = BRIDGE_Y_MIN; y <= BRIDGE_Y_MAX; y += 48) {
      ctx.beginPath();
      ctx.moveTo(rx0 - 7, y);
      ctx.lineTo(rx0 + 7, y);
      ctx.moveTo(rx1 - 7, y);
      ctx.lineTo(rx1 + 7, y);
      ctx.stroke();
    }

    if (!c) return;

    const by = c.bridgeY;
    const tx = c.trolleyX;
    const hoist = c.hoist;
    const hook = this._craneHookPos();

    // Bridge beam — thicker 2.5D girder
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(rx0 - 3, by - 1, rx1 - rx0 + 6, 5);
    ctx.fillStyle = '#5a6a78';
    ctx.fillRect(rx0 - 3, by - 3.5, rx1 - rx0 + 6, 5);
    ctx.fillStyle = '#4a5a68';
    ctx.fillRect(rx0 - 3, by - 3.5, rx1 - rx0 + 6, 2);
    ctx.strokeStyle = '#9aacbc';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx0 - 3, by - 3.5, rx1 - rx0 + 6, 7);
    // Hazard dashes along near lip
    ctx.fillStyle = 'rgba(201, 160, 32, 0.4)';
    for (let x = rx0 + 8; x < rx1 - 8; x += 22) {
      ctx.fillRect(x, by + 2.2, 10, 1.2);
    }

    // End trucks
    for (const rx of [rx0, rx1]) {
      ctx.fillStyle = '#1a2430';
      ctx.fillRect(rx - 5, by - 2, 10, 9);
      ctx.fillStyle = '#6a7888';
      ctx.fillRect(rx - 5, by - 6, 10, 10);
      ctx.strokeStyle = '#b0c0d0';
      ctx.lineWidth = 0.85;
      ctx.strokeRect(rx - 5, by - 6, 10, 10);
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.arc(rx - 2.5, by + 4, 2, 0, Math.PI * 2);
      ctx.arc(rx + 2.5, by + 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trolley carriage
    ctx.fillStyle = '#1a2430';
    ctx.fillRect(tx - 9, by - 2, 18, 9);
    ctx.fillStyle = '#5a6a78';
    ctx.fillRect(tx - 9, by - 6, 18, 10);
    ctx.fillStyle = '#3a4a58';
    ctx.fillRect(tx - 9, by - 6, 18, 2.5);
    ctx.strokeStyle = '#c0d0e0';
    ctx.lineWidth = 0.95;
    ctx.strokeRect(tx - 9, by - 6, 18, 10);
    ctx.fillStyle = '#2a3848';
    ctx.fillRect(tx - 4, by - 3.5, 8, 6);
    ctx.fillStyle = 'rgba(201, 160, 32, 0.45)';
    ctx.fillRect(tx - 8, by - 5.5, 6, 1.2);

    this._drawCraneCabin(ctx, c, tx, by);

    // Hoist cables
    ctx.strokeStyle = 'rgba(40, 44, 48, 0.75)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tx - 2.5, by + 5);
    ctx.lineTo(hook.x - 2.5, hook.y);
    ctx.moveTo(tx + 2.5, by + 5);
    ctx.lineTo(hook.x + 2.5, hook.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190, 200, 210, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx - 2.5, by + 5);
    ctx.lineTo(hook.x - 2.5, hook.y);
    ctx.moveTo(tx + 2.5, by + 5);
    ctx.lineTo(hook.x + 2.5, hook.y);
    ctx.stroke();

    // Aim shadow on deck
    const aimY = this._craneAimFloorY(c);
    const hoistT = Math.min(1, Math.max(0, hoist / HOIST_MAX));
    const rx = 8.5 + hoistT * 2.5;
    const ry = rx * 0.5;
    const sx = tx;
    const sy = aimY + 2;
    const aCore = 0.34 + hoistT * 0.08;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, ry / rx);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, `rgba(0, 0, 0, ${aCore})`);
    grad.addColorStop(0.5, `rgba(0, 0, 0, ${aCore * 0.55})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const cargoPos = c.carried ? this._craneCargoDrawPos() : null;

    // —— Grabber hand (tip math LOCKED — do not change leftTip/rightTip/midTip/tipY) ——
    const open = c.claw ?? CLAW_OPEN;
    const palmY = hook.y + CLAW_PALM;
    const tipY = hook.y + CLAW_FINGER;
    const leftBase = hook.x - 4;
    const rightBase = hook.x + 4;
    const leftTip = hook.x - (2.2 + open * 5.5);
    const rightTip = hook.x + (2.2 + open * 5.5);
    const midTip = hook.x + (open - 0.5) * 0.8;

    // Wrist block above palm
    ctx.fillStyle = '#3a4550';
    ctx.strokeStyle = '#a8b8c8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hook.x - 5, hook.y - 2);
    ctx.lineTo(hook.x + 5, hook.y - 2);
    ctx.lineTo(hook.x + 4.5, hook.y + 1);
    ctx.lineTo(hook.x - 4.5, hook.y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Palm plate (same footprint as before, slightly thicker face)
    ctx.fillStyle = '#5a6a78';
    ctx.strokeStyle = '#c8d0d8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hook.x - 6, hook.y);
    ctx.lineTo(hook.x + 6, hook.y);
    ctx.lineTo(hook.x + 4, palmY);
    ctx.lineTo(hook.x - 4, palmY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(20, 16, 10, 0.25)';
    ctx.fillRect(hook.x - 3, hook.y + 1, 2, palmY - hook.y - 2);

    // Carried cargo hangs from the fingers (top just above fingertip line)
    if (c.carried && cargoPos) {
      this._drawCargoItem(ctx, c.carried, cargoPos.x, cargoPos.y, 1, c.carried.restHeading ?? 0);
    }

    // Fingers — thicker industrial tines, endpoints unchanged
    ctx.strokeStyle = '#2a343c';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leftBase, palmY);
    ctx.lineTo(leftTip, tipY);
    ctx.moveTo(rightBase, palmY);
    ctx.lineTo(rightTip, tipY);
    ctx.moveTo(hook.x, palmY);
    ctx.lineTo(midTip, tipY + 1);
    ctx.stroke();
    ctx.strokeStyle = '#c8d0d8';
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.moveTo(leftBase, palmY);
    ctx.lineTo(leftTip, tipY);
    ctx.moveTo(rightBase, palmY);
    ctx.lineTo(rightTip, tipY);
    ctx.moveTo(hook.x, palmY);
    ctx.lineTo(midTip, tipY + 1);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Fingertip pads — exact tip locations
    ctx.fillStyle = '#8a9aa8';
    for (const [fx, fy] of [
      [leftTip, tipY],
      [rightTip, tipY],
      [midTip, tipY + 1],
    ]) {
      ctx.beginPath();
      ctx.arc(fx, fy, 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d0d8e0';
      ctx.beginPath();
      ctx.arc(fx, fy, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a9aa8';
    }
  }

  _drawMechanic(ctx, npc) {
    const theme =
      npc.theme ||
      MECH_BAY_THEMES[npc.homeBay ?? 0] ||
      MECH_BAY_THEMES[0];
    const weldingWork =
      npc.state === 'workWeld' ||
      (npc.state === 'workShip' &&
        (npc.job === 'installUpgrade' || npc.job === 'removeUpgrade'));
    const bob =
      npc.state === 'flinch' || npc.state === 'clearHot'
        ? Math.sin(npc.phase * 3) * 1.5
        : weldingWork
          ? Math.sin(npc.phase) * 0.25
          : Math.sin(npc.phase) * 0.8;
    const duck =
      npc.state === 'flinch' || npc.state === 'flee' || npc.state === 'clearHot'
        ? 2
        : weldingWork
          ? 1.35
          : 0;
    const walking = [
      'toPile',
      'toShip',
      'toExit',
      'enterDoor',
      'exitDoor',
      'flee',
      'clearHot',
      'toFloorDrop',
      'leaveHatch',
      'linger',
      'idleFluff',
      'gossip',
    ].includes(npc.state);
    const stride = walking ? Math.sin(npc.phase) * 2.4 : 0;

    const oct = this._crewVisOctant(npc);
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const rx = -fy;
    const ry = fx;
    const alongScale = 0.78 + 0.22 * Math.abs(fx);
    const acrossScale = 0.78 + 0.22 * Math.abs(fy);

    // Under-deck emerge / descend
    let scale = 1;
    let alpha = 1;
    if (npc.state === 'emerge') {
      scale = Math.min(1, 0.4 + ((npc.emergeT || 0) / 0.55) * 0.6);
      alpha = 0.55 + scale * 0.45;
    } else if (npc.state === 'descend') {
      scale = Math.max(0.35, npc.stateT / 0.45);
      alpha = 0.55 + scale * 0.45;
    }

    const g = (along, across, up = 0) => ({
      x: npc.x + (fx * along * alongScale + rx * across * acrossScale) * scale,
      y:
        npc.y +
        (fy * along * alongScale + ry * across * acrossScale) * scale +
        bob -
        up * scale,
    });

    // Torch / arc only for hull repair + hardpoint install/strip — not load/unload
    const welding =
      npc.job === 'weld' ||
      npc.job === 'installUpgrade' ||
      npc.job === 'removeUpgrade';
    const cargo = npc.cargo || npc._mechLift?.cargo;
    const panicked =
      npc.state === 'flee' || npc.state === 'flinch' || npc.state === 'clearHot';

    ctx.save();
    ctx.globalAlpha = alpha;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(
      npc.x,
      npc.y + 5 + bob,
      5.5 * scale,
      2.2 * scale,
      heading * 0.12,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Legs — far then near by screen Y
    const legL = {
      hip: g(-0.6, -1.6, 3 + duck),
      foot: g(-0.8 - stride * 0.15, -2.1, -0.2),
      y: 0,
    };
    const legR = {
      hip: g(-0.6, 1.6, 3 + duck),
      foot: g(-0.8 + stride * 0.15, 2.1, -0.2),
      y: 0,
    };
    legL.y = (legL.hip.y + legL.foot.y) / 2;
    legR.y = (legR.hip.y + legR.foot.y) / 2;
    const legs = [legL, legR].sort((a, b) => a.y - b.y);

    const drawLeg = (leg) => {
      ctx.strokeStyle = theme.suitDark;
      ctx.lineWidth = 2.1 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(leg.hip.x, leg.hip.y);
      ctx.lineTo(leg.foot.x, leg.foot.y);
      ctx.stroke();
      // Boot
      ctx.fillStyle = theme.boot;
      ctx.beginPath();
      ctx.ellipse(leg.foot.x, leg.foot.y + 0.6, 2.1 * scale, 1.2 * scale, heading * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineCap = 'butt';
    };

    drawLeg(legs[0]);

    // Tool belt / hips (far side of torso stack)
    const hip = g(-0.4, 0, 3.2 + duck);
    ctx.fillStyle = theme.suitWear;
    ctx.beginPath();
    ctx.ellipse(hip.x, hip.y, 3.4 * scale, 2.0 * scale, heading * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Torso — vertical faces sorted by Y
    const t0 = g(-1.2, -2.4, 4 + duck);
    const t1 = g(-1.2, 2.4, 4 + duck);
    const t2 = g(1.6, 2.4, 4 + duck);
    const t3 = g(1.6, -2.4, 4 + duck);
    const torsoH = 6.5;
    const torsoFaces = [
      [t0, t1],
      [t1, t2],
      [t2, t3],
      [t3, t0],
    ].sort((e0, e1) => (e0[0].y + e0[1].y) / 2 - (e1[0].y + e1[1].y) / 2);
    for (let i = 0; i < torsoFaces.length; i++) {
      const [p0, p1] = torsoFaces[i];
      ctx.fillStyle = i < 2 ? theme.suitWear : theme.suitDark;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p1.x, p1.y - torsoH * scale);
      ctx.lineTo(p0.x, p0.y - torsoH * scale);
      ctx.closePath();
      ctx.fill();
    }
    // Top / chest plate
    ctx.fillStyle = theme.suit;
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y - torsoH * scale);
    ctx.lineTo(t1.x, t1.y - torsoH * scale);
    ctx.lineTo(t2.x, t2.y - torsoH * scale);
    ctx.lineTo(t3.x, t3.y - torsoH * scale);
    ctx.closePath();
    ctx.fill();
    // Bay stripe + scuff
    const s0 = g(0.2, -2.0, 7.5 + duck);
    const s1 = g(0.2, 2.0, 7.5 + duck);
    ctx.strokeStyle = theme.stripe;
    ctx.lineWidth = 1.5 * scale;
    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(20, 14, 8, 0.22)';
    const sc = g(0.4, -0.8, 8.2 + duck);
    ctx.fillRect(sc.x - 1.5 * scale, sc.y, 3.2 * scale, 1.4 * scale);

    // Backpack / O2 pack — draw before helmet if farther (negative along)
    const pack = g(-2.4, 0, 7 + duck);
    const chest = g(0.4, 0, 7 + duck);
    const drawPack = () => {
      ctx.fillStyle = theme.pack;
      ctx.fillRect(
        pack.x - 2.2 * scale,
        pack.y - 4.5 * scale,
        4.4 * scale,
        5.5 * scale
      );
      ctx.fillStyle = 'rgba(180, 160, 80, 0.35)';
      ctx.fillRect(
        pack.x - 1.6 * scale,
        pack.y - 3.8 * scale,
        3.2 * scale,
        1.1 * scale
      );
      ctx.strokeStyle = 'rgba(120, 130, 140, 0.45)';
      ctx.lineWidth = 0.8 * scale;
      ctx.strokeRect(
        pack.x - 2.2 * scale,
        pack.y - 4.5 * scale,
        4.4 * scale,
        5.5 * scale
      );
    };

    if (pack.y <= chest.y) drawPack();

    // Shoulders / arms
    const armL = {
      sh: g(0.2, -2.8, 9 + duck),
      hand: g(MECH_HAND_REACH_X * 0.55, -3.2, 4.5 + duck),
      y: 0,
    };
    const armR = {
      sh: g(0.2, 2.8, 9 + duck),
      hand: g(
        welding || cargo ? MECH_HAND_REACH_X : MECH_HAND_REACH_X * 0.7,
        3.0,
        welding || cargo ? 5.5 + duck : 4.2 + duck
      ),
      y: 0,
    };
    // Prefer right arm as tool/cargo arm (matches facing-local +X hand reach when E/W)
    if (cargo || welding) {
      const handLocal = this._mechHandLocal(cargo || null);
      // World hand from logic facing for cargo alignment; visual arm still uses octant
      const face = npc.facing >= 0 ? 1 : -1;
      armR.hand = {
        x: npc.x + face * handLocal.x * scale,
        y: npc.y + (handLocal.y + bob - duck * 0.3) * scale,
      };
    }
    armL.y = (armL.sh.y + armL.hand.y) / 2;
    armR.y = (armR.sh.y + armR.hand.y) / 2;
    const arms = [armL, armR].sort((a, b) => a.y - b.y);

    const drawArm = (arm, isToolArm) => {
      ctx.strokeStyle = theme.suit;
      ctx.lineWidth = 2.0 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(arm.sh.x, arm.sh.y);
      ctx.lineTo(arm.hand.x, arm.hand.y);
      ctx.stroke();
      ctx.fillStyle = theme.glove;
      ctx.beginPath();
      ctx.arc(arm.hand.x, arm.hand.y, 1.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      if (isToolArm && welding && !cargo) {
        const torch = this._weldTorchTip(npc, { scale, bob, duck });
        ctx.strokeStyle = theme.tool;
        ctx.lineWidth = 1.35 * scale;
        ctx.beginPath();
        ctx.moveTo(arm.hand.x, arm.hand.y);
        ctx.lineTo(torch.x, torch.y);
        ctx.stroke();
        if (weldingWork) {
          const pulse = 0.5 + 0.5 * Math.sin(npc.phase * 4);
          ctx.fillStyle = `rgba(160, 220, 255, ${pulse})`;
          ctx.beginPath();
          ctx.arc(torch.x, torch.y, 2.2 * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(220, 245, 255, ${pulse * 0.55})`;
          ctx.beginPath();
          ctx.arc(torch.x, torch.y, 1.1 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (isToolArm && !cargo && !welding) {
        // Scanner / datapad
        ctx.fillStyle = '#2a3a48';
        ctx.fillRect(
          arm.hand.x - 0.5 * scale,
          arm.hand.y - 2.2 * scale,
          3.2 * scale,
          3.6 * scale
        );
        ctx.fillStyle = 'rgba(100, 220, 160, 0.55)';
        ctx.fillRect(
          arm.hand.x,
          arm.hand.y - 1.6 * scale,
          2.2 * scale,
          1.6 * scale
        );
      }
      ctx.lineCap = 'butt';
    };

    // Far arm first
    drawArm(arms[0], arms[0] === armR);

    // Helmet
    const head = g(0.3, 0, 11.2 + duck);
    ctx.fillStyle = theme.helmet;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.3 * scale, 0, Math.PI * 2);
    ctx.fill();
    // Helmet rim wear
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.35)';
    ctx.lineWidth = 0.9 * scale;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.3 * scale, 0.2, Math.PI * 1.1);
    ctx.stroke();
    // Visor toward forward
    const v0 = g(1.6, -1.5, 11.5 + duck);
    const v1 = g(1.6, 1.5, 11.5 + duck);
    ctx.fillStyle = theme.visor;
    ctx.beginPath();
    ctx.moveTo(v0.x, v0.y - 1.2 * scale);
    ctx.lineTo(v1.x, v1.y - 1.2 * scale);
    ctx.lineTo(v1.x, v1.y + 1.0 * scale);
    ctx.lineTo(v0.x, v0.y + 1.0 * scale);
    ctx.closePath();
    ctx.fill();
    // Bay stripe on helmet brow
    ctx.strokeStyle = theme.stripe;
    ctx.lineWidth = 1.1 * scale;
    ctx.beginPath();
    ctx.moveTo(g(-0.2, -2.2, 12.2 + duck).x, g(-0.2, -2.2, 12.2 + duck).y);
    ctx.lineTo(g(-0.2, 2.2, 12.2 + duck).x, g(-0.2, 2.2, 12.2 + duck).y);
    ctx.stroke();

    if (pack.y > chest.y) drawPack();

    // Near arm
    drawArm(arms[1], arms[1] === armR);

    // Near leg
    drawLeg(legs[1]);

    // Cargo in world space (logic hand) so pick/place stay aligned
    if (cargo) {
      const world = this._mechCargoWorldPos(npc);
      if (world) {
        const head = this._crewVisOctant(npc) * CREW_VIS_OCT;
        this._drawCargoItem(ctx, cargo, world.x, world.y, 0.72 * scale, head);
      }
    }

    // Panic arms up
    if (panicked) {
      ctx.strokeStyle = theme.helmet;
      ctx.lineWidth = 1.4 * scale;
      const hL = g(-0.5, -3.5, 8 + duck);
      const hR = g(-0.5, 3.5, 8 + duck);
      ctx.beginPath();
      ctx.moveTo(hL.x, hL.y);
      ctx.lineTo(hL.x - rx * 2 * scale, hL.y - 4 * scale);
      ctx.moveTo(hR.x, hR.y);
      ctx.lineTo(hR.x + rx * 2 * scale, hR.y - 3.5 * scale);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawForklift(ctx, npc) {
    const bounce = Math.sin(npc.phase * 0.5) * 0.35;
    const forkH = npc.forkH ?? FORK_RAISED;
    const forkDrop = forkH * FORK_DROP_VIS;
    const oct = this._crewVisOctant(npc);
    const heading = oct * CREW_VIS_OCT;
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const rx = -fy;
    const ry = fx;
    // Foreshortening: length reads best E/W; width best N/S (2.5D look-down)
    const alongScale = 0.72 + 0.28 * Math.abs(fx);
    const acrossScale = 0.72 + 0.28 * Math.abs(fy);
    const body = npc.body || '#c87830';
    const bodyDark = '#6a3a18';
    const bodyWear = '#8a5030';
    const metal = '#8a9aa8';
    const metalLit = '#b0c0d0';
    const metalDark = '#4a5868';

    // Ground-plane point. Hangar 2.5D: higher screen Y = nearer camera (draw later).
    const g = (along, across) => ({
      x: npc.x + fx * along * alongScale + rx * across * acrossScale,
      y: npc.y + fy * along * alongScale + ry * across * acrossScale + bounce,
    });

    const drawWheel = (p) => {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1.5, 3.1, 2.2, heading * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1.2, 1.4, 1.0, heading * 0.2, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawCounterweight = () => {
      const a0 = g(-11, -5.5);
      const a1 = g(-11, 5.5);
      const a2 = g(-5.5, 5.5);
      const a3 = g(-5.5, -5.5);
      const h = 5;
      // Vertical faces: far (low Y) first, near (high Y) last
      const edges = [
        [a0, a1],
        [a1, a2],
        [a2, a3],
        [a3, a0],
      ].sort((e0, e1) => (e0[0].y + e0[1].y) / 2 - (e1[0].y + e1[1].y) / 2);
      ctx.fillStyle = '#2a3038';
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.lineTo(a2.x, a2.y);
      ctx.lineTo(a3.x, a3.y);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < edges.length; i++) {
        const [p0, p1] = edges[i];
        ctx.fillStyle = i < 2 ? '#3a4450' : '#454e5a';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y - h);
        ctx.lineTo(p1.x, p1.y - h);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p0.x, p0.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#505a68';
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y - h);
      ctx.lineTo(a1.x, a1.y - h);
      ctx.lineTo(a2.x, a2.y - h);
      ctx.lineTo(a3.x, a3.y - h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 160, 40, 0.45)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y - h * 0.45);
      ctx.lineTo(a1.x, a1.y - h * 0.45);
      ctx.stroke();
    };

    const drawChassis = () => {
      const a0 = g(-6, -5);
      const a1 = g(-6, 5);
      const a2 = g(7, 5);
      const a3 = g(7, -5);
      const h = 6;
      const edges = [
        [a0, a1],
        [a1, a2],
        [a2, a3],
        [a3, a0],
      ].sort((e0, e1) => (e0[0].y + e0[1].y) / 2 - (e1[0].y + e1[1].y) / 2);
      for (let i = 0; i < edges.length; i++) {
        const [p0, p1] = edges[i];
        ctx.fillStyle = i < 2 ? bodyWear : bodyDark;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p1.x, p1.y - h);
        ctx.lineTo(p0.x, p0.y - h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y - h);
      ctx.lineTo(a1.x, a1.y - h);
      ctx.lineTo(a2.x, a2.y - h);
      ctx.lineTo(a3.x, a3.y - h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e0a060';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.fillStyle = 'rgba(40, 24, 12, 0.22)';
      const w0 = g(-2, -2.5);
      const w1 = g(3, 1.5);
      ctx.fillRect(w0.x - 2, w0.y - h - 1, 5, 2.2);
      ctx.fillRect(w1.x - 1.5, w1.y - h - 0.5, 4, 1.6);
      ctx.strokeStyle = 'rgba(20, 12, 6, 0.35)';
      ctx.lineWidth = 0.7;
      const s0 = g(1, -4.5);
      const s1 = g(1, 4.5);
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y - h);
      ctx.lineTo(s1.x, s1.y - h);
      ctx.stroke();
    };

    const ropsPosts = [
      g(-3.5, -4),
      g(-3.5, 4),
      g(2.5, 4),
      g(2.5, -4),
    ].sort((a, b) => a.y - b.y);
    const roofH = 12;

    const drawRopsPost = (p) => {
      ctx.strokeStyle = metalDark;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x, p.y - roofH);
      ctx.stroke();
    };

    const drawRopsRoof = () => {
      const posts = [
        g(-3.5, -4),
        g(-3.5, 4),
        g(2.5, 4),
        g(2.5, -4),
      ];
      ctx.strokeStyle = metal;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(posts[0].x, posts[0].y - roofH);
      ctx.lineTo(posts[1].x, posts[1].y - roofH);
      ctx.lineTo(posts[2].x, posts[2].y - roofH);
      ctx.lineTo(posts[3].x, posts[3].y - roofH);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140, 150, 160, 0.35)';
      ctx.lineWidth = 0.6;
      const m0 = g(-0.5, -3.5);
      const m1 = g(-0.5, 3.5);
      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y - roofH + 1);
      ctx.lineTo(m1.x, m1.y - roofH + 1);
      ctx.stroke();
    };

    const drawCab = () => {
      const a0 = g(-3, -3.5);
      const a1 = g(-3, 3.5);
      const a2 = g(2, 3.5);
      const a3 = g(2, -3.5);
      const h0 = 6;
      const h1 = 11;
      const faces = [
        [a0, a1],
        [a1, a2],
        [a2, a3],
        [a3, a0],
      ].sort((e0, e1) => (e0[0].y + e0[1].y) / 2 - (e1[0].y + e1[1].y) / 2);
      for (let i = 0; i < faces.length; i++) {
        const [p0, p1] = faces[i];
        ctx.fillStyle = i < 2 ? '#2a3848' : '#1e2834';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y - h0);
        ctx.lineTo(p1.x, p1.y - h0);
        ctx.lineTo(p1.x, p1.y - h1);
        ctx.lineTo(p0.x, p0.y - h1);
        ctx.closePath();
        ctx.fill();
      }
      // Windshield on the forward cab face (toward mast / +along)
      const f0 = g(2, -3.5);
      const f1 = g(2, 3.5);
      ctx.fillStyle = 'rgba(120, 200, 255, 0.32)';
      ctx.beginPath();
      ctx.moveTo(f0.x, f0.y - h0 - 1);
      ctx.lineTo(f1.x, f1.y - h0 - 1);
      ctx.lineTo(f1.x, f1.y - h1 + 0.5);
      ctx.lineTo(f0.x, f0.y - h1 + 0.5);
      ctx.closePath();
      ctx.fill();
      const head = g(-0.2, 0);
      ctx.fillStyle = '#c8d0d8';
      ctx.beginPath();
      ctx.arc(head.x, head.y - 9.5, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(80, 160, 200, 0.4)';
      ctx.fillRect(head.x - 1.4, head.y - 10.2, 2.2, 1.4);
    };

    const drawMast = () => {
      const base = g(7.5, 0);
      const mastH = 15;
      ctx.fillStyle = metalDark;
      ctx.fillRect(base.x - 2.2, base.y - mastH, 4.4, mastH - 2);
      ctx.fillStyle = metal;
      ctx.fillRect(base.x - 1.5, base.y - mastH, 1.1, mastH - 2);
      ctx.fillRect(base.x + 0.4, base.y - mastH, 1.1, mastH - 2);
      const carY = base.y - 10 + forkDrop * 0.55;
      ctx.fillStyle = '#5a6878';
      ctx.fillRect(base.x - 2.6, carY - 2, 5.2, 4);
      ctx.strokeStyle = 'rgba(20, 16, 10, 0.4)';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(base.x - 2.6, carY - 2, 5.2, 4);
      const blink = 0.45 + 0.55 * Math.max(0, Math.sin(npc.phase * 1.7));
      ctx.fillStyle = `rgba(255, 170, 40, ${0.35 + blink * 0.5})`;
      ctx.beginPath();
      ctx.arc(base.x, base.y - mastH - 1.2, 1.6, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawForks = () => {
      const tineAlong0 = 8.5;
      const tineAlong1 = FORK_TINE_TIP_X;
      const tineLift = FORK_TINE_Y_BASE + forkDrop * 0.35;
      ctx.strokeStyle = metalLit;
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      for (const across of [-2.2, 2.2]) {
        const p0 = g(tineAlong0, across);
        const p1 = g(tineAlong1, across);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y + tineLift);
        ctx.lineTo(p1.x, p1.y + tineLift);
        ctx.stroke();
      }
      const b0 = g(tineAlong0, -3);
      const b1 = g(tineAlong0, 3);
      ctx.strokeStyle = metal;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(b0.x, b0.y + tineLift - 1);
      ctx.lineTo(b1.x, b1.y + tineLift - 1);
      ctx.stroke();
      ctx.lineCap = 'butt';
    };

    const drawCargo = () => {
      const cargo = npc.cargo || npc._forkLift?.cargo;
      if (!cargo) return;
      const world = this._forkCargoWorldPos(npc);
      if (world) {
        const head = this._crewVisOctant(npc) * CREW_VIS_OCT;
        this._drawCargoItem(ctx, cargo, world.x, world.y, 0.9, head);
      }
    };

    const drawMastForksCargo = () => {
      drawMast();
      drawForks();
      drawCargo();
    };

    // --- Painter pass (far → near). Per-octant occlusion via screen Y. ---
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(npc.x + fx * 1, npc.y + 7 + bounce, 13, 4.2, heading * 0.15, 0, Math.PI * 2);
    ctx.fill();

    const wheels = [
      [-7.5, -4.8],
      [-7.5, 4.8],
      [4.5, -5.2],
      [4.5, 5.2],
    ]
      .map(([al, ac]) => g(al, ac))
      .sort((a, b) => a.y - b.y);
    const farWheels = wheels.slice(0, 2);
    const nearWheels = wheels.slice(2);

    for (const w of farWheels) drawWheel(w);

    drawCounterweight();
    drawChassis();

    for (const p of ropsPosts.slice(0, 2)) drawRopsPost(p);

    const mastDepth = g(7.5, 0).y;
    const cabDepth = g(-0.5, 0).y;
    if (mastDepth <= cabDepth) {
      drawMastForksCargo();
      drawCab();
    } else {
      drawCab();
      drawMastForksCargo();
    }

    drawRopsRoof();
    for (const p of ropsPosts.slice(2)) drawRopsPost(p);

    for (const w of nearWheels) drawWheel(w);
  }

  /**
   * Sparkle draw filtered by layer pass:
   * - `under` — weld (layer under) + contact smoke
   * - `over` — weld (layer over) hardpoint bursts
   * - `overhead` — engine / freight dust (non-weld)
   */
  _drawSparkles(ctx, mode = 'overhead') {
    for (const s of this._sparkle) {
      if (mode === 'under') {
        if (!(s.weld && s.layer === 'under') && !(s.dust && s.layer === 'under')) {
          continue;
        }
      } else if (mode === 'over') {
        if (!(s.weld && s.layer === 'over')) continue;
      } else {
        // Overhead: non-weld, and dust not tagged as under-weld smoke
        if (s.weld) continue;
        if (s.dust && s.layer === 'under') continue;
      }

      const a = Math.max(0, s.life / s.max);
      if (s.dust) {
        // Soft hold-dust puffs (load / unload) + weld contact smoke
        const r = s.r * (0.85 + (1 - a) * 0.7);
        ctx.fillStyle = `rgba(120, 105, 80, ${a * 0.28})`;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, r * 1.35, r * 0.75, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(160, 145, 115, ${a * 0.16})`;
        ctx.beginPath();
        ctx.ellipse(s.x + r * 0.2, s.y - r * 0.15, r * 0.7, r * 0.45, -0.3, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (s.weld) {
        const spd = Math.hypot(s.vx || 0, s.vy || 0);
        if (s.core) {
          ctx.fillStyle = `rgba(220, 245, 255, ${a * 0.95})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * a, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(160, 220, 255, ${a * 0.45})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * a * 1.85, 0, Math.PI * 2);
          ctx.fill();
        } else if (spd > 12) {
          const ang = Math.atan2(s.vy || 0, s.vx || 0);
          const len = Math.min(5.5, 1.2 + spd * 0.035) * a;
          const hw = Math.max(0.45, s.r * 0.45) * a;
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(ang);
          ctx.fillStyle = s.warm
            ? `rgba(255, 190, 90, ${a * 0.9})`
            : `rgba(180, 230, 255, ${a * 0.92})`;
          ctx.beginPath();
          ctx.ellipse(-len * 0.15, 0, len, hw, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = s.warm
            ? `rgba(255, 180, 80, ${a * 0.85})`
            : `rgba(180, 230, 255, ${a * 0.95})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * a, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = `rgba(255, 180, 80, ${a * 0.7})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Deck-hugging sparky wash under the hull — long-range cue when the mech is occluded.
   * Contact glow from `_emitWeldArc`; satellite glows track live weld sparks + brief ember trails.
   */
  _drawWeldUnderGlow(ctx) {
    for (const npc of this.npcs) {
      const g = npc._weldGlow;
      const base = g?.intensity || 0;
      const flash = g?.flash || 0;
      if (!g || (base < 0.04 && flash < 0.04)) continue;
      // Halfway between first underglow and the bright punch pass
      const a = Math.min(1.2, base * 0.92 + flash * 0.5);
      const pulse = 0.82 + 0.28 * Math.min(1, flash);
      const x = g.x;
      const y = g.y;
      const seed = g.speckleSeed || 0;
      const t = this.time;

      // Contact wash jitter both ways around the tuned mid (radius + brightness)
      const sizeJ =
        1 +
        Math.sin(t * 31 + seed * 7) * 0.1 +
        Math.sin(t * 67 + seed * 13) * 0.07 +
        Math.sin(t * 103 + seed * 3) * 0.04;
      const brightJ =
        1 +
        Math.sin(t * 39 + seed * 5) * 0.12 +
        Math.sin(t * 81 + seed * 17) * 0.08 +
        Math.sin(t * 127 + seed * 9) * 0.05;
      // Slight axis stretch so the blob breathes, not just scales uniformly
      const stretchX = 1 + Math.sin(t * 47 + seed * 11) * 0.06;
      const stretchY = 1 + Math.cos(t * 53 + seed * 19) * 0.06;

      const rx = (19 + a * 11) * (0.96 + pulse * 0.06) * sizeJ * stretchX;
      const ry = (10.5 + a * 6.5) * (0.96 + pulse * 0.06) * sizeJ * stretchY;
      const ba = pulse * brightJ;
      const wash = ctx.createRadialGradient(x, y, 0, x, y, rx);
      wash.addColorStop(0, `rgba(200, 240, 255, ${Math.min(0.52, a * 0.34 * ba)})`);
      wash.addColorStop(0.38, `rgba(125, 208, 255, ${Math.min(0.3, a * 0.19 * ba)})`);
      wash.addColorStop(0.72, `rgba(90, 180, 240, ${Math.min(0.12, a * 0.06 * ba)})`);
      wash.addColorStop(1, 'rgba(80, 160, 220, 0)');
      ctx.fillStyle = wash;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0.08 + Math.sin(t * 19 + seed) * 0.05, 0, Math.PI * 2);
      ctx.fill();

      const jx = x + Math.sin(t * 42 + seed * 11) * 2.1 * a;
      const jy = y + Math.cos(t * 37 + seed * 9) * 1.55 * a;
      const crx = (6.75 + a * 4.75) * pulse * sizeJ;
      const cry = (3.85 + a * 2.85) * pulse * sizeJ;
      const core = ctx.createRadialGradient(jx, jy, 0, jx, jy, crx);
      core.addColorStop(0, `rgba(248, 252, 255, ${Math.min(0.8, a * 0.7 * ba)})`);
      core.addColorStop(0.3, `rgba(180, 230, 255, ${Math.min(0.55, a * 0.42 * ba)})`);
      core.addColorStop(0.6, `rgba(140, 210, 255, ${Math.min(0.25, a * 0.16 * ba)})`);
      core.addColorStop(1, 'rgba(100, 180, 240, 0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.ellipse(jx, jy, crx, cry, -0.15, 0, Math.PI * 2);
      ctx.fill();

      if (g.amber || flash > 0.5) {
        const aa = Math.min(0.42, a * 0.32 * ba);
        ctx.fillStyle = `rgba(255, 155, 58, ${aa})`;
        ctx.beginPath();
        ctx.ellipse(
          jx + Math.sin(t * 55) * 1.4,
          jy + 0.8,
          (5.75 + a * 2.75) * sizeJ,
          (2.95 + a * 1.4) * sizeJ,
          0.3,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      const n = 2 + ((seed * 3.5) | 0) % 3;
      for (let i = 0; i < n; i++) {
        const sx =
          jx + Math.sin(t * 68 + i * 2.3 + seed * 17) * (3 + a * 2.5);
        const sy =
          jy + Math.cos(t * 61 + i * 1.7 + seed * 13) * (1.9 + a * 1.7);
        const sa = Math.min(
          0.85,
          a * pulse * (0.4 + 0.5 * Math.abs(Math.sin(t * 100 + i * 3 + flash * 6)))
        );
        ctx.fillStyle = `rgba(235, 248, 255, ${sa})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.65 + a * 0.45 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Each flying weld spark casts its own small deck wash — composite reads as lively slag light
    this._drawWeldSparkUnderglows(ctx);
  }

  /**
   * Per-spark under-hull lights + short ember trails. Keeps contact wash size/brightness;
   * adds motion by lighting wherever slag currently is (and just was).
   */
  _drawWeldSparkUnderglows(ctx) {
    for (const s of this._sparkle) {
      if (!s.weld) continue;
      const lifeA = Math.max(0, s.life / (s.max || 0.3));
      if (lifeA < 0.06) continue;
      this._paintSparkDeckGlow(ctx, s.x, s.y, lifeA, s);
    }
    if (!this._weldEmberTrail?.length) return;
    for (const e of this._weldEmberTrail) {
      const lifeA = Math.max(0, e.life / e.max);
      if (lifeA < 0.05) continue;
      this._paintSparkDeckGlow(ctx, e.x, e.y, lifeA * 0.7, e);
    }
  }

  /**
   * Over-layer / beside-hull sparks kiss the plating. Clipped to each pad's ship ellipse
   * so wash sits on hull, not the apron. Drawn after ships, before overhead sparks.
   */
  _drawWeldHullWashes(ctx) {
    /** @type {Map<number, { padX: number, padY: number, padAngle: number, paints: Array }>} */
    const groups = new Map();
    const enqueue = (padX, padY, padAngle, bay, paint) => {
      if (padX == null || bay == null) return;
      let g = groups.get(bay);
      if (!g) {
        g = { padX, padY, padAngle, paints: [] };
        groups.set(bay, g);
      }
      g.paints.push(paint);
    };

    for (const s of this._sparkle) {
      if (!s.weld || s.padX == null) continue;
      const lifeA = Math.max(0, s.life / (s.max || 0.3));
      if (lifeA < 0.06) continue;
      const proj = this._projectOntoShipHull(
        s.padX,
        s.padY ?? 0,
        s.padAngle ?? FACE_NORTH,
        s.x,
        s.y
      );
      const over = s.layer === 'over';
      // Over sparks always light plating; under sparks only when they fly past the rim
      if (!over && proj.inside) continue;
      if (!over && proj.outside > 1.1) continue;
      const rimFall =
        proj.outside <= 0
          ? 1
          : Math.max(0, 1 - proj.outside / (over ? 1.15 : 0.95));
      if (rimFall < 0.08) continue;
      const strength = (over ? 0.92 : 0.55) * rimFall;
      enqueue(s.padX, s.padY ?? 0, s.padAngle ?? FACE_NORTH, s.bay, {
        x: proj.x,
        y: proj.y,
        lifeA,
        src: s,
        strength,
      });
    }

    for (const e of this._weldEmberTrail || []) {
      if (e.padX == null || e.layer !== 'over') continue;
      const lifeA = Math.max(0, e.life / e.max);
      if (lifeA < 0.05) continue;
      const proj = this._projectOntoShipHull(
        e.padX,
        e.padY ?? 0,
        e.padAngle ?? FACE_NORTH,
        e.x,
        e.y
      );
      const rimFall =
        proj.outside <= 0 ? 1 : Math.max(0, 1 - proj.outside / 1.15);
      if (rimFall < 0.08) continue;
      enqueue(e.padX, e.padY ?? 0, e.padAngle ?? FACE_NORTH, e.bay, {
        x: proj.x,
        y: proj.y,
        lifeA: lifeA * 0.65,
        src: e,
        strength: 0.7 * rimFall,
      });
    }

    // Contact heat on plating after over-layer bursts
    for (const npc of this.npcs) {
      const g = npc._weldGlow;
      if (!g || (g.surfaceKiss || 0) < 0.05 || g.padX == null) continue;
      const a = Math.min(1, (g.intensity || 0) * 0.7 + (g.flash || 0) * 0.4);
      if (a < 0.05) continue;
      enqueue(g.padX, g.padY ?? 0, g.padAngle ?? FACE_NORTH, g.bay, {
        x: g.x,
        y: g.y,
        lifeA: a,
        src: { warm: !!g.amber, core: true, r: 2.2, _glowSeed: g.speckleSeed || 1 },
        strength: 0.75 * g.surfaceKiss,
        contact: true,
      });
    }

    if (!groups.size) return;

    // Hangar ships are 2.5D (base + side walls + raised deck). Paint the same
    // wash on each extrude band so light hits side peeks as well as the top face.
    for (const g of groups.values()) {
      this._paintWeldHullWashLayers(ctx, g);
    }
  }

  /**
   * Clip + paint weld washes across angled extrude bands (base / mid walls / deck).
   * Matches hangarShipView lift direction so side views get plating light too.
   */
  _paintWeldHullWashLayers(ctx, g) {
    const heading = headingIndexFromAngle(g.padAngle);
    // Typical hull extrude liftH ≈ h*0.45 with h≈4.5–5.5 → ~2.2 on the deck
    const deckH = 2.35;
    const midH = deckH * 0.48;
    const deckLift = angledLiftLocal(heading, deckH);
    const midLift = angledLiftLocal(heading, midH);
    const depthY = angledDepthScale(heading);

    const layers = [
      { lx: 0, ly: 0, strength: 0.5, label: 'base' },
      { lx: midLift.x, ly: midLift.y, strength: 0.78, label: 'sides' },
      { lx: deckLift.x, ly: deckLift.y, strength: 1, label: 'deck' },
    ];

    for (const layer of layers) {
      // Lift is ship-local (same space as extrude); convert to world offset
      const liftW = this._shipLocalToWorld(0, 0, layer.lx, layer.ly, g.padAngle);
      const ox = g.padX + liftW.x;
      const oy = g.padY + liftW.y;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(g.padAngle);
      ctx.scale(1, depthY);
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        SHIP_EXTENT.LENGTH * 0.52,
        SHIP_EXTENT.BEAM * 0.52,
        0,
        0,
        Math.PI * 2
      );
      ctx.clip();
      ctx.scale(1, 1 / depthY);
      ctx.rotate(-g.padAngle);
      ctx.translate(-ox, -oy);

      for (const p of g.paints) {
        this._paintSparkDeckGlow(
          ctx,
          p.x + liftW.x,
          p.y + liftW.y,
          p.lifeA * p.strength * layer.strength,
          p.src
        );
      }
      ctx.restore();
    }
  }

  /** Soft elliptical deck kiss for one spark / ember (drawn under ships). */
  _paintSparkDeckGlow(ctx, x, y, lifeA, src) {
    const warm = !!src.warm;
    const core = !!src.core;
    const r = src.r || 1.2;
    const t = this.time;
    // Per-spark phase so neighbors don't breathe in lockstep
    const seed = (src._glowSeed ??= Math.random() * 20) + x * 0.17 + y * 0.13;
    const sizeJ =
      1 +
      Math.sin(t * 31 + seed * 7) * 0.1 +
      Math.sin(t * 67 + seed * 13) * 0.07 +
      Math.sin(t * 103 + seed * 3) * 0.04;
    const brightJ =
      1 +
      Math.sin(t * 39 + seed * 5) * 0.12 +
      Math.sin(t * 81 + seed * 17) * 0.08 +
      Math.sin(t * 127 + seed * 9) * 0.05;
    const stretchX = 1 + Math.sin(t * 47 + seed * 11) * 0.06;
    const stretchY = 1 + Math.cos(t * 53 + seed * 19) * 0.06;
    // Modest alphas so many sparks dance without blowing out the main wash
    const peak = core ? 0.38 : warm ? 0.3 : 0.24;
    const a = Math.min(peak, lifeA * peak * (0.55 + 0.45 * lifeA) * brightJ);
    const rx = ((core ? 6.2 : 4.6) + r * 2.1) * sizeJ * stretchX;
    const ry = rx * 0.52 * stretchY;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rx);
    if (warm) {
      grad.addColorStop(0, `rgba(255, 210, 140, ${a})`);
      grad.addColorStop(0.4, `rgba(255, 160, 70, ${a * 0.45})`);
      grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
    } else {
      grad.addColorStop(0, `rgba(230, 248, 255, ${a})`);
      grad.addColorStop(0.4, `rgba(150, 220, 255, ${a * 0.42})`);
      grad.addColorStop(1, 'rgba(100, 180, 240, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0.1 + Math.sin(t * 19 + seed) * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // Tiny hot pin so individual sparks read under the belly
    ctx.fillStyle = warm
      ? `rgba(255, 200, 120, ${a * 0.85})`
      : `rgba(245, 252, 255, ${a * 0.9})`;
    ctx.beginPath();
    ctx.arc(x, y, (core ? 1.3 : 0.85) * lifeA * sizeJ, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawDebris(ctx) {
    for (const d of this._debris) {
      const a = d.life / d.max;
      ctx.fillStyle = d.color;
      ctx.globalAlpha = a;
      ctx.fillRect(d.x, d.y, d.r, d.r);
      ctx.globalAlpha = 1;
    }
  }

  _drawHazardWash(ctx) {
    const e = this._hazard.engine;
    const m = this._hazard.maneuver;
    const w = this._hazard.weapons;
    if (e < 0.05 && m < 0.05 && w < 0.05) return;

    const ang = this._shipAngle ?? SHIP.SPAWN_ANGLE;
    const sx = this._shipPos?.x ?? 0;
    const sy = this._shipPos?.y ?? 0;
    if (e > 0.1) {
      const ax = sx + Math.cos(ang + Math.PI) * 28;
      const ay = sy + Math.sin(ang + Math.PI) * 28;
      ctx.fillStyle = `rgba(255, 120, 40, ${e * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(ax, ay, 22 + e * 10, 40 + e * 20, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    // Soft cyan kiss on the deck under the muzzle tip (not the whole pad)
    if (w > 0.1) {
      const wx = this._weaponWash?.x ?? sx;
      const wy = this._weaponWash?.y ?? sy;
      const r = 7 + w * 5;
      const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
      grad.addColorStop(0, `rgba(180, 230, 255, ${w * 0.22})`);
      grad.addColorStop(0.45, `rgba(100, 200, 255, ${w * 0.1})`);
      grad.addColorStop(1, 'rgba(80, 160, 220, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
