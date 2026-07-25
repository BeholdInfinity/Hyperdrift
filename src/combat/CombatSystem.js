/**
 * Spaceflight combat orchestration — targets, weapons, collisions, breakup, death FX.
 */

import { Vec2 } from '../utils/MathUtils.js';
import { ShipBreakupSystem } from './ShipBreakupSystem.js';
import { CombatSpatialIndex } from './CombatSpatialIndex.js';
import { getCombatTarget, syncCombatTargetPositions } from './CombatTarget.js';
import { tickNpcWeapons, markCombatHostile } from './NpcWeaponAI.js';
import { CockpitDeathBurst } from '../systems/CockpitDeathBurst.js';

export class CombatSystem {
  constructor() {
    this.breakup = new ShipBreakupSystem();
    this.spatial = new CombatSpatialIndex();
    this._wreckCamPos = new Vec2();
    this._wreckCamVel = new Vec2();
    this._wreckAngle = 0;
    this._wreckHasPose = false;
    /** @type {import('../systems/CockpitDeathBurst.js').CockpitDeathBurst|null} */
    this._hudDeathBurst = null;
  }

  /** @param {object[]} asteroids */
  buildTargets(asteroids, ambientTraffic, playerShip) {
    const ships = ambientTraffic?.getCombatTargets?.() ?? [];
    const player = getCombatTarget(playerShip);
    if (player) ships.push(player);
    this.spatial.rebuild({ asteroids, ships });
    return { asteroids, ships, spatialIndex: this.spatial };
  }

  playerDead(ship) {
    return !!ship?.combatDestroyed;
  }

  hudBursting(ship) {
    return this.playerDead(ship) && !!this._hudDeathBurst && !this._hudDeathBurst.done;
  }

  /**
   * Player weapons, NPC fire, projectile hits, fragment sim, HUD death burst tick.
   * @param {{
   *   ship: object,
   *   weaponSystem: import('../systems/WeaponSystem.js').WeaponSystem,
   *   input: import('../systems/InputSystem.js').InputSystem,
   *   aimWorld: { x: number, y: number },
   *   pointerInViewport: boolean,
   *   asteroids: object[],
   *   ambientTraffic: import('../world/AmbientTrafficSystem.js').AmbientTrafficSystem,
   *   entityManager: import('../entities/EntityManager.js').EntityManager,
   *   particles: import('../entities/Particle.js').ParticleSystem,
   *   renderer: import('../systems/Renderer.js').Renderer,
   *   cockpitFrame: import('../systems/CockpitFrame.js').CockpitFrame,
   *   deltaTime: number,
   *   onDeathOverlayReady?: () => void,
   *   onPlayerDeathUi?: () => void,
   * }} ctx
   */
  updateSpaceflight(ctx) {
    const {
      ship,
      weaponSystem,
      input,
      aimWorld,
      pointerInViewport,
      asteroids,
      ambientTraffic,
      entityManager,
      particles,
      renderer,
      cockpitFrame,
      deltaTime,
      onDeathOverlayReady,
      onPlayerDeathUi,
    } = ctx;

    const combatTargets = this.buildTargets(asteroids, ambientTraffic, ship);

    if (!ship.combatDestroyed) {
      weaponSystem.update(
        ship,
        input,
        aimWorld,
        pointerInViewport,
        combatTargets,
        deltaTime,
        { consumeAmmo: true }
      );
    }

    tickNpcWeapons(ambientTraffic?.ships || [], ship, weaponSystem, deltaTime);
    entityManager.update(deltaTime);

    syncCombatTargetPositions(combatTargets.ships);
    this.spatial.rebuild({
      asteroids: combatTargets.asteroids,
      ships: combatTargets.ships,
    });

    weaponSystem.checkCollisions(combatTargets, {
      onShipDestroyed: (s, x, y) =>
        this.handleShipDestroyed(s, x, y, {
          ship,
          particles,
          renderer,
          cockpitFrame,
          ambientTraffic,
          onPlayerDeathUi,
        }),
      onShipHit: (impact) => {
        const owner = impact.owner;
        if (owner?.combatTeam === 'player' && impact.ship && impact.ship !== ship) {
          markCombatHostile(impact.ship);
        }
      },
    });

    this.breakup.update(deltaTime);

    if (ship.combatDestroyed && this._hudDeathBurst && !this._hudDeathBurst.done) {
      this._hudDeathBurst.update(deltaTime);
      if (this._hudDeathBurst.done) onDeathOverlayReady?.();
    }
  }

  /**
   * @param {{
   *   ship: object,
   *   particles: import('../entities/Particle.js').ParticleSystem,
   *   renderer: import('../systems/Renderer.js').Renderer,
   *   cockpitFrame: import('../systems/CockpitFrame.js').CockpitFrame,
   *   ambientTraffic: import('../world/AmbientTrafficSystem.js').AmbientTrafficSystem,
   *   onPlayerDeathUi?: () => void,
   * }} ctx
   */
  handleShipDestroyed(destroyed, x, y, ctx) {
    if (!destroyed || destroyed.combatDestroyed) return;
    destroyed.combatDestroyed = true;

    this.breakup.breakShip(destroyed);
    ctx.particles.emitBurst(
      x, y, 28, 280, 0.55,
      'rgba(255, 160, 80, 0.95)', 5, 0.6
    );
    ctx.particles.emitBurst(
      x, y, 16, 200, 0.45,
      'rgba(255, 100, 50, 0.8)', 4
    );

    if (destroyed === ctx.ship) {
      destroyed.velocity.set(0, 0);
      destroyed.angularVelocity = 0;
      this._wreckHasPose = false;
      this._hudDeathBurst = new CockpitDeathBurst(
        ctx.renderer,
        ctx.cockpitFrame.layout,
        ctx.particles
      );
      ctx.onPlayerDeathUi?.();
    } else {
      ctx.ambientTraffic?.removeShip?.(destroyed);
    }
  }

  /** Camera follow target while the player ship is destroyed. */
  getWreckCameraPose(ship) {
    const frag = this.breakup.getPrimaryFragment();
    if (frag) {
      this._wreckCamPos.set(frag.x, frag.y);
      this._wreckCamVel.set(frag.vx, frag.vy);
      this._wreckAngle = frag.angle;
      this._wreckHasPose = true;
      return {
        pos: this._wreckCamPos,
        vel: this._wreckCamVel,
        angle: frag.angle,
      };
    }
    if (this._wreckHasPose) {
      this._wreckCamVel.set(0, 0);
      return {
        pos: this._wreckCamPos,
        vel: this._wreckCamVel,
        angle: this._wreckAngle,
      };
    }
    return {
      pos: ship.position,
      vel: ship.velocity,
      angle: ship.angle,
    };
  }

  /** @param {CanvasRenderingContext2D} ctx */
  renderBreakup(ctx) {
    this.breakup.render(ctx);
  }

  /** @param {CanvasRenderingContext2D} ctx */
  renderHudBurst(ctx) {
    this._hudDeathBurst?.render(ctx);
  }

  clear() {
    this.breakup.clear();
    this._hudDeathBurst = null;
    this._wreckHasPose = false;
  }
}
