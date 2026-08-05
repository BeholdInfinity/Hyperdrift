import { RADAR } from '../core/Constants.js';

/**
 * Shared contact occlusion — line-of-sight visibility between a sensor origin
 * (player ship center for radar/shadows, nose for FLS) and radar/FLS contacts.
 *
 * Used by: RadarSystem (paint gate), ForwardScanSystem (scan cap),
 * OcclusionShadowPass (viewport umbra + SCAN darkened wedges).
 *
 * Hull fidelity per decisions:
 * - circle prefilter all pairs
 * - polygon for asteroids/ships within ~1.5× sensor range
 * - station = single hull AABB (landing roof tape ignored)
 * - ore = circle
 * Budget: nearest OCCLUSION_CANDIDATES_MAX occluders; computed once per frame,
 * shared by consumers.
 */

const TWO_PI = Math.PI * 2;

/** Ray vs segment; returns t along ray or null (from CombatResolver). */
function raySegmentT(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1 - ox) * sy - (y1 - oy) * sx) / denom;
  const u = ((x1 - ox) * dy - (y1 - oy) * dx) / denom;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}

/** Ray vs circle; returns nearest hit t >= 0 or null. */
function rayCircleT(ox, oy, dx, dy, cx, cy, r) {
  const oxr = ox - cx;
  const oyr = oy - cy;
  const b = oxr * dx + oyr * dy;
  const c = oxr * oxr + oyr * oyr - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  return t >= 0 ? t : null;
}

/** Ray vs AABB; returns nearest hit t >= 0 or null (slab method). */
function rayAabbT(ox, oy, dx, dy, minX, minY, maxX, maxY) {
  let tmin = 0;
  let tmax = Infinity;
  if (Math.abs(dx) < 1e-12) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - ox) * inv;
    let t2 = (maxX - ox) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dy) < 1e-12) {
    if (oy < minY || oy > maxY) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - oy) * inv;
    let t2 = (maxY - oy) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmax < tmin) return null;
  return tmin >= 0 ? tmin : null;
}

/** Ray vs convex polygon; returns nearest hit t >= 0 or null. */
function rayPolyT(ox, oy, dx, dy, maxRange, verts) {
  if (!verts || verts.length < 2) return null;
  let best = null;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const t = raySegmentT(ox, oy, dx, dy, a.x, a.y, b.x, b.y);
    if (t != null && t <= maxRange && (best === null || t < best)) best = t;
  }
  return best;
}

/** Transform local verts to world given pose. */
function vertsToWorld(verts, px, py, angle) {
  if (!verts?.length) return null;
  const cos = Math.cos(angle || 0);
  const sin = Math.sin(angle || 0);
  const out = new Array(verts.length);
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    out[i] = { x: px + v.x * cos - v.y * sin, y: py + v.x * sin + v.y * cos };
  }
  return out;
}

export class ContactOcclusion {
  constructor() {
    this._frame = 0;
    this._prepared = null;
  }

  nextFrame() {
    this._frame++;
  }

  /**
   * Distance-sorted occluder list, built once per frame + origin + sensorRange
   * and shared by computeVisibility (per contact) and buildShadowPolygons.
   * Building per contact was the FPS killer (vertsToWorld churn × contacts²).
   */
  _prepareOccluders(origin, candidates, sensorRange) {
    const p = this._prepared;
    if (
      p &&
      p.frame === this._frame &&
      p.ox === origin.x &&
      p.oy === origin.y &&
      p.sensorRange === sensorRange
    ) {
      return p.list;
    }
    const list = [];
    for (const c of candidates) {
      const ox = c.x ?? c.ref?.position?.x ?? c.ref?.x;
      const oy = c.y ?? c.ref?.position?.y ?? c.ref?.y;
      if (ox == null || oy == null) continue;
      const ddx = ox - origin.x;
      const ddy = oy - origin.y;
      const d = Math.hypot(ddx, ddy);
      if (d <= 1e-3) continue;
      const occ = this.occluderFor(
        { type: c.type, ref: c.ref, x: ox, y: oy, angle: c.angle },
        sensorRange,
        d
      );
      if (!occ) continue;
      occ.dist = d;
      occ.id = c.id;
      // Angular cone from origin (the same bearing/half-extent the renderer
      // uses to place the object) — lets consumers skip pairs whose vectors
      // never overlap instead of ray-testing them.
      occ.bearing = Math.atan2(ddy, ddx);
      occ.halfAngle = Math.asin(Math.min(1, (occ.boundR ?? occ.radius) / d));
      list.push(occ);
    }
    list.sort((a, b) => a.dist - b.dist);
    this._prepared = {
      frame: this._frame,
      ox: origin.x,
      oy: origin.y,
      sensorRange,
      list,
    };
    return list;
  }

  /**
   * Occluder description for a contact-like object.
   * @param {object} c contact { type, ref, x, y, angle }
   * @param {number} sensorRange effective sensor range (for fidelity gate)
   * @param {number} distToOrigin distance from origin to occluder center
   * @returns {{ kind: string, cx: number, cy: number, radius: number, poly?: Array, aabb?: object } | null}
   */
  occluderFor(c, sensorRange, distToOrigin) {
    const ref = c.ref;
    const cx = c.x ?? ref?.position?.x ?? ref?.x ?? 0;
    const cy = c.y ?? ref?.position?.y ?? ref?.y ?? 0;
    const detailed = distToOrigin <= sensorRange * 1.5;

    if (c.type === 'asteroid') {
      const radius = ref?.radius ?? 20;
      if (!detailed) return { kind: 'circle', cx, cy, radius, boundR: radius };
      const verts = ref?.vertices;
      const poly =
        verts && verts.length >= 3
          ? vertsToWorld(verts, ref.position.x, ref.position.y, ref.angle || 0)
          : null;
      // Asteroid radius is the composite bounding radius — contains all verts.
      if (poly) return { kind: 'poly', cx, cy, radius, boundR: radius, poly };
      return { kind: 'circle', cx, cy, radius, boundR: radius };
    }

    if (c.type === 'civilian' || c.type === 'patrol') {
      const ext = ref?.shipDef?.hullExtents?.();
      const radius = ext ? Math.max(ext.forward ?? 20, ext.aft ?? 20) : 24;
      if (!detailed || !ext) return { kind: 'circle', cx, cy, radius, boundR: radius };
      const half = Math.max(ext.forward ?? 0, ext.aft ?? 0);
      const halfW = Math.max(ext.port ?? 0, ext.starboard ?? 0) || radius * 0.45;
      const local = [
        { x: ext.forward ?? half, y: -halfW },
        { x: ext.forward ?? half, y: halfW },
        { x: -(ext.aft ?? half), y: halfW },
        { x: -(ext.aft ?? half), y: -halfW },
      ];
      const poly = vertsToWorld(local, cx, cy, c.angle ?? ref?.angle ?? 0);
      // Box corners exceed centerline radius — bound by the half-diagonal.
      return { kind: 'poly', cx, cy, radius, boundR: Math.hypot(half, halfW), poly };
    }

    if (c.type === 'station') {
      // Single solid AABB — ignore landing roof tape occluder.
      const r = (ref?.radius ?? 140) * (ref?.scale ?? 1);
      return {
        kind: 'aabb',
        cx,
        cy,
        radius: r,
        // AABB corners sit at r·√2 — prefilters must use the corner bound.
        boundR: r * Math.SQRT2,
        aabb: { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r },
      };
    }

    if (c.type === 'ore') {
      const radius = ref?.radius ?? 5;
      return { kind: 'circle', cx, cy, radius, boundR: radius };
    }

    return null;
  }

  /**
   * Angular half-extent of a target from origin (for sample fan width).
   */
  _targetAngularExtent(origin, target) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dist = Math.hypot(dx, dy) || 1;
    const radius = target.ref?.radius ?? this._fallbackRadius(target) ?? 10;
    return Math.min(Math.PI / 3, Math.asin(Math.min(1, radius / dist)));
  }

  _fallbackRadius(target) {
    const ref = target.ref;
    if (!ref) return 10;
    if (target.type === 'station') return (ref.radius ?? 140) * (ref.scale ?? 1);
    const ext = ref.shipDef?.hullExtents?.();
    if (ext) return Math.max(ext.forward ?? 20, ext.aft ?? 20);
    return ref.radius ?? 10;
  }

  /**
   * Compute visibility of a target from origin past occluders.
   * @param {{x:number,y:number}} origin sensor origin
   * @param {object} target contact { x, y, type, ref }
   * @param {Array<object>} candidates all contact-like objects (raw list)
   * @param {{ sensorRange?: number, samples?: number }} opts
   * @returns {number} 0..1
   */
  computeVisibility(origin, target, candidates, opts = {}) {
    const sensorRange = opts.sensorRange ?? RADAR.RANGE;
    const samples = Math.max(1, opts.samples ?? RADAR.OCCLUSION_SAMPLES ?? 8);

    const tdx = target.x - origin.x;
    const tdy = target.y - origin.y;
    const targetDist = Math.hypot(tdx, tdy);
    if (targetDist <= 1e-6) return 1;

    // Shared per-frame list (nearest-first); per-target we only keep occluders
    // nearer than the target, capped at OCCLUSION_CANDIDATES_MAX.
    const prepared = this._prepareOccluders(origin, candidates, sensorRange);
    const cap = RADAR.OCCLUSION_CANDIDATES_MAX ?? 24;
    const baseAngle = Math.atan2(tdy, tdx);
    const half = this._targetAngularExtent(origin, target);
    const occluders = [];
    for (const occ of prepared) {
      if (occ.dist >= targetDist - 1e-3) break; // sorted nearest-first
      if (occ.id != null && occ.id === target.id) continue;
      // Angular prefilter: cones that never overlap the target's bearing
      // can't block it — skip before any ray work.
      let da = occ.bearing - baseAngle;
      if (da > Math.PI) da -= TWO_PI;
      else if (da < -Math.PI) da += TWO_PI;
      if (Math.abs(da) > half + occ.halfAngle) continue;
      occluders.push(occ);
      if (occluders.length >= cap) break;
    }
    if (!occluders.length) return 1;

    // Sample a fan of rays spanning the target's angular extent.
    let unblocked = 0;

    for (let s = 0; s < samples; s++) {
      const f = samples === 1 ? 0.5 : s / (samples - 1);
      const a = baseAngle + (f - 0.5) * 2 * half;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let blocked = false;
      for (const occ of occluders) {
        // Circle prefilter: is the ray even near this occluder?
        const tCircle = rayCircleT(origin.x, origin.y, dx, dy, occ.cx, occ.cy, occ.boundR ?? occ.radius);
        if (tCircle == null || tCircle >= targetDist) continue;
        if (occ.kind === 'circle') {
          blocked = true;
          break;
        }
        if (occ.kind === 'aabb') {
          const t = rayAabbT(
            origin.x, origin.y, dx, dy,
            occ.aabb.minX, occ.aabb.minY, occ.aabb.maxX, occ.aabb.maxY
          );
          if (t != null && t < targetDist) {
            blocked = true;
            break;
          }
          continue;
        }
        if (occ.kind === 'poly') {
          const t = rayPolyT(origin.x, origin.y, dx, dy, targetDist, occ.poly);
          if (t != null) {
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) unblocked++;
    }

    return unblocked / samples;
  }

  /**
   * Build 2D umbra shadow polygons from occluder hulls (origin = light/sensor).
   * Each polygon: occluder face + rays through silhouette verts extended to bounds.
   * @param {{x:number,y:number}} origin
   * @param {Array<object>} candidates contact-like objects
   * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds clip bounds
   * @param {{ sensorRange?: number, maxOccluders?: number }} opts
   * @returns {Array<{ verts: Array<{x:number,y:number}> }>}
   */
  buildShadowPolygons(origin, candidates, bounds, opts = {}) {
    const sensorRange = opts.sensorRange ?? RADAR.RANGE;
    const maxOcc = opts.maxOccluders ?? (RADAR.OCCLUSION_SHADOW_MAX ?? 64);
    const boundR =
      Math.max(
        Math.abs(bounds.maxX - origin.x),
        Math.abs(bounds.minX - origin.x),
        Math.abs(bounds.maxY - origin.y),
        Math.abs(bounds.minY - origin.y)
      ) || sensorRange;

    // Shared per-frame occluder list (already sorted nearest-first).
    const all = this._prepareOccluders(origin, candidates, sensorRange);
    const occs = all.length > maxOcc ? all.slice(0, maxOcc) : all;

    const polys = [];
    for (const occ of occs) {
      const silhouette = this._silhouetteVerts(origin, occ);
      if (silhouette.length < 2) continue;
      // Umbra poly: silhouette edge + both endpoints extended away from origin.
      const extended = silhouette.map((v) => {
        const dx = v.x - origin.x;
        const dy = v.y - origin.y;
        const d = Math.hypot(dx, dy) || 1;
        const t = boundR * 1.5;
        return { x: origin.x + (dx / d) * t, y: origin.y + (dy / d) * t };
      });
      polys.push({ verts: [...silhouette, ...extended.reverse()] });
    }
    return polys;
  }

  /**
   * Silhouette vertices of an occluder as seen from origin (tangent points).
   * Falls back to nearest-facing arc for circles/AABBs.
   */
  _silhouetteVerts(origin, occ) {
    if (occ.kind === 'poly' && occ.poly?.length >= 3) {
      // Tangent-ish: pick extreme verts by angle from origin.
      const pts = occ.poly.map((v) => ({
        x: v.x,
        y: v.y,
        a: Math.atan2(v.y - origin.y, v.x - origin.x),
      }));
      pts.sort((p, q) => p.a - q.a);
      const a0 = pts[0];
      const a1 = pts[pts.length - 1];
      return [
        { x: a0.x, y: a0.y },
        { x: a1.x, y: a1.y },
      ];
    }
    // Circle / AABB: two tangent offsets perpendicular to origin direction.
    const dx = occ.cx - origin.x;
    const dy = occ.cy - origin.y;
    const d = Math.hypot(dx, dy) || 1;
    const px = -dy / d;
    const py = dx / d;
    const r = occ.radius;
    return [
      { x: occ.cx + px * r, y: occ.cy + py * r },
      { x: occ.cx - px * r, y: occ.cy - py * r },
    ];
  }

  /**
   * Map world shadow polygons into full-disc SCAN scope wedges.
   * @param {Array<{verts:Array}>} polys from buildShadowPolygons
   * @param {{x:number,y:number}} origin sensor/ship world position
   * @param {number} outerR scope outer radius (px)
   * @param {number} plotRange world range at outerR
   * @param {number} rot camera rotation (rad) applied to bearings
   * @returns {Array<{ a0: number, a1: number }>} screen-space bearing wedges
   */
  shadowPolysToScopeWedges(polys, origin, _outerR, _plotRange, rot = 0) {
    const wedges = [];
    for (const p of polys || []) {
      if (!p.verts || p.verts.length < 2) continue;
      // First two verts = silhouette endpoints in world (see buildShadowPolygons).
      // Bearing is relative to the ship origin, not world (0,0).
      const v0 = p.verts[0];
      const v1 = p.verts[1];
      let a0 = Math.atan2(v0.y - origin.y, v0.x - origin.x) + rot;
      let a1 = Math.atan2(v1.y - origin.y, v1.x - origin.x) + rot;
      // Normalize to shortest arc.
      let da = a1 - a0;
      while (da > Math.PI) da -= TWO_PI;
      while (da < -Math.PI) da += TWO_PI;
      if (da < 0) {
        [a0, a1] = [a1, a0];
        da = -da;
      }
      if (da <= 0 || da >= Math.PI) continue;
      wedges.push({ a0, a1 });
    }
    return wedges;
  }
}
