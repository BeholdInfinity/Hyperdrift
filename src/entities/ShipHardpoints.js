/**
 * Single source of truth for ship-local hardpoints.
 * +X = nose, +Y = starboard. Angles are exhaust / fire direction.
 */
export const SHIP_EXTENT = {
  LENGTH: 44,
  BEAM: 28,
};

export const HARDPOINTS = {
  /** Dorsal combat turret pivot — ship rotation center */
  dorsalTurret: { x: 0, y: 0, angle: 0 },
  /** Forward mining laser mount */
  miningLaser: { x: 21, y: 0, angle: 0 },
  mainEngine: { x: -19, y: 0, angle: Math.PI },

  nosePort: { x: 15, y: -6.5, angle: 0 },
  noseStarboard: { x: 15, y: 6.5, angle: 0 },
  aftPort: { x: -15, y: -10, angle: Math.PI },
  aftStarboard: { x: -15, y: 10, angle: Math.PI },
  portFore: { x: 5, y: -10, angle: -Math.PI / 2 },
  portAft: { x: -8, y: -13, angle: -Math.PI / 2 },
  starboardFore: { x: 5, y: 10, angle: Math.PI / 2 },
  starboardAft: { x: -8, y: 13, angle: Math.PI / 2 },
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
