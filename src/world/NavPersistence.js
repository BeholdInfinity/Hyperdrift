/**
 * Persist POI Book + Travel Log + Pip Loadouts to localStorage.
 */

const STORAGE_KEY = 'hyperdrift.navProfile';
const VERSION = 2;

export function loadNavProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const ver = data.version | 0;
    if (ver !== 1 && ver !== 2) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveNavProfile({
  pois,
  travelLog,
  nextExpeditionId,
  pipLoadouts,
  nextLoadoutId,
  activeLoadoutId,
}) {
  try {
    const payload = {
      version: VERSION,
      nextExpeditionId,
      pois,
      travelLog,
      pipLoadouts,
      nextLoadoutId,
      activeLoadoutId: activeLoadoutId ?? null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
