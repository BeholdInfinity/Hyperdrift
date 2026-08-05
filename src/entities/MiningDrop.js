import { Entity } from './Entity.js';

/** World-space mining loot chunk ejected from a popped module. */
export class MiningDrop extends Entity {
  /**
   * @param {number} x
   * @param {number} y
   * @param {string} oreType
   * @param {Record<string, number>|string} composition
   * @param {number} [amount]
   */
  constructor(x, y, oreType, composition, amount = 1) {
    super(x, y);
    this.oreType = oreType;
    this.composition = composition;
    this.amount = amount;
    this.radius = 5;
    this.lifetime = 120;
    this.maxLifetime = 120;
  }

  update(deltaTime) {
    if (!this._grappled) {
      this.position.x += this.velocity.x * deltaTime;
      this.position.y += this.velocity.y * deltaTime;
    }
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) this.destroy();
  }
}
