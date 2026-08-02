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

export function streamSpawnBudget() {
  return WORLD.STREAM_SPAWN_BUDGET ?? 100;
}

/** Raise outer-shell budget when catalog materialize is behind (speed-independent density). */
export function streamSpawnBudgetForBacklog(backlog) {
  const base = streamSpawnBudget();
  const max = WORLD.STREAM_SPAWN_BUDGET_MAX ?? 400;
  const frames = Math.max(1, WORLD.STREAM_SPAWN_CATCHUP_FRAMES ?? 3);
  const catchup = Math.ceil(Math.max(0, backlog) / frames);
  return Math.min(max, Math.max(base, catchup));
}

export function distWorld(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Distance anchor for spawn/cull — viewport center when provided, else ship. */
export function streamAnchorXY(ctx) {
  return {
    x: ctx.anchorX ?? ctx.playerX,
    y: ctx.anchorY ?? ctx.playerY,
  };
}

export function distFromStreamAnchor(x, y, ctx) {
  const a = streamAnchorXY(ctx);
  return distWorld(x, y, a.x, a.y);
}

const MATERIALIZE_FRAME_SLOTS = 40;

function hashStreamId(streamId) {
  let h = 0;
  const s = String(streamId ?? '');
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** Deterministic per-rock materialize distance spread across the spawn shell. */
export function materializeDistForStreamId(id, innerRadius, spawnRadius) {
  const t = (hashStreamId(id) % 997) / 997;
  const shell = Math.max(1, spawnRadius - innerRadius);
  return innerRadius + shell * (0.12 + t * 0.88);
}

/** New rocks may appear only in the ring outside the inner radius. */
export function inSpawnShell(dist, innerRadius, spawnRadius) {
  return dist > innerRadius && dist <= spawnRadius;
}

/** Whether a catalog rock should materialize (teleport fills the view too). */
export function inMaterializeRange(dist, innerRadius, spawnRadius, includeView = false) {
  if (includeView) return dist <= spawnRadius;
  return inSpawnShell(dist, innerRadius, spawnRadius);
}

/**
 * Staggered shell materialize — inner bound is visual radius when provided so
 * rocks can enter the viewport; stream view radius still governs retention.
 * @param {number} [innerRadius] — defaults to stream viewRadius (250 km)
 */
export function shouldMaterializeRock(
  dist,
  streamId,
  viewRadius,
  spawnRadius,
  gameTime = 0,
  includeView = false,
  innerRadius = null
) {
  if (includeView) return dist <= spawnRadius;
  const inner = innerRadius ?? viewRadius;
  if (dist <= inner || dist > spawnRadius) return false;
  if (dist > materializeDistForStreamId(streamId, inner, spawnRadius)) return false;
  const slot = hashStreamId(streamId) % MATERIALIZE_FRAME_SLOTS;
  const phase = Math.floor(gameTime * 60) % MATERIALIZE_FRAME_SLOTS;
  return slot === phase;
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
  anchorX,
  anchorY,
  viewRadius,
  despawnRadius
) {
  if (keep.has(id)) return false;
  const asteroid = liveMap.get(id);
  if (!asteroid?.active) return true;
  const d = distWorld(asteroid.position.x, asteroid.position.y, anchorX, anchorY);
  return !shouldKeepLiveRock(d, viewRadius, despawnRadius);
}
