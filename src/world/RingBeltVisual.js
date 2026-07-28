/**
 * Sector map asteroid belt fills — Saturn-inspired concentric band infill.
 * Composition tints the palette; density/width control band count and gaps.
 */

const COMPOSITION_TINT = {
  iron: { r: 145, g: 118, b: 95 },
  silicate: { r: 155, g: 152, b: 148 },
  carbonaceous: { r: 95, g: 88, b: 82 },
  ice: { r: 195, g: 210, b: 228 },
  rare: { r: 175, g: 165, b: 145 },
};

const _bandCache = new Map();
const CACHE_MAX = 8;

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function compositionTint(comp) {
  if (!comp || typeof comp !== 'object') return COMPOSITION_TINT.silicate;
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const [tag, weight] of Object.entries(comp)) {
    const t = COMPOSITION_TINT[tag] || COMPOSITION_TINT.silicate;
    r += t.r * weight;
    g += t.g * weight;
    b += t.b * weight;
    w += weight;
  }
  if (w <= 0) return COMPOSITION_TINT.silicate;
  return { r: r / w, g: g / w, b: b / w };
}

function blendTint(a, b, mix) {
  const t = Math.max(0, Math.min(1, mix));
  return {
    r: a.r * (1 - t) + b.r * t,
    g: a.g * (1 - t) + b.g * t,
    b: a.b * (1 - t) + b.b * t,
  };
}

export function ringBeltCacheKey(ring) {
  const comp = ring?.composition ?? {};
  const compKey = Object.keys(comp)
    .sort()
    .map((k) => `${k}:${comp[k]}`)
    .join('|');
  return `${ring?.id}|${ring?.innerR}|${ring?.outerR}|${ring?.density}|${compKey}`;
}

function lruGet(key) {
  if (!_bandCache.has(key)) return null;
  const val = _bandCache.get(key);
  _bandCache.delete(key);
  _bandCache.set(key, val);
  return val;
}

function lruSet(key, data) {
  if (_bandCache.has(key)) _bandCache.delete(key);
  _bandCache.set(key, data);
  while (_bandCache.size > CACHE_MAX) {
    const oldest = _bandCache.keys().next().value;
    _bandCache.delete(oldest);
  }
}

/** Normalized sub-bands (t0/t1 in 0..1 across annulus width) + ripple lines. */
function buildBandModel(ring) {
  const density = Math.max(0.2, Math.min(1.6, ring.density ?? 1));
  const widthWorld = Math.max(1, (ring.outerR ?? 0) - (ring.innerR ?? 0));
  const widthFactor = Math.min(1.5, Math.max(0.5, widthWorld / 60000));
  const rng = seededRandom(hashSeed(ringBeltCacheKey(ring)));
  const tint = compositionTint(ring.composition);

  const targetBands = Math.round(18 + 42 * density * widthFactor);
  const bands = [];
  const ripples = [];
  let t = 0;

  while (t < 0.998 && bands.length < targetBands * 2) {
    const gapChance = 0.06 + (1.15 - density) * 0.12;
    if (rng() < gapChance) {
      t += 0.004 + rng() * 0.035;
      continue;
    }
    const bandW = (0.008 + rng() * 0.045) * (0.85 + widthFactor * 0.25);
    const t1 = Math.min(1, t + bandW);
    const opacity = (0.12 + rng() * 0.62) * Math.min(1.2, density);
    const bright = 0.35 + rng() * 0.65;
    bands.push({ t0: t, t1, opacity, bright });
    t = t1;
  }

  const rippleCount = Math.round(6 + 18 * density * widthFactor);
  for (let i = 0; i < rippleCount; i++) {
    ripples.push({
      t: rng(),
      opacity: 0.04 + rng() * 0.14,
      w: 0.002 + rng() * 0.008,
    });
  }

  return { tint, bands, ripples, density };
}

function getBandModel(ring) {
  const key = ringBeltCacheKey(ring);
  let model = lruGet(key);
  if (!model) {
    model = buildBandModel(ring);
    lruSet(key, model);
  }
  return model;
}

function clipAnnulus(ctx, cx, cy, innerPx, outerPx) {
  ctx.beginPath();
  ctx.arc(cx, cy, outerPx, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerPx, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
}

function fillAnnulusSlice(ctx, cx, cy, r0, r1) {
  if (r1 <= r0 + 0.05) return;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, 0, Math.PI * 2);
  ctx.arc(cx, cy, r0, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
}

/** Layer α at radius r — matches radial gradient stops used by drawRingBeltBase. */
function annulusLayerAlphaAtRadius(r, innerPx, outerPx, edgeFeatherFrac, alphaMin, alphaMax) {
  const aMin = Math.max(0, Math.min(1, alphaMin));
  const aMax = Math.max(0, Math.min(1, alphaMax));
  const widthPx = outerPx - innerPx;
  if (widthPx <= 0.5) return aMax;
  const frac = Math.max(0, Math.min(0.5, edgeFeatherFrac ?? 0));
  const feather = widthPx * frac;
  if (feather <= 0.5) return aMax;
  const t = Math.max(0, Math.min(1, (r - innerPx) / widthPx));
  const t0 = Math.min(0.49, feather / widthPx);
  const t1 = Math.max(t0 + 0.02, 1 - feather / widthPx);
  if (t <= t0) {
    if (t0 <= 0) return aMax;
    return aMin + (aMax - aMin) * (t / t0);
  }
  if (t >= t1) {
    if (t1 >= 1) return aMax;
    return aMin + (aMax - aMin) * ((1 - t) / (1 - t1));
  }
  return aMax;
}

/** Radial α ramp — multiplies layer α from `alphaMin` at edges to `alphaMax` in the interior. */
function applyAnnulusAlphaRamp(ctx, cx, cy, innerPx, outerPx, edgeFeatherFrac, alphaMin, alphaMax) {
  const aMin = Math.max(0, Math.min(1, alphaMin));
  const aMax = Math.max(0, Math.min(1, alphaMax));
  const widthPx = outerPx - innerPx;
  const frac = Math.max(0, Math.min(0.5, edgeFeatherFrac ?? 0));
  const feather = widthPx * frac;
  const useUniformBranch = feather <= 0.5;
  if (aMax <= 0 && aMin <= 0) return;

  ctx.globalCompositeOperation = 'destination-in';
  const grad = ctx.createRadialGradient(cx, cy, innerPx, cx, cy, outerPx);

  if (useUniformBranch) {
    grad.addColorStop(0, `rgba(255,255,255,${aMax})`);
    grad.addColorStop(1, `rgba(255,255,255,${aMax})`);
  } else {
    const t0 = Math.min(0.49, feather / widthPx);
    const t1 = Math.max(t0 + 0.02, 1 - feather / widthPx);
    grad.addColorStop(0, `rgba(255,255,255,${aMin})`);
    grad.addColorStop(t0, `rgba(255,255,255,${aMax})`);
    grad.addColorStop(t1, `rgba(255,255,255,${aMax})`);
    grad.addColorStop(1, `rgba(255,255,255,${aMin})`);
  }

  ctx.fillStyle = grad;
  fillAnnulusSlice(ctx, cx, cy, innerPx, outerPx);
  ctx.globalCompositeOperation = 'source-over';
}

/** @deprecated sector-map edge fade — transparent edges, full interior */
function applyAnnulusEdgeFeather(ctx, cx, cy, innerPx, outerPx, frac) {
  applyAnnulusAlphaRamp(ctx, cx, cy, innerPx, outerPx, frac, 0, 1);
}

/** Background annulus — rgba radial fill (α min at edges, α max in interior). */
function drawRingBeltBase(ctx, cx, cy, innerPx, outerPx, color, alphaMin, alphaMax, edgeFeatherFrac) {
  const aMin = Math.max(0, Math.min(1, alphaMin));
  const aMax = Math.max(0, Math.min(1, alphaMax));
  const skipDraw = aMax <= 0 && aMin <= 0;
  if (skipDraw) return;

  ctx.save();
  clipAnnulus(ctx, cx, cy, innerPx, outerPx);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  const { r, g, b } = color;
  const widthPx = outerPx - innerPx;
  const frac = Math.max(0, Math.min(0.5, edgeFeatherFrac ?? 0));
  const feather = widthPx * frac;

  const grad = ctx.createRadialGradient(cx, cy, innerPx, cx, cy, outerPx);
  if (feather <= 0.5) {
    grad.addColorStop(0, `rgba(${r},${g},${b},${aMax})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${aMax})`);
  } else {
    const t0 = Math.min(0.49, feather / widthPx);
    const t1 = Math.max(t0 + 0.02, 1 - feather / widthPx);
    grad.addColorStop(0, `rgba(${r},${g},${b},${aMin})`);
    grad.addColorStop(t0, `rgba(${r},${g},${b},${aMax})`);
    grad.addColorStop(t1, `rgba(${r},${g},${b},${aMax})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${aMin})`);
  }

  ctx.fillStyle = grad;
  fillAnnulusSlice(ctx, cx, cy, innerPx, outerPx);
  ctx.restore();
}

/** Concentric bands, ripples, and lighting (no base fill or edge feather). */
function drawRingBeltBands(ctx, cx, cy, innerPx, outerPx, ring, alpha, edgeSoft, bandOpts = {}) {
  const widthPx = outerPx - innerPx;
  const model = getBandModel(ring);
  const { bands, ripples, density } = model;
  const bandAlphaMin = bandOpts.bandAlphaMin ?? 0;
  const bandAlphaMax = bandOpts.bandAlphaMax ?? 1;
  const layerEnvelope = bandOpts.layerEnvelope ?? null;
  const envAt = (r) =>
    layerEnvelope
      ? annulusLayerAlphaAtRadius(
          r,
          innerPx,
          outerPx,
          layerEnvelope.edgeFeatherFrac,
          layerEnvelope.alphaMin,
          layerEnvelope.alphaMax
        )
      : 1;
  const primaryMix = bandOpts.primaryMix ?? 0;
  const compTint = compositionTint(ring.composition);
  const tint =
    primaryMix > 0 && bandOpts.primaryColor
      ? blendTint(compTint, bandOpts.primaryColor, primaryMix)
      : compTint;

  for (const band of bands) {
    let r0 = innerPx + band.t0 * widthPx;
    let r1 = innerPx + band.t1 * widthPx;
    if (r1 <= r0 + 0.15) continue;

    if (band.t0 < 0.08) r0 += edgeSoft * (1 - band.t0 / 0.08);
    if (band.t1 > 0.92) r1 -= edgeSoft * ((band.t1 - 0.92) / 0.08);

    const bri = band.bright;
    const norm = Math.max(0, Math.min(1, band.opacity));
    const rMid = (r0 + r1) * 0.5;
    const a = layerEnvelope
      ? norm * alpha * Math.min(1.15, density) * envAt(rMid)
      : (bandAlphaMin + norm * (bandAlphaMax - bandAlphaMin)) * alpha * Math.min(1.15, density);
    ctx.fillStyle = `rgba(${Math.round(tint.r * bri)}, ${Math.round(tint.g * bri)}, ${Math.round(tint.b * bri)}, ${a})`;
    fillAnnulusSlice(ctx, cx, cy, r0, r1);
  }

  for (const rip of ripples) {
    const r = innerPx + rip.t * widthPx;
    const ripA = layerEnvelope
      ? rip.opacity * alpha * envAt(r)
      : (bandAlphaMin + rip.opacity * (bandAlphaMax - bandAlphaMin)) * alpha;
    ctx.strokeStyle = `rgba(220, 225, 235, ${ripA})`;
    ctx.lineWidth = Math.max(0.35, rip.w * widthPx);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const midR = (innerPx + outerPx) * 0.5;
  const lightAlpha = layerEnvelope
    ? alpha * 0.5 * envAt(midR)
    : alpha * (bandAlphaMin + bandAlphaMax) * 0.5;
  ctx.globalCompositeOperation = 'soft-light';
  const light = ctx.createLinearGradient(cx - outerPx, cy, cx + outerPx * 0.6, cy);
  light.addColorStop(0, `rgba(255, 252, 240, ${lightAlpha * 0.55})`);
  light.addColorStop(0.35, `rgba(200, 195, 185, ${lightAlpha * 0.12})`);
  light.addColorStop(0.65, `rgba(80, 75, 70, ${lightAlpha * 0.08})`);
  light.addColorStop(1, `rgba(0, 0, 0, ${lightAlpha * 0.35})`);
  ctx.fillStyle = light;
  ctx.fillRect(cx - outerPx, cy - outerPx, outerPx * 2, outerPx * 2);

  ctx.globalCompositeOperation = 'screen';
  const specInner = ctx.createRadialGradient(cx, cy, innerPx, cx, cy, innerPx + widthPx * 0.15);
  specInner.addColorStop(0, `rgba(255, 255, 255, ${lightAlpha * 0.22 * density})`);
  specInner.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = specInner;
  fillAnnulusSlice(ctx, cx, cy, innerPx, innerPx + widthPx * 0.18);

  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Filled annulus with Saturn-style concentric band infill (screen px radii).
 *
 * @param {object} [options]
 * @param {number} [options.edgeFeatherFrac] — fade each annulus edge over this fraction of band width (0–0.5)
 */
export function drawRingBeltFill(ctx, cx, cy, innerPx, outerPx, ring, alpha = 1, options = {}) {
  if (outerPx < innerPx + 0.5 || outerPx < 2 || alpha <= 0.01 || !ring) return;
  if (
    !Number.isFinite(cx) ||
    !Number.isFinite(cy) ||
    !Number.isFinite(innerPx) ||
    !Number.isFinite(outerPx)
  ) {
    return;
  }

  const widthPx = outerPx - innerPx;
  const edgeFeatherFrac = Math.max(0, Math.min(0.5, options.edgeFeatherFrac ?? 0));
  const edgeSoft = edgeFeatherFrac > 0 ? 0 : Math.min(widthPx * 0.12, 6);

  ctx.save();
  clipAnnulus(ctx, cx, cy, innerPx, outerPx);

  // Deep base — faint starfield shows through sparse regions (sector map)
  ctx.fillStyle = `rgba(8, 10, 16, ${alpha * 0.55})`;
  fillAnnulusSlice(ctx, cx, cy, innerPx, outerPx);

  drawRingBeltBands(ctx, cx, cy, innerPx, outerPx, ring, alpha, edgeSoft);

  if (edgeFeatherFrac > 0) {
    applyAnnulusEdgeFeather(ctx, cx, cy, innerPx, outerPx, edgeFeatherFrac);
  }

  ctx.restore();
}

/**
 * Flight viewport — background fill and band infill as separate layers (each with own feather/α).
 *
 * @param {object} [options]
 * @param {boolean} [options.showBaseFill]
 * @param {boolean} [options.showBands]
 * @param {{ edgeFeatherFrac?: number, alphaMin?: number, alphaMax?: number, color?: { r: number, g: number, b: number } }} [options.base]
 * @param {{ edgeFeatherFrac?: number, alphaMin?: number, alphaMax?: number, primaryColor?: { r: number, g: number, b: number }, primaryMix?: number }} [options.bands]
 */
export function drawRingBeltFillOverworld(ctx, cx, cy, innerPx, outerPx, ring, alpha = 1, options = {}) {
  if (outerPx < innerPx + 0.5 || outerPx < 2 || !ring) return;
  if (
    !Number.isFinite(cx) ||
    !Number.isFinite(cy) ||
    !Number.isFinite(innerPx) ||
    !Number.isFinite(outerPx)
  ) {
    return;
  }

  const showBase = options.showBaseFill !== false;
  const showBands = options.showBands !== false;
  if (!showBase && !showBands) return;

  const baseCfg = options.base ?? {};
  const bandsCfg = options.bands ?? {};

  if (showBase) {
    drawRingBeltBase(
      ctx,
      cx,
      cy,
      innerPx,
      outerPx,
      baseCfg.color ?? { r: 32, g: 34, b: 38 },
      baseCfg.alphaMin ?? 0,
      baseCfg.alphaMax ?? 1,
      baseCfg.edgeFeatherFrac ?? 0
    );
  }

  if (showBands && alpha > 0.01) {
    const bandEdgeFeather = Math.max(0, Math.min(0.5, bandsCfg.edgeFeatherFrac ?? 0));
    const bandAlphaMin = bandsCfg.alphaMin ?? 0;
    const bandAlphaMax = bandsCfg.alphaMax ?? 1;
    if (bandAlphaMax > 0 || bandAlphaMin > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      clipAnnulus(ctx, cx, cy, innerPx, outerPx);
      drawRingBeltBands(ctx, cx, cy, innerPx, outerPx, ring, alpha, 0, {
        layerEnvelope: {
          edgeFeatherFrac: bandEdgeFeather,
          alphaMin: bandAlphaMin,
          alphaMax: bandAlphaMax,
        },
        primaryColor: bandsCfg.primaryColor,
        primaryMix: bandsCfg.primaryMix,
      });
      ctx.restore();
    }
  }
}
