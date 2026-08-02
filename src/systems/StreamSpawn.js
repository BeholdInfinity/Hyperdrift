import { Asteroid } from '../entities/Asteroid.js';
import { orbitFromWorldAt, positionAt } from '../world/OrbitKinematics.js';
import { normalizeComposition, primaryComposition } from './AsteroidCatalog.js';

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
  streamId = null,
  catalogStats = null
) {
  const { orbitR, orbitAngle0 } = orbitFromWorldAt(x, y, gameTime, layout);
  if (orbitR <= 0) return null;
  const pos = positionAt({ orbitR, orbitAngle0 }, gameTime, layout);
  const asteroid = new Asteroid(
    pos.x,
    pos.y,
    radius,
    hp,
    seed,
    composition
  );
  asteroid.kinematic = true;
  asteroid.orbitR = orbitR;
  asteroid.orbitAngle0 = orbitAngle0;
  if (catalogStats) asteroid.applyCatalogStats(catalogStats);
  else {
    asteroid.composition = normalizeComposition(composition);
    asteroid.compositionTag = primaryComposition(asteroid.composition);
  }
  asteroid.syncOrbit(gameTime, layout);
  if (streamId) asteroid.streamId = streamId;
  return asteroid;
}

/** Belt catalog rock — orbit params + taxonomy fixed at catalog build time. */
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
  asteroid.applyCatalogStats({
    sizeTier: spec.sizeTier,
    volume: spec.volume,
    weight: spec.weight,
    capacityMax: spec.capacityMax,
    capacityRemaining: spec.capacityRemaining ?? spec.capacityMax,
    radius: spec.radius,
    hp: spec.hp,
    seed: spec.seed,
    composition: spec.composition,
    compositionTag: spec.compositionTag,
    lootSeed: spec.lootSeed,
    allowHeroTiers: !!spec.allowHeroTiers,
  });
  asteroid.syncOrbit(gameTime, layout);
  if (streamId) asteroid.streamId = streamId;
  return asteroid;
}
