import { WORLD } from '../core/Constants.js';
import { ProceduralGeneration } from './ProceduralGeneration.js';

export class AsteroidSystem {
  constructor(entityManager) {
    this.entityManager = entityManager;
    this.generator = new ProceduralGeneration();
    this.chunks = new Map();
    this.activeAsteroids = new Set();
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

  update(playerX, playerY) {
    const { cx: pcx, cy: pcy } = this._worldToChunk(playerX, playerY);

    for (let dx = -WORLD.LOAD_RADIUS; dx <= WORLD.LOAD_RADIUS; dx++) {
      for (let dy = -WORLD.LOAD_RADIUS; dy <= WORLD.LOAD_RADIUS; dy++) {
        const cx = pcx + dx;
        const cy = pcy + dy;
        const key = this._chunkKey(cx, cy);

        if (!this.chunks.has(key)) {
          this._loadChunk(cx, cy);
        }
      }
    }

    const toUnload = [];
    for (const [key, chunk] of this.chunks) {
      const dx = Math.abs(chunk.x - pcx);
      const dy = Math.abs(chunk.y - pcy);
      if (dx > WORLD.UNLOAD_RADIUS || dy > WORLD.UNLOAD_RADIUS) {
        toUnload.push(key);
      }
    }

    for (const key of toUnload) {
      this._unloadChunk(key);
    }
  }

  _loadChunk(cx, cy) {
    const chunk = this.generator.generateChunk(cx, cy);
    const key = this._chunkKey(cx, cy);
    this.chunks.set(key, chunk);

    for (const asteroid of chunk.asteroids) {
      this.entityManager.add(asteroid, 'asteroid');
      this.activeAsteroids.add(asteroid);
    }
  }

  _unloadChunk(key) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    for (const asteroid of chunk.asteroids) {
      this.entityManager.remove(asteroid);
      this.activeAsteroids.delete(asteroid);
    }

    this.chunks.delete(key);
  }

  getNebulae() {
    const nebulae = [];
    for (const chunk of this.chunks.values()) {
      nebulae.push(...chunk.nebulae);
    }
    return nebulae;
  }

  getStarDensityAt(x, y) {
    const { cx, cy } = this._worldToChunk(x, y);
    const key = this._chunkKey(cx, cy);
    const chunk = this.chunks.get(key);
    return chunk ? chunk.starDensity : 1;
  }

  getActiveAsteroids() {
    return [...this.activeAsteroids].filter((a) => a.active);
  }
}
