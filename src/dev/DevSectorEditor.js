/**
 * Dev sector map editor — mutate in-memory layout draft + bake to sectorLayout.js.
 */

import { SECTOR_LAYOUT } from '../world/data/sectorLayout.js';
import { saveToRepo, exportToClipboard, SAVE_PATHS } from './DevSave.js';

/** Live draft (mutated by dev UI). */
export const sectorEditorDraft = JSON.parse(JSON.stringify(SECTOR_LAYOUT));

export function randomizePlanetLook() {
  sectorEditorDraft.planet.visualSeed = (Math.random() * 999999) | 0;
  const hues = [0x1a3a4a, 0x2a4a3a, 0x1a3344, 0x243848];
  const h = hues[(Math.random() * hues.length) | 0];
  sectorEditorDraft.planet.palette.ocean = `#${h.toString(16).padStart(6, '0')}`;
}

export function formatSectorLayoutModule(layout) {
  return `/**
 * Baked sector layout — planet + asteroid rings (authoritative for proc gen).
 * Dev Sector Map editor saves edits here via POST /dev/save.
 */

export const SECTOR_LAYOUT = ${JSON.stringify(layout, null, 2)};

export default SECTOR_LAYOUT;
`;
}

export async function bakeSectorLayout() {
  const text = formatSectorLayoutModule(sectorEditorDraft);
  const res = await saveToRepo(SAVE_PATHS.sectorLayout, text);
  if (res.ok) return res;
  await exportToClipboard(text);
  return { ok: false, error: res.error || 'Copied to clipboard instead' };
}
