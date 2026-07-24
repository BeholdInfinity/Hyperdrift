/**
 * Persist POI Book + Travel Log + Pip Loadouts + Nav Route to localStorage.
 */

const STORAGE_KEY = 'hyperdrift.navProfile';
const VERSION = 4;

/** @returns {{ profile: object|null, staleVersion: boolean }} */
export function loadNavProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { profile: null, staleVersion: false };
    const data = JSON.parse(raw);
    const ver = data.version | 0;
    if (ver !== VERSION) return { profile: null, staleVersion: true };
    return { profile: data, staleVersion: false };
  } catch {
    return { profile: null, staleVersion: false };
  }
}

export function saveNavProfile({
  pois,
  travelLog,
  nextExpeditionId,
  pipLoadouts,
  nextLoadoutId,
  activeLoadoutId,
  navRoute,
  trafficRecord,
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
      navRoute: navRoute ?? null,
      trafficRecord: trafficRecord ?? null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
