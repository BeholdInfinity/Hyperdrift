import { SeededRandom, hashCoords } from '../utils/SeededRandom.js';
import { WORLD } from '../core/Constants.js';
import { Asteroid } from '../entities/Asteroid.js';
import { ringAt, pickCompositionTag, ringDensityMultiplier, isInsidePlayableSector, isNearAuthoredSite } from '../world/SectorLayout.js';

export class ProceduralGeneration {
  constructor(seed = WORLD.SEED) {
    this.seed = seed;
  }

  generateChunk(chunkX, chunkY) {
    const rng = new SeededRandom(hashCoords(chunkX, chunkY, this.seed));
    const chunk = {
      x: chunkX,
      y: chunkY,
      asteroids: [],
      nebulae: [],
      starDensity: rng.range(0.5, 1.5),
    };

    const cx = chunk.x * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE / 2;
    const cy = chunk.y * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE / 2;
    if (!isInsidePlayableSector(cx, cy)) {
      return chunk;
    }

    const densityMult = ringDensityMultiplier(cx, cy);
    const regionType = rng.next();

    if (regionType < 0.15 * densityMult) {
      this._generateDenseAsteroidField(chunk, rng);
    } else if (regionType < 0.45 * densityMult) {
      this._generateSparseAsteroidField(chunk, rng);
    }

    if (rng.next() < 0.35) {
      const depth = 1 + rng.int(0, 2);
      this._generateNebula(chunk, rng, depth);
    }

    return chunk;
  }

  _generateSparseAsteroidField(chunk, rng) {
    const count = rng.int(3, 8);
    const cx = chunk.x * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE / 2;
    const cy = chunk.y * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE / 2;

    for (let i = 0; i < count; i++) {
      const x = cx + rng.range(-WORLD.CHUNK_SIZE / 2, WORLD.CHUNK_SIZE / 2);
      const y = cy + rng.range(-WORLD.CHUNK_SIZE / 2, WORLD.CHUNK_SIZE / 2);
      if (isNearAuthoredSite(x, y)) continue;
      const radius = rng.range(12, 40);
      const hp = Math.ceil(radius / 5);
      const seed = rng.int(1, 99999);
      const ring = ringAt(x, y);
      const composition = pickCompositionTag(rng, ring);
      chunk.asteroids.push(new Asteroid(x, y, radius, hp, seed, composition));
    }
  }

  _generateDenseAsteroidField(chunk, rng) {
    const clusterCount = rng.int(2, 4);
    const cx = chunk.x * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE / 2;
    const cy = chunk.y * WORLD.CHUNK_SIZE + WORLD.CHUNK_SIZE / 2;

    for (let c = 0; c < clusterCount; c++) {
      const clusterX = cx + rng.range(-600, 600);
      const clusterY = cy + rng.range(-600, 600);
      const asteroidCount = rng.int(8, 20);

      for (let i = 0; i < asteroidCount; i++) {
        const spread = rng.range(50, 300);
        const angle = rng.range(0, Math.PI * 2);
        const x = clusterX + Math.cos(angle) * spread * rng.next();
        const y = clusterY + Math.sin(angle) * spread * rng.next();
        if (isNearAuthoredSite(x, y)) continue;
        const radius = rng.range(8, 35);
        const hp = Math.ceil(radius / 4);
        const seed = rng.int(1, 99999);
        const ring = ringAt(x, y);
        const composition = pickCompositionTag(rng, ring);
        chunk.asteroids.push(new Asteroid(x, y, radius, hp, seed, composition));
      }
    }
  }

  _generateNebula(chunk, rng, depth = 1) {
    const cx = chunk.x * WORLD.CHUNK_SIZE + rng.range(200, WORLD.CHUNK_SIZE - 200);
    const cy = chunk.y * WORLD.CHUNK_SIZE + rng.range(200, WORLD.CHUNK_SIZE - 200);
    const radius = rng.range(400, 900);
    const hue = rng.range(180, 320);
    // Match ambient nebula recipe: fewer stronger blobs (avoids dither weave)
    const depthAlpha = [0.1, 0.13, 0.16][depth - 1] || 0.12;

    chunk.nebulae.push({
      x: cx,
      y: cy,
      radius,
      hue,
      alpha: rng.range(depthAlpha * 0.7, depthAlpha),
      driftX: rng.range(-5, 5),
      driftY: rng.range(-5, 5),
      phase: rng.range(0, Math.PI * 2),
      depth,
      blobs: Array.from({ length: rng.int(2, 4) }, () => ({
        offsetX: rng.range(-radius * 0.5, radius * 0.5),
        offsetY: rng.range(-radius * 0.5, radius * 0.5),
        size: rng.range(radius * 0.3, radius * 0.8),
        hueOffset: rng.range(-40, 40),
      })),
    });
  }
}
