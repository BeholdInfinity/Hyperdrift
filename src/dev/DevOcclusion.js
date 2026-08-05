/**
 * Dev menu — contact occlusion tuning (space context).
 * Enabled mirrors Settings → Display; counts/samples mutate RADAR live;
 * Save bakes game defaults to src/core/Constants.js; Reset restores code defaults.
 */

import { RADAR } from '../core/Constants.js';
import { Settings } from '../core/Settings.js';
import { DevTools } from './DevTools.js';
import { saveToRepo, SAVE_PATHS } from './DevSave.js';

/** Code defaults captured at load (Reset target, pre-mutation). */
const CODE_DEFAULTS = {
  shadowMax: RADAR.OCCLUSION_SHADOW_MAX ?? 64,
  candidatesMax: RADAR.OCCLUSION_CANDIDATES_MAX ?? 24,
  samples: RADAR.OCCLUSION_SAMPLES ?? 8,
};

function readNum(id) {
  return Number(document.getElementById(id)?.value);
}

function setStatus(msg) {
  const el = document.getElementById('dev-occ-status');
  if (el) el.textContent = msg || '';
}

function syncSlider(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = String(value | 0);
  const read = document.querySelector(`[data-for="${id}"]`);
  if (read) read.textContent = String(value | 0);
}

export function syncOcclusionPanelContent() {
  if (!document.getElementById('dev-panel-occlusion')) return;
  const enabled = document.getElementById('dev-occ-enabled');
  if (enabled) enabled.checked = Settings.isOcclusion();
  syncSlider('dev-occ-shadow-max', RADAR.OCCLUSION_SHADOW_MAX ?? 64);
  syncSlider('dev-occ-candidates', RADAR.OCCLUSION_CANDIDATES_MAX ?? 24);
  syncSlider('dev-occ-samples', RADAR.OCCLUSION_SAMPLES ?? 8);
}

function applyFromPanel() {
  Settings.setOcclusion(!!document.getElementById('dev-occ-enabled')?.checked);
  RADAR.OCCLUSION_SHADOW_MAX = Math.max(1, readNum('dev-occ-shadow-max') | 0);
  RADAR.OCCLUSION_CANDIDATES_MAX = Math.max(1, readNum('dev-occ-candidates') | 0);
  RADAR.OCCLUSION_SAMPLES = Math.max(1, readNum('dev-occ-samples') | 0);
  syncOcclusionPanelContent();
}

/** Bake current RADAR occlusion numbers into src/core/Constants.js. */
async function bakeOcclusionToRepo() {
  const res = await fetch('/src/core/Constants.js');
  let text = await res.text();
  const subs = [
    [/OCCLUSION_SHADOW_MAX:\s*\d+/, `OCCLUSION_SHADOW_MAX: ${RADAR.OCCLUSION_SHADOW_MAX | 0}`],
    [/OCCLUSION_CANDIDATES_MAX:\s*\d+/, `OCCLUSION_CANDIDATES_MAX: ${RADAR.OCCLUSION_CANDIDATES_MAX | 0}`],
    [/OCCLUSION_SAMPLES:\s*\d+/, `OCCLUSION_SAMPLES: ${RADAR.OCCLUSION_SAMPLES | 0}`],
  ];
  for (const [re, out] of subs) text = text.replace(re, out);
  return saveToRepo(SAVE_PATHS.constants, text);
}

export function wireOcclusionDevPanel() {
  document.getElementById('dev-occ-enabled')?.addEventListener('change', applyFromPanel);
  for (const id of ['dev-occ-shadow-max', 'dev-occ-candidates', 'dev-occ-samples']) {
    document.getElementById(id)?.addEventListener('input', applyFromPanel);
  }

  document.getElementById('dev-occ-save')?.addEventListener('click', async () => {
    applyFromPanel();
    const res = await bakeOcclusionToRepo();
    const msg = res.ok
      ? 'Saved Constants.js (game default)'
      : `Save failed: ${res.error || 'dev server offline?'}`;
    setStatus(msg);
    DevTools.status = msg;
  });

  document.getElementById('dev-occ-reset')?.addEventListener('click', () => {
    RADAR.OCCLUSION_SHADOW_MAX = CODE_DEFAULTS.shadowMax;
    RADAR.OCCLUSION_CANDIDATES_MAX = CODE_DEFAULTS.candidatesMax;
    RADAR.OCCLUSION_SAMPLES = CODE_DEFAULTS.samples;
    setStatus('Reset to code defaults (Save to bake)');
    DevTools.status = 'Occlusion tuning reset — Save to write game file';
    syncOcclusionPanelContent();
  });

  syncOcclusionPanelContent();
}
