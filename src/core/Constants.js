import { VISUAL_TUNING } from '../ships/data/visualTuning.js';

export const PHYSICS = {
  MAX_SPEED: 900,
  /** Cruise yaw rate (rad/s) — kept deliberately slower than old mouse-aim tracking */
  MAX_ROTATION_SPEED: 2.6,
  MANEUVER_THRUST: 200,
  MAIN_ENGINE_THRUST: 450,
  AFTERBURNER_MULT: 2.2,
  BRAKE_MANEUVER_THRUST: 120,
  BRAKE_MAIN_THRUST: 500,
  ROTATION_ACCEL: 5.5,
  ROTATION_DAMPING: 7,
  VELOCITY_THRESHOLD: 5,
  /** Outside Precision: Q/E double-tap yaw multiplier */
  YAW_FAST_MULT: 1.65,
  /** Outside Precision: WASD double-tap thrust multiplier */
  MANEUVER_BURST_MULT: 1.3,
  /** Precision active: single-hold thrust/yaw scale (33% of default) */
  PRECISION_THRUST_MULT: 0.33,
  /** Precision active: double-tap-hold thrust/yaw scale (66% of default) */
  PRECISION_BURST_MULT: 0.66,
  /** Double-tap window (seconds) for QWEASD burst */
  DOUBLE_TAP_WINDOW: 0.32,
  /** Double-tap Alt arms zero-hold only below this speed (world u/s). */
  ZERO_HOLD_ARM_SPEED: 100,
  /** Zero-hold disengages if speed exceeds this while active. */
  ZERO_HOLD_CANCEL_SPEED: 120,
};

export const SHIP = {
  WIDTH: 44,
  HEIGHT: 28,
  /** Nose points screen-north (−Y). Local +X is still nose. */
  SPAWN_ANGLE: -Math.PI / 2,
  /** Combat turret max 3 shots/sec */
  TURRET_COOLDOWN: 1 / 3,
  TURRET_BARREL_LENGTH: 14,
  TURRET_MUZZLE_EXTRA: 2.5,
  TURRET_RECOIL_DIST: 3.5,
  TURRET_RECOIL_RECOVER: 0.1,
  TURRET_BASE_OUTER: 7,
  TURRET_BASE_MID: 5,
  TURRET_BASE_INNER: 2.8,
  /** Maneuvering thruster cup visual scale (housing/bore size, all Mk tiers) */
  THRUSTER_CUP_SCALE: VISUAL_TUNING.thrusterCupScale ?? 1.5,
  /** Maneuvering thruster plume length/width bump to match larger cups */
  THRUSTER_PLUME_SCALE: VISUAL_TUNING.thrusterPlumeScale ?? 1.15,
  /** Generic engine size × class.scale (UltraLight fix); from visualTuning */
  GENERIC_ENGINE_CLASS_SCALE: VISUAL_TUNING.genericEngineClassScale ?? 1,
  /** Combat turret traverse rate (rad/s) toward pointer */
  TURRET_SLEW_RATE: 5.5,
  /** Mining laser traverse rate (rad/s) within its arc */
  MINING_LASER_SLEW_RATE: 4.5,
  /** Half-angle of mining laser forward arc (radians) */
  MINING_LASER_ARC: (35 * Math.PI) / 180,
  MINING_LASER_RANGE: 280,
  MINING_LASER_DPS: 40,
  /** Local +X from chin hardpoint to muzzle tip (matches StarterBellDraw) */
  MINING_LASER_MUZZLE_OFFSET: 4.8,
  PROJECTILE_SPEED: 1200,
  PROJECTILE_DAMAGE: 25,
};

export const WORLD = {
  CHUNK_SIZE: 2000,
  LOAD_RADIUS: 3,
  UNLOAD_RADIUS: 5,
  SEED: 42,
  USE_MAX_SPEED_CAP: false,
  SOFT_EDGE_RADIUS: 750000,
};

export const CAMERA = {
  MAX_OFFSET_RATIO: 0.32,
  OFFSET_SMOOTHING: 4,
  STATIONARY_THRESHOLD: 15,
  ZOOM_MIN: 0.1,
  ZOOM_MAX: 2.0,
  /**
   * HUD label anchor: the internal zoom that should read as "0x" to the player.
   * Zoom below this maps linearly to [0,1] on the label; at/above 1x the label
   * matches the internal value (1x=1x, 2x=2x). See CameraSystem.displayZoom().
   */
  ZOOM_LABEL_ZERO: 0.1,
  ZOOM_WHEEL_STEP: 0.1,
  ZOOM_SMOOTHING: 6,
  SPEED_ZOOM_MAX: 1.0,
  SPEED_ZOOM_MIN: 0.55,
};

/** Dev Blueprint sandbox — ship can fill the play circle */
export const BLUEPRINT = {
  ZOOM_MIN: 1.2,
  /** Close enough for hull + mounts to fill the viewport */
  ZOOM_MAX: 22,
  ZOOM_DEFAULT: 9,
  ZOOM_WHEEL_STEP: 0.45,
  /**
   * Viewport layout (circle stays sacred — UI lives in the black outside).
   * Radius as fraction of min(w,h)/2; centerY as fraction of height (raised for inspector band).
   */
  VIEW_RADIUS_FRAC: 0.78,
  VIEW_CENTER_Y: 0.40,
};

/** Home Base hangar (docked bay; new-game / between-mission hub seed) */
export const HANGAR = {
  /** Dock pad disc radius (B2 Mk2; HangarBay BAY.PAD_R) */
  PAD_R: 38,
  /**
   * Widest zoom-out floor (actual min also tracks sidePadX so B1–B3 stay
   * frameable after layout edits). Was 1.85 @ SIDE_PAD_X=155.
   */
  ZOOM_MIN: 1.15,
  /** Manual scroll zoom-in cap (pad/hull detail). Elevator uses ZOOM_ELEVATOR. */
  ZOOM_MAX: 9,
  /** Title → hangar elevator arrival start (pad-centered close-up, not hull-fill). */
  ZOOM_ELEVATOR: 7.5,
  /** ~1080p fallback — runtime uses hangarDefaultZoom(viewportRadius) */
  ZOOM_DEFAULT: 5,
  /** Wider during launch/land so doors + path read clearly */
  ZOOM_LAUNCH: 3.2,
  ZOOM_WHEEL_STEP: 0.35,
  /**
   * Neighbor pad offset from center (B1 left / B3 right).
   * Runtime value is driven by hangar-layout `sidePadX` (Dev hangar editor).
   */
  SIDE_PAD_X: 155,
  /** Bay half-height (must match HangarBay BAY.HALF_H) */
  BAY_HALF_H: 200,
  DOOR_H: 42,
  /** North of doors = clear of hangar for launch handoff */
  LAUNCH_EXIT_Y: -260,
  /** Landing start: north of open B2 doors */
  LAND_START_Y: -245,
  /** Hover lift: ship draw scale when airborne over the pad */
  HOVER_SCALE: 1.14,
  /** Seconds for lift / lower (8-thruster burst + altitude cue) */
  HOVER_LIFT_TIME: 0.7,
  /** Peak intensity of the simultaneous 8-thruster burst */
  HOVER_BURST_POWER: 1.05,
  /** Pad turntable 180° (south → north) after landing settle */
  PAD_TURN_TIME: 1.55,
  /** Southbound entry speed into open bay */
  LAND_APPROACH_SPEED: 78,
  /** B1/B3 ambient visitor traffic */
  VISITOR_OCCUPY_CHANCE: 0.55,
  /**
   * Chance a fresh B1/B3 visitor rolls the player's own pad-Mk tier (peer-sized,
   * e.g. Standard when the player flies Standard) instead of the smaller
   * UltraLight/Light Mk1 tier. Physical pad discs are already Mk2-sized
   * (`HANGAR.PAD_R`) on every bay, so this is a spawn-pool weight, not a
   * docking-clamp limit.
   */
  VISITOR_PEER_MK_CHANCE: 0.7,
  /** Chance a leave uses the under-deck elevator instead of bay doors */
  VISITOR_ELEVATOR_CHANCE: 0.38,
  /** Empty bay: among elevator raises, chance of immediate leave vs raise-for-service */
  VISITOR_RAISE_LAUNCH_CHANCE: 0.4,
  /** Empty bay: chance next event is elevator raise (vs door arrive) */
  VISITOR_EMPTY_ELEVATOR_CHANCE: 0.35,
  VISITOR_COOLDOWN_BUSY_MIN: 11,
  VISITOR_COOLDOWN_BUSY_MAX: 24,
  /** Empty pad wait before next arrive / raise (longer so bays stay clear) */
  VISITOR_COOLDOWN_EMPTY_MIN: 18,
  VISITOR_COOLDOWN_EMPTY_MAX: 42,
  /**
   * When the pilot is in space, empty-bay door fills are requested for ambient
   * approach (keeps outside traffic cadence close to hangar-side cooldowns).
   */
  SPACE_ARRIVAL_REQUEST_RETRY_MIN: 14,
  SPACE_ARRIVAL_REQUEST_RETRY_MAX: 28,
  /**
   * After final scan turns service pips green, short beat before visitor exit.
   * (Longer legacy dwell replaced — depart should follow the green board.)
   */
  VISITOR_SERVICE_DWELL_MIN: 1.4,
  VISITOR_SERVICE_DWELL_MAX: 3.2,
  /** If a mech never walks away after status=done, force-settle pips after this */
  VISITOR_PIP_SETTLE_FAILSAFE_SEC: 5,
  /** Beat after settle before deck work starts (visitors; player uses board reveal) */
  VISITOR_ARRIVE_SETTLE_DWELL_MIN: 2,
  VISITOR_ARRIVE_SETTLE_DWELL_MAX: 5,
  /** Hangar Bay Scanners warm up before board text fills */
  BOARD_REVEAL_PRESCAN_SEC: 0.5,
  /** Player/visitor board scan after pad settle: SHIP STATS rows top→bottom */
  BOARD_REVEAL_STATS_SEC: 2,
  /** Cargo panel populate after stats */
  BOARD_REVEAL_CARGO_SEC: 1,
  /** Green ship scan continues this long after cargo panel finishes */
  BOARD_REVEAL_SCAN_TAIL_SEC: 0.5,
  /** Max wait after cargo before first service pip (captain menu) */
  BOARD_REVEAL_PIP_GAP_MAX: 2,
  /** Captain pip pick: delay between different service types */
  BOARD_REVEAL_PIP_GAP_DIFF_MIN: 0.2,
  BOARD_REVEAL_PIP_GAP_DIFF_MAX: 0.6,
  /** Captain pip pick: delay when repeating the same type as the previous pip */
  BOARD_REVEAL_PIP_GAP_SAME_MIN: 0.1,
  BOARD_REVEAL_PIP_GAP_SAME_MAX: 0.2,
  /** Quick Hangar Bay Scanner pass after all service jobs finish (before board goes green) */
  BOARD_FINAL_SCAN_SEC: 1,
  /** After B2 captain checklist finishes, wait before rolling a new list (player owns exit). */
  PLAYER_SERVICE_REROLL_MIN: 10,
  PLAYER_SERVICE_REROLL_MAX: 60,
  /** Side-bay sim run before first hangar frame (B1/B3); B2 stays fresh */
  WARMUP_SEC: 60,
  WARMUP_STEP: 0.25,
  VISITOR_HOVER_SCALE: 1.12,
  VISITOR_LIFT_TIME: 0.65,
  VISITOR_SINK_TIME: 1.75,
  VISITOR_BELOW_TIME: 2.1,
  /** Brief beat before player ship rises on title Home Base entry */
  PLAYER_ELEVATOR_BELOW_TIME: 0.75,
  /** Zoom-out after B2 pad seats at deck level (title elevator entry) */
  PLAYER_ELEVATOR_ZOOM_TIME: 1.1,
  VISITOR_RISE_TIME: 1.35,
  VISITOR_DOOR_TIME: 1.5,
  VISITOR_APPROACH_SPEED: 95,
  VISITOR_THRUST_ACCEL: 160,
};

/**
 * Dock pad Mk disc radii (world units) — Blueprint background rings + future bay sizing.
 * Mk2 matches hangar B2 (`HANGAR.PAD_R`). Mk1 sized for UltraLight/Light fill;
 * Mk3 sized for Heavy (~2× Standard).
 */
export const PAD_MK_RADIUS = {
  1: 22,
  2: HANGAR.PAD_R,
  3: 80,
};

/**
 * Blueprint-only decorative Mk4 tease radius (world units).
 * Not used for ship/class sizing — rim peeks near the play-circle edge at ZOOM_MIN.
 */
export const PAD_MK4_TEASE_RADIUS = 300;

/**
 * Jennings Station overworld exterior.
 * SCALE multiplies all station-authored world lengths vs the original (radius 160).
 * Ship-relative limits (dock speed, hull extents, angle slack) stay unscaled.
 */
const STATION_SCALE = 4;

export const STATION = {
  /** World size vs original authoring (linear). */
  SCALE: STATION_SCALE,
  WORLD_X: 0,
  WORLD_Y: 0,
  WORLD_VX: 0,
  WORLD_VY: 0,
  RADIUS: 160 * STATION_SCALE,
  /**
   * Dock / official entrance on the north rim (must match RADIUS).
   * Enter-ready circle is centered here; caution paint sits on this Y.
   */
  DOCK_FACE_Y: 160 * STATION_SCALE,
  APPROACH_RADIUS: 420 * STATION_SCALE,
  /** Enter/Click ready distance from dock face (furthest approach lights sit here) */
  DOCK_RADIUS: 160 * STATION_SCALE,
  /**
   * Floating runway length: station north rim → outer approach lights.
   * (With DOCK_FACE_Y === RADIUS, equals DOCK_RADIUS.)
   */
  RUNWAY_LENGTH: 160 * STATION_SCALE,
  /** Safe approach speed — ship handling, not station scale */
  DOCK_MAX_SPEED: 120,
  /** Bay mouth half-width (caution stripe span); approach corridor matches */
  MOUTH_HALF_W: 58 * STATION_SCALE,
  /**
   * Mouth geometry (local Y): caution paint on the circle at −RADIUS.
   * Black apron is only north of the paint; hull is solid south of it.
   */
  MOUTH_APRON: 28 * STATION_SCALE,
  MOUTH_STRIPE_H: 6 * STATION_SCALE,
  MOUTH_FRAME_PAD: 10 * STATION_SCALE,
  MOUTH_SILL_BAR_H: 8 * STATION_SCALE,
  /** How far cheeks flare out past the jambs to blend into the disc */
  MOUTH_CHEEK_OUT: 18 * STATION_SCALE,
  /** How far south cheeks wrap onto the disc from the paint */
  MOUTH_CHEEK_SOUTH: 26 * STATION_SCALE,
  /**
   * Unique hangar roof pad just south of the caution paint (rounded rect).
   * Part of entrance occlusion with the tape.
   */
  HANGAR_ROOF_DEPTH: 80 * STATION_SCALE,
  HANGAR_ROOF_HALF_W: (58 + 10 + 6) * STATION_SCALE,
  HANGAR_ROOF_CORNER: 12 * STATION_SCALE,
  /**
   * Hangar→space exit: nest this far south of the paint (under hangar roof)
   * so the ship starts occluded and crosses the sill outbound.
   */
  EXIT_NEST: 22 * STATION_SCALE,
  /**
   * Hangar→space exit burn ends when the north tip is this close to the
   * furthest (outer) approach-light pair.
   */
  EXIT_BURN_LIGHT_PAD: 36 * STATION_SCALE,
  /** Failsafe max duration for exit burn (seconds) */
  EXIT_BURN_MAX_SEC: 14,
  /** Occlusion speed hysteresis above DOCK_MAX_SPEED (avoids tape flicker) */
  OCCLUDE_SPEED_SLACK: 18,
  /** Approach guide lights: pairs from DOCK_RADIUS inward to the stripe sill */
  APPROACH_LIGHT_PAIRS: 5,
  APPROACH_LIGHT_HALF_W: 72 * STATION_SCALE,
  APPROACH_LIGHT_R: 3.2 * STATION_SCALE,
  /** Chase: seconds between successive pair blinks (furthest → closest) */
  APPROACH_LIGHT_STEP: 0.26,
  /** How long each pair stays lit in a chase step */
  APPROACH_LIGHT_ON: 0.2,
  /** Full-station blink period when all pads blocked */
  APPROACH_LIGHT_FULL_BLINK: 0.45,
  /** Pad / runway bay status lights (core disc radius) */
  PAD_STATUS_LIGHT_R: 2.0 * STATION_SCALE,
  /** Auto-ingress: nose-in (south) or reverse nose-out (north) within this slack (rad) */
  INGRESS_ANGLE_SLACK: 0.5,
  /** Fallback ship-local +X / −X extents when a def has no footprint */
  LEADING_EDGE_FALLBACK: 22,
  AFT_EDGE_FALLBACK: 20,
  /**
   * How far past the caution sill (world +Y, into the bay) the inbound hull edge
   * may travel before auto-ingress fires — tip enters the aperture first.
   */
  INGRESS_EDGE_OVERHANG: 16 * STATION_SCALE,
  /** Max edge depth past trigger still counted (avoids one-frame skips) */
  INGRESS_TRIGGER_WINDOW: 48 * STATION_SCALE,
  INGRESS_CORRIDOR_PAD_Y: 28 * STATION_SCALE,
  INGRESS_CORRIDOR_PAD_X: 10 * STATION_SCALE,
  INGRESS_MOUTH_SLACK: 4 * STATION_SCALE,
  /** Exterior arms / core set dressing */
  ARM_ROOT: 70 * STATION_SCALE,
  ARM_LEN: 110 * STATION_SCALE,
  ARM_LEN_S: 90 * STATION_SCALE,
  ARM_BEAM_HALF_H: 10 * STATION_SCALE,
  ARM_TIP_W: 28 * STATION_SCALE,
  ARM_TIP_H: 32 * STATION_SCALE,
  CORE_HALF_W: 48 * STATION_SCALE,
  CORE_HALF_H: 38 * STATION_SCALE,
  BEACON_R: 3.5 * STATION_SCALE,
  LABEL_GAP: 22 * STATION_SCALE,
};

/**
 * Sparse ambient traffic (modular ships in open space).
 * Near hangar: a few ships + always-on police pack. Deep: rare, not zero.
 * Near/mid/deep bands scale with STATION.SCALE so density stays station-relative.
 * Spawn/despawn only off-screen (never pop in/out of the player's view).
 */
export const AMBIENT = {
  MAX_SHIPS: 16,
  /** Soft cap for non-police near the station */
  MAX_NEAR_NON_POLICE: 5,
  /** Always maintain this many police around the station (min = max) */
  MIN_POLICE: 3,
  MAX_POLICE: 3,
  /**
   * Fixed pack mix (length = MIN/MAX_POLICE):
   * 1× Heavy fighter (biggest tier, Mk5) + 2× Standard fighter (Mk2 — player size).
   */
  POLICE_SLOTS: [
    { classId: 'heavyFighter', mk: 5 },
    { classId: 'standardFighter', mk: 2 },
    { classId: 'standardFighter', mk: 2 },
  ],
  NEAR_RADIUS: 900 * STATION_SCALE,
  MID_RADIUS: 2800 * STATION_SCALE,
  DEEP_RADIUS: 9000 * STATION_SCALE,
  FALLOFF_K: 2.4,
  DEEP_FLOOR: 0.04,
  DEEP_FALLOFF: 1.8,
  NEAR_ACCEPT: 0.75,
  DEEP_ACCEPT: 0.35,
  DEEP_SPAWN_CHANCE: 0.12,
  DEEP_SPAWN_MIN: 4200 * STATION_SCALE,
  DEEP_SPAWN_MAX: 7800 * STATION_SCALE,
  FLYBY_RADIUS: 1600 * STATION_SCALE,
  SPAWN_INTERVAL_MIN: 2.2,
  SPAWN_INTERVAL_MAX: 6.5,
  /** Absolute far cull (still requires off-screen) */
  CULL_DIST: 7500 * STATION_SCALE,
  /** Ship-relative clearance / scan (not station scale) */
  PLAYER_CLEARANCE: 220,
  SCAN_RANGE: 520,
  /**
   * Extra world units beyond the circular play viewport for spawn/despawn.
   * Ships only appear/disappear outside viewRadius + this margin.
   */
  VISIBLE_MARGIN: 140,
  /**
   * Extra world units beyond max radar reach. Ambient spawn/despawn also
   * stay outside this bubble around the player so contacts don't pop onto /
   * off the radar. Cheap: still capped by MAX_SHIPS.
   */
  SCAN_HORIZON_MARGIN: 1200,
  /** Seed this many non-police near the station on flight start (off-screen) */
  SEED_NEAR_TRAFFIC: 3,
  /**
   * Min gap between spawned bay approaches (hangar-requested fills).
   * Tuned so outside mouth traffic feels like hangar visitor cadence.
   */
  BAY_APPROACH_SPAWN_MIN: 12,
  BAY_APPROACH_SPAWN_MAX: 26,
  /**
   * Station customers spawn on a wide ring around the station (all bearings),
   * then fly inbound to the north runway staging point — not only from the north.
   */
  CUSTOMER_SPAWN_R_MIN: 2000 * STATION_SCALE,
  CUSTOMER_SPAWN_R_MAX: 3400 * STATION_SCALE,
  /** Staging point north of furthest approach lights before final runway approach */
  CUSTOMER_STAGE_NORTH: 420 * STATION_SCALE,
  CUSTOMER_INBOUND_SPEED: 175,
  CUSTOMER_STAGE_ARRIVAL_R: 140,
  /**
   * Station holding racetrack (north of runway). South edge sits
   * HOLD_RUNWAY_CLEARANCE above furthest approach lights.
   */
  HOLD_RUNWAY_CLEARANCE: 220 * STATION_SCALE,
  HOLD_HALF_W: 200 * STATION_SCALE,
  HOLD_HALF_H: 110 * STATION_SCALE,
  HOLD_ARRIVAL_R: 70,
  HOLD_CRUISE_SPEED: 70,
  /**
   * Police hex orbit: station edge + 2× runway length
   * (visible around Jennings, not deep-space).
   */
  POLICE_ORBIT_R: 160 * STATION_SCALE + 2 * (160 * STATION_SCALE),
  /** Slight radial spread so the pack isn’t on one perfect circle */
  POLICE_ORBIT_SPREAD: 80 * STATION_SCALE,
  /** Police hex legs around station */
  POLICE_HEX_SIDES: 6,
  POLICE_ARRIVAL_R: 90,
  /** Lane/shuttle chord hex (slightly looser) */
  LANE_HEX_SIDES: 6,
  LANE_ARRIVAL_R: 90,
  /**
   * Reboost hysteresis: burn only when speed < cruise*(1-band).
   * At/above that → coast (no thrust). No upper-band braking; only PHYSICS.MAX_SPEED clamps.
   */
  COAST_SPEED_BAND: 0.08,
  COAST_HEADING_TOL: 0.22,
};

export const RENDER = {
  CIRCLE_MARGIN: 0.08,
};

/**
 * Radar / sensor tuning. Detection is range-gated and driven by
 * `effectiveTier = min(radarMk, radarPips)` (360° sweep / Radar channel).
 * The tier table is data-driven and open-ended — append rows for higher Mks / bigger pip pools.
 * Each tier's `range` is world units; HUD km = `range / KM_SCALE`.
 *
 * Plot radius uses a piecewise pip map: 1 pip fills the whole band/scope with
 * R1; each extra pip halves the outermost display band and extends reach to Rn.
 * Range-divider rings sit at display fracs 0.5, 0.75, 0.875, … (tier − 1 rings).
 */
export const RADAR = {
  /**
   * @deprecated Legacy base; tier rows now store absolute world ranges.
   * Kept so older multipliers / drawers don't NaN if referenced.
   */
  RANGE: 12000,
  /** World units per displayed kilometre (contact + ring labels). */
  KM_SCALE: 100,
  /** Contacts beyond this fraction of the tier range read as "edge" (ghosted). */
  EDGE_MARGIN: 0.12,
  /** Hard cap on plotted contacts (ships/station kept before asteroids). */
  MAX_CONTACTS: 48,
  /**
   * Sweep arms scale with tier up to this cap. Further pips boost angular
   * speed instead (`SWEEP_SPEED + (tier − SWEEP_ARM_MAX) × SWEEP_SPEED_PER_EXTRA_PIP`).
   */
  SWEEP_ARM_MAX: 3,
  /** Base radar sweep angular speed (rad/s) at ≤ SWEEP_ARM_MAX pips. */
  SWEEP_SPEED: 0.95,
  /** Added rad/s for each radar pip beyond SWEEP_ARM_MAX. */
  SWEEP_SPEED_PER_EXTRA_PIP: 0.4,
  /** @deprecated use SWEEP_SPEED — kept so old reads don't NaN */
  SWEEP_BASE: 0.95,
  SWEEP_TIER_MULT: 0,
  /** Residual blip alpha after one full sweep without a re-ping. */
  BLIP_FADE_FLOOR: 0.22,
  /** Selected-contact sweep pulse fade rate (1 → 0, per second). */
  SELECTION_PULSE_DECAY: 2.8,
  /** Shortest-arc epsilon (rad) when deciding a painted contact has moved. */
  BLIP_BEARING_EPS: 0.04,
  /** Asteroids/objects on by default (dev drawer can disable). */
  INCLUDE_ASTEROIDS: true,
  /**
   * Temporary test gate: asteroid contacts only within this tier's range (R1),
   * even when the live radar tier is higher. Bump to widen later.
   */
  ASTEROID_RANGE_TIER: 1,
  /**
   * Tier rows indexed by effectiveTier (0 = off). `range` = world units
   * (strictly increasing). Display km = range / KM_SCALE.
   */
  TIERS: [
    { range: 0 }, // 0 — off
    { range: 5000 }, // 1 — 50 km
    { range: 10000 }, // 2 — 100 km
    { range: 15000 }, // 3 — 150 km
    { range: 20000 }, // 4 — 200 km
    { range: 25000 }, // 5 — 250 km (Mk5 / 5 pips)
  ],
};

/** Furthest radar world range (highest TIERS.range). */
export function radarMaxRange() {
  let m = 0;
  for (const row of RADAR.TIERS) {
    if ((row.range || 0) > m) m = row.range;
  }
  return m;
}

/**
 * IFF (Identification Friend or Foe) palette. Applies to radar contacts and
 * POIs. Blue = known neutral POI + its patrols; Yellow = unknown/unidentified
 * (incl. unaffiliated civilians); Red = hostile; Green = faction ally.
 */
export const IFF = {
  blue: '#5fb0ff',
  yellow: '#ffd24a',
  red: '#ff5a5a',
  green: '#5fe08a',
  /** Non-IFF space objects (asteroids, debris). */
  object: '#9aa6b0',
};

/** Points-of-interest / waypoint tracker tuning. */
export const POI = {
  /** Register a POI when the player passes within this world range. */
  DISCOVER_RANGE: 2600,
  /** Discovery source tags. */
  SOURCE: {
    PROXIMITY: 'proximity',
    MISSION: 'mission',
    MANUAL: 'manual',
    PURCHASE: 'purchase',
  },
};

/** Ephemeral nav route queue (distinct from POI Book). */
export const NAV = {
  ARRIVAL_RADIUS_BASE: 600,
  ARRIVAL_RADIUS_SPEED_MULT: 0.35,
  ARRIVAL_RADIUS_MAX: 2400,
  MAX_STOPS: 12,
  /** Nav-route-only — travel log trails must not use white. */
  GENERIC_STOP_COLOR: '#ffffff',
  ROUTE_LINE_COLOR: '#ffffff',
  /** @param {number} speed Ship speed magnitude (world u/s). */
  effectiveArrivalRadius(speed) {
    const s = Math.max(0, speed || 0);
    const r = NAV.ARRIVAL_RADIUS_BASE + s * NAV.ARRIVAL_RADIUS_SPEED_MULT;
    return Math.min(NAV.ARRIVAL_RADIUS_MAX, Math.max(NAV.ARRIVAL_RADIUS_BASE, r));
  },
};

/**
 * Global power-pip pool. Systems draw pips as distinct channels.
 * Radar tier reads `radar`; Forward Looking Scanner reads `scanner`.
 */
export const PIPS = {
  /** Maximum pips the generator can supply (fully fueled). */
  BASE_POOL: 12,
  /** Prototype startup effective pool (dev-bake target). */
  DEFAULT_GENERATOR_PIPS: 8,
  CHANNELS: ['radar', 'scanner', 'engine', 'weapons', 'shield'],
  DEFAULTS: { radar: 2, scanner: 1, engine: 2, weapons: 1, shield: 0 },
  MAX_PER_CHANNEL: 5,
  MAX_LOADOUTS: 12,
};
