import { Vec2 } from '../utils/MathUtils.js';
import { PICKUP_COLLECT_RADIUS } from './MiningDropSystem.js';

/** MMB grapple — optional remote ore collection. */
export class GrappleSystem {
  constructor() {
    /** @type {'idle'|'extending'|'attached'|'reeling'} */
    this.state = 'idle';
    this.hookX = 0;
    this.hookY = 0;
    this.targetDrop = null;
    this.extendSpeed = 520;
    this.reelSpeed = 380;
  }

  /** @returns {number} max cable length in world units */
  maxCableLength(ship) {
    const ext = ship.shipDef?.hullExtents?.() ?? { forward: 22, aft: 20 };
    return (ext.forward + ext.aft) * 5;
  }

  originWorld(ship) {
    if (typeof ship.getMiningLaserOrigin === 'function') {
      return ship.getMiningLaserOrigin();
    }
    const fwd = Vec2.fromAngle(ship.angle ?? 0);
    return {
      x: ship.position.x + fwd.x * 18,
      y: ship.position.y + fwd.y * 18,
    };
  }

  /**
   * Fire grapple toward world aim point.
   * @returns {boolean}
   */
  tryFire(ship, aimWorld, miningDropSystem) {
    if (!ship || this.state !== 'idle') return false;
    const origin = this.originWorld(ship);
    const maxLen = this.maxCableLength(ship);
    const dx = aimWorld.x - origin.x;
    const dy = aimWorld.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return false;
    const ux = dx / dist;
    const uy = dy / dist;
    const pickDist = Math.min(maxLen, dist);
    const px = origin.x + ux * pickDist;
    const py = origin.y + uy * pickDist;
    const drop = miningDropSystem?.pickDropAt(px, py, 28);
    if (!drop) return false;

    this.state = 'extending';
    this.targetDrop = drop;
    this.hookX = origin.x;
    this.hookY = origin.y;
    this._aimX = drop.position.x;
    this._aimY = drop.position.y;
    return true;
  }

  update(ship, deltaTime, miningDropSystem, hooks = {}) {
    if (this.state === 'idle' || !ship) return;

    const origin = this.originWorld(ship);
    const drop = this.targetDrop;

    if (this.state === 'extending') {
      if (!drop?.active) {
        this._reset();
        return;
      }
      const dx = drop.position.x - this.hookX;
      const dy = drop.position.y - this.hookY;
      const dist = Math.hypot(dx, dy);
      const step = this.extendSpeed * deltaTime;
      if (dist <= step + 4) {
        this.hookX = drop.position.x;
        this.hookY = drop.position.y;
        this.state = 'reeling';
      } else {
        this.hookX += (dx / dist) * step;
        this.hookY += (dy / dist) * step;
      }
      return;
    }

    if (this.state === 'reeling') {
      if (!drop?.active) {
        this._reset();
        return;
      }
      const tx = origin.x;
      const ty = origin.y;
      const dx = tx - drop.position.x;
      const dy = ty - drop.position.y;
      const dist = Math.hypot(dx, dy);
      const step = this.reelSpeed * deltaTime;
      if (dist <= PICKUP_COLLECT_RADIUS || dist <= step) {
        miningDropSystem?.collectDrop(ship, drop, hooks);
        this._reset();
        return;
      }
      drop.position.x += (dx / dist) * step;
      drop.position.y += (dy / dist) * step;
      drop.velocity.set(0, 0);
      this.hookX = drop.position.x;
      this.hookY = drop.position.y;
    }
  }

  _reset() {
    this.state = 'idle';
    this.targetDrop = null;
  }

  /** Cable segment for render. */
  cableSegment(ship) {
    if (this.state === 'idle' || !ship) return null;
    const o = this.originWorld(ship);
    return { x1: o.x, y1: o.y, x2: this.hookX, y2: this.hookY };
  }
}
