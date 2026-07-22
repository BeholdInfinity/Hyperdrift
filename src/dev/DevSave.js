/**
 * Bake drafts back into repo files via local dev-server POST /dev/save.
 * Clipboard export is the fallback when the server cannot write.
 */

const ALLOWED = new Set([
  'src/ships/data/visualTuning.js',
  'src/ships/data/mountLayouts.js',
  'src/world/hangar-layout.js',
  'src/ui/title-layout.js',
  'src/world/data/sectorLayout.js',
  'src/core/Constants.js',
]);

/**
 * @param {string} path
 * @param {string} contents
 * @returns {Promise<{ ok: boolean, path?: string, bytes?: number, error?: string }>}
 */
export async function saveToRepo(path, contents) {
  if (!ALLOWED.has(path)) {
    return { ok: false, error: `Path not allowlisted: ${path}` };
  }
  try {
    const res = await fetch('/dev/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, contents }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.error || `HTTP ${res.status}`,
        path,
      };
    }
    return { ok: true, path: data.path, bytes: data.bytes };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Save failed (is dev-server.py running?)',
      path,
    };
  }
}

/**
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function exportToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function isSavePathAllowed(path) {
  return ALLOWED.has(path);
}

export const SAVE_PATHS = {
  visualTuning: 'src/ships/data/visualTuning.js',
  mountLayouts: 'src/ships/data/mountLayouts.js',
  hangarLayout: 'src/world/hangar-layout.js',
  titleLayout: 'src/ui/title-layout.js',
  sectorLayout: 'src/world/data/sectorLayout.js',
  constants: 'src/core/Constants.js',
};
