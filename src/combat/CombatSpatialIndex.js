/**
 * Per-frame combat broadphase — asteroids + ship targets for weapons.
 */

import { COMBAT } from '../core/Constants.js';
import { SpatialGrid } from '../utils/SpatialGrid.js';

export class CombatSpatialIndex {
  constructor() {
    this.grid = new SpatialGrid(COMBAT.SPATIAL_CELL_SIZE);
    /** @type {unknown[]} */
    this._scratch = [];
    /** Largest ship hit radius inserted this frame (includes COMBAT.MAX_TARGET_RADIUS floor). */
    this._maxShipRadius = COMBAT.MAX_TARGET_RADIUS;
  }

  /**
   * @param {{ asteroids?: object[], ships?: import('./CombatTarget.js').CombatTarget[] }} ctx
   */
  rebuild(ctx = {}) {
    this.grid.clear();
    this._maxShipRadius = COMBAT.MAX_TARGET_RADIUS;
    const asteroids = ctx.asteroids ?? [];
    const ships = ctx.ships ?? [];

    for (const asteroid of asteroids) {
      if (!asteroid?.active) continue;
      this.grid.insert(
        `a${asteroid.id}`,
        asteroid.position.x,
        asteroid.position.y,
        asteroid.radius,
        { kind: 'asteroid', ref: asteroid }
      );
    }

    for (const target of ships) {
      if (!target) continue;
      const r = target.radius || COMBAT.MAX_TARGET_RADIUS;
      this._maxShipRadius = Math.max(this._maxShipRadius, r);
      this.grid.insert(
        `s${target.id}`,
        target.x,
        target.y,
        target.radius,
        { kind: 'ship', ref: target }
      );
    }
  }

  /**
   * Candidates near a projectile (largest ship radius + projectile radius).
   * @param {object} proj
   */
  queryProjectile(proj) {
    const pad = this._maxShipRadius + (proj.radius ?? 0);
    return this.grid.queryRadius(
      proj.position.x,
      proj.position.y,
      pad,
      this._scratch
    );
  }

  /**
   * Candidates overlapping a ray segment AABB (mining laser).
   */
  queryRay(ox, oy, dx, dy, range) {
    const pad = this._maxShipRadius;
    const endX = ox + dx * range;
    const endY = oy + dy * range;
    return this.grid.queryAABB(
      Math.min(ox, endX) - pad,
      Math.min(oy, endY) - pad,
      Math.max(ox, endX) + pad,
      Math.max(oy, endY) + pad,
      this._scratch
    );
  }
}
