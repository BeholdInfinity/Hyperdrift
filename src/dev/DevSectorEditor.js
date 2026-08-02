/**
 * Dev sector map editor — mutate in-memory layout draft + bake to sectorLayout.js.
 */

import { SECTOR_LAYOUT } from '../world/data/sectorLayout.js';
import {
  hydrateOrbitParams,
  maxRingOuterR,
  siteWorldPosition,
  listSites,
  siteInsideRing,
  distToNearestRing,
  setSectorLayoutOverride,
  clearSectorLayoutOverride,
} from '../world/SectorLayout.js';
import {
  circularSpeed,
  period,
  gravityMu,
  angularSpeed,
  orbitOmegaFor,
} from '../world/OrbitKinematics.js';
import { saveToRepo, exportToClipboard, SAVE_PATHS } from './DevSave.js';

/** Live draft (mutated by dev UI). */
export const sectorEditorDraft = JSON.parse(JSON.stringify(SECTOR_LAYOUT));

/** @type {(() => void) | null} */
let _changeListener = null;

const HISTORY_MAX = 60;

/** @type {{ past: object[], future: object[], shadow: object|null, dragBase: object|null, applying: boolean }} */
const _history = {
  past: [],
  future: [],
  shadow: null,
  dragBase: null,
  applying: false,
};

function cloneLayout(layout) {
  return JSON.parse(JSON.stringify(layout));
}

function layoutFingerprint(layout) {
  return JSON.stringify(layout);
}

export const sectorEditorUI = {
  active: false,
  selectedSiteId: null,
  selectedRingId: null,
  selectedTierId: null,
  /** Highlighted sub-belt pocket on the selected ring (map overlay). */
  selectedSubBeltId: null,
  showTrafficPreview: true,
  showTierBands: true,
  /** When true (default), sector editor map uses t=0 — not a full sim pause. */
  freezeOrbit: true,
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

export function stationsForTier(tierId, layout = sectorEditorDraft) {
  return listSites('station', layout).filter((s) => s.socialTier === tierId);
}

export function computeTierOrbitFromStations(tierId, layout = sectorEditorDraft) {
  const stations = stationsForTier(tierId, layout);
  const radii = stations
    .map((s) => s.orbit?.orbitR)
    .filter((r) => Number.isFinite(r))
    .sort((a, b) => a - b);
  if (!radii.length) return getTierOrbitR(tierId, layout);
  const mid = Math.floor(radii.length / 2);
  return radii.length % 2 ? radii[mid] : (radii[mid - 1] + radii[mid]) / 2;
}

/** Write socialOrbitInner[tierId] from station median; optional silent skip notify. */
export function syncTierOrbitFromStations(tierId, layout = sectorEditorDraft, { silent = false } = {}) {
  const stations = stationsForTier(tierId, layout);
  if (!stations.length) return false;
  const tiers = ensureSocialOrbitInner(layout);
  const planetR = layout.planet?.radius ?? 35000;
  tiers[tierId] = Math.max(planetR + 5000, computeTierOrbitFromStations(tierId, layout));
  if (!silent) notifySectorEditorChange();
  return true;
}

export function syncAllTierOrbitsFromStations(layout = sectorEditorDraft, { silent = false } = {}) {
  for (const tierId of listSocialTierIds(layout)) {
    syncTierOrbitFromStations(tierId, layout, { silent: true });
  }
  if (!silent) notifySectorEditorChange();
}

export function setTierOrbitR(tierId, orbitR, layout = sectorEditorDraft) {
  const tiers = ensureSocialOrbitInner(layout);
  const planetR = layout.planet?.radius ?? 35000;
  const r = Math.max(planetR + 5000, Number(orbitR) || planetR + 5000);
  tiers[tierId] = r;
  for (const site of stationsForTier(tierId, layout)) {
    if (!site.orbit) continue;
    site.orbit.orbitR = r;
    const pos = siteWorldPosition(site, 0, layout);
    site.x = pos.x;
    site.y = pos.y;
  }
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

/** Reset undo/redo stacks to the current draft (call after editor open / hydrate). */
export function initSectorEditorHistory() {
  _history.past = [];
  _history.future = [];
  _history.dragBase = null;
  _history.applying = false;
  _history.shadow = cloneLayout(sectorEditorDraft);
}

/** Snapshot draft before a map drag so one gesture = one undo step. */
export function beginSectorEditorDragHistory() {
  if (_history.applying || _history.dragBase) return;
  _history.dragBase = cloneLayout(sectorEditorDraft);
}

/** Commit or discard the drag checkpoint. */
export function endSectorEditorDragHistory(moved) {
  if (!_history.dragBase) return;
  if (moved) {
    _history.past.push(_history.dragBase);
    if (_history.past.length > HISTORY_MAX) _history.past.shift();
    _history.future.length = 0;
  }
  _history.dragBase = null;
  _history.shadow = cloneLayout(sectorEditorDraft);
}

function applyLayoutSnapshot(snapshot) {
  if (!snapshot) return;
  _history.applying = true;
  Object.keys(sectorEditorDraft).forEach((k) => delete sectorEditorDraft[k]);
  Object.assign(sectorEditorDraft, cloneLayout(snapshot));
  hydrateOrbitParams(sectorEditorDraft);
  ensureSocialOrbitInner(sectorEditorDraft);
  _history.shadow = cloneLayout(sectorEditorDraft);
  _history.applying = false;
  notifySectorEditorChange();
}

export function canSectorEditorUndo() {
  return _history.past.length > 0;
}

export function canSectorEditorRedo() {
  return _history.future.length > 0;
}

export function undoSectorEditor() {
  if (!_history.past.length || _history.dragBase) return false;
  _history.future.push(cloneLayout(sectorEditorDraft));
  if (_history.future.length > HISTORY_MAX) _history.future.shift();
  applyLayoutSnapshot(_history.past.pop());
  return true;
}

export function redoSectorEditor() {
  if (!_history.future.length || _history.dragBase) return false;
  _history.past.push(cloneLayout(sectorEditorDraft));
  if (_history.past.length > HISTORY_MAX) _history.past.shift();
  applyLayoutSnapshot(_history.future.pop());
  return true;
}

export function notifySectorEditorChange() {
  sectorEditorUI.revision += 1;
  if (!_history.applying && !_history.dragBase) {
    const nextFp = layoutFingerprint(sectorEditorDraft);
    const shadowFp = _history.shadow ? layoutFingerprint(_history.shadow) : null;
    if (shadowFp != null && nextFp !== shadowFp) {
      _history.past.push(_history.shadow);
      if (_history.past.length > HISTORY_MAX) _history.past.shift();
      _history.future.length = 0;
      _history.shadow = cloneLayout(sectorEditorDraft);
    } else if (_history.shadow == null) {
      _history.shadow = cloneLayout(sectorEditorDraft);
    }
  }
  _changeListener?.();
}

export const PAIR_TO_RING_ID = {
  inner: 'inner_ore',
  mid: 'mid_mixed',
  outer: 'outer_ice',
};

export const RING_TO_PAIR_ID = {
  inner_ore: 'inner',
  mid_mixed: 'mid',
  outer_ice: 'outer',
};

/** Radial inset from ring innerR — gates sit just inside the belt (outside band, validator-safe). */
export const WARP_GATE_INNER_OFFSET = 1000;

export function warpGateOrbitR(ring, layout = sectorEditorDraft) {
  const planetR = layout.planet?.radius ?? 35000;
  const minR = planetR + 1000;
  const innerR = ring?.innerR ?? 0;
  const offset = layout.spacing?.warpGateInnerOffset ?? WARP_GATE_INNER_OFFSET;
  return Math.max(minR, innerR - offset);
}

export { maxRingOuterR };

export function isFringeSite(site) {
  return site?.kind === 'landmark' || site?.kind === 'warp_instance';
}

export function migrateStaticFringeToOrbit(layout = sectorEditorDraft) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  let changed = false;
  for (const site of layout.sites ?? []) {
    if (!isFringeSite(site)) continue;
    if (site.orbit?.orbitR != null && site.motion !== 'static') continue;
    const x = site.x ?? 0;
    const y = site.y ?? 0;
    const orbitR = Math.hypot(x - cx, y - cy);
    const orbitAngle0 = Math.atan2(y - cy, x - cx);
    site.motion = 'orbit';
    site.orbit = { orbitR, orbitAngle0, orbitOmega: null };
    if (site.fringeClearance == null) {
      const pos = siteWorldPosition(site, 0, layout);
      site.fringeClearance =
        distToNearestRing(pos.x, pos.y, layout) || layout.spacing?.minFringeFromRing || 270000;
    }
    changed = true;
  }
  if (changed) hydrateOrbitParams(layout);
  return changed;
}

export function syncWarpGatesFromRing(ringId, layout = sectorEditorDraft, { silent = false } = {}) {
  const ring = layout.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  const pairId = ring.warpPairId || RING_TO_PAIR_ID[ringId];
  if (!pairId) return false;
  const gateR = warpGateOrbitR(ring, layout);
  for (const site of layout.sites ?? []) {
    if (site.kind !== 'warp_ring' || site.pairId !== pairId || !site.orbit) continue;
    site.orbit.orbitR = gateR;
    const pos = siteWorldPosition(site, 0, layout);
    site.x = pos.x;
    site.y = pos.y;
  }
  if (!silent) notifySectorEditorChange();
  return true;
}

export function syncAllWarpGatesFromRings(layout = sectorEditorDraft, { silent = false } = {}) {
  for (const ring of layout.rings ?? []) {
    syncWarpGatesFromRing(ring.id, layout, { silent: true });
  }
  if (!silent) notifySectorEditorChange();
}

export function syncFringeSitesFromRings(layout = sectorEditorDraft, { silent = false } = {}) {
  const outer = maxRingOuterR(layout);
  if (outer <= 0) return false;
  for (const site of layout.sites ?? []) {
    if (!isFringeSite(site) || !site.orbit) continue;
    const clearance =
      site.fringeClearance ?? layout.spacing?.minFringeFromRing ?? 270000;
    site.orbit.orbitR = outer + clearance;
    const pos = siteWorldPosition(site, 0, layout);
    site.x = pos.x;
    site.y = pos.y;
  }
  if (!silent) notifySectorEditorChange();
  return true;
}

function afterRingRadiiChange(ringId, layout = sectorEditorDraft) {
  syncWarpGatesFromRing(ringId, layout, { silent: true });
  syncFringeSitesFromRings(layout, { silent: true });
  hydrateOrbitParams(layout);
  notifySectorEditorChange();
}

export function setSectorEditorActive(active, engine = null) {
  sectorEditorUI.active = !!active;
  if (sectorEditorUI.active) {
    migrateStaticFringeToOrbit(sectorEditorDraft);
    hydrateOrbitParams(sectorEditorDraft);
    ensureSocialOrbitInner(sectorEditorDraft);
    syncAllTierOrbitsFromStations(sectorEditorDraft, { silent: true });
    syncAllWarpGatesFromRings(sectorEditorDraft, { silent: true });
    setSectorLayoutOverride(sectorEditorDraft);
    syncPlanetRadiusSlider();
    initSectorEditorHistory();
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
  const el = document.getElementById('sme-planet-r');
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
  sectorEditorUI.selectedSubBeltId = null;
  notifySectorEditorChange();
}

export function selectTier(tierId) {
  sectorEditorUI.selectedTierId = tierId || null;
  if (tierId) {
    sectorEditorUI.selectedSiteId = null;
    sectorEditorUI.selectedRingId = null;
    sectorEditorUI.selectedSubBeltId = null;
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
  const prev = sectorEditorUI.selectedRingId;
  sectorEditorUI.selectedRingId = ringId || null;
  if (ringId) {
    sectorEditorUI.selectedSiteId = null;
    sectorEditorUI.selectedTierId = null;
  }
  if (!ringId || ringId !== prev) sectorEditorUI.selectedSubBeltId = null;
  notifySectorEditorChange();
}

export function selectSubBelt(subBeltId) {
  sectorEditorUI.selectedSubBeltId = subBeltId || null;
  notifySectorEditorChange();
}

/** Set ring ice/iron/silicate weights (0..1); preserve other keys; renormalize mix. */
export function setRingComposition(ringId, { ice = 0, iron = 0, silicate = 0 } = {}) {
  const ring = sectorEditorDraft.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  const next = { ...(ring.composition || {}) };
  next.ice = Math.max(0, Number(ice) || 0);
  next.iron = Math.max(0, Number(iron) || 0);
  next.silicate = Math.max(0, Number(silicate) || 0);
  let sum = 0;
  for (const v of Object.values(next)) sum += Math.max(0, Number(v) || 0);
  if (sum <= 0) {
    ring.composition = { silicate: 1 };
  } else {
    const out = {};
    for (const [k, v] of Object.entries(next)) {
      out[k] = Math.max(0, Number(v) || 0) / sum;
    }
    ring.composition = out;
  }
  notifySectorEditorChange();
  return true;
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
  afterRingRadiiChange(ringId);
  return true;
}

export function setRingOuterR(ringId, outerR) {
  const ring = sectorEditorDraft.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  const next = clampRingRadii(ring.innerR, outerR);
  ring.innerR = next.innerR;
  ring.outerR = next.outerR;
  afterRingRadiiChange(ringId);
  return true;
}

export function setRingRadii(ringId, innerR, outerR) {
  const ring = sectorEditorDraft.rings?.find((r) => r.id === ringId);
  if (!ring) return false;
  const next = clampRingRadii(innerR, outerR);
  ring.innerR = next.innerR;
  ring.outerR = next.outerR;
  afterRingRadiiChange(ringId);
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
  { id: 'asteroid_field', label: 'Asteroid field' },
  { id: 'shepherd_moon', label: 'Shepherd moon' },
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
  const prevOrbit = { ...site.orbit };
  site.orbit.orbitR = orbitR;
  site.orbit.orbitAngle0 = orbitAngle0;
  site.orbit.orbitOmega = orbitOmegaFor(orbitR, sectorEditorDraft);
  const pos = siteWorldPosition(site, 0, sectorEditorDraft);
  site.x = pos.x;
  site.y = pos.y;
  if (site.kind === 'asteroid_field' && site.rocks?.length) {
    const dR = orbitR - (prevOrbit.orbitR ?? orbitR);
    const dA = orbitAngle0 - (prevOrbit.orbitAngle0 ?? orbitAngle0);
    for (const rock of site.rocks) {
      rock.orbitR = (rock.orbitR ?? orbitR) + dR;
      rock.orbitAngle0 = (rock.orbitAngle0 ?? orbitAngle0) + dA;
    }
  }
  if (isFringeSite(site)) {
    site.fringeClearance = distToNearestRing(pos.x, pos.y, sectorEditorDraft);
  } else if (site.kind === 'station' && site.socialTier) {
    syncTierOrbitFromStations(site.socialTier, sectorEditorDraft, { silent: true });
  }
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

export function setSiteFringeClearance(siteId, clearance, layout = sectorEditorDraft) {
  const site = layout.sites?.find((s) => s.id === siteId);
  if (!site?.orbit || !isFringeSite(site)) return false;
  site.fringeClearance = Math.max(0, Number(clearance) || 0);
  const outer = maxRingOuterR(layout);
  site.orbit.orbitR = outer + site.fringeClearance;
  const pos = siteWorldPosition(site, 0, layout);
  site.x = pos.x;
  site.y = pos.y;
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
        (s) =>
          s.motion === 'orbit' ||
          s.kind === 'station' ||
          s.kind === 'warp_ring' ||
          s.kind === 'landmark' ||
          s.kind === 'warp_instance'
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
    label: 'Orbital sites outside rings',
    hint:
      'Stations, warp gates, landmarks, and warp instances must not sit inside an asteroid ring band.',
    severity: 'error',
    collect(layout) {
      const issues = [];
      for (const site of layout.sites ?? []) {
        if (
          (site.kind === 'station' ||
            site.kind === 'warp_ring' ||
            site.kind === 'landmark' ||
            site.kind === 'warp_instance') &&
          siteInsideRing(site, layout)
        ) {
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
      'Warns when a station orbit radius is an outlier within its tier group (>80k u from tier median when multiple stations share the tier).',
    severity: 'warning',
    collect(layout) {
      const warnings = [];
      const tierOutlier = 80000;
      for (const tierId of listSocialTierIds(layout)) {
        const stations = stationsForTier(tierId, layout);
        if (stations.length < 2) continue;
        const median = computeTierOrbitFromStations(tierId, layout);
        for (const site of stations) {
          const r = site.orbit?.orbitR;
          if (r != null && Math.abs(r - median) > tierOutlier) {
            warnings.push(
              `${site.id} orbitR ${Math.round(r)} outlier for tier ${tierId} (median ${Math.round(median)})`
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
      'Each warp pairId in use must have exactly two gate sites (or zero). Rings may omit warpPairId.',
    severity: 'error',
    collect(layout) {
      const issues = [];
      const pairIds = new Set();
      for (const s of layout.sites ?? []) {
        if (s.kind === 'warp_ring' && s.pairId) pairIds.add(s.pairId);
      }
      for (const ring of layout.rings ?? []) {
        const pid = ring.warpPairId || RING_TO_PAIR_ID[ring.id];
        if (pid) pairIds.add(pid);
      }
      for (const pairId of pairIds) {
        const sides = (layout.sites ?? []).filter(
          (s) => s.kind === 'warp_ring' && s.pairId === pairId
        );
        if (sides.length !== 0 && sides.length !== 2) {
          issues.push(`warp pair "${pairId}" needs 0 or 2 gates (found ${sides.length})`);
        }
      }
      return issues;
    },
  },
  {
    id: 'asteroid_field_in_ring',
    label: 'Asteroid fields inside rings',
    hint: 'Hero asteroid_field sites must sit inside a ring band.',
    severity: 'error',
    collect(layout) {
      const issues = [];
      for (const site of layout.sites ?? []) {
        if (site.kind === 'asteroid_field' && !siteInsideRing(site, layout)) {
          issues.push(`${site.id} must sit inside a ring band`);
        }
      }
      return issues;
    },
  },
  {
    id: 'shepherd_moon_in_gap',
    label: 'Shepherd moons in gaps',
    hint: 'Shepherd moons must orbit in the gap between two ring bands.',
    severity: 'error',
    collect(layout) {
      const issues = [];
      const rings = [...(layout.rings ?? [])].sort((a, b) => a.innerR - b.innerR);
      for (const site of layout.sites ?? []) {
        if (site.kind !== 'shepherd_moon') continue;
        const r = site.orbit?.orbitR;
        if (r == null) {
          issues.push(`${site.id} missing orbitR`);
          continue;
        }
        let inGap = false;
        for (let i = 0; i < rings.length - 1; i++) {
          if (r > rings[i].outerR && r < rings[i + 1].innerR) {
            inGap = true;
            const halfGap = (rings[i + 1].innerR - rings[i].outerR) * 0.5;
            if ((site.radius ?? 0) >= halfGap) {
              issues.push(`${site.id} radius too large for gap`);
            }
            break;
          }
        }
        if (!inGap) issues.push(`${site.id} not in an inter-ring gap`);
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
  {
    id: 'orbit_omega_mu',
    label: 'Orbit ω vs gravity μ',
    hint:
      'Each site orbitOmega must match √(μ/R³) from planet.gravityMu. Stale hand-tuned values break co-orbit with the player ship; hydrate rebakes them on save.',
    severity: 'warning',
    collect(layout) {
      const warnings = [];
      const mu = gravityMu(layout);
      for (const site of layout.sites ?? []) {
        const R = site.orbit?.orbitR;
        const omega = site.orbit?.orbitOmega;
        if (R == null || omega == null) continue;
        const expected = angularSpeed(R, mu);
        if (expected <= 0) continue;
        const relErr = Math.abs(omega - expected) / expected;
        if (relErr > 0.001) {
          warnings.push(
            `${site.id} orbitOmega ${omega.toExponential(4)} ≠ μ-derived ${expected.toExponential(4)} (${(relErr * 100).toFixed(1)}% off)`
          );
        }
      }
      return warnings;
    },
  },
];

/**
 * @returns {{ ok: boolean, issues: string[], warnings: string[], rules: Array<{ id: string, label: string, hint: string, severity: string, ok: boolean, items: string[] }> }}
 */
export function buildValidatorReport(layout = sectorEditorDraft) {
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
  hydrateOrbitParams(layout);
  ensureSocialOrbitInner(layout);
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
  hydrateOrbitParams(sectorEditorDraft);
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
  migrateStaticFringeToOrbit(sectorEditorDraft);
  hydrateOrbitParams(sectorEditorDraft);
  ensureSocialOrbitInner(sectorEditorDraft);
  syncAllTierOrbitsFromStations(sectorEditorDraft, { silent: true });
  syncAllWarpGatesFromRings(sectorEditorDraft, { silent: true });
  notifySectorEditorChange();
}
