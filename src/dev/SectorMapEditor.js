/**
 * Sector map editor — drag sites on the LIVE sector map, tier/traffic overlays.
 */

import {
  sectorEditorUI,
  isSectorEditorActive,
  moveSiteOrbit,
  setSiteSurfaceAngle,
  moveStaticSite,
  snapOrbitRToTier,
  tierColor,
  notifySectorEditorChange,
  getSocialOrbitInner,
  setTierOrbitR,
  selectRing,
  selectTier,
  clearEditorSelection,
  setRingInnerR,
  setRingOuterR,
  formatOrbitStats,
  mapFilterFadeAlpha,
  isSiteListFilterActive,
  TIER_DISPLAY_NAMES,
} from './DevSectorEditor.js';
import { editorMapTime } from './SectorEditorGeography.js';
import {
  getSectorLayout,
  listSites,
  siteWorldPosition,
  stationTrafficZonesFor,
  stationTrafficOuterRadius,
} from '../world/SectorLayout.js';
import { compositionFillStyle } from '../systems/AsteroidCatalog.js';

const FONT = "'Barlow Condensed', 'Segoe UI', sans-serif";
const ACCENT = 'rgba(120, 200, 255, 0.9)';
const RING_ACCENT = 'rgba(255, 154, 80, 0.95)';
const COPPER = 'rgba(230, 171, 109, 0.92)';
const TAU = Math.PI * 2;

/** Draw composition pocket overlays for the selected ring. */
function drawSubBeltOverlays(ctx, ring, cx, cy, scale) {
  const list = ring?.subBelts;
  if (!list?.length || !(ring.outerR > ring.innerR)) return;
  const width = ring.outerR - ring.innerR;
  const selId = sectorEditorUI.selectedSubBeltId;
  for (const sb of list) {
    const t0 = Math.max(0, Math.min(1, sb.t0 ?? 0));
    const t1 = Math.max(0, Math.min(1, sb.t1 ?? 1));
    const r0 = (ring.innerR + width * Math.min(t0, t1)) * scale;
    const r1 = (ring.innerR + width * Math.max(t0, t1)) * scale;
    if (r1 < 2) continue;
    const selected = sb.id === selId;
    const alpha = selected ? 0.38 : 0.2;
    ctx.fillStyle = compositionFillStyle(sb.composition, alpha);
    ctx.strokeStyle = compositionFillStyle(sb.composition, selected ? 0.85 : 0.45);
    ctx.lineWidth = selected ? 2 : 1;
    const th0 = sb.theta0;
    const th1 = sb.theta1;
    const fullCircle = th0 == null || th1 == null;
    ctx.beginPath();
    if (fullCircle) {
      ctx.arc(cx, cy, r1, 0, TAU);
      ctx.arc(cx, cy, r0, 0, TAU, true);
      ctx.fill('evenodd');
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, TAU);
      ctx.stroke();
      if (r0 >= 2) {
        ctx.beginPath();
        ctx.arc(cx, cy, r0, 0, TAU);
        ctx.stroke();
      }
    } else {
      let a0 = Number(th0);
      let a1 = Number(th1);
      if (a1 < a0) {
        const tmp = a0;
        a0 = a1;
        a1 = tmp;
      }
      ctx.arc(cx, cy, r1, a0, a1);
      ctx.arc(cx, cy, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** @type {{ siteId: string|null, ringId: string|null, tierId: string|null, ringEdge: string|null, moved: boolean, sx: number, sy: number }} */
const _drag = {
  siteId: null,
  ringId: null,
  tierId: null,
  ringEdge: null,
  moved: false,
  sx: 0,
  sy: 0,
};

export function getSectorEditorDragState() {
  return _drag;
}

export function siteWorldXY(site, layout = getSectorLayout(), gameTime = 0) {
  return siteWorldPosition(site, gameTime, layout);
}

export function pickSiteAtWorld(wx, wy, view, layout = getSectorLayout(), gameTime = 0) {
  const tol = Math.max(8000, 14000 / Math.max(0.2, view.zoom));
  let best = null;
  let bestD = Infinity;
  for (const site of layout.sites ?? []) {
    const pos = siteWorldXY(site, layout, gameTime);
    const d = Math.hypot(wx - pos.x, wy - pos.y);
    if (d < tol && d < bestD) {
      bestD = d;
      best = site;
    }
  }
  return best;
}

export function pickSiteAtScreenEditor(sx, sy, mapBox, view, gameTime = 0) {
  const layout = getSectorLayout();
  let best = null;
  let bestD = Infinity;
  for (const site of layout.sites ?? []) {
    const pos = siteWorldXY(site, layout, gameTime);
    const s = view.worldToScreen(pos.x, pos.y, mapBox);
    const d = Math.hypot(sx - s.x, sy - s.y);
    const hitR = site.id === sectorEditorUI.selectedSiteId ? 16 : 11;
    if (d < hitR && d < bestD) {
      bestD = d;
      best = site;
    }
  }
  return best;
}

function planetScreenCenter(view, mapBox, layout) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  return view.worldToScreen(cx, cy, mapBox);
}

function screenRadiusFromPlanet(sx, sy, view, mapBox, layout) {
  const ps = planetScreenCenter(view, mapBox, layout);
  return Math.hypot(sx - ps.x, sy - ps.y);
}

export function pickRingAtScreenEditor(sx, sy, mapBox, view, layout = getSectorLayout()) {
  const scale = view.scaleForBox(mapBox.w, mapBox.h);
  const rScreen = screenRadiusFromPlanet(sx, sy, view, mapBox, layout);
  const hitPx = 14;
  let best = null;
  let bestD = Infinity;

  for (const ring of layout.rings ?? []) {
    const ri = ring.innerR * scale;
    const ro = ring.outerR * scale;
    if (ro < 3) continue;

    if (rScreen >= ri && rScreen <= ro) {
      return ring;
    }

    const dInner = Math.abs(rScreen - ri);
    const dOuter = Math.abs(rScreen - ro);
    const d = Math.min(dInner, dOuter);
    if (d < hitPx && d < bestD) {
      bestD = d;
      best = ring;
    }
  }
  return best;
}

export function pickTierAtScreenEditor(sx, sy, mapBox, view, layout = getSectorLayout()) {
  const tiers = getSocialOrbitInner(layout);
  const scale = view.scaleForBox(mapBox.w, mapBox.h);
  const rScreen = screenRadiusFromPlanet(sx, sy, view, mapBox, layout);
  const hitPx = 12;

  if (sectorEditorUI.selectedTierId && tiers[sectorEditorUI.selectedTierId] != null) {
    const selR = tiers[sectorEditorUI.selectedTierId] * scale;
    if (Math.abs(rScreen - selR) < hitPx + 2) return sectorEditorUI.selectedTierId;
  }

  let best = null;
  let bestD = Infinity;
  for (const [tierId, orbitR] of Object.entries(tiers)) {
    const tr = orbitR * scale;
    const d = Math.abs(rScreen - tr);
    if (d < hitPx && d < bestD) {
      bestD = d;
      best = tierId;
    }
  }
  return best;
}

function ringEdgeAtScreen(sx, sy, ring, mapBox, view, layout = getSectorLayout()) {
  const scale = view.scaleForBox(mapBox.w, mapBox.h);
  const rScreen = screenRadiusFromPlanet(sx, sy, view, mapBox, layout);
  const ri = ring.innerR * scale;
  const ro = ring.outerR * scale;
  const dInner = Math.abs(rScreen - ri);
  const dOuter = Math.abs(rScreen - ro);
  if (rScreen >= ri && rScreen <= ro) {
    return dInner <= dOuter ? 'inner' : 'outer';
  }
  return dInner <= dOuter ? 'inner' : 'outer';
}

export function pickSiteAtScreen(engine, sx, sy, mapBox, view) {
  const w = view.screenToWorld(sx, sy, mapBox);
  return pickSiteAtWorld(w.x, w.y, view, getSectorLayout(), editorMapTime(engine));
}

function applySiteWorldPosition(site, wx, wy, layout, shiftKey) {
  if (!site) return false;
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;

  if (site.kind === 'planetary' || site.motion === 'surface') {
    setSiteSurfaceAngle(site.id, Math.atan2(wy - cy, wx - cx));
    return true;
  }

  if (site.motion === 'static') {
    moveStaticSite(site.id, wx, wy);
    return true;
  }

  if (site.orbit) {
    let orbitR = Math.hypot(wx - cx, wy - cy);
    const orbitAngle0 = Math.atan2(wy - cy, wx - cx);
    if (shiftKey && site.socialTier) {
      orbitR = snapOrbitRToTier(orbitR, site.socialTier);
    }
    moveSiteOrbit(site.id, orbitR, orbitAngle0);
    return true;
  }

  return false;
}

function applyRingWorldRadius(ringId, edge, wx, wy, layout) {
  const cx = layout.planet?.center?.x ?? 0;
  const cy = layout.planet?.center?.y ?? 0;
  const rWorld = Math.hypot(wx - cx, wy - cy);
  if (edge === 'inner') setRingInnerR(ringId, rWorld);
  else setRingOuterR(ringId, rWorld);
}

export function selectSite(siteId, engine = null) {
  sectorEditorUI.selectedSiteId = siteId || null;
  if (siteId) {
    sectorEditorUI.selectedRingId = null;
    sectorEditorUI.selectedTierId = null;
    sectorEditorUI.selectedSubBeltId = null;
  }
  notifySectorEditorChange();
  const view =
    engine?.mode === 'sectorEditor'
      ? engine.getSectorEditorView?.()
      : engine?.sectorMapView;
  if (view && siteId) {
    const site = getSectorLayout().sites?.find((s) => s.id === siteId);
    if (site) {
      const pos = siteWorldXY(site, getSectorLayout(), editorMapTime(engine));
      view.followShip = false;
      view.panCenter.x = pos.x;
      view.panCenter.y = pos.y;
    }
  }
}

export function beginEditorPointer(engine, sx, sy, mapBox, view) {
  _drag.siteId = null;
  _drag.ringId = null;
  _drag.tierId = null;
  _drag.ringEdge = null;
  _drag.moved = false;
  _drag.sx = sx;
  _drag.sy = sy;

  const layout = getSectorLayout();
  const site =
    pickSiteAtScreenEditor(sx, sy, mapBox, view, editorMapTime(engine)) ??
    pickSiteAtScreen(engine, sx, sy, mapBox, view);
  if (site) {
    _drag.siteId = site.id;
    selectSite(site.id, engine);
    return 'site';
  }

  const ring = pickRingAtScreenEditor(sx, sy, mapBox, view, layout);
  if (ring) {
    _drag.ringId = ring.id;
    _drag.ringEdge = ringEdgeAtScreen(sx, sy, ring, mapBox, view, layout);
    selectRing(ring.id);
    return 'ring';
  }

  const tierId = pickTierAtScreenEditor(sx, sy, mapBox, view, layout);
  if (tierId) {
    _drag.tierId = tierId;
    selectTier(tierId);
    return 'tier';
  }

  clearEditorSelection();
  view.beginPointer(sx, sy);
  return 'pan';
}

export function moveEditorPointer(engine, sx, sy, mapBox, view, shiftKey) {
  if (_drag.siteId) {
    if (Math.hypot(sx - _drag.sx, sy - _drag.sy) > 4) _drag.moved = true;
    const site = getSectorLayout().sites?.find((s) => s.id === _drag.siteId);
    const w = view.screenToWorld(sx, sy, mapBox);
    applySiteWorldPosition(site, w.x, w.y, getSectorLayout(), shiftKey);
    notifySectorEditorChange();
    return true;
  }
  if (_drag.ringId) {
    if (Math.hypot(sx - _drag.sx, sy - _drag.sy) > 4) _drag.moved = true;
    const w = view.screenToWorld(sx, sy, mapBox);
    applyRingWorldRadius(_drag.ringId, _drag.ringEdge || 'outer', w.x, w.y, getSectorLayout());
    return true;
  }
  if (_drag.tierId) {
    if (Math.hypot(sx - _drag.sx, sy - _drag.sy) > 4) _drag.moved = true;
    const layout = getSectorLayout();
    const cx = layout.planet?.center?.x ?? 0;
    const cy = layout.planet?.center?.y ?? 0;
    const w = view.screenToWorld(sx, sy, mapBox);
    setTierOrbitR(_drag.tierId, Math.hypot(w.x - cx, w.y - cy), layout);
    return true;
  }
  view.movePointer(sx, sy, mapBox);
  return false;
}

export function endEditorPointer(view) {
  const siteId = _drag.siteId;
  const ringId = _drag.ringId;
  const tierId = _drag.tierId;
  const moved = _drag.moved;
  _drag.siteId = null;
  _drag.ringId = null;
  _drag.tierId = null;
  _drag.ringEdge = null;
  _drag.moved = false;

  if (siteId) {
    return { siteId, ringId: null, tierId: null, moved, suppressClick: moved };
  }
  if (ringId) {
    return { siteId: null, ringId, tierId: null, moved, suppressClick: moved };
  }
  if (tierId) {
    return { siteId: null, ringId: null, tierId, moved, suppressClick: moved };
  }
  view.endPointer();
  return { siteId: null, ringId: null, tierId: null, moved: false, suppressClick: view.suppressClick };
}

/**
 * Sector map pointer when editor is active.
 * @returns {boolean} true if wheel was consumed
 */
export function processSectorEditorPointer(engine, input, panels, zoomWheel) {
  const view = engine.sectorMapView;
  const mx = input.mouseScreen.x;
  const my = input.mouseScreen.y;
  if (!view.mapBody || !view.containsMapPoint(mx, my)) {
    if (!input.mouseDown) panels._sectorEditorTracking = false;
    return false;
  }

  if (zoomWheel !== 0) {
    view.stepZoom(zoomWheel);
    return true;
  }

  if (input.mouseDown) {
    if (!panels._sectorEditorTracking) {
      const mode = beginEditorPointer(engine, mx, my, view.mapBody, view);
      panels._sectorEditorTracking = mode;
    } else if (
      panels._sectorEditorTracking === 'site' ||
      panels._sectorEditorTracking === 'ring' ||
      panels._sectorEditorTracking === 'tier'
    ) {
      moveEditorPointer(engine, mx, my, view.mapBody, view, input.shiftKey);
    } else {
      view.movePointer(mx, my, view.mapBody);
    }
  } else if (panels._sectorEditorTracking) {
    const result = endEditorPointer(view);
    panels._sectorEditorTracking = false;
    if (result.siteId && !result.moved) {
      selectSite(result.siteId, engine);
    } else if (result.ringId && !result.moved) {
      selectRing(result.ringId);
    } else if (result.tierId && !result.moved) {
      selectTier(result.tierId);
    }
    view.suppressClick = result.suppressClick;
  }

  return false;
}

export function sectorEditorBlocksMapClick() {
  return isSectorEditorActive();
}

export function drawSectorEditorOverlay(ctx, mapBox, engine, view, mapTime = null) {
  if (!isSectorEditorActive()) return;
  const layout = getSectorLayout();
  const scale = view.scaleForBox(mapBox.w, mapBox.h);
  const t = mapTime != null ? mapTime : editorMapTime(engine);
  const ps = planetScreenCenter(view, mapBox, layout);

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapBox.x, mapBox.y, mapBox.w, mapBox.h);
  ctx.clip();

  const bandVis = sectorEditorUI.showTierBands ? 1 : 0.35;
  const tiers = getSocialOrbitInner(layout);
  for (const [tier, r] of Object.entries(tiers)) {
    const rs = r * scale;
    if (rs < 4) continue;
    const fade = isSiteListFilterActive() ? mapFilterFadeAlpha('tier', tier) : 1;
    const selected = tier === sectorEditorUI.selectedTierId;
    ctx.globalAlpha = (selected ? 1 : fade) * bandVis;
    ctx.strokeStyle = tierColor(tier, selected ? 0.55 : 0.22);
    ctx.lineWidth = selected ? 2 : 1;
    ctx.setLineDash(selected ? [] : [4, 6]);
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, rs, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    if (selected) {
      ctx.font = `600 9px ${FONT}`;
      ctx.fillStyle = tierColor(tier, 0.95);
      ctx.textAlign = 'left';
      ctx.fillText(`${TIER_DISPLAY_NAMES[tier] || tier} · ${Math.round(r)} u`, ps.x + rs + 6, ps.y - 4);
    }
    ctx.globalAlpha = 1;
  }

  const selRing = sectorEditorUI.selectedRingId
    ? layout.rings?.find((r) => r.id === sectorEditorUI.selectedRingId)
    : null;

  if (selRing) {
    const ri = selRing.innerR * scale;
    const ro = selRing.outerR * scale;
    if (ro >= 3) {
      ctx.fillStyle = 'rgba(255, 154, 80, 0.1)';
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, ro, 0, TAU);
      ctx.arc(ps.x, ps.y, ri, 0, TAU, true);
      ctx.fill('evenodd');
      ctx.strokeStyle = RING_ACCENT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, ri, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, ro, 0, TAU);
      ctx.stroke();
      drawSubBeltOverlays(ctx, selRing, ps.x, ps.y, scale);
      const mid = formatOrbitStats((selRing.innerR + selRing.outerR) * 0.5, layout);
      ctx.font = `600 9px ${FONT}`;
      ctx.fillStyle = RING_ACCENT;
      ctx.textAlign = 'left';
      ctx.fillText(`${selRing.id} · mid ${mid.radius} u`, ps.x + ro + 6, ps.y);
    }
  }

  if (sectorEditorUI.showTrafficPreview) {
    for (const site of listSites('station', layout)) {
      if (site.trafficPolicy === 'none') continue;
      const fade = isSiteListFilterActive() ? mapFilterFadeAlpha('site', site) : 1;
      if (fade < 0.5) continue;
      const pos = siteWorldXY(site, layout, t);
      const ss = view.worldToScreen(pos.x, pos.y, mapBox);
      ctx.globalAlpha = fade;
      const zones = stationTrafficZonesFor(site, layout);
      for (const z of zones) {
        const zr = z.maxDist * scale;
        if (zr < 2) continue;
        ctx.strokeStyle = 'rgba(200, 140, 80, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, zr, 0, TAU);
        ctx.stroke();
      }
      const outer = stationTrafficOuterRadius(site, layout) * scale;
      if (outer >= 2) {
        ctx.strokeStyle = 'rgba(200, 140, 80, 0.08)';
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, outer, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  for (const site of layout.sites ?? []) {
    const pos = siteWorldXY(site, layout, t);
    const s = view.worldToScreen(pos.x, pos.y, mapBox);
    const selected = site.id === sectorEditorUI.selectedSiteId;
    const fade = isSiteListFilterActive() ? mapFilterFadeAlpha('site', site) : 1;
    let r = selected ? 7 : site.kind === 'station' ? 4.5 : 3.5;
    if (site.kind === 'shepherd_moon') {
      r = Math.max(selected ? 6 : 4, (site.radius ?? 8000) * scale * 0.35);
    } else if (site.kind === 'asteroid_field') {
      r = selected ? 8 : 5.5;
    }
    ctx.globalAlpha = selected ? 1 : fade;
    if (site.kind === 'shepherd_moon') {
      ctx.fillStyle = selected
        ? 'rgba(210, 200, 180, 0.95)'
        : 'rgba(180, 170, 150, 0.8)';
    } else if (site.kind === 'asteroid_field') {
      ctx.fillStyle = selected
        ? 'rgba(220, 180, 90, 0.95)'
        : 'rgba(200, 160, 70, 0.75)';
    } else {
      ctx.fillStyle = tierColor(site.socialTier || site.kind, selected ? 0.95 : 0.75);
    }
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(11, r + 4), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(8, 14, 22, 0.72)';
  ctx.fillRect(mapBox.x + 4, mapBox.y + 4, Math.min(mapBox.w - 8, 420), 28);
  ctx.fillStyle = COPPER;
  ctx.font = `600 10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(
    'SECTOR EDIT — sites · rings · tier bands · Shift snap tier',
    mapBox.x + 10,
    mapBox.y + 20
  );
  ctx.restore();
}

export function hoverTargetAtScreen(sx, sy, mapBox, view, gameTime = 0) {
  const layout = getSectorLayout();
  const site = pickSiteAtScreenEditor(sx, sy, mapBox, view, gameTime);
  if (site) return { type: 'site', id: site.id, name: site.name || site.id };
  const ring = pickRingAtScreenEditor(sx, sy, mapBox, view, layout);
  if (ring) return { type: 'ring', id: ring.id, name: ring.id };
  const tierId = pickTierAtScreenEditor(sx, sy, mapBox, view, layout);
  if (tierId) {
    return { type: 'tier', id: tierId, name: TIER_DISPLAY_NAMES[tierId] || tierId };
  }
  return null;
}
