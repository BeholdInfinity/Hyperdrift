import { Entity } from './Entity.js';
import { Vec2 } from '../utils/MathUtils.js';
import { HARDPOINTS } from './ShipHardpoints.js';

export class Ship extends Entity {
  constructor(x = 0, y = 0) {
    super(x, y);
    this.mass = 1;
    this.momentOfInertia = 1;
    this.thrusters = {
      aftPort: 0,
      aftStarboard: 0,
      nosePort: 0,
      noseStarboard: 0,
      portFore: 0,
      portAft: 0,
      starboardFore: 0,
      starboardAft: 0,
      mainEngine: 0,
      afterburner: 0,
      retroBurn: false,
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
    const gun = HARDPOINTS.gun;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return {
      x: this.position.x + gun.x * cos - gun.y * sin,
      y: this.position.y + gun.x * sin + gun.y * cos,
    };
  }

  update(deltaTime) {
    if (this.fireCooldown > 0) this.fireCooldown -= deltaTime;
    if (this.muzzleFlash > 0) this.muzzleFlash -= deltaTime;
  }
}
