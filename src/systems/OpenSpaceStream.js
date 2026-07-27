import { WORLD } from '../core/Constants.js';
import { SeededRandom, hashCoords } from '../utils/SeededRandom.js';
import {
  ringAt,
  nearRingAt,
  pickCompositionTag,
  isInsidePlayableSector,
  isNearAuthoredSite,
  getSectorLayout,
} from '../world/SectorLayout.js';
import { spawnKinematicAsteroid } from './StreamSpawn.js';
import { distWorld, inSpawnShell, shouldDropLiveRock, shouldKeepLiveRock } from './StreamRadii.js';

function dist(ax, ay, bx, by) {
  return distWorld(ax, ay, bx, by);
}

function cellCoord(v, cellSize) {
  return Math.floor(v / cellSize);
}

function cellBounds(cellX, cellY, cellSize) {
  const minX = cellX * cellSize;
  const minY = cellY * cellSize;
  return {
    minX,
    minY,
    maxX: minX + cellSize,
    maxY: minY + cellSize,
    cx: minX + cellSize / 2,
    cy: minY + cellSize / 2,
  };
}

function openRockId(cellX, cellY, index) {
  return `open:${cellX},${cellY}:${index}`;
}

/** Deterministic open-space field catalog for one cell. */
export function buildOpenFieldCatalog(cellX, cellY, seed = WORLD.SEED) {
  const rng = new SeededRandom(hashCoords(cellX, cellY, seed ^ 0x0e01));
  const layout = getSectorLayout();
  const bounds = cellBounds(cellX, cellY, WORLD.OPEN_FIELD_CELL);
  const catalog = [];

  if (!isInsidePlayableSector(bounds.cx, bounds.cy, layout)) {
    return catalog;
  }
  if (ringAt(bounds.cx, bounds.cy, layout)) {
    return catalog;
  }

  const mult = WORLD.OPEN_SPACE_FIELD_MULT * WORLD.OPEN_SPACE_SPAWN_HALVE;
  const regionType = rng.next();
  const half = WORLD.OPEN_SPACE_SPAWN_HALVE;

  if (regionType < 0.15 * mult) {
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
        if (!isInsidePlayableSector(x, y, layout)) continue;
        if (ringAt(x, y, layout)) continue;
        if (isNearAuthoredSite(x, y, layout)) continue;
        catalog.push({
          x,
          y,
          radius: rng.range(8, 35),
          hp: Math.ceil(rng.range(8, 35) / 4),
          seed: rng.int(1, 99999),
          composition: pickCompositionTag(rng, null),
        });
      }
    }
  } else if (regionType < 0.45 * mult) {
    const count = Math.max(1, rng.int(3, 8) * half | 0);
    const halfCell = WORLD.OPEN_FIELD_CELL / 2;
    for (let i = 0; i < count; i++) {
      const x = bounds.cx + rng.range(-halfCell, halfCell);
      const y = bounds.cy + rng.range(-halfCell, halfCell);
      if (!isInsidePlayableSector(x, y, layout)) continue;
      if (ringAt(x, y, layout)) continue;
      if (isNearAuthoredSite(x, y, layout)) continue;
      catalog.push({
        x,
        y,
        radius: rng.range(12, 40),
        hp: Math.ceil(rng.range(12, 40) / 5),
        seed: rng.int(1, 99999),
        composition: pickCompositionTag(rng, null),
      });
    }
  }

  return catalog;
}

export class OpenSpaceStream {
  constructor() {
    /** @type {Map<string, object[]>} */
    this._catalogs = new Map();
    /** @type {Map<string, import('../entities/Asteroid.js').Asteroid>} */
    this._live = new Map();
  }

  _cellKey(cellX, cellY) {
    return `${cellX},${cellY}`;
  }

  _getCatalog(cellX, cellY) {
    const key = this._cellKey(cellX, cellY);
    if (!this._catalogs.has(key)) {
      this._catalogs.set(key, buildOpenFieldCatalog(cellX, cellY));
    }
    return this._catalogs.get(key);
  }

  _cellsInRetention(playerX, playerY, retention) {
    const cell = WORLD.OPEN_FIELD_CELL;
    const minCX = cellCoord(playerX - retention, cell);
    const maxCX = cellCoord(playerX + retention, cell);
    const minCY = cellCoord(playerY - retention, cell);
    const maxCY = cellCoord(playerY + retention, cell);
    const out = [];
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        out.push([cx, cy]);
      }
    }
    return out;
  }

  /**
   * @param {object} ctx
   */
  reconcile(ctx) {
    const { playerX, playerY, gameTime, viewRadius, spawnRadius, despawnRadius, destroyedIds, system } =
      ctx;
    const layout = getSectorLayout();
    const stats = { inRing: false, catalogLen: 0, spawned: 0, live: 0 };

    if (nearRingAt(playerX, playerY, despawnRadius, layout)) {
      this._despawnAll(system);
      stats.inRing = true;
      return stats;
    }

    const keep = new Set();
    const cells = this._cellsInRetention(playerX, playerY, spawnRadius);

    for (const [cellX, cellY] of cells) {
      const catalog = this._getCatalog(cellX, cellY);
      stats.catalogLen += catalog.length;
      for (let i = 0; i < catalog.length; i++) {
        const spec = catalog[i];
        const id = openRockId(cellX, cellY, i);
        if (destroyedIds.has(id)) continue;

        let asteroid = this._live.get(id);
        if (asteroid?.active) {
          const liveDist = dist(
            asteroid.position.x,
            asteroid.position.y,
            playerX,
            playerY
          );
          if (shouldKeepLiveRock(liveDist, viewRadius, despawnRadius)) {
            keep.add(id);
          }
          continue;
        }

        const rockDist = dist(spec.x, spec.y, playerX, playerY);
        if (!inSpawnShell(rockDist, viewRadius, spawnRadius)) continue;

        keep.add(id);
        if (asteroid) {
          system.despawnRock(asteroid);
          this._live.delete(id);
        }

        asteroid = spawnKinematicAsteroid(
          spec.x,
          spec.y,
          spec.radius,
          spec.hp,
          spec.seed,
          spec.composition,
          gameTime,
          layout,
          id
        );
        if (!asteroid) continue;
        this._live.set(id, asteroid);
        system.spawnRock(asteroid);
        stats.spawned++;
      }
    }

    for (const [id, asteroid] of this._live) {
      if (
        !shouldDropLiveRock(
          this._live,
          id,
          keep,
          playerX,
          playerY,
          viewRadius,
          despawnRadius
        )
      ) {
        continue;
      }
      system.despawnRock(asteroid);
      this._live.delete(id);
    }

    const cell = WORLD.OPEN_FIELD_CELL;
    const unloadR = despawnRadius + cell * 2;
    for (const key of this._catalogs.keys()) {
      const [cx, cy] = key.split(',').map(Number);
      const bounds = cellBounds(cx, cy, cell);
      if (dist(bounds.cx, bounds.cy, playerX, playerY) > unloadR) {
        this._catalogs.delete(key);
      }
    }
    stats.live = this._live.size;
    return stats;
  }

  _despawnAll(system) {
    for (const asteroid of this._live.values()) {
      system.despawnRock(asteroid);
    }
    this._live.clear();
    this._catalogs.clear();
  }

  dropLive(id) {
    if (id) this._live.delete(id);
  }

  clear(system) {
    this._despawnAll(system);
  }
}
