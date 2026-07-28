import { WORLD } from '../core/Constants.js';

/** Max zoom-out view — no spawn/despawn inside this radius. */
export function streamViewRadius() {
  return WORLD.STREAM_VIEW_RADIUS;
}

/** Outer edge of the spawn shell (rocks materialize between view and spawn radii). */
export function streamSpawnRadius() {
  return WORLD.STREAM_SPAWN_RADIUS;
}

/** Drop live rocks beyond this (never while still inside the view radius). */
export function streamDespawnRadius() {
  return WORLD.STREAM_DESPAWN_RADIUS;
}

export function distWorld(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** New rocks may appear only in the ring outside the viewport. */
export function inSpawnShell(dist, viewRadius, spawnRadius) {
  return dist > viewRadius && dist <= spawnRadius;
}

/** Whether a catalog rock should materialize (teleport fills the view too). */
export function inMaterializeRange(dist, viewRadius, spawnRadius, includeView = false) {
  if (includeView) return dist <= spawnRadius;
  return inSpawnShell(dist, viewRadius, spawnRadius);
}

/** Live rocks stay until beyond despawn; never removed while inside view. */
export function shouldKeepLiveRock(dist, viewRadius, despawnRadius) {
  if (dist <= viewRadius) return true;
  return dist <= despawnRadius;
}

/** @param {Map<string, { active?: boolean, position: { x: number, y: number } }>} liveMap */
export function shouldDropLiveRock(
  liveMap,
  id,
  keep,
  playerX,
  playerY,
  viewRadius,
  despawnRadius
) {
  if (keep.has(id)) return false;
  const asteroid = liveMap.get(id);
  if (!asteroid?.active) return true;
  const d = distWorld(asteroid.position.x, asteroid.position.y, playerX, playerY);
  return !shouldKeepLiveRock(d, viewRadius, despawnRadius);
}
