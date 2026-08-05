/**
 * Unified projectile / mining-laser hit resolution.
 */

import { circleCircle, rayCircle } from '../utils/CollisionUtils.js';
import { COMBAT, SHIP } from '../core/Constants.js';
import { applyHullDamage } from '../world/place/VesselInterior.js';
import { hullDamageFraction } from './CombatTarget.js';
import { assignModuleHitVertices } from '../systems/AsteroidSurface.js';

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

/** Transform world point to asteroid-local coordinates. */
export function worldToAsteroidLocal(asteroid, wx, wy) {
  const dx = wx - asteroid.position.x;
  const dy = wy - asteroid.position.y;
  const cos = Math.cos(-asteroid.angle);
  const sin = Math.sin(-asteroid.angle);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** Module polygon verts in world space (prefers expanded hitVertices). */
export function moduleWorldVertices(asteroid, mod) {
  const cos = Math.cos(asteroid.angle);
  const sin = Math.sin(asteroid.angle);
  const px = asteroid.position.x;
  const py = asteroid.position.y;
  const local = mod.hitVertices?.length ? mod.hitVertices : mod.vertices || [];
  return local.map((v) => {
    const lx = (mod.ox ?? 0) + v.x;
    const ly = (mod.oy ?? 0) + v.y;
    return { x: px + lx * cos - ly * sin, y: py + lx * sin + ly * cos };
  });
}

/** Ray vs segment; returns t along ray or null. */
function raySegmentT(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1 - ox) * sy - (y1 - oy) * sx) / denom;
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}

/** Closest hit distance along ray through module collision polygons. */
export function rayModuleHitDist(ox, oy, dx, dy, maxRange, asteroid, mod) {
  const verts = moduleWorldVertices(asteroid, mod);
  if (verts.length < 2) return null;
  let best = null;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const t = raySegmentT(ox, oy, dx, dy, a.x, a.y, b.x, b.y);
    if (t != null && t <= maxRange && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * Closest module along mining laser.
 * Prefers the rock's sticky module while the beam still intersects it (avoids
 * front-face flicker between overlapping modules).
 * @returns {{ hitDist: number|null, asteroid: object|null, module: object|null, hitWorld: {x:number,y:number}|null }}
 */
export function closestModuleLaserHit(ox, oy, dx, dy, range, asteroids, spatialIndex = null) {
  let bestDist = range;
  let bestAst = null;
  let bestMod = null;

  const candidates = spatialIndex
    ? spatialIndex.queryRay(ox, oy, dx, dy, range).filter((e) => e.kind === 'asteroid').map((e) => e.ref)
    : asteroids;

  for (const asteroid of candidates) {
    if (!asteroid.active) continue;
    asteroid.ensureModules?.();
    const modules = asteroid.activeModules?.() ?? asteroid.modules ?? [];
    if (modules.length && modules.some((m) => !m.hitVertices?.length)) {
      assignModuleHitVertices(modules);
    }

    const stickyId = asteroid._laserStickyModuleId;
    if (stickyId != null) {
      const sticky = modules.find((m) => m.id === stickyId && m.active !== false);
      if (sticky) {
        const tSticky = rayModuleHitDist(ox, oy, dx, dy, range, asteroid, sticky);
        if (tSticky != null && tSticky < bestDist) {
          // Keep sticky unless another module is clearly closer (hysteresis).
          let challengerDist = tSticky;
          let challengerMod = sticky;
          for (const mod of modules) {
            if (mod === sticky) continue;
            const t = rayModuleHitDist(ox, oy, dx, dy, challengerDist, asteroid, mod);
            if (t != null && t < challengerDist * 0.92) {
              challengerDist = t;
              challengerMod = mod;
            }
          }
          if (challengerDist < bestDist) {
            bestDist = challengerDist;
            bestAst = asteroid;
            bestMod = challengerMod;
          }
          continue;
        }
        asteroid._laserStickyModuleId = null;
      } else {
        asteroid._laserStickyModuleId = null;
      }
    }

    for (const mod of modules) {
      const t = rayModuleHitDist(ox, oy, dx, dy, bestDist, asteroid, mod);
      if (t != null && t < bestDist) {
        bestDist = t;
        bestAst = asteroid;
        bestMod = mod;
      }
    }
    if (!modules.length) {
      const hit = rayCircle(
        ox, oy, dx, dy, bestDist,
        asteroid.position.x, asteroid.position.y, asteroid.radius
      );
      if (hit !== null && hit < bestDist) {
        bestDist = hit;
        bestAst = asteroid;
        bestMod = null;
      }
    }
  }

  if (!bestAst) {
    return { hitDist: null, asteroid: null, module: null, hitWorld: null };
  }
  return {
    hitDist: bestDist,
    asteroid: bestAst,
    module: bestMod,
    hitWorld: { x: ox + dx * bestDist, y: oy + dy * bestDist },
  };
}

export { SHIP };
