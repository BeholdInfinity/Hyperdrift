/**
 * Bake dev-panel tuning into repo data files (/dev/save).
 * All dev Save buttons that affect gameplay visuals must use these helpers.
 */

import { saveToRepo, exportToClipboard, SAVE_PATHS } from './DevSave.js';
import {
  snapshotRingBackdropConfig,
  loadRingBackdropFromStorage,
  clearRingBackdropStorage,
} from '../world/RingBackdropConfig.js';
import {
  snapshotDepthCompositorConfig,
  loadDepthCompositorFromStorage,
  clearDepthCompositorStorage,
} from '../world/DepthCompositorConfig.js';

export function formatRingBackdropModule(config) {
  return `/**
 * Baked overworld ring backdrop tuning (authoritative for all players).
 * Dev Ring Bands panel Save writes here via POST /dev/save.
 */

export const RING_BACKDROP = ${JSON.stringify(config, null, 2)};

export default RING_BACKDROP;
`;
}

export function formatDepthCompositorModule(config) {
  return `/**
 * Baked depth compositor tuning (authoritative for all players).
 * Dev Depth panel Save writes here via POST /dev/save.
 */

export const DEPTH_COMPOSITOR = ${JSON.stringify(config, null, 2)};

export default DEPTH_COMPOSITOR;
`;
}

/** @param {ReturnType<typeof snapshotRingBackdropConfig>} [config] */
export async function bakeRingBackdropToRepo(config = snapshotRingBackdropConfig()) {
  const text = formatRingBackdropModule(config);
  const res = await saveToRepo(SAVE_PATHS.ringBackdrop, text);
  if (res.ok) return res;
  await exportToClipboard(text);
  return { ok: false, error: res.error || 'Copied to clipboard instead' };
}

/** @param {ReturnType<typeof snapshotDepthCompositorConfig>} [config] */
export async function bakeDepthCompositorToRepo(config = snapshotDepthCompositorConfig()) {
  const text = formatDepthCompositorModule(config);
  const res = await saveToRepo(SAVE_PATHS.depthCompositor, text);
  if (res.ok) return res;
  await exportToClipboard(text);
  return { ok: false, error: res.error || 'Copied to clipboard instead' };
}

/**
 * One-time: legacy localStorage dev saves → repo bake (pre–repo-save Ring/Depth panels).
 * @returns {Promise<{ ringBaked?: boolean, depthBaked?: boolean, errors?: string[] }>}
 */
export async function migrateLegacyDevBakesFromStorage() {
  const out = { errors: [] };

  const ringLegacy = loadRingBackdropFromStorage();
  if (ringLegacy.ok) {
    const res = await bakeRingBackdropToRepo(snapshotRingBackdropConfig());
    if (res.ok) {
      clearRingBackdropStorage();
      out.ringBaked = true;
    } else {
      out.errors.push(res.error || 'Ring backdrop bake failed');
    }
  }

  const depthLegacy = loadDepthCompositorFromStorage();
  if (depthLegacy.ok) {
    const res = await bakeDepthCompositorToRepo(snapshotDepthCompositorConfig());
    if (res.ok) {
      clearDepthCompositorStorage();
      out.depthBaked = true;
    } else {
      out.errors.push(res.error || 'Depth compositor bake failed');
    }
  }

  return out;
}
