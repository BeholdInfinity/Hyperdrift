/**
 * Scan stroke visuals — green chords + emitter beams for FLS + CONTACT.
 * SCAN: three silhouette pairs open opposite ways around the rim with chords.
 */

/** Cap outline verts for FX sampling (stride down if denser). */
const MAX_OUTLINE = 32;

const _wx = new Float64Array(MAX_OUTLINE);
const _wy = new Float64Array(MAX_OUTLINE);
const _cum = new Float64Array(MAX_OUTLINE + 1);
let _vertCount = 0;
let _perimeter = 0;
let _silMode = 'ellipse'; // 'ellipse' | 'poly'
let _ecx = 0;
let _ecy = 0;
let _erx = 0;
let _ery = 0;
let _eang = 0;
let _ecos = 1;
let _esin = 0;

/** Rim contact points for 3 pairs (left / right walkers). */
const _lx = new Float64Array(3);
const _ly = new Float64Array(3);
const _rx = new Float64Array(3);
const _ry = new Float64Array(3);

const PAIR_SWEEP_HZ = 1.15;
const GHOST_TRAILS = [-0.12, 0.12];

/** Two-pass glow stroke used by scanner sweep lines. */
export function strokeScanSegment(ctx, x0, y0, x1, y1, amp, width) {
  if (amp < 0.02) return;
  ctx.strokeStyle = `rgba(70, 230, 130, ${0.22 * amp})`;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = `rgba(180, 255, 210, ${0.35 * amp})`;
  ctx.lineWidth = Math.max(0.45, width * 0.28);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function pingPong01(t) {
  const u = ((t % 2) + 2) % 2;
  return u < 1 ? u : 2 - u;
}

function wrap01(t) {
  return ((t % 1) + 1) % 1;
}

/**
 * Build a canvas clip path matching the contact silhouette (world or panel space).
 * Uses asteroid verts when available; otherwise a rotated ellipse from extents.
 * @param {object} [opts]
 * @param {boolean} [opts.useVerts=true] false → always ellipse / rect
 * @param {number} [opts.scale=1] multiply local verts (CONTACT panel fit)
 * @param {'auto'|'ellipse'|'rect'} [opts.clipShape='auto']
 * @returns {boolean} true if a clip path was begun (caller must clip + restore)
 */
export function beginContactSilhouetteClip(ctx, contactOrActive, tgt, opts = {}) {
  if (!tgt) return false;
  const c = contactOrActive?.contact || contactOrActive;
  const ref = c?.ref;
  const { cx, cy, angle, halfLen, halfBeam } = tgt;
  const useVerts = opts.useVerts !== false;
  const scale = opts.scale ?? 1;
  const clipShape = opts.clipShape || 'auto';

  ctx.beginPath();
  if (clipShape === 'rect') {
    const cos = Math.cos(angle || 0);
    const sin = Math.sin(angle || 0);
    const hx = Math.max(1, halfLen);
    const hy = Math.max(1, halfBeam);
    // Local corners of axis-aligned rect, then rotate into panel/world.
    const corners = [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy],
    ];
    for (let i = 0; i < 4; i++) {
      const lx = corners[i][0];
      const ly = corners[i][1];
      const x = cx + cos * lx - sin * ly;
      const y = cy + sin * lx + cos * ly;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return true;
  }

  if (
    clipShape !== 'ellipse' &&
    useVerts &&
    c?.type === 'asteroid' &&
    ref?.vertices?.length >= 3
  ) {
    const cos = Math.cos(angle || 0);
    const sin = Math.sin(angle || 0);
    for (let i = 0; i < ref.vertices.length; i++) {
      const v = ref.vertices[i];
      const x = cx + (v.x * cos - v.y * sin) * scale;
      const y = cy + (v.x * sin + v.y * cos) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return true;
  }

  const rx = Math.max(2, halfLen * 0.98);
  const ry = Math.max(2, halfBeam * 0.92);
  ctx.ellipse(cx, cy, rx, ry, angle || 0, 0, Math.PI * 2);
  return true;
}

/**
 * Prepare silhouette sampler scratch from contact + extents.
 * @param {object} [opts]
 * @param {boolean} [opts.useVerts=true]
 * @param {number} [opts.scale=1]
 * @param {'auto'|'ellipse'|'rect'} [opts.clipShape='auto']
 */
function prepareSilhouette(contactOrActive, tgt, opts = {}) {
  const c = contactOrActive?.contact || contactOrActive;
  const ref = c?.ref;
  const { cx, cy, angle, halfLen, halfBeam } = tgt;
  const useVerts = opts.useVerts !== false;
  const scale = opts.scale ?? 1;
  const clipShape = opts.clipShape || 'auto';

  if (clipShape === 'rect') {
    // Sample a tight rectangle perimeter (ore diamond / panel rect).
    const hx = Math.max(1, halfLen);
    const hy = Math.max(1, halfBeam);
    const cos = Math.cos(angle || 0);
    const sin = Math.sin(angle || 0);
    const corners = [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy],
    ];
    for (let i = 0; i < 4; i++) {
      const lx = corners[i][0];
      const ly = corners[i][1];
      _wx[i] = cx + cos * lx - sin * ly;
      _wy[i] = cy + sin * lx + cos * ly;
    }
    _vertCount = 4;
    _cum[0] = 0;
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      total += Math.hypot(_wx[j] - _wx[i], _wy[j] - _wy[i]);
      _cum[i + 1] = total;
    }
    _perimeter = total > 1e-6 ? total : 1;
    _silMode = 'poly';
    return;
  }

  if (
    clipShape !== 'ellipse' &&
    useVerts &&
    c?.type === 'asteroid' &&
    ref?.vertices?.length >= 3
  ) {
    const verts = ref.vertices;
    const nRaw = verts.length;
    const stride = nRaw > MAX_OUTLINE ? Math.ceil(nRaw / MAX_OUTLINE) : 1;
    const cos = Math.cos(angle || 0);
    const sin = Math.sin(angle || 0);
    let n = 0;
    for (let i = 0; i < nRaw && n < MAX_OUTLINE; i += stride) {
      const v = verts[i];
      _wx[n] = cx + (v.x * cos - v.y * sin) * scale;
      _wy[n] = cy + (v.x * sin + v.y * cos) * scale;
      n++;
    }
    if (n >= 3) {
      _vertCount = n;
      _cum[0] = 0;
      let total = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = _wx[j] - _wx[i];
        const dy = _wy[j] - _wy[i];
        total += Math.hypot(dx, dy);
        _cum[i + 1] = total;
      }
      _perimeter = total > 1e-6 ? total : 1;
      _silMode = 'poly';
      return;
    }
  }

  _silMode = 'ellipse';
  _ecx = cx;
  _ecy = cy;
  _erx = Math.max(2, halfLen * 0.98);
  _ery = Math.max(2, halfBeam * 0.92);
  _eang = angle || 0;
  _ecos = Math.cos(_eang);
  _esin = Math.sin(_eang);
  _vertCount = 0;
  _perimeter = 0;
}

/** Sample silhouette at normalized perimeter t∈[0,1) into out arrays at index i. */
function sampleSilhouetteInto(t01, ox, oy, i) {
  const t = wrap01(t01);
  if (_silMode === 'poly' && _vertCount >= 3) {
    const target = t * _perimeter;
    const n = _vertCount;
    let seg = 0;
    while (seg < n - 1 && _cum[seg + 1] < target) seg++;
    const a = _cum[seg];
    const b = _cum[seg + 1];
    const span = b - a || 1;
    const u = (target - a) / span;
    const j = (seg + 1) % n;
    ox[i] = _wx[seg] + (_wx[j] - _wx[seg]) * u;
    oy[i] = _wy[seg] + (_wy[j] - _wy[seg]) * u;
    return;
  }
  const th = t * Math.PI * 2;
  const lx = _erx * Math.cos(th);
  const ly = _ery * Math.sin(th);
  ox[i] = _ecx + _ecos * lx - _esin * ly;
  oy[i] = _ecy + _esin * lx + _ecos * ly;
}

/** Fill _lx/_ly/_rx/_ry for shared open/close progress u. */
function fillPairRimPoints(u) {
  const open = Math.max(0, Math.min(1, u));
  for (let k = 0; k < 3; k++) {
    const start = k / 3;
    sampleSilhouetteInto(start + 0.5 * open, _lx, _ly, k);
    sampleSilhouetteInto(start - 0.5 * open, _rx, _ry, k);
  }
}

/**
 * Draw 3 silhouette pair chords (+ ghost trails). Assumes silhouette prepared.
 * Does not set composite mode / clip — caller owns that.
 */
function strokePairChords(ctx, amp, lineScale, scanT) {
  if (amp < 0.02) return;
  const ls = lineScale;
  const u = pingPong01(scanT * PAIR_SWEEP_HZ);
  fillPairRimPoints(u);
  for (let k = 0; k < 3; k++) {
    strokeScanSegment(ctx, _lx[k], _ly[k], _rx[k], _ry[k], amp * 0.85, 2.4 * ls);
    strokeScanSegment(ctx, _lx[k], _ly[k], _rx[k], _ry[k], amp, 0.85 * ls);
  }
  for (let ti = 0; ti < GHOST_TRAILS.length; ti++) {
    const u2 = pingPong01(scanT * PAIR_SWEEP_HZ + GHOST_TRAILS[ti]);
    fillPairRimPoints(u2);
    for (let k = 0; k < 3; k++) {
      strokeScanSegment(ctx, _lx[k], _ly[k], _rx[k], _ry[k], amp * 0.28, 1.4 * ls);
    }
  }
  // Restore main rim points for beams / sparks.
  fillPairRimPoints(u);
}

/**
 * CONTACT / panel: silhouette-clipped pair chords only (no ship emitters).
 * @param {object} [opts]
 * @param {boolean} [opts.useVerts=true]
 * @param {number} [opts.scale=1] panel fit scale for asteroid verts
 * @param {'auto'|'ellipse'|'rect'} [opts.clipShape='auto']
 */
export function drawSilhouettePairChords(ctx, opts) {
  const amp = opts.amp ?? 0;
  if (amp < 0.02) return;
  const {
    contact = null,
    cx,
    cy,
    halfLen,
    halfBeam,
    angle,
    scanT = 0,
    lineScale = 1,
    useVerts = true,
    scale = 1,
    clipShape = 'auto',
  } = opts;
  if (!(halfLen > 0) || !(halfBeam > 0)) return;

  const tgt = { cx, cy, angle, halfLen, halfBeam };
  const silOpts = { useVerts, scale, clipShape };
  prepareSilhouette(contact, tgt, silOpts);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (beginContactSilhouetteClip(ctx, contact, tgt, silOpts)) {
    ctx.clip();
  }
  strokePairChords(ctx, amp, lineScale, scanT);
  ctx.restore();
}

/**
 * Idle FLS seek: 3 beams from each nose hot spot, sweeping ±halfArc
 * at staggered rates/phases so they don't lock-step.
 */
export function seekBeamSpec(side, k) {
  return {
    rate: 0.42 + k * 0.14 + side * 0.09,
    phase: side * 0.53 + k * 0.37 + side * k * 0.11,
    amp: 0.42 + 0.12 * (1 - k * 0.28),
  };
}

/** Six seek-beam world angles (emitter0×3 then emitter1×3) for the given clock. */
export function seekBeamAngles(bore, halfArc, scanT) {
  const angles = [];
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < 3; k++) {
      const { rate, phase } = seekBeamSpec(side, k);
      const u = pingPong01(scanT * rate * 2 + phase);
      angles.push(bore + (u * 2 - 1) * halfArc);
    }
  }
  return angles;
}

export function drawIdleSeekBeams(ctx, opts) {
  const {
    emitters,
    bore,
    halfArc,
    beamR,
    scanT,
    lineScale = 1,
  } = opts;
  if (!emitters?.length || !(beamR > 0) || !(halfArc > 0)) return;

  const ls = lineScale;
  const angles = seekBeamAngles(bore, halfArc, scanT);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let i = 0;
  for (const em of emitters) {
    for (let k = 0; k < 3; k++) {
      const ang = angles[i++];
      const { amp } = seekBeamSpec(em.side ?? 0, k);
      const x1 = em.x + Math.cos(ang) * beamR;
      const y1 = em.y + Math.sin(ang) * beamR;
      strokeScanSegment(ctx, em.x, em.y, x1, y1, amp * 0.55, 2.4 * ls);
      strokeScanSegment(ctx, em.x, em.y, x1, y1, amp, 0.7 * ls);
    }
  }
  ctx.restore();
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Lerp six beams between seek fan angles and live silhouette rim pair points.
 * Assumes fillPairRimPoints already ran for the target scan progress.
 * blend 0 = pure seek, 1 = pure scan aims.
 */
function drawBlendedRimBeams(ctx, opts) {
  const {
    emitters,
    seekAngles,
    blend,
    beamR,
    lineScale = 1,
    overshoot = 6,
    amp = 0.85,
  } = opts;
  if (!emitters?.length || !seekAngles?.length) return;

  const u = Math.max(0, Math.min(1, blend));
  const e = easeInOut(u);
  const ls = lineScale;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let i = 0;
  for (const em of emitters) {
    const side = em.side ?? 0;
    const ox = side === 0 ? _lx : _rx;
    const oy = side === 0 ? _ly : _ry;
    for (let k = 0; k < 3; k++) {
      const seekAng = seekAngles[i++] ?? 0;
      const seekX = em.x + Math.cos(seekAng) * beamR;
      const seekY = em.y + Math.sin(seekAng) * beamR;

      const ax = ox[k];
      const ay = oy[k];
      const dx = ax - em.x;
      const dy = ay - em.y;
      const len = Math.hypot(dx, dy) || 1;
      const scanX = ax + (dx / len) * overshoot;
      const scanY = ay + (dy / len) * overshoot;

      const x1 = seekX + (scanX - seekX) * e;
      const y1 = seekY + (scanY - seekY) * e;
      const beamAmp = amp * (0.55 + 0.2 * (1 - k * 0.25));
      strokeScanSegment(ctx, em.x, em.y, x1, y1, beamAmp * 0.45, 2.8 * ls);
      strokeScanSegment(ctx, em.x, em.y, x1, y1, beamAmp, 0.7 * ls);

      if (e > 0.35) {
        const sparkA = ((e - 0.35) / 0.65) * 0.15 * beamAmp;
        ctx.beginPath();
        ctx.arc(ax, ay, (1.2 + amp * 0.6) * ls, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160, 255, 200, ${sparkA})`;
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawRimBeams(ctx, opts) {
  const {
    emitters,
    lineScale = 1,
    overshoot = 6,
    amp = 0.85,
  } = opts;
  if (!emitters?.length) return;
  const ls = lineScale;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const em of emitters) {
    const side = em.side ?? 0;
    const ox = side === 0 ? _lx : _rx;
    const oy = side === 0 ? _ly : _ry;
    for (let k = 0; k < 3; k++) {
      const ax = ox[k];
      const ay = oy[k];
      const dx = ax - em.x;
      const dy = ay - em.y;
      const len = Math.hypot(dx, dy) || 1;
      const bx = ax + (dx / len) * overshoot;
      const by = ay + (dy / len) * overshoot;
      const beamAmp = amp * (0.55 + 0.2 * (1 - k * 0.25));
      strokeScanSegment(ctx, em.x, em.y, bx, by, beamAmp * 0.45, 2.8 * ls);
      strokeScanSegment(ctx, em.x, em.y, bx, by, beamAmp, 0.7 * ls);
      ctx.beginPath();
      ctx.arc(ax, ay, (1.2 + amp * 0.6) * ls, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160, 255, 200, ${0.15 * beamAmp})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * FLS scan FX on a target: silhouette pair chords + rim-aimed nose beams.
 *
 * @param {number} [opts.rasterAmp] separate amp for chords (0 during early acquire)
 * @param {number} [opts.beamBlend] 0..1 seek→scan beam blend; omit for full scan beams
 * @param {number[]} [opts.seekAngles] required when beamBlend < 1
 * @param {number} [opts.beamR] seek beam length for blending
 */
export function drawHangarStyleScan(ctx, opts) {
  const amp = opts.amp ?? 0;
  if (amp < 0.02) return;
  const {
    emitters,
    cx,
    cy,
    halfLen,
    halfBeam,
    angle,
    scanT,
    lineScale = 1,
    overshoot = 6,
    contact = null,
    rasterAmp = amp,
    beamBlend = 1,
    seekAngles = null,
    beamR = 0,
  } = opts;
  if (!emitters?.length || !(halfLen > 0) || !(halfBeam > 0)) return;

  const tgt = { cx, cy, angle, halfLen, halfBeam };
  prepareSilhouette(contact, tgt);

  const u = pingPong01(scanT * PAIR_SWEEP_HZ);
  fillPairRimPoints(u);

  if (rasterAmp > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (beginContactSilhouetteClip(ctx, contact, tgt)) {
      ctx.clip();
    }
    strokePairChords(ctx, rasterAmp, lineScale, scanT);
    ctx.restore();
  }

  if (beamBlend < 0.999 && seekAngles?.length) {
    drawBlendedRimBeams(ctx, {
      emitters,
      seekAngles,
      blend: beamBlend,
      beamR,
      lineScale,
      overshoot,
      amp,
    });
    return;
  }

  drawRimBeams(ctx, { emitters, lineScale, overshoot, amp });
}

/**
 * Resolve a radar/FLS contact into scan target extents (world).
 * @returns {{ cx: number, cy: number, angle: number, halfLen: number, halfBeam: number } | null}
 */
export function contactScanTarget(contactOrActive) {
  const c = contactOrActive?.contact || contactOrActive;
  if (!c) return null;
  const ref = c.ref;
  const cx = contactOrActive.x ?? ref?.position?.x ?? ref?.x ?? c.x ?? c.wx;
  const cy = contactOrActive.y ?? ref?.position?.y ?? ref?.y ?? c.y ?? c.wy;
  if (cx == null || cy == null) return null;

  if (c.type === 'asteroid') {
    const r = ref?.radius || 18;
    return { cx, cy, angle: ref?.angle || 0, halfLen: r * 0.95, halfBeam: r * 0.85 };
  }
  if (c.type === 'ore') {
    const r = (ref?.radius || 5) + 2;
    return { cx, cy, angle: 0, halfLen: r, halfBeam: r };
  }
  if (c.type === 'station' || c.id === 'station') {
    const r = 36;
    return { cx, cy, angle: 0, halfLen: r, halfBeam: r };
  }

  const def = ref?.shipDef;
  const ext = def?.hullExtents?.();
  const fwd = ext?.forward ?? def?.forwardExtent?.() ?? 22;
  const aft = ext?.aft ?? def?.aftExtent?.() ?? 20;
  const halfLen = Math.max(16, (fwd + aft) * 0.52);
  const halfBeam = Math.max(10, halfLen * 0.42);
  return {
    cx,
    cy,
    angle: ref?.angle ?? c.heading ?? 0,
    halfLen,
    halfBeam,
  };
}
