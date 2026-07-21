/**
 * Persist POI Book + Travel Log to localStorage.
 */

const STORAGE_KEY = 'hyperdrift.navProfile';
const VERSION = 1;

export function loadNavProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveNavProfile({ pois, travelLog, nextExpeditionId }) {
  try {
    const payload = {
      version: VERSION,
      nextExpeditionId,
      pois,
      travelLog,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
