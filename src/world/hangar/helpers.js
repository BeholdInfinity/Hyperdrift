import { HANGAR } from '../../core/Constants.js';
import { WELD_SPOTS_MIN, WELD_SPOTS_MAX } from './constants.js';

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function randInt(lo, hi) {
  return lo + ((Math.random() * (hi - lo + 1)) | 0);
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

function craneJobDistScale() {
  return Math.max(120, HANGAR.SIDE_PAD_X * 0.97);
}

function weldSpotsForPip() {
  return WELD_SPOTS_MIN + ((Math.random() * (WELD_SPOTS_MAX - WELD_SPOTS_MIN + 1)) | 0);
}

function bayLaneHalf() {
  const halfGap = HANGAR.SIDE_PAD_X / 2;
  return Math.min(72, Math.max(52, halfGap - 6));
}

export { rand, pick, randInt, thrusterActivity, craneJobDistScale, weldSpotsForPip, bayLaneHalf };
