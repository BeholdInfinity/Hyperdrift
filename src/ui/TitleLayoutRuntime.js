/**
 * Live apply / reset helpers for TITLE_LAYOUT (Dev Title Layout panel).
 */

import { TITLE_LAYOUT } from './title-layout.js';

/** Snapshot of last disk save (or module load). */
let _saved = null;

function cloneLayout(src = TITLE_LAYOUT) {
  return JSON.parse(JSON.stringify(src));
}

function copyLayout(dst, src) {
  for (const k of Object.keys(src)) {
    dst[k] = src[k];
  }
}

/** Capture current values as the "previous save" baseline. */
export function markTitleLayoutSaved() {
  _saved = cloneLayout(TITLE_LAYOUT);
}

/** Restore layout from last successful save (or initial module load). */
export function resetTitleLayoutToSaved() {
  if (!_saved) markTitleLayoutSaved();
  copyLayout(TITLE_LAYOUT, _saved);
  applyTitleMenuCss();
}

/**
 * Patch live layout values.
 * @param {Partial<typeof TITLE_LAYOUT>} partial
 */
export function applyTitleLayout(partial = {}) {
  for (const [k, v] of Object.entries(partial)) {
    if (!(k in TITLE_LAYOUT)) continue;
    if (typeof TITLE_LAYOUT[k] === 'number' && Number.isFinite(Number(v))) {
      TITLE_LAYOUT[k] = Number(v);
    } else {
      TITLE_LAYOUT[k] = v;
    }
  }
  applyTitleMenuCss();
}

/** Push menu scale/offset onto `#start-screen` CSS variables. */
export function applyTitleMenuCss() {
  const el = document.getElementById('start-screen');
  if (!el) return;
  const L = TITLE_LAYOUT;
  el.style.setProperty('--title-menu-scale', String(L.menuScale));
  el.style.setProperty('--title-menu-x', `${L.menuOffsetX}px`);
  el.style.setProperty('--title-menu-y', `${L.menuOffsetY}px`);
}

export function getTitleLayout() {
  return TITLE_LAYOUT;
}

export function cloneTitleLayout() {
  return cloneLayout(TITLE_LAYOUT);
}

markTitleLayoutSaved();
applyTitleMenuCss();
