import { WORLD } from '../core/Constants.js';
import { SeededRandom, hashCoords } from '../utils/SeededRandom.js';
import { isInsidePlayableSector, getSectorLayout } from '../world/SectorLayout.js';
import { getDepthCompositorConfig } from '../world/DepthCompositorConfig.js';

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

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function buildNebula(cellX, cellY, rng, depth = 1) {
  const cell = WORLD.NEBULA_CELL;
  const cx = cellX * cell + rng.range(200, cell - 200);
  const cy = cellY * cell + rng.range(200, cell - 200);
  const radius = rng.range(400, 900);
  const hue = rng.range(180, 320);
  const depthAlpha = [0.1, 0.13, 0.16][depth - 1] || 0.12;

  return {
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
  };
}

export class NebulaStream {
  constructor() {
    /** @type {Map<string, object[]>} cellKey -> nebulae[] */
    this._cells = new Map();
    this._cache = [];
    this._cacheDirty = true;
  }

  _cellKey(cellX, cellY) {
    return `${cellX},${cellY}`;
  }

  _ensureCell(cellX, cellY) {
    const key = this._cellKey(cellX, cellY);
    if (this._cells.has(key)) return;

    const layout = getSectorLayout();
    const bounds = cellBounds(cellX, cellY, WORLD.NEBULA_CELL);
    if (!isInsidePlayableSector(bounds.cx, bounds.cy, layout)) {
      this._cells.set(key, []);
      return;
    }

    const rng = new SeededRandom(hashCoords(cellX, cellY, WORLD.SEED ^ 0xdeb0));
    const nebulae = [];
    const spawnMult = getDepthCompositorConfig().streamSpawnRateMult ?? 1;
    const spawnGate = Math.min(1, 0.35 * spawnMult);
    if (rng.next() < spawnGate) {
      const depth = 1 + rng.int(0, 2);
      nebulae.push(buildNebula(cellX, cellY, rng, depth));
    }
    this._cells.set(key, nebulae);
    this._cacheDirty = true;
  }

  reconcile(playerX, playerY, spawnRadius, despawnRadius, viewRadius = 0) {
    const cell = WORLD.NEBULA_CELL;
    const minCX = cellCoord(playerX - spawnRadius, cell);
    const maxCX = cellCoord(playerX + spawnRadius, cell);
    const minCY = cellCoord(playerY - spawnRadius, cell);
    const maxCY = cellCoord(playerY + spawnRadius, cell);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        this._ensureCell(cx, cy);
      }
    }

    const unloadR = despawnRadius + cell * 2;
    for (const key of this._cells.keys()) {
      const [cx, cy] = key.split(',').map(Number);
      const bounds = cellBounds(cx, cy, cell);
      if (dist(bounds.cx, bounds.cy, playerX, playerY) > unloadR) {
        this._cells.delete(key);
        this._cacheDirty = true;
      }
    }
  }

  getNebulae() {
    if (this._cacheDirty) {
      this._cache.length = 0;
      for (const nebulae of this._cells.values()) {
        for (const n of nebulae) this._cache.push(n);
      }
      this._cacheDirty = false;
    }
    return this._cache;
  }

  clear() {
    this._cells.clear();
    this._cache.length = 0;
    this._cacheDirty = true;
  }
}
