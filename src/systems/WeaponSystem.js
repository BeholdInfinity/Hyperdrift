import { Projectile } from '../entities/Projectile.js';
import { SHIP } from '../core/Constants.js';
import { Vec2, clamp, angleDifference, normalizeAngle } from '../utils/MathUtils.js';

function slewAngle(current, target, maxRate, deltaTime) {
  const diff = angleDifference(current, target);
  const step = maxRate * deltaTime;
  if (Math.abs(diff) <= step) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(diff) * step);
}

export class WeaponSystem {
  constructor(entityManager, particleSystem) {
    this.entityManager = entityManager;
    this.particles = particleSystem;
  }

  /**
   * @param {object} ship
   * @param {object} input
   * @param {{ x: number, y: number }} aimWorld
   * @param {boolean} pointerInViewport
   * @param {object[]} asteroids
   * @param {number} deltaTime
   */
  update(ship, input, aimWorld, pointerInViewport, asteroids, deltaTime) {
    const flight = input.getFlightInput();
    ship.miningLaserFiring = false;
    ship.miningLaserBeamLength = SHIP.MINING_LASER_RANGE;

    if (pointerInViewport) {
      const desiredWorld = Math.atan2(
        aimWorld.y - ship.position.y,
        aimWorld.x - ship.position.x
      );
      ship.turretAngle = slewAngle(
        ship.turretAngle,
        desiredWorld,
        SHIP.TURRET_SLEW_RATE,
        deltaTime
      );

      const desiredRel = clamp(
        angleDifference(ship.angle, desiredWorld),
        -SHIP.MINING_LASER_ARC,
        SHIP.MINING_LASER_ARC
      );
      ship.miningLaserRelAngle = slewAngle(
        ship.miningLaserRelAngle,
        desiredRel,
        SHIP.MINING_LASER_SLEW_RATE,
        deltaTime
      );
      // Keep relative angle in arc after slew (slewAngle normalizes to ±π)
      ship.miningLaserRelAngle = clamp(
        ship.miningLaserRelAngle,
        -SHIP.MINING_LASER_ARC,
        SHIP.MINING_LASER_ARC
      );
    }

    if (!pointerInViewport) return;

    if (flight.firePrimary && ship.fireCooldown <= 0) {
      this._fireTurret(ship);
    }

    if (flight.fireLaser) {
      ship.miningLaserFiring = true;
      this._applyMiningLaser(ship, asteroids, deltaTime);
    }
  }

  _fireTurret(ship) {
    const tip = ship.getTurretMuzzle();
    const angle = ship.turretAngle;

    const projectile = new Projectile(tip.x, tip.y, angle, ship);
    this.entityManager.add(projectile, 'projectile');

    ship.fireCooldown = SHIP.TURRET_COOLDOWN;
    ship.muzzleFlash = 0.06;
    ship.turretRecoil = 1;

    const dir = Vec2.fromAngle(angle);
    this.particles.emitBurst(
      tip.x, tip.y, 4, 200, 0.08,
      'rgba(100, 200, 255, 0.9)', 3, 0.5
    );
    this.particles.emit(
      tip.x + dir.x * 5, tip.y + dir.y * 5,
      dir.x * 100, dir.y * 100,
      0.06, 'rgba(150, 220, 255, 1)', 5, 'muzzle'
    );
  }

  _applyMiningLaser(ship, asteroids, deltaTime) {
    const origin = ship.getMiningLaserOrigin();
    const angle = ship.getMiningLaserWorldAngle();
    const dir = Vec2.fromAngle(angle);
    const range = SHIP.MINING_LASER_RANGE;
    const damage = SHIP.MINING_LASER_DPS * deltaTime;

    let closest = null;
    let closestDist = range;

    for (const asteroid of asteroids) {
      if (!asteroid.active) continue;
      const hit = this._rayCircle(
        origin.x, origin.y,
        dir.x, dir.y,
        range,
        asteroid.position.x, asteroid.position.y,
        asteroid.radius
      );
      if (hit !== null && hit < closestDist) {
        closestDist = hit;
        closest = asteroid;
      }
    }

    if (closest) {
      const destroyed = closest.takeDamage(damage);
      ship.miningLaserBeamLength = closestDist;
      if (destroyed) {
        this._createImpactEffect(
          origin.x + dir.x * closestDist,
          origin.y + dir.y * closestDist,
          true
        );
      }
    } else {
      ship.miningLaserBeamLength = range;
    }
  }

  /** Distance along ray to circle, or null */
  _rayCircle(ox, oy, dx, dy, maxDist, cx, cy, radius) {
    const fx = ox - cx;
    const fy = oy - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrt = Math.sqrt(disc);
    const t1 = (-b - sqrt) / (2 * a);
    const t2 = (-b + sqrt) / (2 * a);
    let t = Infinity;
    if (t1 >= 0) t = Math.min(t, t1);
    if (t2 >= 0) t = Math.min(t, t2);
    if (t === Infinity || t > maxDist) return null;
    return t;
  }

  checkCollisions(asteroids) {
    const projectiles = this.entityManager.getByType('projectile');
    const impacts = [];

    for (const proj of projectiles) {
      if (!proj.active) continue;

      for (const asteroid of asteroids) {
        if (!asteroid.active) continue;

        const dist = Vec2.distance(proj.position, asteroid.position);
        if (dist < asteroid.radius + proj.radius) {
          const destroyed = asteroid.takeDamage(proj.damage);
          proj.destroy();
          impacts.push({
            x: proj.position.x,
            y: proj.position.y,
            destroyed,
            asteroid,
          });
          break;
        }
      }
    }

    for (const impact of impacts) {
      this._createImpactEffect(impact.x, impact.y, impact.destroyed);
    }

    return impacts;
  }

  _createImpactEffect(x, y, big) {
    const count = big ? 20 : 8;
    const color = big ? 'rgba(255, 180, 80, 0.9)' : 'rgba(200, 200, 200, 0.8)';
    this.particles.emitBurst(x, y, count, big ? 250 : 120, big ? 0.5 : 0.25, color, big ? 5 : 3);
    if (big) {
      this.particles.emitBurst(x, y, 12, 180, 0.4, 'rgba(255, 100, 50, 0.7)', 4);
    }
  }
}
