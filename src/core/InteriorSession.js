/**
 * Station interior instance — fully isolated from exterior space flight.
 * Created on hangar entry, destroyed on launch exit or return to title.
 * Exterior `GameEngine` never constructs HangarBay; space sim never ticks interiors.
 */
import { EntityManager } from '../entities/EntityManager.js';
import { ParticleSystem } from '../entities/Particle.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';
import { HangarBay } from '../world/HangarBay.js';
import { syncStationAnchor } from '../world/SectorBootstrap.js';
import { STATION } from './Constants.js';

export class InteriorSession {
  constructor() {
    this.hangarBay = new HangarBay();
    this.entityManager = new EntityManager();
    this.particleSystem = new ParticleSystem();
    this.weaponSystem = new WeaponSystem(this.entityManager, this.particleSystem);
    /** gameTime when the player entered the interior (space catch-up baseline). */
    this.enteredGameTime = 0;
    /** Jennings orbit frame frozen for the interior visit. */
    this.frozenAnchor = null;
    this.spaceFrozen = false;
    /** Cosmetic peephole coords — not the live flight camera. */
    this.backdrop = { x: 0, y: -68000 };
    this.backdropSession = 0;
  }

  /** Snapshot exterior orbit and drop space chunk/traffic load before interior runs. */
  freezeExterior(engine) {
    this.enteredGameTime = engine.gameTime || 0;
    syncStationAnchor(engine.station, this.enteredGameTime);
    this.frozenAnchor = {
      x: engine.station.x,
      y: engine.station.y,
      vx: engine.station.vx ?? 0,
      vy: engine.station.vy ?? 0,
    };
    this.spaceFrozen = true;
    this.hangarBay.spaceTrafficActive = false;
    this.hangarBay.preferExternalDoorTraffic = false;
    engine.ambientTraffic.reset();
    engine._frameAsteroids = [];
    engine.asteroidSystem.update(0, -1e9);
  }

  applyFrozenAnchor(station) {
    if (!this.spaceFrozen || !this.frozenAnchor) return;
    const a = this.frozenAnchor;
    if (station.setWorldAnchor) {
      station.setWorldAnchor(a.x, a.y, a.vx, a.vy);
    } else {
      station.x = a.x;
      station.y = a.y;
      station.vx = a.vx;
      station.vy = a.vy;
    }
    STATION.WORLD_X = a.x;
    STATION.WORLD_Y = a.y;
    STATION.WORLD_VX = a.vx;
    STATION.WORLD_VY = a.vy;
  }

  resetBackdrop() {
    const ax = this.frozenAnchor?.x ?? 0;
    const ay = this.frozenAnchor?.y ?? 0;
    const jitter = () => (Math.random() - 0.5) * 5000;
    this.backdrop = {
      x: ax + jitter(),
      y: ay - 68000 + jitter(),
    };
    this.backdropSession = (this.backdropSession | 0) + 1;
    this.hangarBay.invalidateSpacefieldCache?.();
  }

  /**
   * Launch exit: advance orbital frame by elapsed interior time, resume exterior sim.
   */
  catchUpExterior(engine) {
    if (!this.spaceFrozen) return;
    const t = engine.gameTime || 0;
    syncStationAnchor(engine.station, t);
    engine.poiSystem.syncPositions(t);
    this.spaceFrozen = false;
    this.frozenAnchor = null;
    if (!engine.ambientTraffic.ships?.length) engine.ambientTraffic.reset();
  }

  destroy() {
    this.hangarBay.clearOps?.();
    this.entityManager.clear();
    this.particleSystem.clear();
    this.hangarBay.invalidateSpacefieldCache?.();
  }
}
