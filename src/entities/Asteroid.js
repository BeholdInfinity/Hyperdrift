import { Entity } from './Entity.js';
import { Vec2 } from '../utils/MathUtils.js';

export class Asteroid extends Entity {
  constructor(x, y, radius, hp, seed) {
    super(x, y);
    this.radius = radius;
    this.maxHp = hp;
    this.hp = hp;
    this.seed = seed;
    this.vertices = this._generateVertices();
    this.rotationSpeed = (seed % 100) / 100 * 0.8 - 0.4;
    this.mass = radius * radius * 0.01;
    this.momentOfInertia = this.mass * radius * radius;
  }

  _generateVertices() {
    const verts = [];
    const sides = 8 + (this.seed % 5);
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const r = this.radius * (0.75 + ((this.seed * (i + 1) * 7) % 100) / 200);
      verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return verts;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.destroy();
      return true;
    }
    return false;
  }

  update(deltaTime) {
    this.angle += this.rotationSpeed * deltaTime;
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
  }

  containsPoint(x, y) {
    return Vec2.distance(this.position, { x, y }) < this.radius;
  }
}
