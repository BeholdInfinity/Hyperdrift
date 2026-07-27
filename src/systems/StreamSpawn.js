import { Asteroid } from '../entities/Asteroid.js';
import { orbitFromWorldAt, positionAt } from '../world/OrbitKinematics.js';

/** Kinematic rock placed on its circular orbit at gameTime. */
export function spawnKinematicAsteroid(
  x,
  y,
  radius,
  hp,
  seed,
  composition,
  gameTime,
  layout,
  streamId = null
) {
  const { orbitR, orbitAngle0 } = orbitFromWorldAt(x, y, gameTime, layout);
  if (orbitR <= 0) return null;
  const pos = positionAt({ orbitR, orbitAngle0 }, gameTime, layout);
  const asteroid = new Asteroid(pos.x, pos.y, radius, hp, seed, composition);
  asteroid.kinematic = true;
  asteroid.orbitR = orbitR;
  asteroid.orbitAngle0 = orbitAngle0;
  asteroid.syncOrbit(gameTime, layout);
  if (streamId) asteroid.streamId = streamId;
  return asteroid;
}

/** Belt catalog rock — orbit params fixed at catalog build time. */
export function spawnBeltAsteroid(spec, gameTime, layout, streamId = null) {
  if (!spec?.orbitR) return null;
  const pos = positionAt(
    { orbitR: spec.orbitR, orbitAngle0: spec.orbitAngle0 },
    gameTime,
    layout
  );
  const asteroid = new Asteroid(
    pos.x,
    pos.y,
    spec.radius,
    spec.hp,
    spec.seed,
    spec.composition
  );
  asteroid.kinematic = true;
  asteroid.orbitR = spec.orbitR;
  asteroid.orbitAngle0 = spec.orbitAngle0;
  asteroid.syncOrbit(gameTime, layout);
  if (streamId) asteroid.streamId = streamId;
  return asteroid;
}
