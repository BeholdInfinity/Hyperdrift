import { SeededRandom, hashCoords } from '../utils/SeededRandom.js';
import { WORLD } from '../core/Constants.js';
import { Asteroid } from '../entities/Asteroid.js';
import {
  ringAt,
  pickCompositionTag,
  isInsidePlayableSector,
  isNearAuthoredSite,
  radiusAt,
  getSectorLayout,
} from '../world/SectorLayout.js';
import { orbitFromWorldAt, positionAt } from '../world/OrbitKinematics.js';

/** Fraction of chunk samples (center + corners) lying inside a ring annulus. */
export function chunkRingOverlap(cx, cy, ring, chunkSize = WORLD.CHUNK_SIZE) {
  if (!ring) return 0;
  const half = chunkSize / 2;
  const pts = [
    [cx, cy],
    [cx - half, cy - half],
    [cx + half, cy - half],
    [cx + half, cy + half],
    [cx - half, cy + half],
  ];
  let n = 0;
  for (const [x, y] of pts) {
    const r = radiusAt(x, y);
    if (r >= ring.innerR && r <= ring.outerR) n++;
  }
  return n / pts.length;
}

/** Ring band with the strongest overlap for this chunk (handles straddling edges). */
export function bestRingForChunk(cx, cy, layout = getSectorLayout()) {
  let bestRing = null;
  let bestOverlap = 0;
  for (const ring of layout.rings ?? []) {
    const overlap = chunkRingOverlap(cx, cy, ring);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestRing = ring;
    }
  }
  return { ring: bestRing, overlap: bestOverlap };
}

export function beltTargetForChunk(ring, overlap) {
  return Math.max(
    1,
    Math.round(WORLD.BELT_ROCKS_AT_DENSITY_1 * (ring?.density ?? 1) * overlap)
  );
}

export function chunkBounds(chunkX, chunkY) {
  const minX = chunkX * WORLD.CHUNK_SIZE;
  const minY = chunkY * WORLD.CHUNK_SIZE;
  return {
    minX,
    minY,
    maxX: minX + WORLD.CHUNK_SIZE,
    maxY: minY + WORLD.CHUNK_SIZE,
    cx: minX + WORLD.CHUNK_SIZE / 2,
    cy: minY + WORLD.CHUNK_SIZE / 2,
  };
}

function pointInRingAnnulus(x, y, ring) {
  const r = radiusAt(x, y);
  return r >= ring.innerR && r <= ring.outerR;
}

/** Deterministic belt catalog — sample fixed world anchors in the chunk, attach orbits at t=0. */
export function buildBeltCatalog(chunkX, chunkY, ring, overlap, seed = WORLD.SEED) {
  const rng = new SeededRandom(hashCoords(chunkX, chunkY, seed ^ 0xbe17));
  const layout = getSectorLayout();
  const bounds = chunkBounds(chunkX, chunkY);
  const target = beltTargetForChunk(ring, overlap);
  const half = WORLD.CHUNK_SIZE / 2;
  const maxAttempts = target * WORLD.BELT_SPAWN_ATTEMPTS_PER_ROCK;
  const catalog = [];
  let attempts = 0;

  while (catalog.length < target && attempts < maxAttempts) {
    attempts++;
    const sampleX = bounds.cx + rng.range(-half, half);
    const sampleY = bounds.cy + rng.range(-half, half);
    if (!pointInRingAnnulus(sampleX, sampleY, ring)) continue;
    if (isNearAuthoredSite(sampleX, sampleY, layout)) continue;

    const { orbitR, orbitAngle0 } = orbitFromWorldAt(sampleX, sampleY, 0, layout);
    if (orbitR <= 0) continue;

    catalog.push({
      orbitR,
      orbitAngle0,
      radius: rng.range(10, 38),
      hp: Math.ceil(rng.range(10, 38) / 4),
      seed: rng.int(1, 99999),
      composition: pickCompositionTag(rng, ring),
    });
  }
  return catalog;
}

export function spawnKinematicRock(x, y, radius, hp, seed, composition, gameTime, layout) {
  const { orbitR, orbitAngle0 } = orbitFromWorldAt(x, y, gameTime, layout);
  if (orbitR <= 0) return null;
  const asteroid = new Asteroid(x, y, radius, hp, seed, composition);
  asteroid.kinematic = true;
  asteroid.orbitR = orbitR;
  asteroid.orbitAngle0 = orbitAngle0;
  asteroid.syncOrbit(gameTime, layout);
  return asteroid;
}

export function spawnBeltRock(spec, gameTime, layout) {
  if (!spec?.orbitR) return null;
  const pos = positionAt(
    { orbitR: spec.orbitR, orbitAngle0: spec.orbitAngle0 },
    gameTime,
    layout
  );
  const asteroid = new Asteroid(
    pos.x,
    pos.y,
    spec.radius,
    spec.hp,
    spec.seed,
    spec.composition
  );
  asteroid.kinematic = true;
  asteroid.orbitR = spec.orbitR;
  asteroid.orbitAngle0 = spec.orbitAngle0;
  asteroid.syncOrbit(gameTime, layout);
  return asteroid;
}

export class ProceduralGeneration {
  constructor(seed = WORLD.SEED) {
    this.seed = seed;
  }

  generateChunk(chunkX, chunkY, gameTime = 0) {
    const rng = new SeededRandom(hashCoords(chunkX, chunkY, this.seed));
    const layout = getSectorLayout();
    const bounds = chunkBounds(chunkX, chunkY);
    const chunk = {
      x: chunkX,
      y: chunkY,
      asteroids: [],
      nebulae: [],
      starDensity: rng.range(0.5, 1.5),
      belt: null,
    };

    if (!isInsidePlayableSector(bounds.cx, bounds.cy)) {
      return chunk;
    }

    const { ring, overlap } = bestRingForChunk(bounds.cx, bounds.cy, layout);

    if (ring && overlap > 0) {
      chunk.belt = {
        ring,
        overlap,
        catalog: buildBeltCatalog(chunkX, chunkY, ring, overlap, this.seed),
      };
    } else {
      this._maybeGenerateOpenSpaceField(chunk, rng, bounds, gameTime, layout);
    }

    if (rng.next() < 0.35) {
      const depth = 1 + rng.int(0, 2);
      this._generateNebula(chunk, rng, depth);
    }

    return chunk;
  }

  /** Sparse/deep-space clusters — 50% reduced vs legacy; prograde velocity at radius. */
  _maybeGenerateOpenSpaceField(chunk, rng, bounds, gameTime, layout) {
    const mult = WORLD.OPEN_SPACE_FIELD_MULT * WORLD.OPEN_SPACE_SPAWN_HALVE;
    const regionType = rng.next();

    if (regionType < 0.15 * mult) {
      this._generateDenseAsteroidField(chunk, rng, bounds, gameTime, layout);
    } else if (regionType < 0.45 * mult) {
      this._generateSparseAsteroidField(chunk, rng, bounds, gameTime, layout);
    }
  }

  _spawnOpenRock(chunk, rng, x, y, radius, hp, seed, gameTime, layout) {
    if (isNearAuthoredSite(x, y, layout)) return;
    const ring = ringAt(x, y, layout);
    const composition = pickCompositionTag(rng, ring);
    const asteroid = spawnKinematicRock(
      x,
      y,
      radius,
      hp,
      seed,
      composition,
      gameTime,
      layout
    );
    if (asteroid) chunk.asteroids.push(asteroid);
  }

  _generateSparseAsteroidField(chunk, rng, bounds, gameTime, layout) {
    const half = WORLD.OPEN_SPACE_SPAWN_HALVE;
    const count = Math.max(1, rng.int(3, 8) * half | 0);
    if (count <= 0) return;

    for (let i = 0; i < count; i++) {
      const x = bounds.cx + rng.range(-WORLD.CHUNK_SIZE / 2, WORLD.CHUNK_SIZE / 2);
      const y = bounds.cy + rng.range(-WORLD.CHUNK_SIZE / 2, WORLD.CHUNK_SIZE / 2);
      const radius = rng.range(12, 40);
      const hp = Math.ceil(radius / 5);
      const seed = rng.int(1, 99999);
      this._spawnOpenRock(chunk, rng, x, y, radius, hp, seed, gameTime, layout);
    }
  }

  _generateDenseAsteroidField(chunk, rng, bounds, gameTime, layout) {
    const half = WORLD.OPEN_SPACE_SPAWN_HALVE;
    const clusterCount = Math.max(1, rng.int(2, 4) * half | 0);

    for (let c = 0; c < clusterCount; c++) {
      const clusterX = bounds.cx + rng.range(-600, 600);
      const clusterY = bounds.cy + rng.range(-600, 600);
      const asteroidCount = Math.max(1, rng.int(8, 20) * half | 0);

      for (let i = 0; i < asteroidCount; i++) {
        const spread = rng.range(50, 300);
        const angle = rng.range(0, Math.PI * 2);
        const x = clusterX + Math.cos(angle) * spread * rng.next();
        const y = clusterY + Math.sin(angle) * spread * rng.next();
        const radius = rng.range(8, 35);
        const hp = Math.ceil(radius / 4);
        const seed = rng.int(1, 99999);
        this._spawnOpenRock(chunk, rng, x, y, radius, hp, seed, gameTime, layout);
      }
    }
  }

  _generateNebula(chunk, rng, depth = 1) {
    const cx = chunk.x * WORLD.CHUNK_SIZE + rng.range(200, WORLD.CHUNK_SIZE - 200);
    const cy = chunk.y * WORLD.CHUNK_SIZE + rng.range(200, WORLD.CHUNK_SIZE - 200);
    const radius = rng.range(400, 900);
    const hue = rng.range(180, 320);
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
