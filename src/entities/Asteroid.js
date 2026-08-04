import { Entity } from './Entity.js';
import { Vec2 } from '../utils/MathUtils.js';
import { positionAt, velocityAt } from '../world/OrbitKinematics.js';
import { getSectorLayout } from '../world/SectorLayout.js';
import {
  ammoYieldCount,
  basePopSeconds,
  buildModularRock,
  compositionFillStyle,
  getSizeTier,
  laserMkPopFactor,
  laserYieldFrac,
  normalizeComposition,
  primaryComposition,
  resolveDropTable,
  rockWeight,
  hpForRock,
} from '../systems/AsteroidCatalog.js';
import {
  boundingRadiusFromModules,
  compositeOutlineVertices,
  generateCrackLines,
} from '../systems/AsteroidSurface.js';
import { worldToAsteroidLocal } from '../combat/CombatResolver.js';

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
    this.modules = [];
    this.shapeProfile = 'potato';
    this.vertices = [];
    /** @deprecated use spinSpeed */
    this.rotationSpeed = 0;
    this.spinSpeed = 0;
    this.orbitSpeedMul = 1;
    this.mass = radius * radius * 0.01;
    this.momentOfInertia = this.mass * radius * radius;
    /** Kinematic belt / open-space rock — position driven by orbit each frame. */
    this.kinematic = false;
    this.orbitR = 0;
    this.orbitAngle0 = 0;
    /** Hero rocks may use Large / Very Large tiers when shrinking. */
    this.allowHeroTiers = false;
  }

  /** Active modules (mining targets). */
  activeModules() {
    return (this.modules || []).filter((m) => m.active !== false);
  }

  /** Rebuild composite outline + radius from remaining modules. */
  refreshFromModules() {
    const active = this.activeModules();
    this.capacityRemaining = active.length;
    if (!active.length) {
      this.vertices = [];
      this.radius = 0;
      return;
    }
    const outline = compositeOutlineVertices(active);
    this.vertices = outline.length >= 3 ? outline : active[0].vertices;
    this.radius = boundingRadiusFromModules(active);
    this.volume = active.length;
    this.weight = rockWeight(this.volume, this.composition);
    this.mass = this.radius * this.radius * 0.01;
    this.momentOfInertia = this.mass * this.radius * this.radius;
  }

  /** Ensure modular layout exists (baked rocks without modules[]). */
  ensureModules(ctx = {}) {
    if (this.modules?.length) return this.modules;
    const built = buildModularRock(
      {
        sizeTier: this.sizeTier,
        volume: this.volume,
        radius: this.radius,
        seed: this.seed,
        lootSeed: this.lootSeed,
        composition: this.composition,
        compositionTag: this.compositionTag,
        shapeProfile: this.shapeProfile,
        spinSpeed: this.spinSpeed,
      },
      ctx
    );
    this.modules = built.modules;
    this.shapeProfile = built.shapeProfile;
    this.spinSpeed = built.spinSpeed ?? this.spinSpeed;
    this.rotationSpeed = this.spinSpeed;
    this.vertices = built.vertices;
    this.radius = built.radius;
    this.capacityMax = built.capacityMax;
    this.capacityRemaining = built.capacityRemaining;
    return this.modules;
  }

  /** Apply gen-time catalog / hero stats. */
  applyCatalogStats(stats) {
    if (!stats) return this;
    this.sizeTier = stats.sizeTier ?? this.sizeTier;
    const tier = getSizeTier(this.sizeTier);
    this.volume =
      stats.volume ?? stats.weight ?? tier.volume;
    this.radius = stats.radius ?? this.radius;
    this.maxHp = stats.hp ?? this.maxHp;
    this.hp = this.maxHp;
    this.seed = stats.seed ?? this.seed;
    this.composition = normalizeComposition(stats.composition ?? this.composition);
    this.compositionTag = stats.compositionTag ?? primaryComposition(this.composition);
    this.lootSeed = stats.lootSeed ?? this.lootSeed;
    this.dropTable = stats.dropTable ?? null;
    this.allowHeroTiers = !!stats.allowHeroTiers;
    this.shapeProfile = stats.shapeProfile ?? this.shapeProfile;
    this.spinSpeed = stats.spinSpeed ?? this.spinSpeed ?? 0;
    this.rotationSpeed = this.spinSpeed;
    this.orbitSpeedMul = stats.orbitSpeedMul ?? this.orbitSpeedMul ?? 1;

    if (stats.modules?.length) {
      this.modules = stats.modules.map((m) => ({
        ...m,
        active: m.active !== false,
        mineState: m.mineState ?? 'idle',
        crackProgress: m.crackProgress ?? 0,
      }));
      this.capacityMax = stats.capacityMax ?? this.modules.length;
      this.capacityRemaining =
        stats.capacityRemaining ??
        this.activeModules().length;
      this.refreshFromModules();
    } else {
      const built = buildModularRock(stats, {});
      this.modules = built.modules;
      this.shapeProfile = built.shapeProfile;
      this.spinSpeed = built.spinSpeed;
      this.rotationSpeed = this.spinSpeed;
      this.vertices = built.vertices;
      this.radius = built.radius;
      this.capacityMax = built.capacityMax;
      this.capacityRemaining = built.capacityRemaining;
    }

    this.weight = rockWeight(this.volume, this.composition);
    this.mass = this.radius * this.radius * 0.01;
    this.momentOfInertia = this.mass * this.radius * this.radius;
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
    const mul = this.orbitSpeedMul ?? 1;
    this.position.set(pos.x, pos.y);
    this.velocity.set(vel.vx * mul, vel.vy * mul);
  }

  /**
   * Mining laser on one module — crack buildup then pop.
   * @returns {{ extracted: number, shrunk: boolean, destroyed: boolean, yieldStub: object[], cracking: boolean, popped: boolean }}
   */
  mineModuleLaser(moduleId, deltaTime, laserMk = 1, hitWorld = null) {
    const result = {
      extracted: 0,
      shrunk: false,
      destroyed: false,
      yieldStub: [],
      cracking: false,
      popped: false,
    };
    if (!this.active) return result;
    this.ensureModules();
    const mod = this.modules.find((m) => m.id === moduleId && m.active !== false);
    if (!mod) return result;

    if (!mod.crackLines?.length && hitWorld) {
      const local = worldToAsteroidLocal(this, hitWorld.x, hitWorld.y);
      mod.crackLines = generateCrackLines(mod, local.x, local.y);
    }
    if (mod.mineState !== 'cracking') mod.mineState = 'cracking';

    const popDuration = basePopSeconds(mod.compositionTag) / laserMkPopFactor(laserMk);
    mod.crackProgress = Math.min(1, (mod.crackProgress ?? 0) + deltaTime / popDuration);
    result.cracking = mod.crackProgress < 1;

    if (mod.crackProgress >= 1) {
      mod.active = false;
      mod.mineState = 'popped';
      result.popped = true;
      result.extracted = 1;
      result.shrunk = true;
      result.yieldStub.push({
        composition: mod.compositionTag,
        mix: mod.composition,
        dropTable: mod.dropTable,
        from: this.streamId || this.id,
      });
      this.refreshFromModules();
      if (!this.activeModules().length) {
        this.destroy();
        result.destroyed = true;
      }
    }
    return result;
  }

  /**
   * Decay crack heat on modules not actively lasered this frame.
   * Call before mining laser apply so lasered module still net-heats.
   */
  tickCrackCooldown(deltaTime) {
    if (!this.modules?.length || deltaTime <= 0) return;
    for (const mod of this.modules) {
      if (mod.active === false) continue;
      const progress = mod.crackProgress ?? 0;
      if (progress <= 0) {
        if (mod.mineState === 'cracking') {
          mod.mineState = 'idle';
          mod.crackLines = null;
        }
        continue;
      }
      const popDuration = basePopSeconds(mod.compositionTag);
      // Cool slower than Mk1 heat-up so brief pauses retain some glow.
      const coolDuration = popDuration * 2.2;
      mod.crackProgress = Math.max(0, progress - deltaTime / coolDuration);
      if (mod.crackProgress <= 0) {
        mod.crackProgress = 0;
        mod.mineState = 'idle';
        mod.crackLines = null;
      }
    }
  }

  /**
   * Legacy entry — delegates to modular mining when modules exist.
   * @returns {{ extracted: number, shrunk: boolean, destroyed: boolean, yieldStub: object[] }}
   */
  mineExtract(deltaTime, laserMk = 1, targetModuleId = null, hitWorld = null) {
    if (targetModuleId != null) {
      const r = this.mineModuleLaser(targetModuleId, deltaTime, laserMk, hitWorld);
      return {
        extracted: r.extracted,
        shrunk: r.shrunk,
        destroyed: r.destroyed,
        yieldStub: r.yieldStub,
      };
    }
    this.ensureModules();
    const active = this.activeModules();
    if (!active.length) {
      if (this.active) this.destroy();
      return { extracted: 0, shrunk: false, destroyed: true, yieldStub: [] };
    }
    return this.mineModuleLaser(active[0].id, deltaTime, laserMk, hitWorld);
  }

  /** @deprecated shrink replaced by module pop */
  _tryShrink() {
    return false;
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
    if (!this.kinematic) {
      const spin = this.spinSpeed ?? this.rotationSpeed ?? 0;
      this.angle += spin * deltaTime;
      this.position.x += this.velocity.x * deltaTime;
      this.position.y += this.velocity.y * deltaTime;
    }
  }

  containsPoint(x, y) {
    return Vec2.distance(this.position, { x, y }) < this.radius;
  }
}
