import { Projectile } from '../entities/Projectile.js';
import { SHIP } from '../core/Constants.js';
import { Vec2 } from '../utils/MathUtils.js';

export class WeaponSystem {
  constructor(entityManager, particleSystem) {
    this.entityManager = entityManager;
    this.particles = particleSystem;
  }

  update(ship, input, deltaTime) {
    if (!input.mouseDown || ship.fireCooldown > 0) return;

    const tip = ship.getCannonTip();
    const angle = ship.angle;

    const projectile = new Projectile(tip.x, tip.y, angle, ship);
    this.entityManager.add(projectile, 'projectile');

    ship.fireCooldown = SHIP.CANNON_COOLDOWN;
    ship.muzzleFlash = 0.05;

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

  checkCollisions(asteroids) {
    const projectiles = this.entityManager.getByType('projectile');
    const impacts = [];

    for (const proj of projectiles) {
      if (!proj.active) continue;

      for (const asteroid of asteroids) {
        if (!asteroid.active) continue;
        if (proj.containsPoint && !proj.containsPoint) {
          // projectile doesn't have containsPoint, use distance
        }

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
