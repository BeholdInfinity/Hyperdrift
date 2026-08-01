/**
 * Two-tier dev menu — compact root launcher + draggable sub-menu popups.
 */

import { DevTools } from './DevTools.js';
import {
  hasStoredPosition,
  layoutCascadePopups,
  registerDevPanel,
} from './DevPanelDrag.js';

/** @typedef {'title'|'hangar'|'space'|'sectorEditor'} DevContext */

/** @type {Record<string, DevContext|null>} */
const MODE_TO_CONTEXT = {
  title: 'title',
  hangar: 'hangar',
  playing: 'space',
  sectorEditor: 'sectorEditor',
  blueprint: null,
  controls: null,
  settings: null,
};

/** Modes where the entire dev drawer is hidden. */
export const DEV_DRAWER_HIDDEN_MODES = new Set(['blueprint', 'settings']);

/**
 * @typedef {{ id: string, label: string, panelId?: string, action?: string }} DevLauncher
 */

/** @type {Record<DevContext, DevLauncher[]>} */
export const DEV_LAUNCHERS = {
  title: [
    { id: 'titleLayout', label: 'Title Layout', panelId: 'dev-title-panel' },
    { id: 'depth', label: 'Depth', panelId: 'dev-panel-depth' },
    { id: 'sim', label: 'Sim', panelId: 'dev-panel-sim' },
    { id: 'inspect', label: 'Inspect', panelId: 'dev-panel-inspect' },
    { id: 'traffic', label: 'AI Traffic', panelId: 'dev-panel-traffic' },
  ],
  hangar: [
    { id: 'sim', label: 'Sim', panelId: 'dev-panel-sim' },
    { id: 'inspect', label: 'Inspect', panelId: 'dev-panel-inspect' },
    { id: 'overlays', label: 'Overlays', panelId: 'dev-panel-overlays' },
    { id: 'hangar', label: 'Hangar', panelId: 'dev-panel-hangar' },
    { id: 'vessel', label: 'Vessel', panelId: 'dev-panel-vessel' },
  ],
  space: [
    { id: 'sim', label: 'Sim', panelId: 'dev-panel-sim' },
    { id: 'inspect', label: 'Inspect', panelId: 'dev-panel-inspect' },
    { id: 'overlays', label: 'Overlays', panelId: 'dev-panel-overlays' },
    { id: 'radar', label: 'Radar', panelId: 'dev-panel-radar' },
    { id: 'depth', label: 'Depth', panelId: 'dev-panel-depth' },
    { id: 'ringBands', label: 'Ring Bands', panelId: 'dev-panel-ring-bands' },
    { id: 'mapEditor', label: 'Map Editor', action: 'openSectorEditor' },
  ],
  sectorEditor: [{ id: 'sim', label: 'Sim', panelId: 'dev-panel-sim' }],
};

/** Hangar-only nested panels (opened from Hangar popup, not root). */
export const HANGAR_NESTED_PANELS = ['dev-bay-panel', 'dev-place-panel', 'hangar-edit-panel'];

/** @type {((action: string) => void) | null} */
let _actionHandler = null;

/** @type {(() => void) | null} */
let _syncUi = null;

/**
 * @param {string} engineMode
 * @returns {DevContext|null}
 */
export function contextForMode(engineMode) {
  return MODE_TO_CONTEXT[engineMode] ?? null;
}

/**
 * @param {string} engineMode
 */
export function isDevDrawerVisible(engineMode) {
  return !DEV_DRAWER_HIDDEN_MODES.has(engineMode);
}

/**
 * @param {DevContext} context
 * @returns {DevLauncher[]}
 */
export function getLaunchers(context) {
  return DEV_LAUNCHERS[context] || [];
}

/**
 * @param {(action: string) => void} fn
 */
export function setDevMenuActionHandler(fn) {
  _actionHandler = fn;
}

/**
 * @param {() => void} fn
 */
export function setDevMenuSyncUi(fn) {
  _syncUi = fn;
}

function requestSync() {
  if (typeof _syncUi === 'function') _syncUi();
}

/**
 * @param {string} panelId
 */
export function isPanelOpen(panelId) {
  return !!DevTools.panelOpen[panelId];
}

/**
 * @param {string} panelId
 * @param {boolean} open
 */
export function setPanelOpen(panelId, open) {
  DevTools.panelOpen[panelId] = !!open;
  DevTools.syncLegacyPanelFlags();
  requestSync();
}

/**
 * @param {string} panelId
 */
export function togglePanel(panelId) {
  setPanelOpen(panelId, !isPanelOpen(panelId));
}

/**
 * @param {DevLauncher} launcher
 */
export function activateLauncher(launcher) {
  if (launcher.action) {
    if (typeof _actionHandler === 'function') _actionHandler(launcher.action);
    return;
  }
  if (launcher.panelId) togglePanel(launcher.panelId);
}

/**
 * Close panels not valid for the current context.
 * @param {DevContext|null} context
 */
export function closeInvalidPanels(context) {
  const allowed = new Set();
  if (context) {
    for (const l of getLaunchers(context)) {
      if (l.panelId) allowed.add(l.panelId);
    }
  }
  for (const id of Object.keys(DevTools.panelOpen)) {
    if (!allowed.has(id) && DevTools.panelOpen[id]) {
      DevTools.panelOpen[id] = false;
    }
  }
  if (context !== 'hangar') {
    for (const id of HANGAR_NESTED_PANELS) {
      DevTools.panelOpen[id] = false;
    }
    DevTools.hangarEdit = false;
  }
  DevTools.syncLegacyPanelFlags();
}

/**
 * @param {string} engineMode
 */
export function syncContext(engineMode) {
  const context = contextForMode(engineMode);
  DevTools.devContext = context;
  closeInvalidPanels(context);
  renderLaunchers(context);
  requestSync();
}

/**
 * @param {DevContext|null} context
 */
export function renderLaunchers(context) {
  const host = document.getElementById('dev-menu-launchers');
  if (!host) return;
  host.innerHTML = '';
  if (!context) return;

  for (const launcher of getLaunchers(context)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hangar-dev-btn dev-menu-launcher';
    btn.textContent = launcher.label;
    btn.dataset.launcherId = launcher.id;
    if (launcher.panelId && isPanelOpen(launcher.panelId)) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      activateLauncher(launcher);
      renderLaunchers(context);
    });
    host.appendChild(btn);
  }
}

/**
 * @param {HTMLElement|null} rootEl
 * @param {HTMLElement|null} toggleEl
 */
function anchorRect(rootEl, toggleEl) {
  const el = rootEl && !rootEl.classList.contains('hidden') ? rootEl : toggleEl;
  return el?.getBoundingClientRect() ?? { left: 12, top: 12, right: 60, bottom: 40, width: 48, height: 28 };
}

/**
 * Show/hide popup panels based on open state and drawer visibility.
 * @param {{ devMode: boolean, drawerOpen: boolean, context: DevContext|null, suspended: boolean }} opts
 */
export function syncPopupVisibility(opts) {
  const { devMode, drawerOpen, context, suspended } = opts;
  const showPopups = devMode && drawerOpen && !suspended && !!context;

  const allPanelIds = new Set(Object.keys(DevTools.panelOpen));
  for (const ctx of Object.values(DEV_LAUNCHERS)) {
    for (const l of ctx) {
      if (l.panelId) allPanelIds.add(l.panelId);
    }
  }
  for (const id of HANGAR_NESTED_PANELS) allPanelIds.add(id);

  /** @type {HTMLElement[]} */
  const toLayout = [];

  for (const panelId of allPanelIds) {
    const panel = document.getElementById(panelId);
    if (!panel) continue;

    const contextOk =
      context &&
      (getLaunchers(context).some((l) => l.panelId === panelId) ||
        (context === 'hangar' && HANGAR_NESTED_PANELS.includes(panelId)));

    const open = !!DevTools.panelOpen[panelId];
    const visible = showPopups && contextOk && open;
    panel.classList.toggle('hidden', !visible);
    panel.classList.toggle('dev-panel-suspended', !visible && open);

    if (visible && !hasStoredPosition(panelId)) {
      toLayout.push(panel);
    }
  }

  if (showPopups && toLayout.length) {
    const root = document.getElementById('dev-menu-root');
    const toggle = document.getElementById('dev-drawer-toggle');
    layoutCascadePopups(anchorRect(root, toggle), toLayout);
  }
}

/** Hide popups visually while keeping open flags (drawer closed). */
export function suspendPopups() {
  DevTools.drawerSuspended = true;
  for (const [panelId, open] of Object.entries(DevTools.panelOpen)) {
    if (!open) continue;
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.add('hidden');
      panel.classList.add('dev-panel-suspended');
    }
  }
}

/** Restore popups that were open before suspend. */
export function restorePopups() {
  DevTools.drawerSuspended = false;
  requestSync();
}

/**
 * Register all dev popup panels for drag + layout.
 * @param {string[]} panelIds
 */
export function registerDevPopups(panelIds) {
  for (const id of panelIds) {
    const el = document.getElementById(id);
    if (el) registerDevPanel(el);
  }
}

/**
 * @param {boolean} open
 */
export function setDrawerOpen(open) {
  DevTools.drawerOpen = !!open;
  const root = document.getElementById('dev-menu-root');
  const drawer = document.getElementById('dev-drawer');
  if (drawer) drawer.classList.toggle('open', DevTools.drawerOpen);
  if (root) root.classList.toggle('hidden', !DevTools.drawerOpen);

  if (DevTools.drawerOpen) {
    restorePopups();
  } else {
    suspendPopups();
    renderLaunchers(DevTools.devContext);
  }
  requestSync();
}

/**
 * Toggle dev drawer open/closed.
 */
export function toggleDrawer() {
  setDrawerOpen(!DevTools.drawerOpen);
}
