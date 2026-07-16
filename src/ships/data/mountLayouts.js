/**
 * Unit-space mount layouts — machine-editable via Dev Mode Blueprint Author.
 * Positions match hull footprints at scale=1, morph=0; catalog applies sectionScale.
 */

/** @typedef {{ key: string, category: string, x: number, y: number, angle: number, articulation?: string, face?: string }} MountT */

/** @type {Record<string, MountT[]>} */
export const BELL_MOUNTS = {
  bridge: [
    {
      key: 'miningLaser',
      category: 'forwardLaser',
      x: 18,
      y: 0,
      angle: 0,
      articulation: 'slewArc',
      face: 'chin',
    },
  ],
  body: [
    {
      key: 'dorsalTurret',
      category: 'smallTurret',
      x: 0,
      y: 0,
      angle: 0,
      articulation: 'slew360',
      face: 'dorsal',
    },
    {
      key: 'nosePort',
      category: 'maneuverThruster',
      x: 9.2,
      y: -6.8,
      angle: 0,
      face: 'prop',
    },
    {
      key: 'noseStarboard',
      category: 'maneuverThruster',
      x: 9.2,
      y: 6.8,
      angle: 0,
      face: 'prop',
    },
    {
      key: 'portFore',
      category: 'maneuverThruster',
      x: 3.5,
      y: -9.1,
      angle: -Math.PI / 2,
      face: 'prop',
    },
    {
      key: 'starboardFore',
      category: 'maneuverThruster',
      x: 3.5,
      y: 9.1,
      angle: Math.PI / 2,
      face: 'prop',
    },
  ],
  engine: [
    {
      key: 'mainEngine',
      category: 'mainEngine',
      x: -19.6,
      y: 0,
      angle: Math.PI,
      face: 'prop',
    },
    {
      key: 'aftPort',
      category: 'maneuverThruster',
      x: -14.2,
      y: -12.5,
      angle: Math.PI,
      face: 'prop',
    },
    {
      key: 'aftStarboard',
      category: 'maneuverThruster',
      x: -14.2,
      y: 12.5,
      angle: Math.PI,
      face: 'prop',
    },
    {
      key: 'portAft',
      category: 'maneuverThruster',
      x: -8.4,
      y: -11.8,
      angle: -Math.PI / 2,
      face: 'prop',
    },
    {
      key: 'starboardAft',
      category: 'maneuverThruster',
      x: -8.4,
      y: 11.8,
      angle: Math.PI / 2,
      face: 'prop',
    },
  ],
};

/**
 * UltraLight mounts by classId (unit space).
 * @type {Record<string, MountT[]>}
 */
export const ULTRA_MOUNTS = {
  drone: [
    {
      key: 'mainEngine',
      category: 'mainEngine',
      x: -7.6,
      y: 0,
      angle: Math.PI,
      face: 'prop',
    },
    {
      key: 'nosePort',
      category: 'maneuverThruster',
      x: 7.2 * 0.55,
      y: -2.6,
      angle: 0,
      face: 'prop',
    },
    {
      key: 'noseStarboard',
      category: 'maneuverThruster',
      x: 7.2 * 0.55,
      y: 2.6,
      angle: 0,
      face: 'prop',
    },
  ],
  scout: [
    {
      key: 'mainEngine',
      category: 'mainEngine',
      x: -11.4,
      y: 0,
      angle: Math.PI,
      face: 'prop',
    },
    {
      key: 'nosePort',
      category: 'maneuverThruster',
      x: 12.5 * 0.55,
      y: -2.8,
      angle: 0,
      face: 'prop',
    },
    {
      key: 'noseStarboard',
      category: 'maneuverThruster',
      x: 12.5 * 0.55,
      y: 2.8,
      angle: 0,
      face: 'prop',
    },
  ],
  racer: [
    {
      key: 'mainEngine',
      category: 'mainEngine',
      x: -13.5,
      y: 0,
      angle: Math.PI,
      face: 'prop',
    },
    {
      key: 'nosePort',
      category: 'maneuverThruster',
      x: 14.2 * 0.55,
      y: -3.6,
      angle: 0,
      face: 'prop',
    },
    {
      key: 'noseStarboard',
      category: 'maneuverThruster',
      x: 14.2 * 0.55,
      y: 3.6,
      angle: 0,
      face: 'prop',
    },
  ],
  lightFighter: [
    {
      key: 'noseGun',
      category: 'forwardGun',
      x: 12.5,
      y: 0,
      angle: 0,
      articulation: 'static',
      face: 'chin',
    },
    {
      key: 'mainEngine',
      category: 'mainEngine',
      x: -13.5,
      y: 0,
      angle: Math.PI,
      face: 'prop',
    },
    {
      key: 'nosePort',
      category: 'maneuverThruster',
      x: 14.2 * 0.55,
      y: -3.6,
      angle: 0,
      face: 'prop',
    },
    {
      key: 'noseStarboard',
      category: 'maneuverThruster',
      x: 14.2 * 0.55,
      y: 3.6,
      angle: 0,
      face: 'prop',
    },
  ],
};

/** Combined export for Save / DevTools */
export const MOUNT_LAYOUTS = {
  bell: BELL_MOUNTS,
  ultra: ULTRA_MOUNTS,
};

/**
 * @param {string} classId
 * @returns {MountT[]}
 */
export function ultraMountsFromData(classId) {
  const m = ULTRA_MOUNTS[classId];
  if (m) return m.map((x) => ({ ...x }));
  // Fallback matching legacy ultraMounts for unknown ids
  const engX = -13.5;
  const noseX = 14.2;
  const noseY = 3.6;
  return [
    {
      key: 'mainEngine',
      category: 'mainEngine',
      x: engX,
      y: 0,
      angle: Math.PI,
      face: 'prop',
    },
    {
      key: 'nosePort',
      category: 'maneuverThruster',
      x: noseX * 0.55,
      y: -noseY,
      angle: 0,
      face: 'prop',
    },
    {
      key: 'noseStarboard',
      category: 'maneuverThruster',
      x: noseX * 0.55,
      y: noseY,
      angle: 0,
      face: 'prop',
    },
  ];
}
