/**
 * Dev menu — overworld ring band backdrop tuning (space context only).
 */

import { DevTools } from './DevTools.js';
import { bakeRingBackdropToRepo } from './DevConfigBake.js';
import {
  getRingBackdropConfig,
  patchRingBackdropConfig,
  resetRingBackdropConfig,
  clearRingBackdropStorage,
} from '../world/RingBackdropConfig.js';

function pctLabel(v) {
  return `${Math.round(v * 100)}%`;
}

function readNum(id) {
  return Number(document.getElementById(id)?.value);
}

function setSwatch(id, rgb) {
  const el = document.getElementById(id);
  if (el && rgb) {
    el.style.background = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }
}

function syncSlider(id, value, readId) {
  const el = document.getElementById(id);
  if (el) el.value = String(Math.round(value * 100));
  const read = document.querySelector(`[data-for="${readId}"]`);
  if (read) read.textContent = pctLabel(value);
}

function setRingBandsStatus(msg) {
  const el = document.getElementById('dev-rb-status');
  if (el) el.textContent = msg || '';
}

export function syncRingBandsPanelContent() {
  if (!document.getElementById('dev-panel-ring-bands')) return;
  const cfg = getRingBackdropConfig();

  const enabled = document.getElementById('dev-rb-enabled');
  const baseOn = document.getElementById('dev-rb-base');
  const bandsOn = document.getElementById('dev-rb-bands');
  if (enabled) enabled.checked = cfg.enabled;
  if (baseOn) baseOn.checked = cfg.showBaseFill;
  if (bandsOn) bandsOn.checked = cfg.showBands;

  syncSlider('dev-rb-base-edge', cfg.base.edgeFeatherFrac, 'dev-rb-base-edge');
  syncSlider('dev-rb-base-alpha-min', cfg.base.alphaMin, 'dev-rb-base-alpha-min');
  syncSlider('dev-rb-base-alpha-max', cfg.base.alphaMax, 'dev-rb-base-alpha-max');

  syncSlider('dev-rb-band-edge', cfg.bands.edgeFeatherFrac, 'dev-rb-band-edge');
  syncSlider('dev-rb-band-alpha-min', cfg.bands.alphaMin, 'dev-rb-band-alpha-min');
  syncSlider('dev-rb-band-alpha-max', cfg.bands.alphaMax, 'dev-rb-band-alpha-max');
  syncSlider('dev-rb-primary-mix', cfg.bands.primaryMix, 'dev-rb-primary-mix');

  const pr = document.getElementById('dev-rb-pr');
  const pg = document.getElementById('dev-rb-pg');
  const pb = document.getElementById('dev-rb-pb');
  if (pr) pr.value = String(cfg.bands.primaryColor.r);
  if (pg) pg.value = String(cfg.bands.primaryColor.g);
  if (pb) pb.value = String(cfg.bands.primaryColor.b);

  const br = document.getElementById('dev-rb-br');
  const bg = document.getElementById('dev-rb-bg');
  const bb = document.getElementById('dev-rb-bb');
  if (br) br.value = String(cfg.base.color.r);
  if (bg) bg.value = String(cfg.base.color.g);
  if (bb) bb.value = String(cfg.base.color.b);

  setSwatch('dev-rb-swatch-primary', cfg.bands.primaryColor);
  setSwatch('dev-rb-swatch-base', cfg.base.color);
}

function applyFromPanel() {
  patchRingBackdropConfig({
    enabled: !!document.getElementById('dev-rb-enabled')?.checked,
    showBaseFill: !!document.getElementById('dev-rb-base')?.checked,
    showBands: !!document.getElementById('dev-rb-bands')?.checked,
    base: {
      edgeFeatherFrac: readNum('dev-rb-base-edge') / 100,
      alphaMin: readNum('dev-rb-base-alpha-min') / 100,
      alphaMax: readNum('dev-rb-base-alpha-max') / 100,
      color: {
        r: readNum('dev-rb-br'),
        g: readNum('dev-rb-bg'),
        b: readNum('dev-rb-bb'),
      },
    },
    bands: {
      edgeFeatherFrac: readNum('dev-rb-band-edge') / 100,
      alphaMin: readNum('dev-rb-band-alpha-min') / 100,
      alphaMax: readNum('dev-rb-band-alpha-max') / 100,
      primaryMix: readNum('dev-rb-primary-mix') / 100,
      primaryColor: {
        r: readNum('dev-rb-pr'),
        g: readNum('dev-rb-pg'),
        b: readNum('dev-rb-pb'),
      },
    },
  });
  syncRingBandsPanelContent();
}

export function wireRingBandsDevPanel() {
  document.getElementById('dev-rb-enabled')?.addEventListener('change', applyFromPanel);
  document.getElementById('dev-rb-base')?.addEventListener('change', applyFromPanel);
  document.getElementById('dev-rb-bands')?.addEventListener('change', applyFromPanel);

  for (const id of [
    'dev-rb-base-edge',
    'dev-rb-base-alpha-min',
    'dev-rb-base-alpha-max',
    'dev-rb-band-edge',
    'dev-rb-band-alpha-min',
    'dev-rb-band-alpha-max',
    'dev-rb-primary-mix',
  ]) {
    document.getElementById(id)?.addEventListener('input', applyFromPanel);
  }

  for (const id of ['dev-rb-pr', 'dev-rb-pg', 'dev-rb-pb', 'dev-rb-br', 'dev-rb-bg', 'dev-rb-bb']) {
    document.getElementById(id)?.addEventListener('input', applyFromPanel);
  }

  document.getElementById('dev-rb-save')?.addEventListener('click', async () => {
    applyFromPanel();
    const res = await bakeRingBackdropToRepo();
    const msg = res.ok
      ? 'Saved ringBackdrop.js (game default)'
      : `Save failed: ${res.error}`;
    setRingBandsStatus(msg);
    DevTools.status = msg;
  });

  document.getElementById('dev-rb-reset')?.addEventListener('click', () => {
    resetRingBackdropConfig();
    clearRingBackdropStorage();
    setRingBandsStatus('Reset to code defaults (Save to bake)');
    DevTools.status = 'Ring band tuning reset — Save to write game file';
    syncRingBandsPanelContent();
  });

  syncRingBandsPanelContent();
}
