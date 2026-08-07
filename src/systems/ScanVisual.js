/**
 * Scan stroke visuals — green raster lines + emitter beams.
 * Extracted from hangar scan helpers (HangarRender._strokeScanSegment /
 * _drawShipBoardScans) so FLS + CONTACT can share the same look.
 */

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

/**
 * Build a canvas clip path matching the contact silhouette (world or panel space).
 * Uses asteroid verts when available; otherwise a rotated ellipse from extents.
 * @param {object} [opts]
 * @param {boolean} [opts.useVerts=true] false → always ellipse (panel-scaled previews)
 * @returns {boolean} true if a clip path was begun (caller must clip + restore)
 */
export function beginContactSilhouetteClip(ctx, contactOrActive, tgt, opts = {}) {
  if (!tgt) return false;
  const c = contactOrActive?.contact || contactOrActive;
  const ref = c?.ref;
  const { cx, cy, angle, halfLen, halfBeam } = tgt;
  const useVerts = opts.useVerts !== false;

  ctx.beginPath();
  if (useVerts && c?.type === 'asteroid' && ref?.vertices?.length >= 3) {
    const cos = Math.cos(angle || 0);
    const sin = Math.sin(angle || 0);
    for (let i = 0; i < ref.vertices.length; i++) {
      const v = ref.vertices[i];
      const x = cx + v.x * cos - v.y * sin;
      const y = cy + v.x * sin + v.y * cos;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return true;
  }

  // Ships / ore / station / panel previews: tight rotated ellipse inside extents.
  const rx = Math.max(2, halfLen * 0.98);
  const ry = Math.max(2, halfBeam * 0.92);
  ctx.ellipse(cx, cy, rx, ry, angle || 0, 0, Math.PI * 2);
  return true;
}

/**
 * Draw scanner raster lines (nose↔aft barcode bar + ghost trails).
 * Caller may clip to a silhouette first for panel previews.
 */
export function drawScanLinesClipped(ctx, cx, cy, halfLen, halfBeam, angle, scanT, amp, lineScale = 1) {
  if (amp < 0.02) return;
  ctx.globalCompositeOperation = 'lighter';
  const ls = lineScale;
  const u = pingPong01(scanT * 1.15);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Stay inside silhouette; clip masks any residual overhang.
  const along = (u * 2 - 1) * halfLen * 0.92;
  const rx = cx + c * along;
  const ry = cy + s * along;
  const bx = -s * halfBeam * 0.98;
  const by = c * halfBeam * 0.98;
  strokeScanSegment(ctx, rx - bx, ry - by, rx + bx, ry + by, amp * 0.85, 2.4 * ls);
  strokeScanSegment(ctx, rx - bx, ry - by, rx + bx, ry + by, amp, 0.85 * ls);
  for (const trail of [-0.12, 0.12]) {
    const u2 = pingPong01(scanT * 1.15 + trail);
    const along2 = (u2 * 2 - 1) * halfLen * 0.92;
    const rx2 = cx + c * along2;
    const ry2 = cy + s * along2;
    strokeScanSegment(ctx, rx2 - bx, ry2 - by, rx2 + bx, ry2 + by, amp * 0.28, 1.4 * ls);
  }
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
 * Lerp six beams between seek fan angles and hangar-style aim points on a target.
 * blend 0 = pure seek, 1 = pure scan aims.
 */
export function drawBlendedTargetBeams(ctx, opts) {
  const {
    emitters,
    seekAngles,
    cx,
    cy,
    halfLen,
    halfBeam,
    angle,
    scanT,
    blend,
    beamR,
    lineScale = 1,
    overshoot = 6,
    amp = 0.85,
  } = opts;
  if (!emitters?.length || !seekAngles?.length) return;

  const u = Math.max(0, Math.min(1, blend));
  const e = easeInOut(u);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ls = lineScale;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let i = 0;
  for (const em of emitters) {
    const phase = (em.side ?? 0) * 0.5;
    for (let k = 0; k < 3; k++) {
      const seekAng = seekAngles[i++] ?? angle;
      const seekX = em.x + Math.cos(seekAng) * beamR;
      const seekY = em.y + Math.sin(seekAng) * beamR;

      const uu = pingPong01(scanT * (1.35 + k * 0.17) + phase + k * 0.22);
      const vv = pingPong01(scanT * (0.9 + k * 0.11) + phase * 1.3 + 0.4);
      const lx = (uu * 2 - 1) * halfLen * 0.95;
      const ly = (vv * 2 - 1) * halfBeam * 0.9;
      const ax = cx + c * lx - s * ly;
      const ay = cy + s * lx + c * ly;
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

      // Sparks fade in as we lock on.
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

/**
 * Full hangar-style scan FX on a target: silhouette-clipped rasters + beams
 * from emitters that ping-pong aim points across the hull with contact sparks.
 *
 * @param {number} [opts.rasterAmp] separate amp for rasters (0 during early acquire)
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

  // Rasters masked to the rock/hull silhouette (fade in during acquire).
  if (rasterAmp > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (beginContactSilhouetteClip(ctx, contact, tgt)) {
      ctx.clip();
    }
    drawScanLinesClipped(ctx, cx, cy, halfLen, halfBeam, angle, scanT, rasterAmp, lineScale);
    ctx.restore();
  }

  if (beamBlend < 0.999 && seekAngles?.length) {
    drawBlendedTargetBeams(ctx, {
      emitters,
      seekAngles,
      cx,
      cy,
      halfLen,
      halfBeam,
      angle,
      scanT,
      blend: beamBlend,
      beamR,
      lineScale,
      overshoot,
      amp,
    });
    return;
  }

  // Full scan beams + sparks.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ls = lineScale;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const em of emitters) {
    const phase = (em.side ?? 0) * 0.5;
    for (let k = 0; k < 3; k++) {
      const u = pingPong01(scanT * (1.35 + k * 0.17) + phase + k * 0.22);
      const v = pingPong01(scanT * (0.9 + k * 0.11) + phase * 1.3 + 0.4);
      const lx = (u * 2 - 1) * halfLen * 0.95;
      const ly = (v * 2 - 1) * halfBeam * 0.9;
      const ax = cx + c * lx - s * ly;
      const ay = cy + s * lx + c * ly;
      const dx = ax - em.x;
      const dy = ay - em.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = ax + (dx / len) * overshoot;
      const oy = ay + (dy / len) * overshoot;
      const beamAmp = amp * (0.55 + 0.2 * (1 - k * 0.25));
      strokeScanSegment(ctx, em.x, em.y, ox, oy, beamAmp * 0.45, 2.8 * ls);
      strokeScanSegment(ctx, em.x, em.y, ox, oy, beamAmp, 0.7 * ls);
      ctx.beginPath();
      ctx.arc(ax, ay, (1.2 + amp * 0.6) * ls, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(160, 255, 200, ${0.15 * beamAmp})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Resolve a radar/FLS contact into hangar-style scan target extents (world).
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
    // Compact station icon footprint — full STATION.RADIUS would dominate the FX.
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
