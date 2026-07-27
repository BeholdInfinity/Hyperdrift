/**
 * Shared Keplerian helpers — one μ for gravity + kinematic belts/stations.
 */

import { getSectorLayout } from './SectorLayout.js';

export function gravityMu(layout = getSectorLayout()) {
  return layout.planet?.gravityMu ?? 1.8e12;
}

/** Guard orbit integrators — NaN/Infinity gameTime poisons station anchor + spawn. */
export function finiteGameTime(gameTime = 0) {
  return Number.isFinite(gameTime) ? gameTime : 0;
}

export function circularSpeed(R, mu) {
  if (R <= 0 || mu <= 0) return 0;
  return Math.sqrt(mu / R);
}

export function angularSpeed(R, mu) {
  if (R <= 0 || mu <= 0) return 0;
  return Math.sqrt(mu / (R * R * R));
}

export function period(R, mu) {
  const w = angularSpeed(R, mu);
  return w > 0 ? (Math.PI * 2) / w : Infinity;
}

export function orbitOmegaFor(R, layout = getSectorLayout()) {
  return angularSpeed(R, gravityMu(layout));
}

/** Circular ω from layout μ and orbitR — ignores stale baked orbitOmega. */
export function resolveOrbitOmega(orbit, layout = getSectorLayout()) {
  const R = orbit?.orbitR ?? 0;
  return orbitOmegaFor(R, layout);
}

export function positionAt(orbit, gameTime, layout = getSectorLayout()) {
  const t = finiteGameTime(gameTime);
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const R = orbit.orbitR ?? 0;
  const omega = resolveOrbitOmega(orbit, layout);
  const theta = (orbit.orbitAngle0 ?? 0) + omega * t;
  return { x: cx + Math.cos(theta) * R, y: cy + Math.sin(theta) * R };
}

export function velocityAt(orbit, gameTime, layout = getSectorLayout()) {
  const t = finiteGameTime(gameTime);
  const R = orbit.orbitR ?? 0;
  const omega = resolveOrbitOmega(orbit, layout);
  const theta = (orbit.orbitAngle0 ?? 0) + omega * t;
  // v = ωR matches circularSpeed(μ, R) and GravitySystem at the same radius.
  const v = omega * R;
  return {
    vx: -Math.sin(theta) * v,
    vy: Math.cos(theta) * v,
    speed: v,
    heading: Math.atan2(Math.cos(theta), -Math.sin(theta)),
  };
}

/**
 * Build a circular orbit that places a body at world (x, y) at gameTime.
 * @returns {{ orbitR: number, orbitAngle0: number }}
 */
export function orbitFromWorldAt(x, y, gameTime = 0, layout = getSectorLayout()) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const dx = x - cx;
  const dy = y - cy;
  const R = Math.hypot(dx, dy);
  const thetaNow = Math.atan2(dy, dx);
  const omega = orbitOmegaFor(R, layout);
  const t = finiteGameTime(gameTime);
  return { orbitR: R, orbitAngle0: thetaNow - omega * t };
}
