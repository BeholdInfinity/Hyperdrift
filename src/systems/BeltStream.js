import { WORLD } from '../core/Constants.js';
import { SeededRandom, hashCoords } from '../utils/SeededRandom.js';
import {
  nearRingAt,
  pickCompositionTag,
  isNearAuthoredSite,
  radiusAt,
  distToNearestRing,
  getSectorLayout,
} from '../world/SectorLayout.js';
import { orbitFromWorldAt, positionAt } from '../world/OrbitKinematics.js';
import { spawnBeltAsteroid } from './StreamSpawn.js';
import {
  distWorld,
  inMaterializeRange,
  shouldDropLiveRock,
  shouldKeepLiveRock,
  shouldMaterializeRock,
} from './StreamRadii.js';

function ringSalt(ringId) {
  let h = 0;
  for (let i = 0; i < ringId.length; i++) {
    h = (Math.imul(h, 31) + ringId.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function dist(ax, ay, bx, by) {
  return distWorld(ax, ay, bx, by);
}

function sectorDeltaTheta(ring) {
  const midR = (ring.innerR + ring.outerR) * 0.5;
  return WORLD.BELT_SECTOR_ARC / Math.max(midR, 1);
}

function sectorIndex(theta, deltaTheta) {
  return Math.floor((theta + Math.PI) / deltaTheta);
}

function beltRockTarget(ring) {
  return Math.max(
    1,
    Math.round(WORLD.BELT_ROCKS_AT_DENSITY_1 * (ring.density ?? 1))
  );
}

/** Deterministic slot templates for one angular sector (orbit resolved at materialize). */
export function buildSectorCatalog(ring, sectorIdx, seed = WORLD.SEED) {
  const deltaTheta = sectorDeltaTheta(ring);
  const rng = new SeededRandom(
    hashCoords(sectorIdx, ringSalt(ring.id), seed ^ 0xbe17)
  );
  const target = beltRockTarget(ring);
  const catalog = [];
  const annulusW = ring.outerR - ring.innerR;
  const slotWidth = Math.max(800, WORLD.STREAM_SPAWN_RADIUS * 0.4);
  const slotCount = Math.max(12, Math.ceil(annulusW / slotWidth));

  for (let i = 0; i < target; i++) {
    const slot = i % slotCount;
    const bandW = annulusW / slotCount;
    const sampleR = ring.innerR + slot * bandW + rng.range(0, bandW);
    catalog.push({
      angleJitter: rng.range(-deltaTheta * 0.55, deltaTheta * 0.55),
      sampleR,
      radius: rng.range(10, 38),
      hp: Math.ceil(rng.range(10, 38) / 4),
      seed: rng.int(1, 99999),
      composition: pickCompositionTag(rng, ring),
    });
  }
  return catalog;
}

/** Map a sector template to a live orbit passing through its sample point at gameTime. */
export function resolveBeltOrbit(template, ring, sectorIdx, gameTime, layout) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const deltaTheta = sectorDeltaTheta(ring);
  const sectorCenter = -Math.PI + (sectorIdx + 0.5) * deltaTheta;
  const theta = sectorCenter + template.angleJitter;
  const wx = cx + Math.cos(theta) * template.sampleR;
  const wy = cy + Math.sin(theta) * template.sampleR;
  const orbit = orbitFromWorldAt(wx, wy, gameTime, layout);
  if (orbit.orbitR <= 0) return null;
  return orbit;
}

export function beltRockId(ringId, sectorIdx, rockIdx) {
  return `belt:${ringId}:${sectorIdx}:${rockIdx}`;
}

export class BeltStream {
  constructor() {
    /** @type {Map<string, object[]>} sectorKey -> catalog */
    this._catalogs = new Map();
    /** @type {Map<string, import('../entities/Asteroid.js').Asteroid>} */
    this._live = new Map();
    /** @type {object|null} hysteresis when nearRingAt flickers at belt edge */
    this._lastRing = null;
  }

  _sectorKey(ringId, sectorIdx) {
    return `${ringId}:${sectorIdx}`;
  }

  _getCatalog(ring, sectorIdx) {
    const key = this._sectorKey(ring.id, sectorIdx);
    if (!this._catalogs.has(key)) {
      this._catalogs.set(key, buildSectorCatalog(ring, sectorIdx));
    }
    return this._catalogs.get(key);
  }

  _unloadDistantSectors(ring, playerTheta, deltaTheta, despawnRadius, playerX, playerY) {
    const centerSector = sectorIndex(playerTheta, deltaTheta);
    const retainArc = despawnRadius / Math.max(radiusAt(playerX, playerY), 1);
    const sectorSpan = Math.ceil(retainArc / deltaTheta) + 2;

    for (const key of this._catalogs.keys()) {
      if (!key.startsWith(`${ring.id}:`)) continue;
      const sectorIdx = Number(key.split(':')[1]);
      if (Math.abs(sectorIdx - centerSector) > sectorSpan) {
        this._catalogs.delete(key);
      }
    }
  }

  /**
   * @param {object} ctx
   * @param {number} ctx.playerX
   * @param {number} ctx.playerY
   * @param {number} ctx.gameTime
   * @param {number} ctx.viewRadius
   * @param {number} ctx.spawnRadius
   * @param {number} ctx.despawnRadius
   * @param {Set<string>} ctx.destroyedIds
   * @param {import('./AsteroidSystem.js').AsteroidSystem} ctx.system
   */
  reconcile(ctx) {
    const {
      playerX,
      playerY,
      gameTime,
      viewRadius,
      spawnRadius,
      despawnRadius,
      destroyedIds,
      system,
      materializeInView = false,
      spawnBudget,
      visualRadius = null,
    } = ctx;
    const budget = spawnBudget;
    const shellInner = visualRadius ?? viewRadius;
    const layout = getSectorLayout();
    const distRing = distToNearestRing(playerX, playerY, layout);
    let ring = nearRingAt(playerX, playerY, despawnRadius, layout);
    if (!ring && this._lastRing && distRing <= despawnRadius) {
      ring = this._lastRing;
    }
    if (ring) {
      this._lastRing = ring;
    } else if (distRing > despawnRadius) {
      this._lastRing = null;
    }
    const stats = {
      ringId: ring?.id ?? null,
      distToRing: distToNearestRing(playerX, playerY, layout),
      spawned: 0,
      skipDist: 0,
      skipBudget: 0,
      skipSite: 0,
      skipDestroyed: 0,
      sectorMin: 0,
      sectorMax: 0,
      live: 0,
    };
    if (!ring) {
      for (const [id, asteroid] of this._live) {
        if (!asteroid?.active) continue;
        const d = dist(asteroid.position.x, asteroid.position.y, playerX, playerY);
        if (!shouldKeepLiveRock(d, viewRadius, despawnRadius)) {
          system.despawnRock(asteroid);
          this._live.delete(id);
        }
      }
      stats.live = this._live.size;
      return stats;
    }

    const cx = layout.planet?.center?.x ?? 0;
    const cy = layout.planet?.center?.y ?? 0;
    const playerTheta = Math.atan2(playerY - cy, playerX - cx);
    const playerR = radiusAt(playerX, playerY, layout);
    const deltaTheta = sectorDeltaTheta(ring);
    const retainArc = spawnRadius / Math.max(playerR, 1);
    const sectorMin = sectorIndex(playerTheta - retainArc, deltaTheta);
    const sectorMax = sectorIndex(playerTheta + retainArc, deltaTheta);
    stats.sectorMin = sectorMin;
    stats.sectorMax = sectorMax;
    const keep = new Set();

    this._unloadDistantSectors(ring, playerTheta, deltaTheta, despawnRadius, playerX, playerY);

    for (let sectorIdx = sectorMin; sectorIdx <= sectorMax; sectorIdx++) {
      const catalog = this._getCatalog(ring, sectorIdx);
      for (let i = 0; i < catalog.length; i++) {
        const template = catalog[i];
        const id = beltRockId(ring.id, sectorIdx, i);
        if (destroyedIds.has(id)) {
          stats.skipDestroyed++;
          continue;
        }

        const orbit = resolveBeltOrbit(template, ring, sectorIdx, gameTime, layout);
        if (!orbit) continue;

        const pos = positionAt(orbit, gameTime, layout);
        const rockDist = dist(pos.x, pos.y, playerX, playerY);

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

        const mayMaterialize = materializeInView
          ? inMaterializeRange(rockDist, shellInner, spawnRadius, true)
          : shouldMaterializeRock(
              rockDist,
              id,
              viewRadius,
              spawnRadius,
              gameTime,
              false,
              shellInner
            );
        if (!mayMaterialize) {
          stats.skipDist++;
          continue;
        }

        if (budget && budget.left <= 0) {
          stats.skipBudget++;
          continue;
        }

        if (isNearAuthoredSite(pos.x, pos.y, layout)) {
          stats.skipSite++;
          continue;
        }

        keep.add(id);
        if (asteroid) {
          system.despawnRock(asteroid);
          this._live.delete(id);
        }

        asteroid = spawnBeltAsteroid(
          {
            orbitR: orbit.orbitR,
            orbitAngle0: orbit.orbitAngle0,
            radius: template.radius,
            hp: template.hp,
            seed: template.seed,
            composition: template.composition,
          },
          gameTime,
          layout,
          id
        );
        if (!asteroid) continue;
        this._live.set(id, asteroid);
        system.spawnRock(asteroid);
        stats.spawned++;
        if (budget) budget.left--;
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
