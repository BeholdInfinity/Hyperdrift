import { Entity } from './Entity.js';
import { Vec2 } from '../utils/MathUtils.js';
import { SHIP } from '../core/Constants.js';

export class Projectile extends Entity {
  constructor(x, y, angle, owner) {
    super(x, y);
    this.angle = angle;
    this.owner = owner;
    this.damage = SHIP.PROJECTILE_DAMAGE;
    this.lifetime = 2;
    this.speed = SHIP.PROJECTILE_SPEED;
    this.radius = 3;

    const dir = Vec2.fromAngle(angle);
    this.velocity.x = dir.x * this.speed;
    this.velocity.y = dir.y * this.speed;
  }

  update(deltaTime) {
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.destroy();
    }
  }
}
