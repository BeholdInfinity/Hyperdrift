/**
 * Runtime depth-layer tuning for stars, nebulae, streaks, and dust.
 */

import { PHYSICS } from '../core/Constants.js';

const STAR_DEFAULTS = [
  { parallax: 0.003, brightness: 0.28, color: '#556677', twinkle: 0.55 },
  { parallax: 0.008, brightness: 0.34, color: '#667788', twinkle: 0.48 },
  { parallax: 0.018, brightness: 0.4, color: '#778899', twinkle: 0.4 },
  { parallax: 0.04, brightness: 0.46, color: '#8899aa', twinkle: 0.32 },
  { parallax: 0.08, brightness: 0.52, color: '#99aabb', twinkle: 0.24 },
  { parallax: 0.14, brightness: 0.58, color: '#bbccdd', twinkle: 0.16 },
  { parallax: 0.22, brightness: 0.64, color: '#ddeeff', twinkle: 0.1 },
];

const NEBULA_AMBIENT_DEFAULTS = [
  { parallax: 0.08, alphaMult: 0.75, driftMult: 0.4, sizeMult: 1.3 },
  { parallax: 0.25, alphaMult: 0.95, driftMult: 0.7, sizeMult: 1.0 },
  { parallax: 0.55, alphaMult: 1.15, driftMult: 1.0, sizeMult: 0.75 },
];

function buildDefaultLayers() {
  /** @type {object[]} */
  const layers = [];

  for (let i = 0; i < 7; i++) {
    const d = STAR_DEFAULTS[i];
    layers.push({
      id: `star-${i}`,
      type: 'star',
      label: `Star L${i + 1}`,
      enabled: true,
      depth: -14 + i,
      layerIndex: i,
      parallax: d.parallax,
      brightness: d.brightness,
      color: d.color,
      twinkle: d.twinkle,
    });
  }

  for (let i = 0; i < 3; i++) {
    const d = NEBULA_AMBIENT_DEFAULTS[i];
    layers.push({
      id: `nebulaAmbient-${i}`,
      type: 'nebulaAmbient',
      label: `Ambient Nebula ${i + 1}`,
      enabled: true,
      depth: -7 + i,
      layerIndex: i,
      parallax: d.parallax,
      brightness: d.alphaMult,
      driftMult: d.driftMult,
      sizeMult: d.sizeMult,
    });
  }

  for (let d = 1; d <= 3; d++) {
    layers.push({
      id: `nebulaStream-${d}`,
      type: 'nebulaStream',
      label: `Nebula Stream D${d}`,
      enabled: true,
      depth: -7 + d,
      streamDepth: d,
      brightness: 1,
      sizeMult: 1,
    });
  }

  layers.push({
    id: 'speedStreaks',
    type: 'speedStreaks',
    label: 'Speed Streaks',
    enabled: true,
    depth: -3,
    brightness: 1,
    spawnRateMult: 1,
    maxStreaks: 140,
    lengthMult: 1,
    widthMult: 1,
  });

  return layers;
}

/** @type {{ globals: object, layers: object[], streamSpawnRateMult: number }} */
export const depthCompositorConfig = {
  globals: {
    parallaxScale: 1,
    starTwinkle: true,
    forceStarLite: false,
    referenceSpeed: PHYSICS.STREAK_REFERENCE_SPEED,
  },
  streamSpawnRateMult: 1,
  layers: buildDefaultLayers(),
};

export function getDepthCompositorConfig() {
  return depthCompositorConfig;
}

export function getDepthLayer(id) {
  return depthCompositorConfig.layers.find((l) => l.id === id) || null;
}

export function getEnabledLayersForDepthBucket(bucket) {
  const layers = depthCompositorConfig.layers.filter((l) => l.enabled);
  if (bucket === 'below') {
    return layers.filter((l) => l.depth < 0).sort((a, b) => a.depth - b.depth);
  }
  if (bucket === 'at') {
    return layers.filter((l) => l.depth === 0).sort((a, b) => a.id.localeCompare(b.id));
  }
  if (bucket === 'above') {
    return layers.filter((l) => l.depth > 0).sort((a, b) => a.depth - b.depth);
  }
  return [];
}

/** @param {string} id @param {object} patch */
export function patchDepthLayer(id, patch) {
  const layer = getDepthLayer(id);
  if (!layer || !patch) return false;
  for (const [key, val] of Object.entries(patch)) {
    if (key === 'id' || key === 'type') continue;
    if (key === 'depth') {
      layer.depth = clampDepth(val);
    } else if (key === 'enabled') {
      layer.enabled = !!val;
    } else {
      layer[key] = val;
    }
  }
  return true;
}

/** @param {Partial<typeof depthCompositorConfig>} patch */
export function patchDepthCompositorConfig(patch) {
  if (!patch) return;
  if (patch.globals) {
    Object.assign(depthCompositorConfig.globals, patch.globals);
  }
  if (patch.streamSpawnRateMult != null) {
    depthCompositorConfig.streamSpawnRateMult = clampMult(patch.streamSpawnRateMult);
  }
  if (Array.isArray(patch.layers)) {
    depthCompositorConfig.layers = patch.layers;
  }
}

export function addDustLayer() {
  if (getDepthLayer('dust')) return getDepthLayer('dust');
  const layer = {
    id: 'dust',
    type: 'dust',
    label: 'Dust',
    enabled: true,
    depth: 2,
    parallax: 0.35,
    brightness: 0.22,
    density: 0.65,
    driftSpeed: 1,
    minSize: 0.4,
    maxSize: 1.2,
    color: '#887766',
  };
  depthCompositorConfig.layers.push(layer);
  return layer;
}

export function removeDustLayer() {
  const idx = depthCompositorConfig.layers.findIndex((l) => l.id === 'dust');
  if (idx >= 0) depthCompositorConfig.layers.splice(idx, 1);
}

export function resetDepthCompositorConfig() {
  depthCompositorConfig.globals = {
    parallaxScale: 1,
    starTwinkle: true,
    forceStarLite: false,
    referenceSpeed: PHYSICS.STREAK_REFERENCE_SPEED,
  };
  depthCompositorConfig.streamSpawnRateMult = 1;
  depthCompositorConfig.layers = buildDefaultLayers();
}

function clampDepth(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(-20, Math.min(20, v));
}

function clampMult(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(4, v));
}

const STORAGE_KEY = 'hyperdrift.depthCompositor.v1';

export function snapshotDepthCompositorConfig() {
  return JSON.parse(JSON.stringify(depthCompositorConfig));
}

/** Normalize legacy alpha fields into brightness. */
export function normalizeLayerBrightness(layer) {
  if (!layer) return layer;
  if (layer.brightness == null) {
    if (layer.alphaMult != null) layer.brightness = layer.alphaMult;
    else if (layer.alpha != null) layer.brightness = layer.alpha;
  }
  delete layer.alphaMult;
  delete layer.alpha;
  return layer;
}

function normalizeAllLayers(layers) {
  if (!Array.isArray(layers)) return layers;
  return layers.map((l) => normalizeLayerBrightness({ ...l }));
}

/** Migrate legacy single nebulaStream entry to three depth-specific layers. */
export function migrateStreamLayers(layers) {
  if (!Array.isArray(layers)) return layers;
  if (layers.some((l) => l.id === 'nebulaStream-1')) return layers;
  const old = layers.find((l) => l.id === 'nebulaStream');
  if (!old) return layers;
  const next = layers.filter((l) => l.id !== 'nebulaStream');
  for (let d = 1; d <= 3; d++) {
    next.push({
      id: `nebulaStream-${d}`,
      type: 'nebulaStream',
      label: `Nebula Stream D${d}`,
      enabled: old[`depth${d}Enabled`] !== false && old.enabled !== false,
      depth: typeof old.depth === 'number' ? old.depth + (d - 2) : -7 + d,
      streamDepth: d,
      sizeMult: old.sizeMult ?? 1,
      brightness: old.brightness ?? old.alphaMult ?? 1,
    });
  }
  return normalizeAllLayers(next);
}

/** @param {Partial<typeof depthCompositorConfig>} snap */
export function applyDepthCompositorSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return false;
  if (snap.globals) depthCompositorConfig.globals = { ...depthCompositorConfig.globals, ...snap.globals };
  if (snap.streamSpawnRateMult != null) {
    depthCompositorConfig.streamSpawnRateMult = clampMult(snap.streamSpawnRateMult);
  }
  if (Array.isArray(snap.layers)) {
    depthCompositorConfig.layers = normalizeAllLayers(migrateStreamLayers(snap.layers));
  }
  return true;
}

export function saveDepthCompositorToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotDepthCompositorConfig()));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'localStorage save failed' };
  }
}

export function loadDepthCompositorFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ok: false, missing: true };
    applyDepthCompositorSnapshot(JSON.parse(raw));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'localStorage load failed' };
  }
}

export function clearDepthCompositorStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'localStorage clear failed' };
  }
}
