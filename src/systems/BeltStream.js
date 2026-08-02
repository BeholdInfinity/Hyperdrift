import { WORLD } from '../core/Constants.js';
import { SeededRandom, hashCoords } from '../utils/SeededRandom.js';
import {
  nearRingAt,
  isNearAuthoredSite,
  radiusAt,
  distToNearestRing,
  getSectorLayout,
} from '../world/SectorLayout.js';
import { orbitFromWorldAt, positionAt } from '../world/OrbitKinematics.js';
import { getRingBandModel } from '../world/RingBeltVisual.js';
import { rollRockStats } from './AsteroidCatalog.js';
import { spawnBeltAsteroid } from './StreamSpawn.js';
import { isInsideHeroFieldEnvelope } from './HeroFieldStream.js';
import {
  distWorld,
  inMaterializeRange,
  shouldDropLiveRock,
  shouldKeepLiveRock,
  shouldMaterializeRock,
  streamSpawnBudgetForBacklog,
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

/** Weighted pick among density bands (opacity × bright). */
function pickBandWeighted(bands, rng) {
  if (!bands.length) return null;
  let sum = 0;
  const weights = bands.map((b) => {
    const w = Math.max(0.01, (b.opacity ?? 0.3) * (b.bright ?? 0.5));
    sum += w;
    return w;
  });
  let roll = rng.next() * sum;
  for (let i = 0; i < bands.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return bands[i];
  }
  return bands[bands.length - 1];
}

/**
 * Deterministic sector catalog: rocks only in RingBeltVisual sub-bands,
 * with permanent orbitR / orbitAngle0 (reference t = 0).
 */
export function buildSectorCatalog(ring, sectorIdx, seed = WORLD.SEED) {
  const layout = getSectorLayout();
  const deltaTheta = sectorDeltaTheta(ring);
  const rng = new SeededRandom(
    hashCoords(sectorIdx, ringSalt(ring.id), seed ^ 0xbe17)
  );
  const target = beltRockTarget(ring);
  const catalog = [];
  const annulusW = Math.max(1, ring.outerR - ring.innerR);
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const sectorCenter = -Math.PI + (sectorIdx + 0.5) * deltaTheta;
  const model = getRingBandModel(ring);
  const bands = model?.bands?.length ? model.bands : null;

  let attempts = 0;
  const maxAttempts = target * 8;
  while (catalog.length < target && attempts < maxAttempts) {
    attempts++;
    let sampleR;
    if (bands) {
      const band = pickBandWeighted(bands, rng);
      if (!band) break;
      const t = band.t0 + rng.range(0, Math.max(1e-6, band.t1 - band.t0));
      sampleR = ring.innerR + t * annulusW;
    } else {
      sampleR = ring.innerR + rng.range(0, annulusW);
    }

    const angleJitter = rng.range(-deltaTheta * 0.55, deltaTheta * 0.55);
    const theta = sectorCenter + angleJitter;
    const wx = cx + Math.cos(theta) * sampleR;
    const wy = cy + Math.sin(theta) * sampleR;
    const orbit = orbitFromWorldAt(wx, wy, 0, layout);
    if (orbit.orbitR <= 0) continue;

    const stats = rollRockStats({
      rng,
      ring,
      sampleR,
      theta,
      allowHeroTiers: false,
    });
    catalog.push({
      orbitR: orbit.orbitR,
      orbitAngle0: orbit.orbitAngle0,
      ...stats,
    });
  }
  return catalog;
}

/** @deprecated Prefer template.orbitR / orbitAngle0 from catalog build. */
export function resolveBeltOrbit(template, ring, sectorIdx, gameTime, layout) {
  if (template?.orbitR > 0) {
    return { orbitR: template.orbitR, orbitAngle0: template.orbitAngle0 ?? 0 };
  }
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const deltaTheta = sectorDeltaTheta(ring);
  const sectorCenter = -Math.PI + (sectorIdx + 0.5) * deltaTheta;
  const theta = sectorCenter + (template.angleJitter ?? 0);
  const sampleR = template.sampleR ?? (ring.innerR + ring.outerR) * 0.5;
  const wx = cx + Math.cos(theta) * sampleR;
  const wy = cy + Math.sin(theta) * sampleR;
  const orbit = orbitFromWorldAt(wx, wy, gameTime, layout);
  if (orbit.orbitR <= 0) return null;
  return orbit;
}

export function beltRockId(ringId, sectorIdx, rockIdx) {
  return `belt:${ringId}:${sectorIdx}:${rockIdx}`;
}

function spawnFromTemplate(template, id, gameTime, layout, system, live) {
  const asteroid = spawnBeltAsteroid(template, gameTime, layout, id);
  if (!asteroid) return false;
  live.set(id, asteroid);
  system.spawnRock(asteroid);
  return true;
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
   * @param {number} [ctx.anchorX]
   * @param {number} [ctx.anchorY]
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
    const ax = ctx.anchorX ?? playerX;
    const ay = ctx.anchorY ?? playerY;
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
      backlog: 0,
    };
    if (!ring) {
      for (const [id, asteroid] of this._live) {
        if (!asteroid?.active) continue;
        const d = dist(asteroid.position.x, asteroid.position.y, ax, ay);
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
    const playerTheta = Math.atan2(ay - cy, ax - cx);
    const playerR = radiusAt(ax, ay, layout);
    const deltaTheta = sectorDeltaTheta(ring);
    const retainArc = spawnRadius / Math.max(playerR, 1);
    const sectorMin = sectorIndex(playerTheta - retainArc, deltaTheta);
    const sectorMax = sectorIndex(playerTheta + retainArc, deltaTheta);
    stats.sectorMin = sectorMin;
    stats.sectorMax = sectorMax;
    const keep = new Set();

    this._unloadDistantSectors(ring, playerTheta, deltaTheta, despawnRadius, ax, ay);

    /** @type {{ id: string, template: object, pos: { x: number, y: number }, dist: number }[]} */
    const viewPending = [];
    /** @type {{ id: string, template: object, pos: { x: number, y: number }, dist: number }[]} */
    const shellPending = [];

    for (let sectorIdx = sectorMin; sectorIdx <= sectorMax; sectorIdx++) {
      const catalog = this._getCatalog(ring, sectorIdx);
      for (let i = 0; i < catalog.length; i++) {
        const template = catalog[i];
        const id = beltRockId(ring.id, sectorIdx, i);
        if (destroyedIds.has(id)) {
          stats.skipDestroyed++;
          continue;
        }

        if (!(template.orbitR > 0)) continue;
        const orbit = {
          orbitR: template.orbitR,
          orbitAngle0: template.orbitAngle0 ?? 0,
        };
        const pos = positionAt(orbit, gameTime, layout);
        const rockDist = dist(pos.x, pos.y, ax, ay);

        let asteroid = this._live.get(id);
        if (asteroid?.active) {
          const liveDist = dist(asteroid.position.x, asteroid.position.y, ax, ay);
          if (shouldKeepLiveRock(liveDist, viewRadius, despawnRadius)) {
            keep.add(id);
          }
          continue;
        }

        if (isNearAuthoredSite(pos.x, pos.y, layout)) {
          stats.skipSite++;
          continue;
        }
        if (isInsideHeroFieldEnvelope(pos.x, pos.y, gameTime, layout)) {
          stats.skipSite++;
          continue;
        }

        const entry = { id, template, pos, dist: rockDist };

        if (materializeInView) {
          if (inMaterializeRange(rockDist, shellInner, spawnRadius, true)) {
            if (rockDist <= shellInner) viewPending.push(entry);
            else shellPending.push(entry);
          } else {
            stats.skipDist++;
          }
          continue;
        }

        // View-priority: anything inside the visual/view radius must fill.
        if (rockDist <= shellInner) {
          viewPending.push(entry);
          continue;
        }

        if (
          shouldMaterializeRock(
            rockDist,
            id,
            viewRadius,
            spawnRadius,
            gameTime,
            false,
            shellInner
          )
        ) {
          shellPending.push(entry);
        } else {
          stats.skipDist++;
        }
      }
    }

    stats.backlog = viewPending.length + shellPending.length;
    if (budget) {
      budget.left = streamSpawnBudgetForBacklog(shellPending.length);
    }

    // Fill viewport first — never starve visible density to the outer-shell budget.
    for (const entry of viewPending) {
      if (this._live.get(entry.id)?.active) {
        keep.add(entry.id);
        continue;
      }
      if (
        spawnFromTemplate(
          entry.template,
          entry.id,
          gameTime,
          layout,
          system,
          this._live
        )
      ) {
        keep.add(entry.id);
        stats.spawned++;
      }
    }

    for (const entry of shellPending) {
      if (this._live.get(entry.id)?.active) {
        keep.add(entry.id);
        continue;
      }
      if (budget && budget.left <= 0) {
        stats.skipBudget++;
        continue;
      }
      if (
        spawnFromTemplate(
          entry.template,
          entry.id,
          gameTime,
          layout,
          system,
          this._live
        )
      ) {
        keep.add(entry.id);
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
          ax,
          ay,
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
