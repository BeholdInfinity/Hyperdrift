/**
 * Shared Keplerian helpers — one μ for gravity + kinematic belts/stations.
 */

import { getSectorLayout } from './SectorLayout.js';

export function gravityMu(layout = getSectorLayout()) {
  return layout.planet?.gravityMu ?? 1.8e12;
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

export function positionAt(orbit, gameTime, layout = getSectorLayout()) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const R = orbit.orbitR ?? 0;
  const omega = orbit.orbitOmega ?? orbitOmegaFor(R, layout);
  const theta = (orbit.orbitAngle0 ?? 0) + omega * gameTime;
  return { x: cx + Math.cos(theta) * R, y: cy + Math.sin(theta) * R };
}

export function velocityAt(orbit, gameTime, layout = getSectorLayout()) {
  const R = orbit.orbitR ?? 0;
  const mu = gravityMu(layout);
  const omega = orbit.orbitOmega ?? orbitOmegaFor(R, layout);
  const theta = (orbit.orbitAngle0 ?? 0) + omega * gameTime;
  const v = circularSpeed(R, mu);
  return {
    vx: -Math.sin(theta) * v,
    vy: Math.cos(theta) * v,
    speed: v,
    heading: Math.atan2(Math.cos(theta), -Math.sin(theta)),
  };
}
