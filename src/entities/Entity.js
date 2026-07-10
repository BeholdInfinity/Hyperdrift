import { Vec2 } from '../utils/MathUtils.js';

export class Entity {
  constructor(x = 0, y = 0) {
    this.position = new Vec2(x, y);
    this.velocity = new Vec2();
    this.angle = 0;
    this.angularVelocity = 0;
    this.mass = 1;
    this.momentOfInertia = 1;
    this.active = true;
    this.id = Entity._nextId++;
  }

  static _nextId = 1;

  update(_deltaTime) {}

  destroy() {
    this.active = false;
  }
}
