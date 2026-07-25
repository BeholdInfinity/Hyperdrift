import { Entity } from './Entity.js';
import { Vec2 } from '../utils/MathUtils.js';
import { SHIP } from '../core/Constants.js';
import { applyGravity } from '../world/GravitySystem.js';

export class Projectile extends Entity {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.gravityEnabled=true]
   */
  constructor(x, y, angle, owner, opts = {}) {
    super(x, y);
    this.angle = angle;
    this.owner = owner;
    this.damage = SHIP.PROJECTILE_DAMAGE;
    this.lifetime = SHIP.PROJECTILE_LIFETIME;
    this.speed = SHIP.PROJECTILE_SPEED;
    this.radius = SHIP.PROJECTILE_RADIUS;
    this.affectedByGravity = opts.gravityEnabled !== false;
    this.spawnX = x;
    this.spawnY = y;

    const dir = Vec2.fromAngle(angle);
    this.velocity.x = dir.x * this.speed + (owner?.velocity?.x ?? 0);
    this.velocity.y = dir.y * this.speed + (owner?.velocity?.y ?? 0);
  }

  update(deltaTime) {
    applyGravity(this, deltaTime);
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.destroy();
    }
  }
}
