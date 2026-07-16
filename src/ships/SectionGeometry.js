/**
 * Unit-space section footprints + mount anchors (scale=1, morph=0).
 * Drawing and hardpoints both multiply by sectionScale(class.scale, morph).
 * Mount templates live in data/mountLayouts.js (Dev Mode bake target).
 */

import {
  BELL_MOUNTS as BELL_MOUNTS_DATA,
  ULTRA_MOUNTS,
  ultraMountsFromData,
} from './data/mountLayouts.js';

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
 * @typedef {{ key: string, category: string, x: number, y: number, angle: number, articulation?: string, face?: string }} MountT
 */

/** Live-editable bell mounts (same object as data module — mutations hot-apply). */
export const BELL_MOUNTS = BELL_MOUNTS_DATA;

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
  return ultraMountsFromData(classId);
}

export { ULTRA_MOUNTS };
