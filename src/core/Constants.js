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

export const RENDER = {
  CIRCLE_MARGIN: 0.08,
};
