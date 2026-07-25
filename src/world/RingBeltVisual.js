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

/**
 * Filled annulus with Saturn-style concentric band infill (screen px radii).
 */
export function drawRingBeltFill(ctx, cx, cy, innerPx, outerPx, ring, alpha = 1) {
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
  const model = getBandModel(ring);
  const { tint, bands, ripples, density } = model;
  const edgeSoft = Math.min(widthPx * 0.12, 6);

  ctx.save();
  clipAnnulus(ctx, cx, cy, innerPx, outerPx);

  // Deep base — faint starfield shows through sparse regions
  ctx.fillStyle = `rgba(8, 10, 16, ${alpha * 0.55})`;
  fillAnnulusSlice(ctx, cx, cy, innerPx, outerPx);

  // Concentric sub-bands (vinyl-groove style)
  for (const band of bands) {
    let r0 = innerPx + band.t0 * widthPx;
    let r1 = innerPx + band.t1 * widthPx;
    if (r1 <= r0 + 0.15) continue;

    // Feather annulus edges
    if (band.t0 < 0.08) r0 += edgeSoft * (1 - band.t0 / 0.08);
    if (band.t1 > 0.92) r1 -= edgeSoft * ((band.t1 - 0.92) / 0.08);

    const bri = band.bright;
    const a = band.opacity * alpha * Math.min(1.15, density);
    ctx.fillStyle = `rgba(${Math.round(tint.r * bri)}, ${Math.round(tint.g * bri)}, ${Math.round(tint.b * bri)}, ${a})`;
    fillAnnulusSlice(ctx, cx, cy, r0, r1);
  }

  // Fine ripple lines (sub-structure within bands)
  for (const rip of ripples) {
    const r = innerPx + rip.t * widthPx;
    ctx.strokeStyle = `rgba(220, 225, 235, ${rip.opacity * alpha})`;
    ctx.lineWidth = Math.max(0.35, rip.w * widthPx);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Directional lighting — bright left (sunward), darker right
  ctx.globalCompositeOperation = 'soft-light';
  const light = ctx.createLinearGradient(cx - outerPx, cy, cx + outerPx * 0.6, cy);
  light.addColorStop(0, `rgba(255, 252, 240, ${alpha * 0.55})`);
  light.addColorStop(0.35, `rgba(200, 195, 185, ${alpha * 0.12})`);
  light.addColorStop(0.65, `rgba(80, 75, 70, ${alpha * 0.08})`);
  light.addColorStop(1, `rgba(0, 0, 0, ${alpha * 0.35})`);
  ctx.fillStyle = light;
  ctx.fillRect(cx - outerPx, cy - outerPx, outerPx * 2, outerPx * 2);

  // Specular kiss on dense inner edge (classic ring bright inner boundary)
  ctx.globalCompositeOperation = 'screen';
  const specInner = ctx.createRadialGradient(cx, cy, innerPx, cx, cy, innerPx + widthPx * 0.15);
  specInner.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.22 * density})`);
  specInner.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = specInner;
  fillAnnulusSlice(ctx, cx, cy, innerPx, innerPx + widthPx * 0.18);

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
