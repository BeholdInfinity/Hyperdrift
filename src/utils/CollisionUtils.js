/**
 * Shared 2D collision helpers for weapons and hangar hit tests.
 */

/** @returns {boolean} */
export function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}

/** Distance along ray to circle, or null if no hit within maxDist. */
export function rayCircle(ox, oy, dx, dy, maxDist, cx, cy, radius) {
  const fx = ox - cx;
  const fy = oy - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sqrt = Math.sqrt(disc);
  const t1 = (-b - sqrt) / (2 * a);
  const t2 = (-b + sqrt) / (2 * a);
  let t = Infinity;
  if (t1 >= 0) t = Math.min(t, t1);
  if (t2 >= 0) t = Math.min(t, t2);
  if (t === Infinity || t > maxDist) return null;
  return t;
}
