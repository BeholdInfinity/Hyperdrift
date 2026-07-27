import { isInsidePlayableSector, getSectorLayout } from '../world/SectorLayout.js';
import { streamSpawnRadius, streamDespawnRadius, streamViewRadius } from './StreamRadii.js';
import { BeltStream } from './BeltStream.js';
import { OpenSpaceStream } from './OpenSpaceStream.js';
import { NebulaStream } from './NebulaStream.js';

export class AsteroidSystem {
  constructor(entityManager) {
    this.entityManager = entityManager;
    this.beltStream = new BeltStream();
    this.openStream = new OpenSpaceStream();
    this.nebulaStream = new NebulaStream();
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

  _viewRadius() {
    return streamViewRadius();
  }

  _spawnRadius() {
    return streamSpawnRadius();
  }

  _despawnRadius() {
    return streamDespawnRadius();
  }

  _syncKinematicAsteroids(gameTime = 0) {
    const layout = getSectorLayout();
    for (const asteroid of this.activeAsteroids) {
      if (asteroid.kinematic) asteroid.syncOrbit(gameTime, layout);
    }
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
    const view = this._viewRadius();
    const drop = this._despawnRadius();
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
    }
    this.entityManager.remove(asteroid);
    this.activeAsteroids.delete(asteroid);
    this._markDirty();
  }

  _streamCtx(playerX, playerY, gameTime) {
    return {
      playerX,
      playerY,
      gameTime,
      viewRadius: this._viewRadius(),
      spawnRadius: this._spawnRadius(),
      despawnRadius: this._despawnRadius(),
      destroyedIds: this.destroyedRockIds,
      system: this,
    };
  }

  update(playerX, playerY, gameTime = 0) {
    this._gameTime = gameTime;
    const layout = getSectorLayout();
    const playable = isInsidePlayableSector(playerX, playerY, layout);

    if (!playable) {
      this.beltStream.clear(this);
      this.openStream.clear(this);
      this.nebulaStream.clear();
      this._collectDestroyed();
      this._markDirty();
      return;
    }

    const ctx = this._streamCtx(playerX, playerY, gameTime);
    this.beltStream.reconcile(ctx);
    this.openStream.reconcile(ctx);
    this.nebulaStream.reconcile(
      playerX,
      playerY,
      this._spawnRadius(),
      this._despawnRadius(),
      this._viewRadius()
    );

    this._syncKinematicAsteroids(gameTime);
    this._collectDestroyed();
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
