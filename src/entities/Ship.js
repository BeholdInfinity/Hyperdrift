import { Entity } from './Entity.js';
import { Vec2 } from '../utils/MathUtils.js';
import { SHIP } from '../core/Constants.js';

export class Ship extends Entity {
  constructor(x = 0, y = 0) {
    super(x, y);
    this.mass = 1;
    this.momentOfInertia = 1;
    this.thrusters = {
      aft: 0,
      nose: 0,
      starboard: 0,
      port: 0,
      mainEngine: 0,
      afterburner: 0,
      brakeAft: 0,
      brakeNose: 0,
      brakeStarboard: 0,
      brakePort: 0,
      retroBurn: false,
      rcsClockwise: 0,
      rcsCounterClockwise: 0,
    };
    this.fireCooldown = 0;
    this.muzzleFlash = 0;
  }

  getForward() {
    return Vec2.fromAngle(this.angle);
  }

  getRight() {
    return Vec2.fromAngle(this.angle + Math.PI / 2);
  }

  getCannonTip() {
    const forward = this.getForward();
    return {
      x: this.position.x + forward.x * SHIP.CANNON_OFFSET,
      y: this.position.y + forward.y * SHIP.CANNON_OFFSET,
    };
  }

  update(deltaTime) {
    if (this.fireCooldown > 0) this.fireCooldown -= deltaTime;
    if (this.muzzleFlash > 0) this.muzzleFlash -= deltaTime;
  }
}
