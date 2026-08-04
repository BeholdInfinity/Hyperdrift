import { Projectile } from '../entities/Projectile.js';
import { SHIP } from '../core/Constants.js';
import { Vec2, clamp, angleDifference, normalizeAngle } from '../utils/MathUtils.js';
import { compositionFillStyle } from './AsteroidCatalog.js';
import {
  checkProjectileHits,
  applyMiningLaserShipHit,
  closestModuleLaserHit,
} from '../combat/CombatResolver.js';
import { consumeTurretAmmo, hasTurretAmmo } from '../combat/AmmoSystem.js';
import { turretMuzzleWorld } from '../combat/WeaponHelpers.js';
function slewAngle(current, target, maxRate, deltaTime) {
  const diff = angleDifference(current, target);
  const step = maxRate * deltaTime;
  if (Math.abs(diff) <= step) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(diff) * step);
}

export class WeaponSystem {
  constructor(entityManager, particleSystem, miningDropSystem = null) {
    this.entityManager = entityManager;
    this.particles = particleSystem;
    this.miningDropSystem = miningDropSystem;
    /** @type {object|null} */
    this._combatCallbacks = null;
  }

  /**
   * @param {object} ship
   * @param {object} input
   * @param {{ x: number, y: number }} aimWorld
   * @param {boolean} pointerInViewport
   * @param {{ asteroids?: object[], ships?: import('../combat/CombatTarget.js').CombatTarget[] }} targets
   * @param {number} deltaTime
   * @param {{ gravityEnabled?: boolean, consumeAmmo?: boolean }} [opts]
   */
  update(ship, input, aimWorld, pointerInViewport, targets, deltaTime, opts = {}) {
    const gravityEnabled = opts.gravityEnabled !== false;
    const consumeAmmo = opts.consumeAmmo !== false;
    const asteroids = targets?.asteroids ?? targets ?? [];
    const shipTargets = targets?.ships ?? [];
    const flight = input.getFlightInput();
    ship.miningLaserFiring = false;
    ship.miningLaserBeamLength = SHIP.MINING_LASER_RANGE;

    if (pointerInViewport) {
      const px = ship.position?.x ?? ship.x ?? 0;
      const py = ship.position?.y ?? ship.y ?? 0;
      const desiredWorld = Math.atan2(aimWorld.y - py, aimWorld.x - px);
      ship.turretAngle = slewAngle(
        ship.turretAngle,
        desiredWorld,
        SHIP.TURRET_SLEW_RATE,
        deltaTime
      );

      const desiredRel = clamp(
        angleDifference(ship.angle, desiredWorld),
        -SHIP.MINING_LASER_ARC,
        SHIP.MINING_LASER_ARC
      );
      ship.miningLaserRelAngle = slewAngle(
        ship.miningLaserRelAngle,
        desiredRel,
        SHIP.MINING_LASER_SLEW_RATE,
        deltaTime
      );
      ship.miningLaserRelAngle = clamp(
        ship.miningLaserRelAngle,
        -SHIP.MINING_LASER_ARC,
        SHIP.MINING_LASER_ARC
      );
    }

    if (!pointerInViewport) return;

    if (flight.firePrimary && ship.fireCooldown <= 0) {
      if (!consumeAmmo || hasTurretAmmo(ship)) {
        this.fireTurretFromShip(ship, { gravityEnabled, consumeAmmo });
      }
    }

    if (flight.fireLaser) {
      ship.miningLaserFiring = true;
      this._applyMiningLaser(ship, asteroids, shipTargets, deltaTime, targets?.spatialIndex ?? null);
    }
  }

  /**
   * Shared turret fire path for player ship and NPC traffic bags.
   * @param {object} ship
   * @param {{ gravityEnabled?: boolean, consumeAmmo?: boolean }} [opts]
   */
  fireTurretFromShip(ship, opts = {}) {
    const gravityEnabled = opts.gravityEnabled !== false;
    const consumeAmmo = opts.consumeAmmo !== false;
    if (consumeAmmo && !consumeTurretAmmo(ship)) return;

    const tip = turretMuzzleWorld(ship);
    const angle = ship.turretAngle ?? ship.angle ?? 0;

    const projectile = new Projectile(tip.x, tip.y, angle, ship, { gravityEnabled });
    this.entityManager.add(projectile, 'projectile');

    ship.fireCooldown = SHIP.TURRET_COOLDOWN;
    ship.muzzleFlash = 0.06;
    ship.turretRecoil = 1;

    const dir = Vec2.fromAngle(angle);
    this.particles.emitBurst(
      tip.x, tip.y, 4, 200, 0.08,
      'rgba(100, 200, 255, 0.9)', 3, 0.5
    );
    this.particles.emit(
      tip.x + dir.x * 5, tip.y + dir.y * 5,
      dir.x * 100, dir.y * 100,
      0.06, 'rgba(150, 220, 255, 1)', 5, 'muzzle'
    );
  }

  _applyMiningLaser(ship, asteroids, shipTargets, deltaTime, spatialIndex = null) {
    const origin = ship.getMiningLaserOrigin();
    const angle = ship.getMiningLaserWorldAngle();
    const dir = Vec2.fromAngle(angle);
    const range = SHIP.MINING_LASER_RANGE;
    const damage = SHIP.MINING_LASER_DPS * deltaTime;

    const ast = closestModuleLaserHit(
      origin.x, origin.y, dir.x, dir.y, range, asteroids, spatialIndex
    );
    const shipHit = applyMiningLaserShipHit(
      origin.x, origin.y, dir.x, dir.y, range,
      shipTargets, ship, deltaTime, this._combatCallbacks ?? {},
      spatialIndex
    );

    const astDist = ast.hitDist;
    const shipDist = shipHit.hitDist;
    const useShip =
      shipDist !== null && (astDist === null || shipDist < astDist);

    if (useShip && shipHit.target) {
      ship.miningLaserBeamLength = shipDist;
      if (shipHit.target.ref?.hull <= 0) {
        this._createImpactEffect(
          origin.x + dir.x * shipDist,
          origin.y + dir.y * shipDist,
          true
        );
      }
      return;
    }

    if (ast.asteroid) {
      const rock = ast.asteroid;
      const hitX = origin.x + dir.x * astDist;
      const hitY = origin.y + dir.y * astDist;
      ship.miningLaserBeamLength = astDist;
      const laserMk = ship.miningLaserMk ?? ship.scannerMk ?? 1;
      if (typeof rock.mineModuleLaser === 'function' && ast.module) {
        const mined = rock.mineModuleLaser(
          ast.module.id,
          deltaTime,
          laserMk,
          ast.hitWorld ?? { x: hitX, y: hitY }
        );
        if (mined.cracking && !mined.popped) {
          this._createImpactEffect(hitX, hitY, false);
        }
        if (mined.popped) {
          this.miningDropSystem?.spawnFromModule(rock, ast.module, { x: hitX, y: hitY });
          this._createModulePopDebris(hitX, hitY, ast.module, rock);
          if (mined.destroyed) {
            this._createImpactEffect(hitX, hitY, true);
          }
        }
      } else if (typeof rock.mineExtract === 'function') {
        const mined = rock.mineExtract(deltaTime, laserMk, ast.module?.id, ast.hitWorld);
        if (mined.extracted > 0 && !mined.shrunk) {
          this._createImpactEffect(hitX, hitY, false);
        }
        if (mined.shrunk) {
          this._createShrinkDebris(hitX, hitY, rock);
        }
        if (mined.destroyed) {
          this._createImpactEffect(hitX, hitY, true);
        }
      } else {
        const destroyed = rock.takeDamage(damage);
        if (destroyed) this._createImpactEffect(hitX, hitY, true);
      }
    } else {
      ship.miningLaserBeamLength = range;
    }
  }

  /**
   * @param {{ asteroids: object[], ships?: import('../combat/CombatTarget.js').CombatTarget[], spatialIndex?: import('../combat/CombatSpatialIndex.js').CombatSpatialIndex }} targets
   * @param {{ onShipHit?: Function, onShipDestroyed?: Function, onAsteroidImpact?: Function }} [callbacks]
   */
  checkCollisions(targets, callbacks = {}) {
    this._combatCallbacks = callbacks;
    const projectiles = this.entityManager.getByType('projectile');
    const asteroids = targets?.asteroids ?? [];
    const shipTargets = targets?.ships ?? [];

    const impacts = checkProjectileHits(
      projectiles,
      asteroids,
      shipTargets,
      {
        onAsteroidImpact: (impact) => {
          this._createImpactEffect(impact.x, impact.y, impact.destroyed);
          callbacks.onAsteroidImpact?.(impact);
        },
        onShipHit: (impact) => {
          this._createImpactEffect(impact.x, impact.y, impact.destroyed);
          callbacks.onShipHit?.(impact);
        },
        onShipDestroyed: callbacks.onShipDestroyed,
      },
      targets.spatialIndex ?? null
    );

    return impacts;
  }

  _createImpactEffect(x, y, big) {
    const count = big ? 20 : 8;
    const color = big ? 'rgba(255, 180, 80, 0.9)' : 'rgba(200, 200, 200, 0.8)';
    this.particles.emitBurst(x, y, count, big ? 250 : 120, big ? 0.5 : 0.25, color, big ? 5 : 3);
    if (big) {
      this.particles.emitBurst(x, y, 12, 180, 0.4, 'rgba(255, 100, 50, 0.7)', 4);
    }
  }

  /** Size-tier stepdown burst — rock dust, distinct from laser tick sparks. */
  _createShrinkDebris(x, y, rock) {
    const tint =
      typeof rock?.fillStyle === 'function'
        ? rock.fillStyle()
        : 'rgba(140, 130, 120, 0.9)';
    this._emitDebrisBurst(x, y, tint, rock);
  }

  /** Module pop — composition-tinted burst inheriting parent velocity. */
  _createModulePopDebris(x, y, mod, rock) {
    const tint = compositionFillStyle(mod.composition ?? mod.compositionTag, 0.95);
    this._emitDebrisBurst(x, y, tint, rock);
  }

  _emitDebrisBurst(x, y, tint, rock) {
    const pvx = rock?.velocity?.x ?? 0;
    const pvy = rock?.velocity?.y ?? 0;
    const burst = (count, speed, life, color, size) => {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const spd = speed * (0.5 + Math.random() * 0.5);
        this.particles.emit(
          x,
          y,
          Math.cos(angle) * spd + pvx,
          Math.sin(angle) * spd + pvy,
          life * (0.5 + Math.random() * 0.5),
          color,
          size * (0.5 + Math.random()),
          'burst'
        );
      }
    };
    burst(28, 220, 0.55, tint, 4);
    burst(14, 140, 0.4, 'rgba(90, 85, 80, 0.75)', 3);
  }
}
