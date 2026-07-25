/**
 * Unified projectile / mining-laser hit resolution.
 */

import { circleCircle, rayCircle } from '../utils/CollisionUtils.js';
import { COMBAT, SHIP } from '../core/Constants.js';
import { applyHullDamage } from '../world/place/VesselInterior.js';
import { hullDamageFraction } from './CombatTarget.js';

/**
 * @param {object} proj
 * @param {{ id?: number|string, team?: string, ref?: object }} target
 * @param {object} [owner]
 */
export function shouldSkipProjectileHit(proj, target, owner = proj.owner) {
  if (!target?.ref || target.ref.combatDestroyed) return true;
  if (owner && target.ref === owner) return true;
  if (owner?.id != null && target.id === owner.id) return true;
  const ownerTeam = owner?.combatTeam ?? owner?.team;
  if (ownerTeam && target.team && ownerTeam === target.team) return true;

  const grace = COMBAT.SELF_HIT_GRACE_DIST;
  if (proj.spawnX != null && owner?.id != null && target.id === owner.id) {
    const dx = proj.position.x - proj.spawnX;
    const dy = proj.position.y - proj.spawnY;
    if (dx * dx + dy * dy < grace * grace) return true;
  }
  return false;
}

/** @param {import('./CombatSpatialIndex.js').CombatSpatialIndex|null} spatialIndex */
function asteroidCandidates(spatialIndex, proj, asteroids) {
  if (!spatialIndex) return asteroids;
  const out = [];
  for (const entry of spatialIndex.queryProjectile(proj)) {
    if (entry.kind === 'asteroid' && entry.ref?.active) out.push(entry.ref);
  }
  return out;
}

/** @param {import('./CombatSpatialIndex.js').CombatSpatialIndex|null} spatialIndex */
function shipCandidates(spatialIndex, proj, shipTargets) {
  if (!spatialIndex) return shipTargets;
  const out = [];
  for (const entry of spatialIndex.queryProjectile(proj)) {
    if (entry.kind === 'ship') out.push(entry.ref);
  }
  return out;
}

/**
 * @param {Iterable<object>} projectiles
 * @param {object[]} asteroids
 * @param {import('./CombatTarget.js').CombatTarget[]} shipTargets
 * @param {{ onShipHit?: Function, onShipDestroyed?: Function, onAsteroidImpact?: Function }} [callbacks]
 * @param {import('./CombatSpatialIndex.js').CombatSpatialIndex|null} [spatialIndex]
 */
export function checkProjectileHits(
  projectiles,
  asteroids,
  shipTargets,
  callbacks = {},
  spatialIndex = null
) {
  const impacts = [];

  for (const proj of projectiles) {
    if (!proj.active) continue;

    let hit = false;
    const astList = asteroidCandidates(spatialIndex, proj, asteroids);

    for (const asteroid of astList) {
      if (!asteroid.active) continue;
      if (circleCircle(
        proj.position.x, proj.position.y, proj.radius,
        asteroid.position.x, asteroid.position.y, asteroid.radius
      )) {
        const destroyed = asteroid.takeDamage(proj.damage);
        proj.destroy();
        impacts.push({
          kind: 'asteroid',
          x: proj.position.x,
          y: proj.position.y,
          destroyed,
          asteroid,
        });
        callbacks.onAsteroidImpact?.(impacts[impacts.length - 1]);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    const ships = shipCandidates(spatialIndex, proj, shipTargets);
    for (const target of ships) {
      if (shouldSkipProjectileHit(proj, target)) continue;
      if (circleCircle(
        proj.position.x, proj.position.y, proj.radius,
        target.x, target.y, target.radius
      )) {
        const frac = hullDamageFraction(proj.damage);
        const result = applyHullDamage(target.ref, frac);
        target.hull = result.hull;
        proj.destroy();
        impacts.push({
          kind: 'ship',
          x: proj.position.x,
          y: proj.position.y,
          destroyed: result.destroyed,
          target,
          ship: target.ref,
          owner: proj.owner,
        });
        callbacks.onShipHit?.(impacts[impacts.length - 1]);
        if (result.destroyed) {
          callbacks.onShipDestroyed?.(target.ref, target.x, target.y);
        }
        break;
      }
    }
  }

  return impacts;
}

/**
 * @param {import('./CombatSpatialIndex.js').CombatSpatialIndex|null} [spatialIndex]
 */
export function applyMiningLaserShipHit(
  ox, oy, dx, dy, range, shipTargets, owner, deltaTime, callbacks = {}, spatialIndex = null
) {
  const damage = COMBAT.MINING_LASER_HULL_DPS * deltaTime;
  let closest = null;
  let closestDist = range;

  const candidates = spatialIndex
    ? spatialIndex.queryRay(ox, oy, dx, dy, range).filter((e) => e.kind === 'ship').map((e) => e.ref)
    : shipTargets;

  for (const target of candidates) {
    if (shouldSkipProjectileHit({ owner, spawnX: ox, spawnY: oy, position: { x: ox, y: oy } }, target, owner)) {
      continue;
    }
    const hit = rayCircle(ox, oy, dx, dy, range, target.x, target.y, target.radius);
    if (hit !== null && hit < closestDist) {
      closestDist = hit;
      closest = target;
    }
  }

  if (!closest) return { hitDist: null, target: null };

  const result = applyHullDamage(closest.ref, damage);
  closest.hull = result.hull;
  callbacks.onShipHit?.({
    kind: 'ship',
    x: ox + dx * closestDist,
    y: oy + dy * closestDist,
    destroyed: result.destroyed,
    target: closest,
    ship: closest.ref,
    owner,
  });
  if (result.destroyed) {
    callbacks.onShipDestroyed?.(closest.ref, closest.x, closest.y);
  }

  return { hitDist: closestDist, target: closest };
}

/** Closest asteroid along laser. @param {import('./CombatSpatialIndex.js').CombatSpatialIndex|null} [spatialIndex] */
export function closestAsteroidLaserHit(ox, oy, dx, dy, range, asteroids, spatialIndex = null) {
  let closest = null;
  let closestDist = range;

  const candidates = spatialIndex
    ? spatialIndex.queryRay(ox, oy, dx, dy, range).filter((e) => e.kind === 'asteroid').map((e) => e.ref)
    : asteroids;

  for (const asteroid of candidates) {
    if (!asteroid.active) continue;
    const hit = rayCircle(
      ox, oy, dx, dy, range,
      asteroid.position.x, asteroid.position.y, asteroid.radius
    );
    if (hit !== null && hit < closestDist) {
      closestDist = hit;
      closest = asteroid;
    }
  }

  if (!closest) return { hitDist: null, asteroid: null };

  return { hitDist: closestDist, asteroid: closest };
}

export { SHIP };
