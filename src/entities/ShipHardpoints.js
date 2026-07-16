/**
 * Legacy hardpoint table — kept as fallback / documentation of starter mounts.
 * Runtime player mounts come from `ship.shipDef` (see `src/ships/`).
 * +X = nose, +Y = starboard. Angles are exhaust / fire direction.
 * Canonical unit poses: `src/ships/data/mountLayouts.js` (BELL_MOUNTS).
 */
export const SHIP_EXTENT = {
  /** Matches scaled Standard Generalist (~class.scale 1.55 × unit bell) */
  LENGTH: 68,
  BEAM: 43,
};

export const HARDPOINTS = {
  /** Dorsal combat turret pivot — ship rotation center */
  dorsalTurret: { x: 0, y: 0, angle: 0 },
  /** Forward mining laser — under-bridge chin; tip past nose */
  miningLaser: { x: 18, y: 0, angle: 0 },
  mainEngine: { x: -19.6, y: 0, angle: Math.PI },

  nosePort: { x: 9.2, y: -6.8, angle: 0 },
  noseStarboard: { x: 9.2, y: 6.8, angle: 0 },
  aftPort: { x: -14.2, y: -12.5, angle: Math.PI },
  aftStarboard: { x: -14.2, y: 12.5, angle: Math.PI },
  portFore: { x: 3.5, y: -9.1, angle: -Math.PI / 2 },
  portAft: { x: -8.4, y: -11.8, angle: -Math.PI / 2 },
  starboardFore: { x: 3.5, y: 9.1, angle: Math.PI / 2 },
  starboardAft: { x: -8.4, y: 11.8, angle: Math.PI / 2 },
};

/** Maneuvering thruster keys (excludes weapons / mainEngine). */
export const THRUSTER_KEYS = [
  'aftPort',
  'aftStarboard',
  'nosePort',
  'noseStarboard',
  'portFore',
  'portAft',
  'starboardFore',
  'starboardAft',
];
