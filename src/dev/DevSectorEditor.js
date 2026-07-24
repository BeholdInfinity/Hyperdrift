/**
 * Dev sector map editor — mutate in-memory layout draft + bake to sectorLayout.js.
 */

import { SECTOR_LAYOUT } from '../world/data/sectorLayout.js';
import { hydrateOrbitParams, siteWorldPosition, listSites, siteInsideRing, distToNearestRing } from '../world/SectorLayout.js';
import { saveToRepo, exportToClipboard, SAVE_PATHS } from './DevSave.js';

/** Live draft (mutated by dev UI). */
export const sectorEditorDraft = JSON.parse(JSON.stringify(SECTOR_LAYOUT));

const SOCIAL_INNER = {
  military: 450000,
  elite: 450000,
  home: 490000,
  upper: 520000,
  mid: 540000,
  guild: 560000,
  poor: 590000,
  derelict: 600000,
  pirate: 620000,
};

export function randomizePlanetLook() {
  sectorEditorDraft.planet.visualSeed = (Math.random() * 999999) | 0;
  const hues = [0x1a3a4a, 0x2a4a3a, 0x1a3344, 0x243848];
  const h = hues[(Math.random() * hues.length) | 0];
  sectorEditorDraft.planet.palette.ocean = `#${h.toString(16).padStart(6, '0')}`;
}

export function moveSiteOrbit(siteId, orbitR, orbitAngle0) {
  const site = sectorEditorDraft.sites?.find((s) => s.id === siteId);
  if (!site?.orbit) return false;
  site.orbit.orbitR = orbitR;
  site.orbit.orbitAngle0 = orbitAngle0;
  const pos = siteWorldPosition(site, 0, sectorEditorDraft);
  site.x = pos.x;
  site.y = pos.y;
  return true;
}

export function setSiteSurfaceAngle(siteId, surfaceAngle) {
  const site = sectorEditorDraft.sites?.find((s) => s.id === siteId);
  if (!site) return false;
  site.surfaceAngle = surfaceAngle;
  const pos = siteWorldPosition(site, 0, sectorEditorDraft);
  site.x = pos.x;
  site.y = pos.y;
  return true;
}

function pairDistance(a, b, layout) {
  const pa = siteWorldPosition(a, 0, layout);
  const pb = siteWorldPosition(b, 0, layout);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** @returns {{ ok: boolean, issues: string[], warnings: string[] }} */
export function validateSectorLayout(layout = sectorEditorDraft) {
  hydrateOrbitParams(layout);
  const issues = [];
  const warnings = [];
  const minSep = layout.spacing?.minOrbitalSep ?? 270000;
  const minFringe = layout.spacing?.minFringeFromRing ?? 270000;

  const orbital = listSites(null, layout).filter(
    (s) => s.motion === 'orbit' || s.kind === 'station' || s.kind === 'warp_ring'
  );
  for (let i = 0; i < orbital.length; i++) {
    for (let j = i + 1; j < orbital.length; j++) {
      const d = pairDistance(orbital[i], orbital[j], layout);
      if (d < minSep) {
        issues.push(`${orbital[i].id} ↔ ${orbital[j].id}: ${Math.round(d)} u (< ${minSep})`);
      }
    }
  }

  for (const site of layout.sites ?? []) {
    if (site.kind === 'station' && siteInsideRing(site, layout)) {
      issues.push(`${site.id} sits inside a ring band`);
    }
    if (site.kind === 'landmark' || site.kind === 'warp_instance') {
      const pos = siteWorldPosition(site, 0, layout);
      const fringe = distToNearestRing(pos.x, pos.y, layout);
      if (fringe < minFringe) {
        issues.push(`${site.id} fringe clearance ${Math.round(fringe)} u (< ${minFringe})`);
      }
    }
    if (site.kind === 'station' && site.socialTier) {
      const target = SOCIAL_INNER[site.socialTier];
      if (target && site.orbit?.orbitR > target + 80000) {
        warnings.push(`${site.id} orbitR ${site.orbit.orbitR} outer for tier ${site.socialTier}`);
      }
    }
  }

  const pairs = ['inner', 'mid', 'outer'];
  for (const pairId of pairs) {
    const sides = (layout.sites ?? []).filter((s) => s.kind === 'warp_ring' && s.pairId === pairId);
    if (sides.length !== 2) {
      issues.push(`warp pair "${pairId}" needs 2 gates (found ${sides.length})`);
    }
  }

  const pirate = layout.sites?.find((s) => s.id === 'site.station.pirate');
  if (pirate && pirate.trafficPolicy !== 'none') {
    issues.push('site.station.pirate must use trafficPolicy: none');
  }

  return { ok: issues.length === 0, issues, warnings };
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
  const check = validateSectorLayout(sectorEditorDraft);
  if (!check.ok) {
    return { ok: false, error: `Validator failed: ${check.issues[0]}` };
  }
  const text = formatSectorLayoutModule(sectorEditorDraft);
  const res = await saveToRepo(SAVE_PATHS.sectorLayout, text);
  if (res.ok) return res;
  await exportToClipboard(text);
  return { ok: false, error: res.error || 'Copied to clipboard instead' };
}
