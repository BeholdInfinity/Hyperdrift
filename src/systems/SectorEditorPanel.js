/**
 * Full-screen sector map editor — blueprint-style map canvas + input.
 */

import { drawStandaloneSectorMap } from './SectorMapPanel.js';
import {
  drawSectorEditorOverlay,
  beginEditorPointer,
  moveEditorPointer,
  endEditorPointer,
  selectSite,
  hoverTargetAtScreen,
} from '../dev/SectorMapEditor.js';
import { selectRing, selectTier } from '../dev/DevSectorEditor.js';
import { mapFilterFadeAlpha, isSiteListFilterActive } from '../dev/DevSectorEditor.js';

/** Map rect aligned to the blueprint play circle (full square viewport). */
export function sectorEditorMapBox(renderer) {
  const cx = renderer.centerX;
  const cy = renderer.centerY;
  const r = renderer.viewportRadius;
  return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
}

export function drawSectorEditorFrame(ctx, renderer, engine, view) {
  const box = sectorEditorMapBox(renderer);
  view.mapBody = box;

  ctx.save();
  ctx.fillStyle = '#040810';
  ctx.fillRect(box.x, box.y, box.w, box.h);

  ctx.strokeStyle = 'rgba(255, 154, 80, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);

  drawStandaloneSectorMap(ctx, box, engine, view, {
    fog: false,
    bright: true,
    gameTime: engine.gameTime || 0,
    editorFilterFade: isSiteListFilterActive() ? mapFilterFadeAlpha : null,
  });
  drawSectorEditorOverlay(ctx, box, engine, view);
  ctx.restore();

  return box;
}

/** @returns {boolean} true if wheel consumed */
export function processSectorEditorInput(engine, input, view) {
  const box = view.mapBody || sectorEditorMapBox(engine.renderer);
  view.mapBody = box;
  const mx = input.mouseScreen.x;
  const my = input.mouseScreen.y;
  const inMap =
    mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h;

  const zoomWheel = input.consumeZoomDelta();
  if (zoomWheel !== 0 && inMap) {
    view.stepZoom(zoomWheel);
    return true;
  }

  if (!inMap) {
    if (!input.mouseDown) engine._sectorEditorPointer = null;
    return false;
  }

  if (input.mouseDown) {
    if (!engine._sectorEditorPointer) {
      engine._sectorEditorPointer = beginEditorPointer(engine, mx, my, box, view);
    } else if (engine._sectorEditorPointer === 'site' || engine._sectorEditorPointer === 'ring' || engine._sectorEditorPointer === 'tier') {
      moveEditorPointer(engine, mx, my, box, view, input.shiftKey);
    } else {
      view.movePointer(mx, my, box);
    }
  } else if (engine._sectorEditorPointer) {
    const result = endEditorPointer(view);
    engine._sectorEditorPointer = null;
    if (result.siteId && !result.moved) {
      selectSite(result.siteId, engine);
      if (typeof engine.onSectorEditorSelection === 'function') {
        engine.onSectorEditorSelection(result.siteId);
      }
    } else if (result.ringId && !result.moved) {
      selectRing(result.ringId);
      if (typeof engine.onSectorEditorSelection === 'function') {
        engine.onSectorEditorSelection(null, result.ringId);
      }
    } else if (result.tierId && !result.moved) {
      selectTier(result.tierId);
      if (typeof engine.onSectorEditorSelection === 'function') {
        engine.onSectorEditorSelection(null, null, result.tierId);
      }
    }
  } else {
    const hover = hoverTargetAtScreen(mx, my, box, view, engine.gameTime || 0);
    view.mapHoverTooltip = hover
      ? { text: hover.name || hover.id, sx: mx, sy: my - 14 }
      : null;
  }

  return false;
}

export function sectorEditorScreenToWorld(sx, sy, view, renderer) {
  const box = view.mapBody || sectorEditorMapBox(renderer);
  return view.screenToWorld(sx, sy, box);
}
