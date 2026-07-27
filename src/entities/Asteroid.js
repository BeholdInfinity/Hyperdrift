import { Entity } from './Entity.js';
import { Vec2 } from '../utils/MathUtils.js';
import { positionAt, velocityAt } from '../world/OrbitKinematics.js';
import { getSectorLayout } from '../world/SectorLayout.js';

export class Asteroid extends Entity {
  constructor(x, y, radius, hp, seed, composition = 'silicate') {
    super(x, y);
    this.radius = radius;
    this.maxHp = hp;
    this.hp = hp;
    this.seed = seed;
    /** Harvest tag: iron | ice | silicate | carbonaceous | rare | volatile | … */
    this.composition = composition;
    this.vertices = this._generateVertices();
    this.rotationSpeed = (seed % 100) / 100 * 0.8 - 0.4;
    this.mass = radius * radius * 0.01;
    this.momentOfInertia = this.mass * radius * radius;
    /** Kinematic belt / open-space rock — position driven by orbit each frame. */
    this.kinematic = false;
    this.orbitR = 0;
    this.orbitAngle0 = 0;
  }

  /** Attach circular prograde orbit (μ-derived ω at orbitR). */
  setKinematicOrbit(orbitR, orbitAngle0, gameTime = 0, layout = getSectorLayout()) {
    this.kinematic = true;
    this.orbitR = orbitR;
    this.orbitAngle0 = orbitAngle0;
    this.syncOrbit(gameTime, layout);
  }

  syncOrbit(gameTime = 0, layout = getSectorLayout()) {
    if (!this.kinematic || this.orbitR <= 0) return;
    const orbit = { orbitR: this.orbitR, orbitAngle0: this.orbitAngle0 };
    const pos = positionAt(orbit, gameTime, layout);
    const vel = velocityAt(orbit, gameTime, layout);
    this.position.set(pos.x, pos.y);
    this.velocity.set(vel.vx, vel.vy);
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
    if (!this.kinematic) {
      this.position.x += this.velocity.x * deltaTime;
      this.position.y += this.velocity.y * deltaTime;
    }
  }

  containsPoint(x, y) {
    return Vec2.distance(this.position, { x, y }) < this.radius;
  }
}
