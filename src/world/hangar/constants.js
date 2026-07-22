import { HANGAR, SHIP } from '../../core/Constants.js';
import { clamp } from '../../utils/MathUtils.js';

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
/** North (upgrades), mid (hold cargo), south (forklift storage) */
const ROW_Y = [-78, 8, 118];
/**
 * South edge of each bay's engine danger zone (former stair Y).
 * Floor running-lights end here; stairs moved further south past the backsplash.
 */
const DANGER_ZONE_SOUTH = (ROW_Y[1] + ROW_Y[2]) / 2;
/**
 * Service display boards behind each pad.
 * Northern lip is fixed (must not grow into the pad); checklist scrolls inside the column.
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

/** @param {number} [_viewportRadius] */

/**
 * Hangar zoom that frames the service board bottom at the viewport rim (cam at pad).
 * @param {number} viewportRadius
 * @param {number} [marginPx]
 */

/**
 * Title elevator arrival close-up — pad-centered, less extreme than old ZOOM_MAX 14.
 * @param {number} viewportRadius
 */

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

/** Turn rate for draw heading (rad/s); locks snap faster during pile / weld work */
const CREW_VIS_TURN = 7;
const CREW_VIS_TURN_LOCK = 14;
/** Mech stride vs facing error: full speed inside ALIGN, pivot-only past STOP (rad) */
const MECH_TURN_ALIGN = 0.75;
const MECH_TURN_STOP = 2.15;
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
/** Empty-hand torch length hand→tip (matches `_weldTorchTip` / `_drawMechanic`) */
const WELD_TORCH_REACH = 6.2;

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






/** Keep board / stair anchors aligned with current pad centers. */

/**
 * Apply editable bay spacing to runtime constants + live hangar sim.
 * Flavor props are shifted separately via hangar-layout `setHangarSidePadX`.
 * @param {number} sidePadX
 * @param {HangarBay|null} [hangarBay]
 * @param {number} [delta] change from previous spacing (for shifting free agents)
 */

/** World X for bay index 0/1/2 (B1/B2/B3). */

/** Sync runtime SIDE_PAD_X from baked hangar-layout (no flavor shift). */

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


/** Map a board cell back to a crate kind so unload freight matches the square. */




/**
 * Pack crate-skinned blocks into a cargo grid from free-space fraction (cargoSpace).
 * Higher cargoSpace = emptier hold. Colors match 2.5D hangar crates.
 */




/**
 * Place one free 1×1 crate block into the hold.
 * @param {object} hold
 * @param {{ color?: string, accent?: string, variant?: number }|null} [skinOrCargo]
 * @returns {boolean}
 */


/** 0→1→0 triangle wave for scanner ping-pong. */

/**
 * Per-pick delays for captain pip reveal.
 * Same type as previous → quick double-tap; type change → longer menu browse.
 */

/**
 * Remove one cargo block (prefers small).
 * @returns {object|null} removed cell (for matching unload freight) or null
 */



/**
 * Weighted padMk for a fresh B1/B3 visitor — mostly `peerPadMk` (matches the
 * player's own pad tier, e.g. Mk2 Standard), occasionally Mk1 (UltraLight +
 * Light) for size variety. If the player is already Mk1, there's nothing
 * smaller to roll, so it's always Mk1.
 * @param {number} peerPadMk
 */




/** Curved request probability — mild deficits rarely ask; emptier curves up hard. */

/** Board meter bands — red always requests; green never does. */
const STAT_RED = 0.4;
const STAT_GREEN = 0.7;

/** Map need 0–1 → 1–3 work units (caller handles 0 / no-request). */

/**
 * How many service units for a 0–1 meter (fuel/hull/ammo).
 * Red (&lt;0.4): always ≥1. Yellow: curved roll. Green (≥0.7): none.
 * @param {number} meter01
 * @param {number} [bias=1] multiplies deficit before banding
 */

/** Per Hull pip heal as fraction of full ship health (ship-size tuning later). */
const HULL_PIP_HEAL_MIN = 0.18;
const HULL_PIP_HEAL_MAX = 0.22;
const HULL_PIP_HEAL_AVG = (HULL_PIP_HEAL_MIN + HULL_PIP_HEAL_MAX) / 2;
const HULL_PIP_COUNT_MAX = 5;


/**
 * How many Hull pips to request — ~one pip per ~20% missing health.
 * Same red/yellow/green request gates as other meters.
 */

/** Cargo bring-in / take-out unit count from free or filled slots (board wraps every 5 pips). */

/** Light visitor personality — combat leans ammo/hull; freighters lean cargo. */

const SERVICE_STAGING_TYPES = [
  'refuel',
  'reloadBullets',
  'reloadShells',
  'loadCargo',
  'upgrade',
];





/** Build upgrade freight from ItemCatalog (falls back to legacy UPGRADE_KINDS). */



/** Build 3×6 hardpoint grid (2 columns × 3 bays). */


export function hangarZoomMin(viewportRadius) {
  const floor = HANGAR.ZOOM_MIN;
  if (!viewportRadius || viewportRadius < 40) return floor;
  const halfW = HANGAR.SIDE_PAD_X + HANGAR.PAD_R * 2.5 + 28;
  const halfH = HANGAR.BAY_HALF_H + 40;
  const fit = viewportRadius / Math.max(halfW, halfH);
  return clamp(Math.min(floor, fit * 0.95), 0.95, floor);
}

export function hangarZoomMax(_viewportRadius) {
  return HANGAR.ZOOM_MAX;
}

export function hangarDefaultZoom(viewportRadius, marginPx = 12) {
  if (!viewportRadius || viewportRadius < 40) return HANGAR.ZOOM_DEFAULT;
  const zMin = hangarZoomMin(viewportRadius);
  return clamp(
    (viewportRadius - marginPx) / SERVICE_BOARD_BOTTOM,
    zMin,
    hangarZoomMax(viewportRadius)
  );
}

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


export {
  FACE_SOUTH,
  FACE_NORTH,
  BAY,
  ROW,
  COL_OFFSET,
  ROW_Y,
  DANGER_ZONE_SOUTH,
  SERVICE_BOARD_TOP,
  BACKSPLASH_HALF_W,
  SERVICE_BOARD_H,
  SERVICE_BOARD_BOTTOM,
  BACKSPLASH_Y,
  BACKSPLASH_BAND,
  BACKSPLASH_BYPASS,
  MECH_BODY_R,
  DANGER_ZONE_PAD,
  FLOOR_DROP_CRANE_AGE,
  APRON_SAFE_Y,
  BAY_COMPUTERS,
  CREW_VIS_OCT,
  WELD_SPOTS_MIN,
  WELD_SPOTS_MAX,
  CREW_VIS_TURN,
  CREW_VIS_TURN_LOCK,
  MECH_TURN_ALIGN,
  MECH_TURN_STOP,
  MECH_BAY_THEMES,
  FORK_TRUCK_LEN,
  FORKLIFT_HUB_W,
  FORKLIFT_HUB_HALF_W,
  FORKLIFT_PARK_MIN_PITCH,
  FORKLIFT_PARK_COUNT,
  FORKLIFT_PARK_PITCH,
  FORKLIFT_PARK_SPOT_W,
  FORKLIFT_PARK_SPOT_H,
  FORKLIFT_HUB_Y,
  FORKLIFT_PARKS,
  FORKLIFT_ACTIVE,
  CRANE_HOME,
  STAIRS,
  STAIR_Y,
  MECH_LINGER_Y_MAX,
  GOSSIP_RING_RADIUS,
  BRIDGE_Y_MIN,
  BRIDGE_Y_MAX,
  RUNWAY_X,
  HOIST_RAISED,
  HOIST_MAX,
  TROLLEY_NORTH,
  CLAW_OPEN,
  CLAW_GRIP,
  CLAW_PALM,
  CLAW_FINGER,
  CRANE_CREW,
  FORK_RAISED,
  FORK_LOWERED,
  FORK_ANIM_SPEED,
  FORK_LANE_OFFSET,
  FORK_APPROACH_SOUTH,
  FORK_CREEP_NORTH,
  FORK_TINE_TIP_X,
  FORK_OVERSHOOT,
  FORK_TINE_Y_BASE,
  FORK_DROP_VIS,
  MECH_LANE_OFFSET,
  MECH_APPROACH_ALONG,
  MECH_CREEP_IN,
  MECH_HAND_REACH_X,
  MECH_HAND_GRIP_Y,
  MECH_HANDOFF_SPEED,
  WELD_TORCH_REACH,
  CARGO_MIN,
  CARGO_MAX,
  PILE_CAP,
  INBOUND_SOFT_CAP,
  CRATE_VARIANTS,
  SERVICE_CARGO,
  HOLD_CARGO,
  UPGRADE_KINDS,
  CARGO_KINDS,
  PILE_SLOTS,
  CARGO_BAY_SPECS,
  VISITOR_CARGO_MK,
  STAT_RED,
  STAT_GREEN,
  HULL_PIP_HEAL_MIN,
  HULL_PIP_HEAL_MAX,
  HULL_PIP_HEAL_AVG,
  HULL_PIP_COUNT_MAX,
  SERVICE_STAGING_TYPES,
};

