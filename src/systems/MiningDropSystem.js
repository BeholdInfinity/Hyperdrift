import { MiningDrop } from '../entities/MiningDrop.js';
import { oreLabel, rollModuleDrops } from './MiningLootCatalog.js';

const PICKUP_GRAV_RADIUS = 100;
const PICKUP_COLLECT_RADIUS = 18;
const GRAV_STRENGTH = 420;

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
   * @param {object} asteroid
   * @param {object} mod
   * @param {{ x: number, y: number }} [atWorld]
   */
  spawnFromModule(asteroid, mod, atWorld = null) {
    const rolls = rollModuleDrops(mod.dropTable, mod.lootSeed);
    const cx = atWorld?.x ?? asteroid.position.x;
    const cy = atWorld?.y ?? asteroid.position.y;
    const pvx = asteroid.velocity?.x ?? 0;
    const pvy = asteroid.velocity?.y ?? 0;
    const spawned = [];
    rolls.forEach((roll, i) => {
      const ang = (i / Math.max(1, rolls.length)) * Math.PI * 2 + 0.4;
      const drop = new MiningDrop(cx, cy, roll.oreType, roll.composition, roll.amount);
      drop.velocity.set(
        pvx + Math.cos(ang) * 40,
        pvy + Math.sin(ang) * 40
      );
      this.entityManager.add(drop, 'miningDrop');
      spawned.push(drop);
    });
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
