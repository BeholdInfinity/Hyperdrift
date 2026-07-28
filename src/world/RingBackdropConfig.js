/**
 * Runtime overworld ring backdrop tuning — defaults from RENDER, live-adjustable in dev menu.
 */

import { RENDER } from '../core/Constants.js';

/** @typedef {{ r: number, g: number, b: number }} Rgb */

/** @typedef {{
 *   edgeFeatherFrac: number,
 *   alphaMin: number,
 *   alphaMax: number,
 *   color: Rgb,
 * }} BaseLayerConfig */

/** @typedef {{
 *   edgeFeatherFrac: number,
 *   alphaMin: number,
 *   alphaMax: number,
 *   primaryColor: Rgb,
 *   primaryMix: number,
 * }} BandsLayerConfig */

/** @type {{
 *   enabled: boolean,
 *   showBaseFill: boolean,
 *   showBands: boolean,
 *   base: BaseLayerConfig,
 *   bands: BandsLayerConfig,
 * }} */
export const ringBackdropConfig = {
  enabled: RENDER.RING_BACKDROP,
  showBaseFill: true,
  showBands: true,
  base: {
    edgeFeatherFrac: RENDER.RING_BACKDROP_EDGE_FEATHER_FRAC,
    alphaMin: 0,
    alphaMax: 1,
    color: { ...RENDER.RING_BACKDROP_BASE },
  },
  bands: {
    edgeFeatherFrac: RENDER.RING_BACKDROP_EDGE_FEATHER_FRAC,
    alphaMin: 0.08,
    alphaMax: 0.85,
    primaryColor: { r: 145, g: 118, b: 95 },
    primaryMix: 0.65,
  },
};

export function getRingBackdropConfig() {
  return ringBackdropConfig;
}

/** @param {Partial<typeof ringBackdropConfig> & { base?: Partial<BaseLayerConfig>, bands?: Partial<BandsLayerConfig> }} patch */
export function patchRingBackdropConfig(patch) {
  if (patch.enabled != null) ringBackdropConfig.enabled = !!patch.enabled;
  if (patch.showBaseFill != null) ringBackdropConfig.showBaseFill = !!patch.showBaseFill;
  if (patch.showBands != null) ringBackdropConfig.showBands = !!patch.showBands;
  if (patch.base) patchBaseLayer(patch.base);
  if (patch.bands) patchBandsLayer(patch.bands);
}

/** @param {Partial<BaseLayerConfig>} patch */
function patchBaseLayer(patch) {
  const b = ringBackdropConfig.base;
  if (patch.edgeFeatherFrac != null) {
    b.edgeFeatherFrac = clampFeather(patch.edgeFeatherFrac);
  }
  if (patch.alphaMin != null) b.alphaMin = clamp01(patch.alphaMin);
  if (patch.alphaMax != null) b.alphaMax = clamp01(patch.alphaMax);
  if (b.alphaMin > b.alphaMax) b.alphaMin = b.alphaMax;
  if (patch.color) b.color = clampRgb(patch.color);
}

/** @param {Partial<BandsLayerConfig>} patch */
function patchBandsLayer(patch) {
  const b = ringBackdropConfig.bands;
  if (patch.edgeFeatherFrac != null) {
    b.edgeFeatherFrac = clampFeather(patch.edgeFeatherFrac);
  }
  if (patch.alphaMin != null) b.alphaMin = clamp01(patch.alphaMin);
  if (patch.alphaMax != null) b.alphaMax = clamp01(patch.alphaMax);
  if (b.alphaMin > b.alphaMax) b.alphaMin = b.alphaMax;
  if (patch.primaryColor) b.primaryColor = clampRgb(patch.primaryColor);
  if (patch.primaryMix != null) b.primaryMix = clamp01(patch.primaryMix);
}

export function resetRingBackdropConfig() {
  ringBackdropConfig.enabled = RENDER.RING_BACKDROP;
  ringBackdropConfig.showBaseFill = true;
  ringBackdropConfig.showBands = true;
  ringBackdropConfig.base = {
    edgeFeatherFrac: RENDER.RING_BACKDROP_EDGE_FEATHER_FRAC,
    alphaMin: 0,
    alphaMax: 1,
    color: { ...RENDER.RING_BACKDROP_BASE },
  };
  ringBackdropConfig.bands = {
    edgeFeatherFrac: RENDER.RING_BACKDROP_EDGE_FEATHER_FRAC,
    alphaMin: 0.08,
    alphaMax: 0.85,
    primaryColor: { r: 145, g: 118, b: 95 },
    primaryMix: 0.65,
  };
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function clampFeather(n) {
  return Math.max(0, Math.min(0.5, Number(n)));
}

/** @param {Rgb} c */
function clampRgb(c) {
  return {
    r: clampByte(c.r),
    g: clampByte(c.g),
    b: clampByte(c.b),
  };
}

function clampByte(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(255, v));
}

const STORAGE_KEY = 'hyperdrift.ringBackdrop.v1';

/** @returns {typeof ringBackdropConfig} */
export function snapshotRingBackdropConfig() {
  return JSON.parse(JSON.stringify(ringBackdropConfig));
}

/** @param {Partial<typeof ringBackdropConfig>} snap */
export function applyRingBackdropSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return false;
  patchRingBackdropConfig(snap);
  return true;
}

export function saveRingBackdropToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotRingBackdropConfig()));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'localStorage save failed' };
  }
}

export function loadRingBackdropFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ok: false, missing: true };
    const snap = JSON.parse(raw);
    applyRingBackdropSnapshot(snap);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'localStorage load failed' };
  }
}

export function clearRingBackdropStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'localStorage clear failed' };
  }
}
