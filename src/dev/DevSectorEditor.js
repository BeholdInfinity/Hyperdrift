/**
 * Dev sector map editor — mutate in-memory layout draft + bake to sectorLayout.js.
 */

import { SECTOR_LAYOUT } from '../world/data/sectorLayout.js';
import {
  hydrateOrbitParams,
  siteWorldPosition,
  listSites,
  siteInsideRing,
  distToNearestRing,
  setSectorLayoutOverride,
  clearSectorLayoutOverride,
} from '../world/SectorLayout.js';
import { circularSpeed, period, gravityMu } from '../world/OrbitKinematics.js';
import { saveToRepo, exportToClipboard, SAVE_PATHS } from './DevSave.js';

/** Live draft (mutated by dev UI). */
export const sectorEditorDraft = JSON.parse(JSON.stringify(SECTOR_LAYOUT));

/** @type {(() => void) | null} */
let _changeListener = null;

export const sectorEditorUI = {
  active: false,
  selectedSiteId: null,
  selectedRingId: null,
  selectedTierId: null,
  showTrafficPreview: true,
  showTierBands: true,
  siteFilters: { kind: 'all', tier: 'all', search: '' },
  revision: 0,
};

export const DEFAULT_SOCIAL_ORBIT_INNER = {
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

/** @deprecated use getSocialOrbitInner() */
export const SOCIAL_ORBIT_INNER = DEFAULT_SOCIAL_ORBIT_INNER;

export const TIER_DISPLAY_NAMES = {
  military: 'Military',
  elite: 'Elite',
  home: 'Home',
  upper: 'Upper',
  mid: 'Mid',
  guild: 'Guild',
  poor: 'Poor',
  derelict: 'Derelict',
  pirate: 'Pirate',
};

export function getSocialOrbitInner(layout = sectorEditorDraft) {
  return layout.socialOrbitInner ?? DEFAULT_SOCIAL_ORBIT_INNER;
}

export function ensureSocialOrbitInner(layout = sectorEditorDraft) {
  if (!layout.socialOrbitInner) {
    layout.socialOrbitInner = { ...DEFAULT_SOCIAL_ORBIT_INNER };
  }
  return layout.socialOrbitInner;
}

export function listSocialTierIds(layout = sectorEditorDraft) {
  return Object.keys(getSocialOrbitInner(layout));
}

export function getTierOrbitR(tierId, layout = sectorEditorDraft) {
  return getSocialOrbitInner(layout)[tierId];
}

export function setTierOrbitR(tierId, orbitR, layout = sectorEditorDraft) {
  const tiers = ensureSocialOrbitInner(layout);
  const planetR = layout.planet?.radius ?? 35000;
  tiers[tierId] = Math.max(planetR + 5000, Number(orbitR) || planetR + 5000);
  notifySectorEditorChange();
  return true;
}

const TIER_COLORS = {
  military: 'rgba(180, 200, 120,',
  elite: 'rgba(220, 190, 100,',
  home: 'rgba(120, 200, 255,',
  upper: 'rgba(140, 190, 230,',
  mid: 'rgba(150, 170, 200,',
  guild: 'rgba(190, 150, 110,',
  poor: 'rgba(170, 130, 100,',
  derelict: 'rgba(120, 110, 100,',
  pirate: 'rgba(220, 90, 90,',
  station: 'rgba(120, 200, 255,',
  warp_ring: 'rgba(100, 180, 220,',
  planetary: 'rgba(100, 200, 140,',
  landmark: 'rgba(200, 160, 100,',
  warp_instance: 'rgba(160, 120, 220,',
};

export function tierColor(key, alpha = 0.85) {
  const base = TIER_COLORS[key] || TIER_COLORS.station;
  return `${base}${alpha})`;
}

export function isSectorEditorActive() {
  return sectorEditorUI.active;
}

export function setSectorEditorChangeListener(fn) {
  _changeListener = typeof fn === 'function' ? fn : null;
}

export function notifySectorEditorChange() {
  sectorEditorUI.revision += 1;
  _changeListener?.();
}

export function setSectorEditorActive(active, engine = null) {
  sectorEditorUI.active = !!active;
  if (sectorEditorUI.active) {
    hydrateOrbitParams(sectorEditorDraft);
    ensureSocialOrbitInner(sectorEditorDraft);
    setSectorLayoutOverride(sectorEditorDraft);
    syncPlanetRadiusSlider();
    if (engine?.sectorMapView) {
      engine.sectorMapView.followShip = false;
      engine.sectorMapView.panCenter.x = 0;
      engine.sectorMapView.panCenter.y = 0;
      engine.sectorMapView.zoom = 0.55;
    }
  } else {
    clearSectorLayoutOverride();
    sectorEditorUI.selectedSiteId = null;
    sectorEditorUI.selectedRingId = null;
    sectorEditorUI.selectedTierId = null;
  }
  notifySectorEditorChange();
}

export function syncPlanetRadiusSlider() {
  const el = document.getElementById('dev-sector-planet-r');
  if (!el) return;
  el.min = '20000';
  el.max = '60000';
  el.step = '500';
  el.value = String(sectorEditorDraft.planet?.radius ?? 35000);
}

export function clearEditorSelection() {
  sectorEditorUI.selectedSiteId = null;
  sectorEditorUI.selectedRingId = null;
  sectorEditorUI.selectedTierId = null;
  notifySectorEditorChange();
}

export function selectTier(tierId) {
  sectorEditorUI.selectedTierId = tierId || null;
  if (tierId) {
    sectorEditorUI.selectedSiteId = null;
    sectorEditorUI.selectedRingId = null;
    sectorEditorUI.showTierBands = true;
  }
  notifySectorEditorChange();
}

export function getSelectedTier() {
  if (!sectorEditorUI.selectedTierId) return null;
  const orbitR = getTierOrbitR(sectorEditorUI.selectedTierId);
  if (orbitR == null) return null;
  return {
    id: sectorEditorUI.selectedTierId,
    name: TIER_DISPLAY_NAMES[sectorEditorUI.selectedTierId] || sectorEditorUI.selectedTierId,
    orbitR,
  };
}

export function selectRing(ringId) {
  sectorEditorUI.selectedRingId = ringId || null;
  if (ringId) {
    sectorEditorUI.selectedSiteId = null;
    sectorEditorUI.selectedTierId = null;
  }
  notifySectorEditorChange();
}

export function getSelectedRing() {
  if (!sectorEditorUI.selectedRingId) return null;
  return sectorEditorDraft.rings?.find((r) => r.id === sectorEditorUI.selectedRingId) ?? null;
}

export function orbitStatsAtRadius(R, layout = sectorEditorDraft) {
  const mu = gravityMu(layout);
  const speed = circularSpeed(R, mu);
  const periodSec = period(R, mu);
  return { radius: R, speed, periodSec };
}

export function formatOrbitPeriod(periodSec) {
  if (!Number.isFinite(periodSec) || periodSec <= 0) return '—';
  if (periodSec >= 3600) return `${(periodSec / 3600).toFixed(2)} hr`;
  if (periodSec >= 60) return `${(periodSec / 60).toFixed(1)} min`;
  return `${Math.round(periodSec)} s`;
}

/** @returns {{ radius: number, speed: number, period: string }} */
export function formatOrbitStats(R, layout = sectorEditorDraft) {
  const s = orbitStatsAtRadius(R, layout);
  return {
    radius: Math.round(s.radius),
    speed: Math.round(s.speed),
    period: formatOrbitPeriod(s.periodSec),
  };
}

const MIN_RING_WIDTH = 5000;

function clampRingRadii(innerR, outerR, layout = sectorEditorDraft) {
  const planetR = layout.planet?.radius ?? 35000;
  let inner = Math.max(planetR + 1000, innerR);
  let outer = Math.max(inner + MIN_RING_WIDTH, outerR);
  return { innerR: inner, outerR: outer };
}

export function setRingInnerR(ringId, innerR) {
  const ring = sectorEditorDraft.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  const next = clampRingRadii(innerR, ring.outerR);
  ring.innerR = next.innerR;
  ring.outerR = next.outerR;
  notifySectorEditorChange();
  return true;
}

export function setRingOuterR(ringId, outerR) {
  const ring = sectorEditorDraft.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  const next = clampRingRadii(ring.innerR, outerR);
  ring.innerR = next.innerR;
  ring.outerR = next.outerR;
  notifySectorEditorChange();
  return true;
}

export function setRingRadii(ringId, innerR, outerR) {
  const ring = sectorEditorDraft.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  const next = clampRingRadii(innerR, outerR);
  ring.innerR = next.innerR;
  ring.outerR = next.outerR;
  notifySectorEditorChange();
  return true;
}

export function setRingDensity(ringId, density) {
  const ring = sectorEditorDraft.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  ring.density = Math.max(0, Number(density) || 0);
  notifySectorEditorChange();
  return true;
}

export function ringMidRadius(ring) {
  return ((ring?.innerR ?? 0) + (ring?.outerR ?? 0)) * 0.5;
}

export function ringWidth(ring) {
  return Math.max(0, (ring?.outerR ?? 0) - (ring?.innerR ?? 0));
}

export function setRingMidRadius(ringId, midR) {
  const ring = sectorEditorDraft.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  const half = ringWidth(ring) * 0.5;
  return setRingRadii(ringId, midR - half, midR + half);
}

export function setRingWidth(ringId, width) {
  const ring = sectorEditorDraft.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  const mid = ringMidRadius(ring);
  const half = Math.max(MIN_RING_WIDTH, Number(width) || MIN_RING_WIDTH) * 0.5;
  return setRingRadii(ringId, mid - half, mid + half);
}

export function setSiteListFilter(key, value) {
  if (!sectorEditorUI.siteFilters) sectorEditorUI.siteFilters = { kind: 'all', tier: 'all', search: '' };
  sectorEditorUI.siteFilters[key] = value;
  notifySectorEditorChange();
}

export const SITE_KIND_FILTERS = [
  { id: 'all', label: 'All kinds' },
  { id: 'ring', label: 'Asteroid rings' },
  { id: 'social_tier', label: 'Social tiers' },
  { id: 'station', label: 'Station' },
  { id: 'planetary', label: 'Planetary' },
  { id: 'warp_ring', label: 'Warp ring' },
  { id: 'landmark', label: 'Landmark' },
  { id: 'warp_instance', label: 'Warp instance' },
];

export const SITE_TIER_FILTERS = [
  { id: 'all', label: 'All tiers' },
  { id: 'military', label: 'Military' },
  { id: 'elite', label: 'Elite' },
  { id: 'home', label: 'Home' },
  { id: 'upper', label: 'Upper' },
  { id: 'mid', label: 'Mid' },
  { id: 'guild', label: 'Guild' },
  { id: 'poor', label: 'Poor' },
  { id: 'derelict', label: 'Derelict' },
  { id: 'pirate', label: 'Pirate' },
];

export function snapOrbitRToTier(orbitR, socialTier, layout = sectorEditorDraft) {
  const target = getSocialOrbitInner(layout)[socialTier];
  if (target) return target;
  return orbitR;
}

export function randomizePlanetLook() {
  sectorEditorDraft.planet.visualSeed = (Math.random() * 999999) | 0;
  const hues = [0x1a3a4a, 0x2a4a3a, 0x1a3344, 0x243848];
  const h = hues[(Math.random() * hues.length) | 0];
  sectorEditorDraft.planet.palette.ocean = `#${h.toString(16).padStart(6, '0')}`;
  notifySectorEditorChange();
}

export function moveSiteOrbit(siteId, orbitR, orbitAngle0) {
  const site = sectorEditorDraft.sites?.find((s) => s.id === siteId);
  if (!site?.orbit) return false;
  site.orbit.orbitR = orbitR;
  site.orbit.orbitAngle0 = orbitAngle0;
  const pos = siteWorldPosition(site, 0, sectorEditorDraft);
  site.x = pos.x;
  site.y = pos.y;
  notifySectorEditorChange();
  return true;
}

export function setSiteSurfaceAngle(siteId, surfaceAngle) {
  const site = sectorEditorDraft.sites?.find((s) => s.id === siteId);
  if (!site) return false;
  site.surfaceAngle = surfaceAngle;
  const pos = siteWorldPosition(site, 0, sectorEditorDraft);
  site.x = pos.x;
  site.y = pos.y;
  notifySectorEditorChange();
  return true;
}

export function moveStaticSite(siteId, x, y) {
  const site = sectorEditorDraft.sites?.find((s) => s.id === siteId);
  if (!site) return false;
  site.x = x;
  site.y = y;
  notifySectorEditorChange();
  return true;
}

function pairDistance(a, b, layout) {
  const pa = siteWorldPosition(a, 0, layout);
  const pb = siteWorldPosition(b, 0, layout);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

/** Validator rule definitions — hint shown on hover in the sector editor panel. */
export const VALIDATOR_RULE_DEFS = [
  {
    id: 'orbital_sep',
    label: 'Orbital separation',
    hint:
      'Every pair of orbital stations and warp gates must stay at least minOrbitalSep apart so traffic shells and flight paths do not overlap.',
    severity: 'error',
    collect(layout) {
      const issues = [];
      const minSep = layout.spacing?.minOrbitalSep ?? 150000;
      const orbital = listSites(null, layout).filter(
        (s) => s.motion === 'orbit' || s.kind === 'station' || s.kind === 'warp_ring'
      );
      for (let i = 0; i < orbital.length; i++) {
        for (let j = i + 1; j < orbital.length; j++) {
          const d = pairDistance(orbital[i], orbital[j], layout);
          if (d < minSep) {
            issues.push(
              `${orbital[i].id} ↔ ${orbital[j].id}: ${Math.round(d)} u (< ${minSep})`
            );
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'station_in_ring',
    label: 'Stations outside rings',
    hint:
      'Orbital stations must not sit inside an asteroid ring band — rings are for mining debris, not station shells.',
    severity: 'error',
    collect(layout) {
      const issues = [];
      for (const site of layout.sites ?? []) {
        if (site.kind === 'station' && siteInsideRing(site, layout)) {
          issues.push(`${site.id} sits inside a ring band`);
        }
      }
      return issues;
    },
  },
  {
    id: 'fringe_clearance',
    label: 'Fringe clearance',
    hint:
      'Landmarks and warp instances must keep minFringeFromRing clearance from the nearest asteroid ring so fringe POIs read as outside the belts.',
    severity: 'error',
    collect(layout) {
      const issues = [];
      const minFringe = layout.spacing?.minFringeFromRing ?? 270000;
      for (const site of layout.sites ?? []) {
        if (site.kind === 'landmark' || site.kind === 'warp_instance') {
          const pos = siteWorldPosition(site, 0, layout);
          const fringe = distToNearestRing(pos.x, pos.y, layout);
          if (fringe < minFringe) {
            issues.push(`${site.id} fringe clearance ${Math.round(fringe)} u (< ${minFringe})`);
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'social_tier_orbit',
    label: 'Social tier orbit',
    hint:
      'Warns when a station orbit radius is far outside its social tier inner band — higher tiers should generally orbit closer to the planet.',
    severity: 'warning',
    collect(layout) {
      const warnings = [];
      for (const site of layout.sites ?? []) {
        if (site.kind === 'station' && site.socialTier) {
          const target = getSocialOrbitInner(layout)[site.socialTier];
          if (target && site.orbit?.orbitR > target + 80000) {
            warnings.push(
              `${site.id} orbitR ${site.orbit.orbitR} outer for tier ${site.socialTier}`
            );
          }
        }
      }
      return warnings;
    },
  },
  {
    id: 'warp_pairs',
    label: 'Warp gate pairs',
    hint:
      'Each warp ring pair (inner, mid, outer) must have exactly two gate sites — one per side — so jump routes stay symmetric.',
    severity: 'error',
    collect(layout) {
      const issues = [];
      for (const pairId of ['inner', 'mid', 'outer']) {
        const sides = (layout.sites ?? []).filter(
          (s) => s.kind === 'warp_ring' && s.pairId === pairId
        );
        if (sides.length !== 2) {
          issues.push(`warp pair "${pairId}" needs 2 gates (found ${sides.length})`);
        }
      }
      return issues;
    },
  },
  {
    id: 'pirate_traffic',
    label: 'Pirate station traffic',
    hint:
      'The outlaw pirate hub must use trafficPolicy "none" so ambient patrol traffic does not spawn around a station meant to be off the beaten path.',
    severity: 'error',
    collect(layout) {
      const issues = [];
      const pirate = layout.sites?.find((s) => s.id === 'site.station.pirate');
      if (pirate && pirate.trafficPolicy !== 'none') {
        issues.push('site.station.pirate must use trafficPolicy: none');
      }
      return issues;
    },
  },
];

/**
 * @returns {{ ok: boolean, issues: string[], warnings: string[], rules: Array<{ id: string, label: string, hint: string, severity: string, ok: boolean, items: string[] }> }}
 */
export function buildValidatorReport(layout = sectorEditorDraft) {
  hydrateOrbitParams(layout);
  ensureSocialOrbitInner(layout);
  const rules = VALIDATOR_RULE_DEFS.map((def) => {
    const items = def.collect(layout);
    return {
      id: def.id,
      label: def.label,
      hint: def.hint,
      severity: def.severity,
      ok: items.length === 0,
      items,
    };
  });
  const issues = rules
    .filter((r) => r.severity === 'error' && !r.ok)
    .flatMap((r) => r.items);
  const warnings = rules
    .filter((r) => r.severity === 'warning' && !r.ok)
    .flatMap((r) => r.items);
  return { ok: issues.length === 0, issues, warnings, rules };
}

/** @returns {{ ok: boolean, issues: string[], warnings: string[] }} */
export function validateSectorLayout(layout = sectorEditorDraft) {
  const report = buildValidatorReport(layout);
  return { ok: report.ok, issues: report.issues, warnings: report.warnings };
}

export function formatValidationSummary(layout = sectorEditorDraft) {
  const report = buildValidatorReport(layout);
  if (report.ok && !report.warnings.length) return 'Validator OK — ready to bake';
  const lines = [];
  if (!report.ok) lines.push(`FAIL (${report.issues.length})`, ...report.issues.slice(0, 4));
  if (report.warnings.length) {
    lines.push(`WARN (${report.warnings.length})`, ...report.warnings.slice(0, 3));
  }
  if (report.issues.length > 4) lines.push(`… +${report.issues.length - 4} more`);
  return lines.join('\n');
}

export function listSitesForSelect() {
  return listEntriesForSelect()
    .filter((e) => e.type === 'site')
    .map((e) => e.site);
}

export function isSiteListFilterActive() {
  const f = sectorEditorUI.siteFilters ?? { kind: 'all', tier: 'all', search: '' };
  return (f.kind && f.kind !== 'all') || (f.tier && f.tier !== 'all') || !!(f.search || '').trim();
}

export function siteMatchesFilter(site, filters = sectorEditorUI.siteFilters) {
  const f = filters ?? { kind: 'all', tier: 'all', search: '' };
  if (f.kind && f.kind !== 'all') {
    if (f.kind === 'ring' || f.kind === 'social_tier') return false;
    if (site.kind !== f.kind) return false;
  }
  if (f.tier && f.tier !== 'all' && site.socialTier !== f.tier) return false;
  const q = (f.search || '').trim().toLowerCase();
  if (q) {
    const hay = `${site.name || ''} ${site.id} ${site.kind} ${site.socialTier || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function ringMatchesFilter(ring, filters = sectorEditorUI.siteFilters) {
  const f = filters ?? { kind: 'all', tier: 'all', search: '' };
  if (f.kind && f.kind !== 'all' && f.kind !== 'ring') return false;
  if (f.tier && f.tier !== 'all') return false;
  const q = (f.search || '').trim().toLowerCase();
  if (q && !ring.id.toLowerCase().includes(q)) return false;
  return true;
}

export function tierMatchesFilter(tierId, filters = sectorEditorUI.siteFilters) {
  const f = filters ?? { kind: 'all', tier: 'all', search: '' };
  if (f.kind && f.kind !== 'all' && f.kind !== 'social_tier') return false;
  if (f.tier && f.tier !== 'all' && tierId !== f.tier) return false;
  const q = (f.search || '').trim().toLowerCase();
  const label = (TIER_DISPLAY_NAMES[tierId] || tierId).toLowerCase();
  if (q && !tierId.includes(q) && !label.includes(q)) return false;
  return true;
}

/** @returns {Array<{ type: 'site'|'ring'|'tier', id: string, name: string, site?: object, ring?: object, tier?: object }>} */
export function listEntriesForSelect() {
  const entries = [];
  const f = sectorEditorUI.siteFilters ?? { kind: 'all', tier: 'all', search: '' };
  const includeRings = !f.kind || f.kind === 'all' || f.kind === 'ring';
  const includeTiers = !f.kind || f.kind === 'all' || f.kind === 'social_tier';
  const includeSites =
    !f.kind || f.kind === 'all' || (f.kind !== 'ring' && f.kind !== 'social_tier');

  if (includeTiers) {
    for (const tierId of listSocialTierIds()) {
      if (tierMatchesFilter(tierId)) {
        entries.push({
          type: 'tier',
          id: tierId,
          name: TIER_DISPLAY_NAMES[tierId] || tierId,
          tier: { id: tierId, orbitR: getTierOrbitR(tierId) },
        });
      }
    }
  }
  if (includeRings) {
    for (const ring of sectorEditorDraft.rings ?? []) {
      if (ringMatchesFilter(ring)) {
        entries.push({ type: 'ring', id: ring.id, name: ring.id, ring });
      }
    }
  }
  if (includeSites) {
    for (const site of sectorEditorDraft.sites ?? []) {
      if (siteMatchesFilter(site)) {
        entries.push({ type: 'site', id: site.id, name: site.name || site.id, site });
      }
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function mapFilterFadeAlpha(type, item) {
  if (!isSiteListFilterActive()) return 1;
  let match = false;
  if (type === 'ring') match = ringMatchesFilter(item);
  else if (type === 'tier') match = tierMatchesFilter(item);
  else match = siteMatchesFilter(item);
  if (match) return 1;
  if (type === 'site' && item?.id === sectorEditorUI.selectedSiteId) return 1;
  if (type === 'ring' && item?.id === sectorEditorUI.selectedRingId) return 1;
  if (type === 'tier' && item === sectorEditorUI.selectedTierId) return 1;
  return 0.22;
}

export function formatSectorLayoutModule(layout) {
  return `/**
 * Baked sector layout v2 — Therissa Prime / Thera system (authoritative geography).
 * Dev Sector Map editor saves edits here via POST /dev/save.
 */

export const SECTOR_LAYOUT = ${JSON.stringify(layout, null, 2)};

export default SECTOR_LAYOUT;
`;
}

export async function bakeSectorLayout({ force = false } = {}) {
  const check = validateSectorLayout(sectorEditorDraft);
  if (!check.ok && !force) {
    return { ok: false, error: `Validator failed: ${check.issues[0]}` };
  }
  const text = formatSectorLayoutModule(sectorEditorDraft);
  const res = await saveToRepo(SAVE_PATHS.sectorLayout, text);
  if (res.ok) return res;
  await exportToClipboard(text);
  return { ok: false, error: res.error || 'Copied to clipboard instead' };
}

export function getSelectedSite() {
  if (!sectorEditorUI.selectedSiteId) return null;
  return sectorEditorDraft.sites?.find((s) => s.id === sectorEditorUI.selectedSiteId) ?? null;
}

export function getSiteByIdFromDraft(siteId) {
  return sectorEditorDraft.sites?.find((s) => s.id === siteId) ?? null;
}

export function resetSectorEditorDraft() {
  const fresh = JSON.parse(JSON.stringify(SECTOR_LAYOUT));
  Object.keys(sectorEditorDraft).forEach((k) => delete sectorEditorDraft[k]);
  Object.assign(sectorEditorDraft, fresh);
  hydrateOrbitParams(sectorEditorDraft);
  ensureSocialOrbitInner(sectorEditorDraft);
  notifySectorEditorChange();
}
