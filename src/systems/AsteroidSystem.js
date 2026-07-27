import { WORLD } from '../core/Constants.js';
import { ProceduralGeneration, spawnBeltRock } from './ProceduralGeneration.js';
import { getSectorLayout } from '../world/SectorLayout.js';
import { positionAt } from '../world/OrbitKinematics.js';

export class AsteroidSystem {
  constructor(entityManager) {
    this.entityManager = entityManager;
    this.generator = new ProceduralGeneration();
    /** Chunk metadata (belt catalogs, nebulae) — rock lifetime is distance-based. */
    this.chunks = new Map();
    this.activeAsteroids = new Set();
    /** @type {Map<string, import('../entities/Asteroid.js').Asteroid>} */
    this._beltLive = new Map();
    this._activeList = [];
    this._listDirty = true;
    this._nebulaeCache = [];
    this._nebulaeDirty = true;
    this._gameTime = 0;
  }

  _markDirty() {
    this._listDirty = true;
    this._nebulaeDirty = true;
  }

  _chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  _worldToChunk(x, y) {
    return {
      cx: Math.floor(x / WORLD.CHUNK_SIZE),
      cy: Math.floor(y / WORLD.CHUNK_SIZE),
    };
  }

  _retentionRadius() {
    return (WORLD.UNLOAD_RADIUS + 1) * WORLD.CHUNK_SIZE;
  }

  _distToPlayer(ax, ay, px, py) {
    return Math.hypot(ax - px, ay - py);
  }

  _beltRockId(chunkX, chunkY, index) {
    return `${chunkX},${chunkY}:${index}`;
  }

  _syncKinematicAsteroids(gameTime = 0) {
    const layout = getSectorLayout();
    for (const asteroid of this.activeAsteroids) {
      if (asteroid.kinematic) asteroid.syncOrbit(gameTime, layout);
    }
  }

  _reconcileBeltRocks(playerX, playerY, gameTime = 0) {
    const layout = getSectorLayout();
    const keep = new Set();
    const retain = this._retentionRadius();

    for (const chunk of this.chunks.values()) {
      if (!chunk.belt?.catalog?.length) continue;
      for (let i = 0; i < chunk.belt.catalog.length; i++) {
        const spec = chunk.belt.catalog[i];
        const id = this._beltRockId(chunk.x, chunk.y, i);
        const pos = positionAt(
          { orbitR: spec.orbitR, orbitAngle0: spec.orbitAngle0 },
          gameTime,
          layout
        );
        if (this._distToPlayer(pos.x, pos.y, playerX, playerY) > retain) continue;

        keep.add(id);
        let asteroid = this._beltLive.get(id);
        if (!asteroid || !asteroid.active) {
          if (asteroid) {
            this._despawnRock(asteroid);
            this._beltLive.delete(id);
          }
          asteroid = spawnBeltRock(spec, gameTime, layout);
          if (!asteroid) continue;
          asteroid.beltId = id;
          this._beltLive.set(id, asteroid);
          this.entityManager.add(asteroid, 'asteroid');
          this.activeAsteroids.add(asteroid);
          this._markDirty();
        }
      }
    }

    for (const [id, asteroid] of this._beltLive) {
      if (keep.has(id)) continue;
      this._despawnRock(asteroid);
      this._beltLive.delete(id);
    }
  }

  _cullDistantRocks(playerX, playerY) {
    const retain = this._retentionRadius();
    for (const asteroid of [...this.activeAsteroids]) {
      if (!asteroid.active || asteroid.beltId) continue;
      if (
        this._distToPlayer(
          asteroid.position.x,
          asteroid.position.y,
          playerX,
          playerY
        ) <= retain
      ) {
        continue;
      }
      this._despawnRock(asteroid);
    }
  }

  _despawnRock(asteroid) {
    this.entityManager.remove(asteroid);
    this.activeAsteroids.delete(asteroid);
    if (asteroid.beltId) this._beltLive.delete(asteroid.beltId);
    for (const chunk of this.chunks.values()) {
      if (!chunk.asteroids?.length) continue;
      const idx = chunk.asteroids.indexOf(asteroid);
      if (idx >= 0) chunk.asteroids.splice(idx, 1);
    }
    this._markDirty();
  }

  _shouldUnloadChunk(chunk, pcx, pcy, playerX, playerY, gameTime) {
    const dx = Math.abs(chunk.x - pcx);
    const dy = Math.abs(chunk.y - pcy);
    if (dx <= WORLD.UNLOAD_RADIUS && dy <= WORLD.UNLOAD_RADIUS) return false;

    if (!chunk.belt?.catalog?.length) return true;

    const layout = getSectorLayout();
    const retain = this._retentionRadius();
    for (const spec of chunk.belt.catalog) {
      const pos = positionAt(
        { orbitR: spec.orbitR, orbitAngle0: spec.orbitAngle0 },
        gameTime,
        layout
      );
      if (this._distToPlayer(pos.x, pos.y, playerX, playerY) <= retain) return false;
    }
    return true;
  }

  update(playerX, playerY, gameTime = 0) {
    this._gameTime = gameTime;
    const { cx: pcx, cy: pcy } = this._worldToChunk(playerX, playerY);

    for (let dx = -WORLD.LOAD_RADIUS; dx <= WORLD.LOAD_RADIUS; dx++) {
      for (let dy = -WORLD.LOAD_RADIUS; dy <= WORLD.LOAD_RADIUS; dy++) {
        const cx = pcx + dx;
        const cy = pcy + dy;
        const key = this._chunkKey(cx, cy);
        if (!this.chunks.has(key)) {
          this._loadChunk(cx, cy, gameTime);
        }
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (this._shouldUnloadChunk(chunk, pcx, pcy, playerX, playerY, gameTime)) {
        this.chunks.delete(key);
        this._nebulaeDirty = true;
      }
    }

    this._reconcileBeltRocks(playerX, playerY, gameTime);
    this._syncKinematicAsteroids(gameTime);
    this._cullDistantRocks(playerX, playerY);
  }

  _loadChunk(cx, cy, gameTime = 0) {
    const chunk = this.generator.generateChunk(cx, cy, gameTime);
    const key = this._chunkKey(cx, cy);
    this.chunks.set(key, chunk);

    for (const asteroid of chunk.asteroids) {
      this.entityManager.add(asteroid, 'asteroid');
      this.activeAsteroids.add(asteroid);
    }
    this._markDirty();
  }

  getNebulae() {
    if (this._nebulaeDirty) {
      this._nebulaeCache.length = 0;
      for (const chunk of this.chunks.values()) {
        for (const n of chunk.nebulae) this._nebulaeCache.push(n);
      }
      this._nebulaeDirty = false;
    }
    return this._nebulaeCache;
  }

  getStarDensityAt(x, y) {
    const { cx, cy } = this._worldToChunk(x, y);
    const key = this._chunkKey(cx, cy);
    const chunk = this.chunks.get(key);
    return chunk ? chunk.starDensity : 1;
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
