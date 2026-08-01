/**
 * Dev menu — unified depth layer editor (space + title contexts).
 */

import { DevTools } from './DevTools.js';
import { bakeDepthCompositorToRepo } from './DevConfigBake.js';
import {
  getDepthCompositorConfig,
  patchDepthLayer,
  patchDepthCompositorConfig,
  addDustLayer,
  removeDustLayer,
  resetDepthCompositorConfig,
  clearDepthCompositorStorage,
  migrateStreamLayers,
  normalizeLayerBrightness,
} from '../world/DepthCompositorConfig.js';

/** @type {import('../core/GameEngine.js').GameEngine|null} */
let _engine = null;

export function bindDepthDevEngine(engine) {
  _engine = engine;
}

function pctLabel(v) {
  return `${Math.round(v * 100)}%`;
}

function setDepthStatus(msg) {
  const el = document.getElementById('dev-depth-status');
  if (el) el.textContent = msg || '';
}

function bustDepthCaches() {
  _engine?.nebulaField?.invalidateAmbientCache?.();
  _engine?.interior?.hangarBay?.invalidateSpacefieldCache?.();
}

function readNum(id) {
  return Number(document.getElementById(id)?.value);
}

function syncSlider(id, value, readId, asPct = true) {
  const el = document.getElementById(id);
  if (el) el.value = String(Math.round(value * 100));
  const read = document.querySelector(`[data-for="${readId}"]`);
  if (read) read.textContent = asPct ? pctLabel(value) : String(Math.round(value * 100) / 100);
}

function layerHost() {
  return document.getElementById('dev-depth-layers-host');
}

function sortedLayers() {
  return [...getDepthCompositorConfig().layers].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
}

function typeBadge(type) {
  if (type === 'nebulaAmbient') return 'ambient';
  if (type === 'nebulaStream') return 'stream';
  if (type === 'speedStreaks') return 'streaks';
  return type;
}

function readLayerBrightness(layer) {
  if (layer.brightness != null) return layer.brightness;
  if (layer.alphaMult != null) return layer.alphaMult;
  if (layer.alpha != null) return layer.alpha;
  return layer.type === 'star' ? 0.5 : 1;
}

function brightnessSliderMax(type) {
  if (type === 'star' || type === 'dust') return 100;
  return 300;
}

function buildLayerRow(layer) {
  const row = document.createElement('div');
  row.className = 'dev-depth-layer-row';
  row.dataset.layerId = layer.id;

  const head = document.createElement('div');
  head.className = 'dev-depth-layer-head';

  const en = document.createElement('input');
  en.type = 'checkbox';
  en.checked = !!layer.enabled;
  en.title = 'Enabled';
  en.addEventListener('change', () => {
    patchDepthLayer(layer.id, { enabled: en.checked });
    bustDepthCaches();
  });

  const depth = document.createElement('input');
  depth.type = 'number';
  depth.min = '-20';
  depth.max = '20';
  depth.step = '1';
  depth.value = String(layer.depth);
  depth.className = 'dev-num-input dev-depth-input';
  depth.title = 'Depth';
  depth.addEventListener('change', () => {
    patchDepthLayer(layer.id, { depth: depth.value });
    bustDepthCaches();
    renderLayerRows();
  });

  const label = document.createElement('span');
  label.className = 'dev-depth-layer-label';
  label.textContent = layer.label || layer.id;

  const badge = document.createElement('span');
  badge.className = 'dev-depth-type-badge';
  badge.textContent = typeBadge(layer.type);

  head.append(en, depth, label, badge);
  row.appendChild(head);

  const detail = document.createElement('div');
  detail.className = 'dev-depth-layer-detail';

  const brightVal = readLayerBrightness(layer);
  const brightMax = brightnessSliderMax(layer.type);
  appendSlider(
    detail,
    `${layer.id}-brightness`,
    'Brightness',
    brightVal,
    0,
    brightMax,
    (v) => {
      patchDepthLayer(layer.id, { brightness: v / 100 });
      if (layer.type !== 'star' && layer.type !== 'speedStreaks') bustDepthCaches();
    }
  );

  if (layer.type === 'star' || layer.type === 'nebulaAmbient' || layer.type === 'dust') {
    appendSlider(detail, `${layer.id}-parallax`, 'Parallax', layer.parallax ?? 0.1, 0, 100, (v) => {
      patchDepthLayer(layer.id, { parallax: v / 100 });
      bustDepthCaches();
    });
  }

  if (layer.type === 'star') {
    appendSlider(detail, `${layer.id}-twinkle`, 'Twinkle', layer.twinkle ?? 0.3, 0, 100, (v) => {
      patchDepthLayer(layer.id, { twinkle: v / 100 });
    });
  }

  if (layer.type === 'nebulaAmbient' || layer.type === 'nebulaStream') {
    appendSlider(detail, `${layer.id}-size`, 'Size', layer.sizeMult ?? 1, 25, 200, (v) => {
      patchDepthLayer(layer.id, { sizeMult: v / 100 });
      bustDepthCaches();
    });
  }

  if (layer.type === 'speedStreaks') {
    appendSlider(detail, `${layer.id}-spawn`, 'Spawn', layer.spawnRateMult ?? 1, 0, 400, (v) => {
      patchDepthLayer(layer.id, { spawnRateMult: v / 100 });
    });
    appendSlider(detail, `${layer.id}-len`, 'Length', layer.lengthMult ?? 1, 25, 300, (v) => {
      patchDepthLayer(layer.id, { lengthMult: v / 100 });
    });
    appendSlider(detail, `${layer.id}-width`, 'Width', layer.widthMult ?? 1, 25, 300, (v) => {
      patchDepthLayer(layer.id, { widthMult: v / 100 });
    });
  }

  if (layer.type === 'dust') {
    appendSlider(detail, `${layer.id}-density`, 'Density', layer.density ?? 0.65, 5, 100, (v) => {
      patchDepthLayer(layer.id, { density: v / 100 });
      bustDepthCaches();
    });
  }

  row.appendChild(detail);
  return row;
}

function appendSlider(parent, id, labelText, value, min, max, onInput) {
  const lb = document.createElement('label');
  lb.className = 'dev-title-slider';
  const span = document.createElement('span');
  span.dataset.for = id;
  span.textContent = pctLabel(value);
  const range = document.createElement('input');
  range.type = 'range';
  range.id = id;
  range.min = String(min);
  range.max = String(max);
  range.step = '1';
  range.value = String(Math.round(value * 100));
  range.addEventListener('input', () => {
    const v = readNum(id);
    span.textContent = pctLabel(v / 100);
    onInput(v);
  });
  lb.append(document.createTextNode(`${labelText} `), range, span);
  parent.appendChild(lb);
}

function renderLayerRows() {
  const host = layerHost();
  if (!host) return;
  host.innerHTML = '';
  for (const layer of sortedLayers()) {
    host.appendChild(buildLayerRow(layer));
  }
  const hasDust = !!getDepthCompositorConfig().layers.find((l) => l.id === 'dust');
  const addBtn = document.getElementById('dev-depth-add-dust');
  const rmBtn = document.getElementById('dev-depth-remove-dust');
  if (addBtn) addBtn.classList.toggle('hidden', hasDust);
  if (rmBtn) rmBtn.classList.toggle('hidden', !hasDust);
}

export function syncDepthPanelContent() {
  if (!document.getElementById('dev-panel-depth')) return;
  const cfg = getDepthCompositorConfig();
  const g = cfg.globals;

  const tw = document.getElementById('dev-depth-twinkle');
  const lite = document.getElementById('dev-depth-lite');
  if (tw) tw.checked = g.starTwinkle !== false;
  if (lite) lite.checked = !!g.forceStarLite;

  syncSlider('dev-depth-parallax-scale', g.parallaxScale ?? 1, 'dev-depth-parallax-scale');
  syncSlider('dev-depth-stream-spawn', cfg.streamSpawnRateMult ?? 1, 'dev-depth-stream-spawn');
  syncSlider(
    'dev-depth-ref-speed',
    (g.referenceSpeed ?? 4000) / 4000,
    'dev-depth-ref-speed',
    false
  );

  renderLayerRows();
}

function applyGlobalsFromPanel() {
  patchDepthCompositorConfig({
    globals: {
      starTwinkle: !!document.getElementById('dev-depth-twinkle')?.checked,
      forceStarLite: !!document.getElementById('dev-depth-lite')?.checked,
      parallaxScale: readNum('dev-depth-parallax-scale') / 100,
      referenceSpeed: Math.max(500, readNum('dev-depth-ref-speed') / 100 * 4000),
    },
    streamSpawnRateMult: readNum('dev-depth-stream-spawn') / 100,
  });
  bustDepthCaches();
}

export function wireDepthDevPanel() {
  const migrated = migrateStreamLayers(getDepthCompositorConfig().layers);
  patchDepthCompositorConfig({
    layers: migrated.map((l) => normalizeLayerBrightness({ ...l })),
  });

  document.getElementById('dev-depth-twinkle')?.addEventListener('change', applyGlobalsFromPanel);
  document.getElementById('dev-depth-lite')?.addEventListener('change', applyGlobalsFromPanel);
  document.getElementById('dev-depth-parallax-scale')?.addEventListener('input', applyGlobalsFromPanel);
  document.getElementById('dev-depth-stream-spawn')?.addEventListener('input', applyGlobalsFromPanel);
  document.getElementById('dev-depth-ref-speed')?.addEventListener('input', applyGlobalsFromPanel);

  document.getElementById('dev-depth-add-dust')?.addEventListener('click', () => {
    addDustLayer();
    bustDepthCaches();
    renderLayerRows();
    setDepthStatus('Dust layer added');
  });

  document.getElementById('dev-depth-remove-dust')?.addEventListener('click', () => {
    removeDustLayer();
    bustDepthCaches();
    renderLayerRows();
    setDepthStatus('Dust layer removed');
  });

  document.getElementById('dev-depth-save')?.addEventListener('click', async () => {
    applyGlobalsFromPanel();
    const res = await bakeDepthCompositorToRepo();
    const msg = res.ok
      ? 'Saved depthCompositor.js (game default)'
      : `Save failed: ${res.error}`;
    setDepthStatus(msg);
    DevTools.status = msg;
  });

  document.getElementById('dev-depth-reset')?.addEventListener('click', () => {
    resetDepthCompositorConfig();
    clearDepthCompositorStorage();
    bustDepthCaches();
    syncDepthPanelContent();
    setDepthStatus('Reset to code defaults (Save to bake)');
    DevTools.status = 'Depth tuning reset — Save to write game file';
  });

  syncDepthPanelContent();
}
