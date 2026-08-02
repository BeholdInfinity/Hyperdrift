import { Entity } from './Entity.js';
import { Vec2 } from '../utils/MathUtils.js';
import { positionAt, velocityAt } from '../world/OrbitKinematics.js';
import { getSectorLayout } from '../world/SectorLayout.js';
import {
  ammoYieldCount,
  compositionFillStyle,
  getSizeTier,
  laserYieldFrac,
  normalizeComposition,
  primaryComposition,
  resolveDropTable,
  rockWeight,
  tierForRemainingCapacity,
  hpForRock,
} from '../systems/AsteroidCatalog.js';

export class Asteroid extends Entity {
  constructor(x, y, radius, hp, seed, composition = 'silicate') {
    super(x, y);
    this.radius = radius;
    this.maxHp = hp;
    this.hp = hp;
    this.seed = seed;
    /** @type {Record<string, number>|string} */
    this.composition = normalizeComposition(composition);
    this.compositionTag = primaryComposition(this.composition);
    this.sizeTier = 'small_medium';
    this.volume = 3;
    this.weight = rockWeight(3, this.composition);
    this.capacityMax = 0;
    this.capacityRemaining = 0;
    this.lootSeed = seed >>> 0;
    this.dropTable = null;
    this._mineAcc = 0;
    this._extractedTotal = 0;
    this._laserYieldCap = 0;
    this.vertices = this._generateVertices();
    this.rotationSpeed = (seed % 100) / 100 * 0.8 - 0.4;
    this.mass = radius * radius * 0.01;
    this.momentOfInertia = this.mass * radius * radius;
    /** Kinematic belt / open-space rock — position driven by orbit each frame. */
    this.kinematic = false;
    this.orbitR = 0;
    this.orbitAngle0 = 0;
    /** Hero rocks may use Large / Very Large tiers when shrinking. */
    this.allowHeroTiers = false;
  }

  /** Apply gen-time catalog / hero stats. */
  applyCatalogStats(stats) {
    if (!stats) return this;
    this.sizeTier = stats.sizeTier ?? this.sizeTier;
    const tier = getSizeTier(this.sizeTier);
    // Legacy bakes used `weight` for tier volume (Fibonacci 1–21).
    this.volume =
      stats.volume ?? stats.weight ?? tier.volume;
    this.capacityMax = stats.capacityMax ?? 0;
    this.capacityRemaining = stats.capacityRemaining ?? this.capacityMax;
    this.radius = stats.radius ?? this.radius;
    this.maxHp = stats.hp ?? this.maxHp;
    this.hp = this.maxHp;
    this.seed = stats.seed ?? this.seed;
    this.composition = normalizeComposition(stats.composition ?? this.composition);
    this.compositionTag = stats.compositionTag ?? primaryComposition(this.composition);
    this.weight = rockWeight(this.volume, this.composition);
    this.lootSeed = stats.lootSeed ?? this.lootSeed;
    this.dropTable = stats.dropTable ?? null;
    this.allowHeroTiers = !!stats.allowHeroTiers;
    this.mass = this.radius * this.radius * 0.01;
    this.momentOfInertia = this.mass * this.radius * this.radius;
    this.vertices = this._generateVertices();
    this._laserYieldCap = Math.floor(
      this.capacityMax * laserYieldFrac(stats.laserMk ?? 1)
    );
    return this;
  }

  fillStyle() {
    return compositionFillStyle(this.composition, 1);
  }

  strokeStyle() {
    return compositionFillStyle(this.composition, 0.85);
  }

  ensureDropTable() {
    if (this.dropTable?.resolved) return this.dropTable;
    this.dropTable = resolveDropTable(this.lootSeed, this.composition);
    this.dropTable.resolved = true;
    this.dropTable.entries = [];
    return this.dropTable;
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
    const tier = getSizeTier(this.sizeTier);
    const profile = (this.seed + (tier.volume | 0) * 17) % 5;
    const sides = 7 + profile + (this.seed % 3);
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const jag = 0.72 + ((this.seed * (i + 1) * (7 + profile)) % 100) / 180;
      const r = this.radius * jag;
      verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return verts;
  }

  /**
   * Mining laser extract — pops drops over time; may shrink size tier.
   * @returns {{ extracted: number, shrunk: boolean, destroyed: boolean, yieldStub: object[] }}
   */
  mineExtract(deltaTime, laserMk = 1) {
    const result = {
      extracted: 0,
      shrunk: false,
      destroyed: false,
      yieldStub: [],
    };
    if (!this.active || this.capacityRemaining <= 0) {
      if (this.active && this.capacityRemaining <= 0) {
        this.destroy();
        result.destroyed = true;
      }
      return result;
    }
    this.ensureDropTable();
    if (!this._laserYieldCap) {
      this._laserYieldCap = Math.floor(this.capacityMax * laserYieldFrac(laserMk));
    }
    if (this._extractedTotal >= this._laserYieldCap) {
      // Cap reached — finish the rock.
      this.capacityRemaining = 0;
      this.destroy();
      result.destroyed = true;
      return result;
    }

    // ~1 drop per ~0.55s of continuous laser at baseline DPS feel.
    this._mineAcc += deltaTime;
    const interval = 0.55;
    while (
      this._mineAcc >= interval &&
      this.capacityRemaining > 0 &&
      this._extractedTotal < this._laserYieldCap
    ) {
      this._mineAcc -= interval;
      this.capacityRemaining -= 1;
      this._extractedTotal += 1;
      result.extracted += 1;
      result.yieldStub.push({
        composition: this.compositionTag,
        mix: this.composition,
        from: this.streamId || this.id,
      });
      if (this._tryShrink()) result.shrunk = true;
    }

    if (this.capacityRemaining <= 0 || this._extractedTotal >= this._laserYieldCap) {
      this.capacityRemaining = 0;
      this.destroy();
      result.destroyed = true;
    }
    return result;
  }

  _tryShrink() {
    const next = tierForRemainingCapacity(
      this.capacityRemaining,
      this.allowHeroTiers
    );
    if (!next || next === this.sizeTier) return false;
    const cur = getSizeTier(this.sizeTier);
    const nxt = getSizeTier(next);
    if (nxt.volume >= cur.volume) return false;
    this.sizeTier = next;
    this.volume = nxt.volume;
    this.weight = rockWeight(this.volume, this.composition);
    const midR = (nxt.radiusMin + nxt.radiusMax) * 0.5;
    this.radius = midR;
    this.maxHp = hpForRock(this.radius, this.capacityRemaining);
    this.hp = Math.min(this.hp, this.maxHp);
    this.mass = this.radius * this.radius * 0.01;
    this.momentOfInertia = this.mass * this.radius * this.radius;
    this.vertices = this._generateVertices();
    return true;
  }

  /** Ammo / turret destroy — wasteful yield. */
  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      const yieldCount = ammoYieldCount(this.capacityRemaining);
      this._lastAmmoYield = {
        count: yieldCount,
        composition: this.compositionTag,
        mix: this.composition,
      };
      this.capacityRemaining = 0;
      this.destroy();
      return true;
    }
    return false;
  }

  lastAmmoYield() {
    return this._lastAmmoYield ?? null;
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
