/**
 * Unit-space section footprints + mount anchors (scale=1, morph=0).
 * Drawing and hardpoints both multiply by sectionScale(class.scale, morph).
 */

/** Shared draw/hardpoint scale — keep mounts glued to hull edges. */
export function sectionScale(classScale = 1, morph = 0) {
  return (classScale || 1) * (1 + (morph || 0) * 0.35);
}

/** @type {Record<string, [number, number][]>} */
export const BELL_FEET = {
  bridge: [
    [20, -4],
    [12, -6.5],
    [8, -5.5],
    [8, 5.5],
    [12, 6.5],
    [20, 4],
    [21.5, 0],
  ],
  body: [
    [10, -7],
    [4, -9],
    [-6, -11],
    [-14, -13.5],
    [-16, -11],
    [-16, 11],
    [-14, 13.5],
    [-6, 11],
    [4, 9],
    [10, 7],
  ],
  engine: [
    [-8, -12],
    [-14, -14],
    [-20, -7],
    [-20, 7],
    [-14, 14],
    [-8, 12],
  ],
};

/**
 * Hardpoint templates in the same unit space as footprints.
 * @typedef {{ key: string, category: string, x: number, y: number, angle: number, articulation?: string, face?: string }} MountT
 */

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
    // Fore corners of body hull
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
    // Port / starboard beam
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

/** UltraLight hull footprints (unit) */
export const ULTRA_FEET = {
  drone: [
    [8, -3],
    [4, -4],
    [-6, -3.5],
    [-8, 0],
    [-6, 3.5],
    [4, 4],
    [8, 3],
  ],
  scout: [
    [14, -2.2],
    [6, -3.5],
    [-8, -3],
    [-12, 0],
    [-8, 3],
    [6, 3.5],
    [14, 2.2],
  ],
  racer: [
    [16, -2.5],
    [8, -4.2],
    [-4, -5],
    [-14, -3],
    [-14, 3],
    [-4, 5],
    [8, 4.2],
    [16, 2.5],
  ],
  lightFighter: [
    [15, 0],
    [10, -5],
    [-2, -6],
    [-12, -4],
    [-12, 4],
    [-2, 6],
    [10, 5],
  ],
};

/** Mounts on UltraLight hull edges */
export function ultraMounts(classId) {
  const engX = classId === 'drone' ? -7.6 : classId === 'scout' ? -11.4 : -13.5;
  const noseX = classId === 'drone' ? 7.2 : classId === 'scout' ? 12.5 : 14.2;
  const noseY = classId === 'drone' ? 2.6 : classId === 'scout' ? 2.8 : 3.6;
  /** @type {MountT[]} */
  const m = [
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
  if (classId === 'lightFighter') {
    m.unshift({
      key: 'noseGun',
      category: 'forwardGun',
      x: 12.5,
      y: 0,
      angle: 0,
      articulation: 'static',
      face: 'chin',
    });
  }
  return m;
}
