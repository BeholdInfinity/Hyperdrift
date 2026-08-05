import { MiningDrop } from '../entities/MiningDrop.js';
import { oreLabel, rollModuleDrops } from './MiningLootCatalog.js';

const PICKUP_GRAV_RADIUS = 100;
const PICKUP_COLLECT_RADIUS = 18;
const GRAV_STRENGTH = 420;
/** Max relative eject speed (u/s) — 0 = match parent, up to this = gentle drift off the body. */
const DROP_DRIFT_MAX = 18;
/** Random yaw around the outward (center→pop) axis when applying drift. */
const DROP_DRIFT_CONE = Math.PI * 0.85;

export class MiningDropSystem {
  constructor(entityManager) {
    this.entityManager = entityManager;
  }

  /** @returns {Set<MiningDrop>} */
  getDrops() {
    return this.entityManager.getByType('miningDrop');
  }

  /**
   * Spawn drops from a popped module.
   * Velocity = parent rock velocity + small random outward drift (0…{@link DROP_DRIFT_MAX}).
   * @param {object} asteroid
   * @param {object} mod
   * @param {{ x: number, y: number }} [atWorld]
   */
  spawnFromModule(asteroid, mod, atWorld = null) {
    const rolls = rollModuleDrops(mod.dropTable, mod.lootSeed);
    const cx = atWorld?.x ?? asteroid.position.x;
    const cy = atWorld?.y ?? asteroid.position.y;
    const ax = asteroid.position?.x ?? cx;
    const ay = asteroid.position?.y ?? cy;
    const pvx = asteroid.velocity?.x ?? 0;
    const pvy = asteroid.velocity?.y ?? 0;

    let outX = cx - ax;
    let outY = cy - ay;
    const outLen = Math.hypot(outX, outY);
    if (outLen > 1e-4) {
      outX /= outLen;
      outY /= outLen;
    } else {
      const a = Math.random() * Math.PI * 2;
      outX = Math.cos(a);
      outY = Math.sin(a);
    }

    const spawned = [];
    for (const roll of rolls) {
      const jitter = (Math.random() - 0.5) * DROP_DRIFT_CONE;
      const cos = Math.cos(jitter);
      const sin = Math.sin(jitter);
      const dx = outX * cos - outY * sin;
      const dy = outX * sin + outY * cos;
      const drift = Math.random() * DROP_DRIFT_MAX;
      const scatter = 2 + Math.random() * 4;
      const drop = new MiningDrop(
        cx + dx * scatter,
        cy + dy * scatter,
        roll.oreType,
        roll.composition,
        roll.amount
      );
      drop.velocity.set(pvx + dx * drift, pvy + dy * drift);
      this.entityManager.add(drop, 'miningDrop');
      spawned.push(drop);
    }
    return spawned;
  }

  /**
   * @param {object} ship Player ship
   * @param {number} deltaTime
   * @param {{ pushShipLog?: (msg: string) => void }} [hooks]
   */
  update(ship, deltaTime, hooks = {}) {
    if (!ship?.position) return;
    const sx = ship.position.x;
    const sy = ship.position.y;
    if (!ship.oreHold) ship.oreHold = {};

    for (const drop of this.getDrops()) {
      if (!drop.active) continue;
      if (drop._grappled) continue;
      const dx = sx - drop.position.x;
      const dy = sy - drop.position.y;
      const dist = Math.hypot(dx, dy);

      if (dist < PICKUP_GRAV_RADIUS && dist > 1) {
        const pull = (GRAV_STRENGTH / (dist * dist)) * deltaTime;
        drop.velocity.x += (dx / dist) * pull;
        drop.velocity.y += (dy / dist) * pull;
      }

      if (dist < PICKUP_COLLECT_RADIUS) {
        this._collectDrop(ship, drop, hooks);
      }
    }
  }

  /** Instant pickup (proximity or grapple reel-in). */
  collectDrop(ship, drop, hooks = {}) {
    if (!drop?.active) return false;
    this._collectDrop(ship, drop, hooks);
    return true;
  }

  _collectDrop(ship, drop, hooks) {
    drop._grappled = false;
    if (!ship.oreHold) ship.oreHold = {};
    const key = drop.oreType;
    ship.oreHold[key] = (ship.oreHold[key] ?? 0) + (drop.amount ?? 1);
    const label = oreLabel(key);
    const total = ship.oreHold[key];
    hooks.pushShipLog?.(`[COMPUTER] Ore logged: ${label} +${drop.amount ?? 1} (hold ${total})`);
    this.entityManager.remove(drop);
  }

  /** Nearest drop within range of world point. */
  pickDropAt(wx, wy, maxRange) {
    let best = null;
    let bestD = maxRange;
    for (const drop of this.getDrops()) {
      if (!drop.active) continue;
      const d = Math.hypot(drop.position.x - wx, drop.position.y - wy);
      if (d < bestD) {
        bestD = d;
        best = drop;
      }
    }
    return best;
  }
}

export { PICKUP_GRAV_RADIUS, PICKUP_COLLECT_RADIUS };
