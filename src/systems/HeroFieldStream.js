/**
 * Streams rocks from authored asteroid_field sites (hero clusters).
 */

import { getSectorLayout, listSites, siteWorldPosition } from '../world/SectorLayout.js';
import { positionAt } from '../world/OrbitKinematics.js';
import { spawnBeltAsteroid } from './StreamSpawn.js';
import {
  distWorld,
  inMaterializeRange,
  shouldDropLiveRock,
  shouldKeepLiveRock,
  shouldMaterializeRock,
  streamSpawnBudgetForBacklog,
} from './StreamRadii.js';

export function heroRockId(siteId, rockId) {
  return `hero:${siteId}:${rockId}`;
}

/** Envelope radius for suppressing proc rocks near a hero field. */
export function heroFieldEnvelope(site, gameTime = 0, layout = getSectorLayout()) {
  if (site.fieldRadius > 0) return site.fieldRadius;
  let maxR = 400;
  for (const rock of site.rocks ?? []) {
    const d = Math.abs((rock.orbitR ?? 0) - (site.orbit?.orbitR ?? 0));
    maxR = Math.max(maxR, d + (rock.radius ?? 40) * 2);
  }
  return maxR * 1.15;
}

/** True if world point lies inside any hero field envelope (at gameTime). */
export function isInsideHeroFieldEnvelope(x, y, gameTime = 0, layout = getSectorLayout()) {
  for (const site of listSites('asteroid_field', layout)) {
    const pos = siteWorldPosition(site, gameTime, layout);
    const env = heroFieldEnvelope(site, gameTime, layout);
    if (distWorld(x, y, pos.x, pos.y) < env) return true;
  }
  return false;
}

export class HeroFieldStream {
  constructor() {
    /** @type {Map<string, import('../entities/Asteroid.js').Asteroid>} */
    this._live = new Map();
  }

  dropLive(id) {
    if (id) this._live.delete(id);
  }

  clear(system) {
    for (const asteroid of this._live.values()) {
      system.despawnRock(asteroid);
    }
    this._live.clear();
  }

  /**
   * @param {object} ctx — same shape as BeltStream reconcile ctx
   */
  reconcile(ctx) {
    const {
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
    const ax = ctx.anchorX ?? ctx.playerX;
    const ay = ctx.anchorY ?? ctx.playerY;
    const shellInner = visualRadius ?? viewRadius;
    const layout = getSectorLayout();
    const keep = new Set();
    const stats = { spawned: 0, skipBudget: 0, fields: 0 };

    const pending = [];
    const fields = listSites('asteroid_field', layout);
    stats.fields = fields.length;

    for (const site of fields) {
      const rocks = site.rocks ?? [];
      for (const rock of rocks) {
        const id = heroRockId(site.id, rock.id ?? rock.rockId);
        if (destroyedIds.has(id)) continue;
        if (!(rock.orbitR > 0)) continue;

        const orbit = {
          orbitR: rock.orbitR,
          orbitAngle0: rock.orbitAngle0 ?? 0,
        };
        const pos = positionAt(orbit, gameTime, layout);
        const rockDist = distWorld(pos.x, pos.y, ax, ay);

        let asteroid = this._live.get(id);
        if (asteroid?.active) {
          const liveDist = distWorld(
            asteroid.position.x,
            asteroid.position.y,
            ax,
            ay
          );
          if (shouldKeepLiveRock(liveDist, viewRadius, despawnRadius)) {
            keep.add(id);
          }
          continue;
        }
        if (asteroid && !asteroid.active) {
          destroyedIds.add(id);
          system.despawnRock(asteroid);
          this._live.delete(id);
          continue;
        }

        const entry = { id, rock, dist: rockDist };
        if (materializeInView) {
          if (inMaterializeRange(rockDist, shellInner, spawnRadius, true)) {
            pending.push(entry);
          }
          continue;
        }
        if (rockDist <= shellInner) {
          pending.push({ ...entry, view: true });
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
          pending.push({ ...entry, view: false });
        }
      }
    }

    // Heroes first: view fill, then shell with catch-up budget preference.
    const viewPending = pending.filter((p) => p.view || p.dist <= shellInner);
    const shellPending = pending.filter((p) => !viewPending.includes(p));

    if (spawnBudget) {
      // Prefer heroes — don't reduce budget below catch-up for shell heroes.
      spawnBudget.left = Math.max(
        spawnBudget.left,
        streamSpawnBudgetForBacklog(shellPending.length)
      );
    }

    const spawnOne = (entry) => {
      if (this._live.get(entry.id)?.active) {
        keep.add(entry.id);
        return;
      }
      const asteroid = spawnBeltAsteroid(
        {
          ...entry.rock,
          allowHeroTiers: true,
          capacityRemaining:
            entry.rock.capacityRemaining ?? entry.rock.capacityMax,
        },
        gameTime,
        layout,
        entry.id
      );
      if (!asteroid) return;
      asteroid.allowHeroTiers = true;
      this._live.set(entry.id, asteroid);
      system.spawnRock(asteroid);
      keep.add(entry.id);
      stats.spawned++;
    };

    for (const entry of viewPending) spawnOne(entry);

    for (const entry of shellPending) {
      if (spawnBudget && spawnBudget.left <= 0) {
        stats.skipBudget++;
        continue;
      }
      spawnOne(entry);
      if (spawnBudget) spawnBudget.left--;
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

    return stats;
  }
}
