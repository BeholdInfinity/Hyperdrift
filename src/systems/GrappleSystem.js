import { Vec2 } from '../utils/MathUtils.js';
import { PICKUP_COLLECT_RADIUS } from './MiningDropSystem.js';

/** Catch radius while the hook is flying (world units). */
const HOOK_CATCH_RADIUS = 22;
/** How close the empty hook must get to the muzzle before idle. */
const REEL_HOME_RADIUS = 8;

/** MMB grapple — optional remote ore collection. */
export class GrappleSystem {
  constructor() {
    /** @type {'idle'|'extending'|'reeling'|'reelingEmpty'} */
    this.state = 'idle';
    this.hookX = 0;
    this.hookY = 0;
    this.hookVx = 0;
    this.hookVy = 0;
    this.targetDrop = null;
    this.extendSpeed = 520;
    this.reelSpeed = 380;
    this._dirX = 1;
    this._dirY = 0;
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

  _shipVel(ship) {
    return { x: ship.velocity?.x ?? 0, y: ship.velocity?.y ?? 0 };
  }

  /**
   * Carry a world point with the ship for this frame, then step toward `target`
   * at `speed` in the ship-relative frame (so orbital velocity can't leave it behind).
   * @returns {{ x: number, y: number, dist: number, arrived: boolean }}
   */
  _coMoveToward(x, y, targetX, targetY, ship, deltaTime, speed, arriveR) {
    const sv = this._shipVel(ship);
    let hx = x + sv.x * deltaTime;
    let hy = y + sv.y * deltaTime;
    const dx = targetX - hx;
    const dy = targetY - hy;
    const dist = Math.hypot(dx, dy);
    const step = speed * deltaTime;
    if (dist <= arriveR || dist <= step) {
      return { x: targetX, y: targetY, dist: 0, arrived: true };
    }
    const ux = dx / dist;
    const uy = dy / dist;
    return {
      x: hx + ux * step,
      y: hy + uy * step,
      dist: dist - step,
      arrived: false,
      ux,
      uy,
    };
  }

  /**
   * Fire grapple toward world aim point (no pre-aim drop required).
   * Hook velocity = ship velocity + aim-direction × extendSpeed.
   * @returns {boolean}
   */
  tryFire(ship, aimWorld, _miningDropSystem) {
    if (!ship || this.state !== 'idle') return false;
    const origin = this.originWorld(ship);
    const dx = aimWorld.x - origin.x;
    const dy = aimWorld.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return false;
    const ux = dx / dist;
    const uy = dy / dist;
    const sv = this._shipVel(ship);

    this.state = 'extending';
    this.targetDrop = null;
    this.hookX = origin.x;
    this.hookY = origin.y;
    this._dirX = ux;
    this._dirY = uy;
    this.hookVx = sv.x + ux * this.extendSpeed;
    this.hookVy = sv.y + uy * this.extendSpeed;
    return true;
  }

  /**
   * @param {object} ship
   * @param {number} deltaTime
   * @param {import('./MiningDropSystem.js').MiningDropSystem} miningDropSystem
   * @param {{ pushShipLog?: (msg: string) => void }} [hooks]
   */
  update(ship, deltaTime, miningDropSystem, hooks = {}) {
    if (this.state === 'idle' || !ship) return;

    const origin = this.originWorld(ship);
    const maxLen = this.maxCableLength(ship);
    const sv = this._shipVel(ship);

    if (this.state === 'extending') {
      // Refresh ship-velocity component each frame (thrust / orbit stay matched).
      this.hookVx = sv.x + this._dirX * this.extendSpeed;
      this.hookVy = sv.y + this._dirY * this.extendSpeed;

      const prevX = this.hookX;
      const prevY = this.hookY;
      this.hookX += this.hookVx * deltaTime;
      this.hookY += this.hookVy * deltaTime;

      const caught =
        this._findDropNearHook(miningDropSystem, HOOK_CATCH_RADIUS) ||
        this._findDropAlongSegment(miningDropSystem, prevX, prevY, this.hookX, this.hookY);
      if (caught) {
        this.targetDrop = caught;
        caught._grappled = true;
        this.state = 'reeling';
        this._syncHookToDrop();
        return;
      }

      const cable = Math.hypot(this.hookX - origin.x, this.hookY - origin.y);
      if (cable >= maxLen) {
        this._clampHookToCable(origin, maxLen);
        this.state = 'reelingEmpty';
        this.hookVx = 0;
        this.hookVy = 0;
      }
      return;
    }

    if (this.state === 'reeling') {
      const drop = this.targetDrop;
      if (!drop?.active) {
        if (drop) drop._grappled = false;
        this.state = 'reelingEmpty';
        this.targetDrop = null;
        return;
      }
      const moved = this._coMoveToward(
        drop.position.x,
        drop.position.y,
        origin.x,
        origin.y,
        ship,
        deltaTime,
        this.reelSpeed,
        PICKUP_COLLECT_RADIUS
      );
      drop.position.x = moved.x;
      drop.position.y = moved.y;
      // Velocity is informational only — position is owned while `_grappled`.
      drop.velocity.set(
        sv.x + (moved.ux ?? 0) * this.reelSpeed,
        sv.y + (moved.uy ?? 0) * this.reelSpeed
      );
      this.hookX = drop.position.x;
      this.hookY = drop.position.y;
      if (moved.arrived) {
        miningDropSystem?.collectDrop(ship, drop, hooks);
        this._reset();
      }
      return;
    }

    if (this.state === 'reelingEmpty') {
      const moved = this._coMoveToward(
        this.hookX,
        this.hookY,
        origin.x,
        origin.y,
        ship,
        deltaTime,
        this.reelSpeed,
        REEL_HOME_RADIUS
      );
      this.hookX = moved.x;
      this.hookY = moved.y;
      if (moved.arrived) {
        this._reset();
        return;
      }
      this.hookVx = sv.x + (moved.ux ?? 0) * this.reelSpeed;
      this.hookVy = sv.y + (moved.uy ?? 0) * this.reelSpeed;
    }
  }

  _findDropNearHook(miningDropSystem, radius) {
    return miningDropSystem?.pickDropAt(this.hookX, this.hookY, radius) ?? null;
  }

  /** Swept catch along this frame's hook travel (avoids tunneling past small ore). */
  _findDropAlongSegment(miningDropSystem, x0, y0, x1, y1) {
    const drops = miningDropSystem?.getDrops?.();
    if (!drops?.size) return null;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;
    let best = null;
    let bestD = HOOK_CATCH_RADIUS;
    for (const drop of drops) {
      if (!drop.active) continue;
      let t = 0;
      if (lenSq > 1e-8) {
        t = ((drop.position.x - x0) * dx + (drop.position.y - y0) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      const d = Math.hypot(drop.position.x - px, drop.position.y - py);
      if (d < bestD) {
        bestD = d;
        best = drop;
      }
    }
    return best;
  }

  _syncHookToDrop() {
    const drop = this.targetDrop;
    if (!drop) return;
    this.hookX = drop.position.x;
    this.hookY = drop.position.y;
    this.hookVx = 0;
    this.hookVy = 0;
  }

  _clampHookToCable(origin, maxLen) {
    const dx = this.hookX - origin.x;
    const dy = this.hookY - origin.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    const s = maxLen / d;
    this.hookX = origin.x + dx * s;
    this.hookY = origin.y + dy * s;
  }

  _reset() {
    if (this.targetDrop) this.targetDrop._grappled = false;
    this.state = 'idle';
    this.targetDrop = null;
    this.hookVx = 0;
    this.hookVy = 0;
  }

  /** Cable segment for render. */
  cableSegment(ship) {
    if (this.state === 'idle' || !ship) return null;
    const o = this.originWorld(ship);
    return { x1: o.x, y1: o.y, x2: this.hookX, y2: this.hookY };
  }
}
