import { isInsidePlayableSector, getSectorLayout } from '../world/SectorLayout.js';
import {
  streamSpawnRadius,
  streamDespawnRadius,
  streamViewRadius,
  streamSpawnBudget,
} from './StreamRadii.js';
import { BeltStream } from './BeltStream.js';
import { OpenSpaceStream } from './OpenSpaceStream.js';
import { NebulaStream } from './NebulaStream.js';
import { HeroFieldStream } from './HeroFieldStream.js';

export class AsteroidSystem {
  constructor(entityManager) {
    this.entityManager = entityManager;
    this.beltStream = new BeltStream();
    this.openStream = new OpenSpaceStream();
    this.nebulaStream = new NebulaStream();
    this.heroStream = new HeroFieldStream();
    this.activeAsteroids = new Set();
    /** Session-persistent — destroyed proc rocks stay gone until reload. */
    this.destroyedRockIds = new Set();
    this._activeList = [];
    this._listDirty = true;
    this._gameTime = 0;
  }

  _markDirty() {
    this._listDirty = true;
  }

  /**
   * Advance kinematic orbits + spin to `gameTime`.
   * Call once per frame before combat so laser hits match rendered rock poses.
   */
  syncKinematics(gameTime = 0, deltaTime = 0) {
    const layout = getSectorLayout();
    for (const asteroid of this.activeAsteroids) {
      if (asteroid.kinematic) asteroid.syncOrbit(gameTime, layout);
      const spin = asteroid.spinSpeed ?? asteroid.rotationSpeed ?? 0;
      if (spin && deltaTime > 0) {
        asteroid.angle += spin * deltaTime;
      }
    }
  }

  _syncKinematicAsteroids(gameTime = 0, deltaTime = 0) {
    this.syncKinematics(gameTime, deltaTime);
  }

  _collectDestroyed() {
    for (const asteroid of [...this.activeAsteroids]) {
      if (!asteroid.active && asteroid.streamId) {
        this.destroyedRockIds.add(asteroid.streamId);
        this.despawnRock(asteroid);
      }
    }
  }

  _cullDistantRocks(playerX, playerY) {
    const view = streamViewRadius();
    const drop = streamDespawnRadius();
    const viewSq = view * view;
    const dropSq = drop * drop;
    for (const asteroid of [...this.activeAsteroids]) {
      if (!asteroid.active) continue;
      const dx = asteroid.position.x - playerX;
      const dy = asteroid.position.y - playerY;
      const dSq = dx * dx + dy * dy;
      if (dSq <= viewSq) continue;
      if (dSq <= dropSq) continue;
      this.despawnRock(asteroid);
    }
  }

  spawnRock(asteroid) {
    this.entityManager.add(asteroid, 'asteroid');
    this.activeAsteroids.add(asteroid);
    this._markDirty();
  }

  despawnRock(asteroid) {
    if (!asteroid) return;
    if (!asteroid.active && asteroid.streamId) {
      this.destroyedRockIds.add(asteroid.streamId);
    }
    if (asteroid.streamId) {
      this.beltStream.dropLive(asteroid.streamId);
      this.openStream.dropLive(asteroid.streamId);
      this.heroStream.dropLive(asteroid.streamId);
    }
    this.entityManager.remove(asteroid);
    this.activeAsteroids.delete(asteroid);
    this._markDirty();
  }

  _streamCtx(playerX, playerY, gameTime, opts = {}) {
    return {
      playerX,
      playerY,
      // Viewport center when provided — matches camera lead / what the player sees.
      anchorX: opts.viewCenterX ?? opts.anchorX ?? playerX,
      anchorY: opts.viewCenterY ?? opts.anchorY ?? playerY,
      gameTime,
      viewRadius: streamViewRadius(),
      spawnRadius: streamSpawnRadius(),
      despawnRadius: streamDespawnRadius(),
      visualRadius: opts.visualRadius ?? null,
      spawnBudget: opts.spawnBudget,
      destroyedIds: this.destroyedRockIds,
      system: this,
      materializeInView: !!opts.materializeInView,
    };
  }

  update(playerX, playerY, gameTime = 0, opts = {}) {
    this._gameTime = gameTime;
    const deltaTime = opts.deltaTime ?? 0;
    const layout = getSectorLayout();
    const playable = isInsidePlayableSector(playerX, playerY, layout);

    if (!playable) {
      this.beltStream.clear(this);
      this.openStream.clear(this);
      this.heroStream.clear(this);
      this.nebulaStream.clear();
      this._collectDestroyed();
      this._markDirty();
      return;
    }

    // Permanently retire mined-out rocks *before* stream fill, otherwise catalogs
    // see an inactive live slot as empty and respawn the full template.
    this._collectDestroyed();

    const spawnBudget = { left: streamSpawnBudget() };
    const ctx = this._streamCtx(playerX, playerY, gameTime, { ...opts, spawnBudget });
    // Heroes first so preferential budget / fill wins over proc belts.
    this.heroStream.reconcile(ctx);
    this.beltStream.reconcile(ctx);
    this.openStream.reconcile(ctx);
    this.nebulaStream.reconcile(
      playerX,
      playerY,
      streamSpawnRadius(),
      streamDespawnRadius(),
      streamViewRadius()
    );

    if (!opts.skipKinematicSync) {
      this._syncKinematicAsteroids(gameTime, deltaTime);
    }
    this._cullDistantRocks(playerX, playerY);
  }

  getNebulae() {
    return this.nebulaStream.getNebulae();
  }

  getActiveAsteroids() {
    if (this._listDirty) {
      this._activeList.length = 0;
      for (const a of this.activeAsteroids) {
        if (a.active) this._activeList.push(a);
      }
      this._listDirty = false;
    }
    return this._activeList;
  }
}
