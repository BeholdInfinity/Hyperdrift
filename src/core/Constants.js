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
  /** Precision active: base thrust/yaw scale */
  PRECISION_THRUST_MULT: 0.45,
  /** Precision active: double-tap burst toward near-default cruise */
  PRECISION_BURST_MULT: 0.9,
  /** Caps desire engages below this speed; while Precision active this is also max speed */
  PRECISION_ENGAGE_SPEED: 100,
  /** Seconds Space must be held in Precision before main engine thrust */
  MAIN_ENGINE_WARMUP: 0.45,
  /** Double-tap window (seconds) for QWEASD burst */
  DOUBLE_TAP_WINDOW: 0.32,
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
  /** Combat turret traverse rate (rad/s) toward pointer */
  TURRET_SLEW_RATE: 5.5,
  /** Mining laser traverse rate (rad/s) within its arc */
  MINING_LASER_SLEW_RATE: 4.5,
  /** Half-angle of mining laser forward arc (radians) */
  MINING_LASER_ARC: (35 * Math.PI) / 180,
  MINING_LASER_RANGE: 280,
  MINING_LASER_DPS: 40,
  PROJECTILE_SPEED: 1200,
  PROJECTILE_DAMAGE: 25,
};

export const WORLD = {
  CHUNK_SIZE: 2000,
  LOAD_RADIUS: 3,
  UNLOAD_RADIUS: 5,
  SEED: 42,
};

export const CAMERA = {
  MAX_OFFSET_RATIO: 0.32,
  OFFSET_SMOOTHING: 4,
  STATIONARY_THRESHOLD: 15,
  ZOOM_MIN: 0.4,
  ZOOM_MAX: 2.0,
  ZOOM_WHEEL_STEP: 0.1,
  ZOOM_SMOOTHING: 6,
  SPEED_ZOOM_MAX: 1.0,
  SPEED_ZOOM_MIN: 0.55,
};

/** Home Base hangar (docked bay; new-game / between-mission hub seed) */
export const HANGAR = {
  /** Ceiling stop — three pads + bay door still readable */
  ZOOM_MIN: 1.85,
  /** Close enough that the hull fills most of the play circle */
  ZOOM_MAX: 14,
  /** Enter wide enough to read door + neighbor pads */
  ZOOM_DEFAULT: 9,
  /** Wider during launch/land so doors + path read clearly */
  ZOOM_LAUNCH: 3.2,
  ZOOM_WHEEL_STEP: 0.35,
  /** Neighbor pad offset from center (B1 left / B3 right) */
  SIDE_PAD_X: 155,
  /** Player docks on bay B2 (center) */
  PLAYER_PAD_X: 0,
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
  VISITOR_OCCUPY_CHANCE: 0.68,
  /** Chance a leave/arrive uses the under-deck elevator instead of bay doors */
  VISITOR_ELEVATOR_CHANCE: 0.38,
  /** Empty bay: chance next event is elevator raise → quick launch (vs door arrive-and-stay) */
  VISITOR_RAISE_LAUNCH_CHANCE: 0.32,
  VISITOR_COOLDOWN_BUSY_MIN: 11,
  VISITOR_COOLDOWN_BUSY_MAX: 24,
  VISITOR_COOLDOWN_EMPTY_MIN: 5,
  VISITOR_COOLDOWN_EMPTY_MAX: 14,
  VISITOR_HOVER_SCALE: 1.12,
  VISITOR_LIFT_TIME: 0.65,
  VISITOR_SINK_TIME: 1.75,
  VISITOR_BELOW_TIME: 2.1,
  VISITOR_RISE_TIME: 1.35,
  VISITOR_DOOR_TIME: 1.5,
  VISITOR_APPROACH_SPEED: 95,
  VISITOR_THRUST_ACCEL: 160,
};

/** Jennings Station overworld exterior */
export const STATION = {
  WORLD_X: 0,
  WORLD_Y: 0,
  RADIUS: 160,
  /** Spawn distance north of station center after hangar exit */
  EXIT_OFFSET: 210,
  /** Dock face Y relative to station center (bay mouth) */
  DOCK_FACE_Y: 150,
  APPROACH_RADIUS: 420,
  DOCK_RADIUS: 160,
  DOCK_MAX_SPEED: 120,
};

export const RENDER = {
  CIRCLE_MARGIN: 0.08,
};
