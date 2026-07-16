import { GameEngine } from './core/GameEngine.js';
import { Settings } from './core/Settings.js';
import { DevTools } from './dev/DevTools.js';
import { HangarLayoutEditor } from './dev/HangarLayoutEditor.js';
import { resolveLingerBays } from './world/hangar-layout.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const quickLaunchBtn = document.getElementById('quick-launch-btn');
const settingsTitleBtn = document.getElementById('settings-title-btn');
const blueprintTitleBtn = document.getElementById('blueprint-title-btn');
const hangarBackBtn = document.getElementById('hangar-back-btn');
const hangarLaunchBtn = document.getElementById('hangar-launch-btn');
const hangarBlueprintBtn = document.getElementById('hangar-blueprint-btn');
const hangarSimSpeedReadout = document.getElementById('dev-sim-speed-readout');
const devBayPanel = document.getElementById('dev-bay-panel');
const hangarHud = document.getElementById('hangar-hud');
const controlsHud = document.getElementById('controls-hud');
const blueprintHud = document.getElementById('blueprint-hud');
const controlsBackBtn = document.getElementById('controls-back-btn');
const blueprintBackBtn = document.getElementById('blueprint-back-btn');
const devModeToggle = document.getElementById('dev-mode-toggle');
const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');
const cornerUi = document.getElementById('corner-ui');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const pauseFullscreenBtn = document.getElementById('pause-fullscreen-btn');
const settingsBtn = document.getElementById('settings-btn');
const mainMenuBtn = document.getElementById('main-menu-btn');
const dockHud = document.getElementById('dock-hud');
const devDrawer = document.getElementById('dev-drawer');
const hangarEditPanel = document.getElementById('hangar-edit-panel');

const engine = new GameEngine(canvas);
engine.startTitle();
engine.onBlueprintHeadingChange = () => {
  const bp = engine.getBlueprint?.();
  if (bp) {
    syncBlueprintViewLabels(bp);
    syncBlueprintInspector(bp);
  }
};

function formatSimSpeed(speed) {
  if (speed <= 0) return 'PAUSE';
  if (speed === 0.5) return '0.5×';
  if (speed === 1) return '1×';
  if (Number.isInteger(speed)) return `${speed}×`;
  return `${speed}×`;
}

function syncSimSpeedUi() {
  const speed = engine.getSimSpeed();
  if (hangarSimSpeedReadout) hangarSimSpeedReadout.textContent = formatSimSpeed(speed);
  document.querySelectorAll('.hangar-sim-btn').forEach((btn) => {
    const v = Number(btn.dataset.simSpeed);
    btn.classList.toggle('active', v === speed);
  });
}

function syncDevModeUi() {
  const on = Settings.isDevMode();
  if (devModeToggle) devModeToggle.checked = on;
  // Blueprint is always available to players
  if (blueprintTitleBtn) blueprintTitleBtn.classList.remove('hidden');
  if (devDrawer) {
    devDrawer.classList.toggle('hidden', !on);
    if (!on) {
      DevTools.drawerOpen = false;
      DevTools.bayPanelOpen = false;
      devDrawer.classList.remove('open');
      if (devBayPanel) devBayPanel.classList.add('hidden');
    }
  }
  document.querySelectorAll('.bp-dev-only').forEach((el) => {
    el.classList.toggle('hidden', !on);
  });
  const kicker = document.getElementById('bp-topbar-kicker');
  if (kicker) kicker.textContent = on ? 'DEV' : 'SHIP';
  if (!on && HangarLayoutEditor.isActive()) {
    HangarLayoutEditor.exit();
    if (hangarEditPanel) hangarEditPanel.classList.add('hidden');
  }
  if (on) {
    syncSimSpeedUi();
    syncBayOptionsUi();
  }
  syncBpAuthorSliders();
}

function syncBpAuthorSliders() {
  const t = DevTools.getTuning();
  const cup = document.getElementById('bp-tune-cup');
  const plume = document.getElementById('bp-tune-plume');
  const eng = document.getElementById('bp-tune-engine');
  if (cup) cup.value = String(t.thrusterCupScale);
  if (plume) plume.value = String(t.thrusterPlumeScale);
  if (eng) eng.value = String(t.genericEngineClassScale);
}

function setDevStatus(msg) {
  DevTools.status = msg || '';
  const a = document.getElementById('bp-author-status');
  const d = document.getElementById('dev-drawer-status');
  if (a) a.textContent = DevTools.status;
  if (d) d.textContent = DevTools.status;
}

function syncDevInspect() {
  const el = document.getElementById('dev-inspect');
  if (!el || !Settings.isDevMode()) return;
  const ship = engine.ship || engine._sandboxShip;
  const spd = ship?.velocity?.length?.() ?? 0;
  const px = ship?.position?.x ?? ship?.x ?? 0;
  const py = ship?.position?.y ?? ship?.y ?? 0;
  const chunk = ship ? `${Math.floor(px / 2000)},${Math.floor(py / 2000)}` : '—';
  const playerBay =
    engine.mode === 'hangar'
      ? `B${(engine.playerBayIndex ?? engine.hangarBay?.getPlayerBayIndex?.() ?? 1) + 1}`
      : '—';
  const ctrl = engine.hangarControlTarget;
  const ctrlLabel =
    engine.mode !== 'hangar'
      ? '—'
      : !ctrl
        ? 'none'
        : ctrl.kind === 'player'
          ? 'player'
          : `B${ctrl.bayIndex + 1}`;
  el.textContent = [
    `mode ${engine.mode}`,
    `bay ${playerBay}`,
    `ctrl ${ctrlLabel}`,
    `sim ${formatSimSpeed(engine.getSimSpeed())}`,
    `spd ${spd.toFixed(0)}`,
    `yaw ${(((ship?.angle ?? 0) * 180) / Math.PI).toFixed(0)}°`,
    `chunk ${chunk}`,
    `ambient ${engine.ambientTraffic?.ships?.length ?? 0}`,
    DevTools.dirty.tuning || DevTools.dirty.mounts || DevTools.dirty.hangar
      ? `dirty ${[DevTools.dirty.tuning && 'tune', DevTools.dirty.mounts && 'mnt', DevTools.dirty.hangar && 'hgr'].filter(Boolean).join(',')}`
      : 'dirty —',
  ].join('\n');
}

function rebuildHangarPalette() {
  const host = document.getElementById('hangar-edit-palette');
  if (!host) return;
  const pal = HangarLayoutEditor.paletteKinds();
  const kinds = [...pal.deck, ...pal.yard, ...pal.special];
  host.innerHTML = kinds
    .map(
      (k) =>
        `<button type="button" data-place="${k}">${k}</button>`
    )
    .join('');
}

function syncHangarEditInspector() {
  const el = document.getElementById('hangar-edit-inspector');
  if (!el) return;
  const sel = DevTools.hangarSel;
  if (!sel) {
    el.textContent = 'Select a prop / linger / gossip';
    return;
  }
  if (sel.type === 'linger') {
    const bays = resolveLingerBays(sel.ref, sel.prop);
    el.innerHTML =
      `<div>linger ${sel.ref.id || ''}<br/>xy ${sel.ref.x}, ${sel.ref.y}<br/>` +
      `face ${sel.ref.faceDeg ?? 90}° ±${sel.ref.faceSlackDeg ?? 0}</div>` +
      `<div class="hangar-edit-tools">` +
      [0, 1, 2]
        .map(
          (b) =>
            `<button type="button" class="hangar-dev-btn${bays.includes(b) ? ' active' : ''}" data-bay-toggle="${b}">B${b + 1}</button>`
        )
        .join('') +
      `</div>` +
      `<label>Slack <input type="number" id="hangar-face-slack" min="0" max="90" value="${sel.ref.faceSlackDeg ?? 25}" style="width:4em" /></label>`;
    return;
  }
  if (sel.type === 'gossip') {
    el.innerHTML =
      `<div>gossip ${sel.ref.id}<br/>xy ${sel.ref.x}, ${sel.ref.y}</div>` +
      `<label>Cap <input type="number" id="hangar-gossip-cap" min="1" max="8" value="${sel.ref.capacity}" style="width:4em" /></label>`;
    return;
  }
  el.textContent = `${sel.type} ${sel.ref.id}\n${sel.ref.kind || ''} face ${sel.ref.facing | 0}\nxy ${sel.ref.x}, ${sel.ref.y}`;
}

function escapeBpAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

/** Keep HUD chrome outside the sacred viewport circle (circle-aligned, not screen-edge). */
function syncBlueprintLayoutVars() {
  const hud = blueprintHud;
  const r = engine.renderer;
  if (!hud || !r?.width) return;

  const cx = r.centerX;
  const cy = r.centerY;
  const rad = r.viewportRadius;
  const gap = Math.max(8, Math.round(Math.min(r.width, r.height) * 0.012));
  const leftGutter = Math.max(0, cx - rad);
  const rightGutter = Math.max(0, r.width - (cx + rad));
  const topBand = Math.max(0, cy - rad);
  const bottomBand = Math.max(0, r.height - (cy + rad));
  const sideGutter = Math.min(leftGutter, rightGutter);
  const dockW = Math.max(
    0,
    Math.min(300, Math.floor(sideGutter - gap * 2))
  );
  const inspectorH = Math.max(
    96,
    Math.min(220, Math.floor(bottomBand - gap - 40))
  );

  hud.style.setProperty('--bp-cx', `${cx}px`);
  hud.style.setProperty('--bp-cy', `${cy}px`);
  hud.style.setProperty('--bp-r', `${rad}px`);
  hud.style.setProperty('--bp-gap', `${gap}px`);
  hud.style.setProperty('--bp-dock-w', `${dockW}px`);
  hud.style.setProperty('--bp-inspector-h', `${inspectorH}px`);
  hud.style.setProperty('--bp-w', `${r.width}px`);
  hud.style.setProperty('--bp-h', `${r.height}px`);

  // Layout modes for readable reflow
  let mode = 'wide';
  if (dockW < 160) mode = 'narrow';
  else if (dockW < 220) mode = 'compact';
  if (bottomBand < 120) mode = mode === 'wide' ? 'compact' : mode;
  hud.dataset.bpLayout = mode;
}

/** Rebuild per-section Theme/Color/Mk/Variant cards when class roles change. */
function rebuildBlueprintSectionMenus(bp) {
  const host = document.getElementById('bp-sections');
  if (!host || !bp) return;
  const roles = bp.sectionRoles();
  const def = engine._sandboxShip?.shipDef;
  const key = `${bp.classId}:${roles.join(',')}`;
  if (host.dataset.rolesKey === key) {
    host.querySelectorAll('.bp-section-card').forEach((card) => {
      card.classList.toggle('is-active', card.dataset.role === bp.activeSectionRole);
    });
    return;
  }
  host.dataset.rolesKey = key;

  const row = (role, kind, label, valueId) => `
    <div class="bp-row">
      <span class="bp-label">${label}</span>
      <button type="button" class="bp-cycle" data-bp="${kind}" data-role="${escapeBpAttr(role)}" data-dir="-1">◀</button>
      <span class="bp-value" id="${valueId}">—</span>
      <button type="button" class="bp-cycle" data-bp="${kind}" data-role="${escapeBpAttr(role)}" data-dir="1">▶</button>
    </div>`;

  host.innerHTML = roles
    .map((role) => {
      const title = bp.labelSectionRole(role);
      const sec = def?.section?.(role);
      const shortId = sec?.id ? sec.id.replace(/^sec\./, '') : role;
      const active = role === bp.activeSectionRole ? ' is-active' : '';
      return `<div class="bp-section-card${active}" data-role="${escapeBpAttr(role)}" tabindex="0" role="button" aria-pressed="${role === bp.activeSectionRole}">
        <div class="bp-section-title">
          <span>${title}</span>
          <span class="bp-section-id" title="${escapeBpAttr(sec?.id || '')}">${shortId}</span>
        </div>
        ${row(role, 'theme', 'Theme', `bp-theme-${role}`)}
        ${row(role, 'colorway', 'Color', `bp-colorway-${role}`)}
        ${row(role, 'mk', 'Mk', `bp-mk-${role}`)}
        ${row(role, 'variant', 'Variant', `bp-variant-${role}`)}
      </div>`;
    })
    .join('');
}

function syncBlueprintSectionLabels(bp) {
  for (const role of bp.sectionRoles()) {
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set(`bp-theme-${role}`, bp.labelThemeFor(role));
    set(`bp-colorway-${role}`, bp.labelColorwayFor(role));
    set(`bp-mk-${role}`, bp.labelMkFor(role));
    set(`bp-variant-${role}`, bp.labelVariantFor(role));
  }
  const host = document.getElementById('bp-sections');
  if (host) {
    host.querySelectorAll('.bp-section-card').forEach((card) => {
      const on = card.dataset.role === bp.activeSectionRole;
      card.classList.toggle('is-active', on);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
}

function syncBlueprintViewLabels(bp) {
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('bp-view-mode', bp.labelViewMode());
  set('bp-heading', bp.labelHeading());
  set('bp-status', bp.statusLine(engine._sandboxShip?.shipDef));
  const viewBtn = document.getElementById('bp-view-btn');
  if (viewBtn) viewBtn.textContent = bp.labelViewToggle();
  const explodeBtn = document.getElementById('bp-explode-btn');
  if (explodeBtn) {
    explodeBtn.textContent = bp.labelExploded();
    explodeBtn.classList.toggle('active', !!bp.explodedView);
  }
  const spinBtn = document.getElementById('bp-spin-btn');
  if (spinBtn) {
    spinBtn.classList.toggle('active', !!bp.autoSpin);
    spinBtn.disabled = !!bp.liveControls;
  }
  const liveBtn = document.getElementById('bp-live-btn');
  if (liveBtn) {
    liveBtn.textContent = bp.labelLiveControls();
    liveBtn.classList.toggle('active', !!bp.liveControls);
  }
  const hint = document.getElementById('bp-hint');
  if (hint) {
    hint.innerHTML = bp.liveControls
      ? '<kbd>WASD</kbd>/<kbd>QE</kbd>/<kbd>Space</kbd> hangar controls · no flight · <kbd>SCROLL</kbd> zoom · <kbd>ESC</kbd> back'
      : '<kbd>Q</kbd>/<kbd>E</kbd> yaw · <kbd>SCROLL</kbd> zoom · <kbd>ESC</kbd> back';
  }
}

/** Rebuild the interactive per-hardpoint mount roster (variant cycler per mount). */
function renderMountRoster(bp, def) {
  const host = document.getElementById('bp-mount-roster');
  if (!host) return;
  const entries = bp.mountRosterEntries(def);
  if (!entries.length) {
    host.innerHTML = '<p class="bp-meta">(no ship def)</p>';
    return;
  }
  host.innerHTML = entries
    .map((e) => {
      const faceBit = e.face ? ` · ${e.face}` : '';
      const mkBit = e.hasItem ? `Mk${e.mk}` : '—';
      const variantBit = e.hasItem ? e.variant : '—';
      const disabled = e.hasItem ? '' : 'disabled';
      return `<div class="bp-mount-row${e.hasItem ? '' : ' is-empty'}" data-mount-key="${escapeBpAttr(e.key)}">
        <div class="bp-mount-info">
          <span class="bp-mount-key">${escapeBpAttr(e.key)}</span>
          <span class="bp-mount-cat">${escapeBpAttr(e.category)}${faceBit}</span>
        </div>
        <div class="bp-mount-controls">
          <span class="bp-mount-mk">${mkBit}</span>
          <button type="button" class="bp-cycle" data-bp="hpvariant" data-key="${escapeBpAttr(e.key)}" data-dir="-1" ${disabled} aria-label="Previous variant">◀</button>
          <span class="bp-value">${escapeBpAttr(variantBit)}</span>
          <button type="button" class="bp-cycle" data-bp="hpvariant" data-key="${escapeBpAttr(e.key)}" data-dir="1" ${disabled} aria-label="Next variant">▶</button>
        </div>
      </div>`;
    })
    .join('');
}

function syncBlueprintInspector(bp) {
  const def = engine._sandboxShip?.shipDef || null;
  const body = document.getElementById('bp-inspector-body');
  const sel = document.getElementById('bp-inspector-sel');
  const meta = document.getElementById('bp-identity-meta');
  if (body) body.textContent = bp.debugReport(def);
  if (sel) {
    sel.textContent = `${bp.labelSectionRole(bp.activeSectionRole)} · ${bp.labelThemeFor(bp.activeSectionRole)} · Mk${bp.labelMkFor(bp.activeSectionRole)} · ${bp.labelVariantFor(bp.activeSectionRole)}`;
  }
  renderMountRoster(bp, def);
  if (meta) {
    const scale = def?.scale ?? '—';
    meta.textContent = `${bp.labelPadMk()} · scale ${scale} · ${bp.sectionRoles().length} section${bp.sectionRoles().length === 1 ? '' : 's'}`;
  }
  const blurbEl = document.getElementById('bp-theme-blurb');
  if (blurbEl) blurbEl.textContent = bp.labelThemeBlurb() || '';
}

function syncBlueprintUi() {
  const bp = engine.getBlueprint?.();
  if (!bp) return;
  syncBlueprintLayoutVars();
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('bp-group', bp.labelGroup());
  set('bp-class', bp.labelClass());
  rebuildBlueprintSectionMenus(bp);
  syncBlueprintSectionLabels(bp);
  syncBlueprintViewLabels(bp);
  syncBlueprintInspector(bp);
}

function closeChangelogPanel() {
  if (typeof window.__hyperdriftCloseChangelog === 'function') {
    window.__hyperdriftCloseChangelog();
  }
}

function showTitleUi() {
  overlay.classList.remove('hidden');
  startScreen.classList.remove('hidden');
  if (hangarHud) hangarHud.classList.add('hidden');
  if (controlsHud) controlsHud.classList.add('hidden');
  if (blueprintHud) blueprintHud.classList.add('hidden');
  hud.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.add('hidden');
  if (dockHud) dockHud.classList.add('hidden');
  if (hangarEditPanel) hangarEditPanel.classList.add('hidden');
  DevTools.bayPanelOpen = false;
  if (devBayPanel) devBayPanel.classList.add('hidden');
  HangarLayoutEditor.exit();
  syncDevModeUi();
}

function showPlayingUi() {
  closeChangelogPanel();
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  if (hangarHud) hangarHud.classList.add('hidden');
  if (controlsHud) controlsHud.classList.add('hidden');
  if (blueprintHud) blueprintHud.classList.add('hidden');
  hud.classList.remove('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.remove('hidden');
}

function showHangarUi() {
  closeChangelogPanel();
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.add('hidden');
  if (controlsHud) controlsHud.classList.add('hidden');
  if (blueprintHud) blueprintHud.classList.add('hidden');
  if (hangarHud) hangarHud.classList.remove('hidden');
  if (dockHud) dockHud.classList.add('hidden');
  syncDevModeUi();
}

function showControlsUi() {
  closeChangelogPanel();
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.add('hidden');
  if (hangarHud) hangarHud.classList.add('hidden');
  if (blueprintHud) blueprintHud.classList.add('hidden');
  if (controlsHud) controlsHud.classList.remove('hidden');
  if (dockHud) dockHud.classList.add('hidden');
  syncDevModeUi();
}

function showBlueprintUi() {
  closeChangelogPanel();
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.add('hidden');
  if (hangarHud) hangarHud.classList.add('hidden');
  if (controlsHud) controlsHud.classList.add('hidden');
  if (blueprintHud) blueprintHud.classList.remove('hidden');
  if (dockHud) dockHud.classList.add('hidden');
  DevTools.bayPanelOpen = false;
  if (devBayPanel) devBayPanel.classList.add('hidden');
  syncBlueprintUi();
}

function startGame() {
  showPlayingUi();
  engine.beginPlay();
}

function openHangar() {
  engine.beginHangar({ fromMenu: true });
  showHangarUi();
}

function leaveHangar() {
  engine.exitHangar();
  showTitleUi();
}

function openSettings(from = 'title') {
  showControlsUi();
  engine.beginControls(from === 'pause' ? 'pause' : 'title');
}

function openBlueprint(from = 'title') {
  showBlueprintUi();
  engine.beginBlueprint(from === 'hangar' ? 'hangar' : 'title');
  syncBlueprintUi();
  syncDevModeUi();
}

function leaveControls(dest) {
  if (dest === 'pause') {
    hud.classList.remove('hidden');
    if (cornerUi) cornerUi.classList.remove('hidden');
    if (controlsHud) controlsHud.classList.add('hidden');
    pauseMenu.classList.remove('hidden');
    return;
  }
  showTitleUi();
}

function leaveBlueprint(dest) {
  if (dest === 'hangar') {
    showHangarUi();
    return;
  }
  showTitleUi();
}

engine.onHangarExit = () => {
  showTitleUi();
};

engine.onLaunchComplete = () => {
  showPlayingUi();
};

engine.onEnterHangar = () => {
  showHangarUi();
};

engine.onControlsExit = (dest) => {
  leaveControls(dest);
};

engine.onBlueprintEnter = () => {
  syncBlueprintUi();
};

engine.onBlueprintExit = (dest) => {
  leaveBlueprint(dest);
};

if (startBtn) startBtn.addEventListener('click', openHangar);
if (quickLaunchBtn) quickLaunchBtn.addEventListener('click', startGame);
if (settingsTitleBtn) settingsTitleBtn.addEventListener('click', () => openSettings('title'));
if (blueprintTitleBtn) {
  blueprintTitleBtn.addEventListener('click', () => openBlueprint('title'));
}
if (hangarBackBtn) hangarBackBtn.addEventListener('click', leaveHangar);
if (hangarLaunchBtn) {
  hangarLaunchBtn.addEventListener('click', () => engine.requestLaunch());
}
if (hangarBlueprintBtn) {
  hangarBlueprintBtn.addEventListener('click', () => openBlueprint('hangar'));
}
document.querySelectorAll('.hangar-sim-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!Settings.isDevMode()) return;
    engine.setSimSpeed(Number(btn.dataset.simSpeed));
    syncSimSpeedUi();
  });
});
if (devModeToggle) {
  syncDevModeUi();
  devModeToggle.addEventListener('change', () => {
    Settings.setDevMode(devModeToggle.checked);
    syncDevModeUi();
  });
}
if (controlsBackBtn) {
  controlsBackBtn.addEventListener('click', () => {
    const dest = engine.exitControls();
    leaveControls(dest);
  });
}
if (blueprintBackBtn) {
  blueprintBackBtn.addEventListener('click', () => {
    const dest = engine.exitBlueprint();
    leaveBlueprint(dest);
  });
}

const blueprintPanel = document.getElementById('blueprint-panel');
if (blueprintPanel) {
  blueprintPanel.addEventListener('click', (ev) => {
    const card = ev.target.closest?.('.bp-section-card');
    const btn = ev.target.closest?.('.bp-cycle');
    if (!btn && card && engine.mode === 'blueprint') {
      const bp = engine.getBlueprint?.();
      if (!bp) return;
      const role = card.dataset.role;
      if (role) {
        bp.setActiveSection(role);
        syncBlueprintUi();
      }
      return;
    }
    if (!btn || engine.mode !== 'blueprint') return;
    const kind = btn.dataset.bp;
    const dir = Number(btn.dataset.dir) || 1;
    const role = btn.dataset.role || null;
    const bp = engine.getBlueprint?.();
    if (!bp) return;

    if (kind === 'group') {
      engine.blueprintApplySpec(function () {
        return this.cycleGroup(dir);
      });
      const host = document.getElementById('bp-sections');
      if (host) delete host.dataset.rolesKey;
      syncBlueprintUi();
      return;
    }
    if (kind === 'class') {
      engine.blueprintApplySpec(function () {
        return this.cycleClass(dir);
      });
      const host = document.getElementById('bp-sections');
      if (host) delete host.dataset.rolesKey;
      syncBlueprintUi();
      return;
    }

    if (
      role &&
      (kind === 'theme' || kind === 'colorway' || kind === 'mk' || kind === 'variant')
    ) {
      const map = {
        theme: 'cycleTheme',
        colorway: 'cycleColorway',
        mk: 'cycleMk',
        variant: 'cycleVariant',
      };
      bp.setActiveSection(role);
      bp[map[kind]](dir, role);
      if (engine._sandboxShip?.shipDef) {
        bp.applySectionToDef(engine._sandboxShip.shipDef, role);
      }
      syncBlueprintUi();
    }
  });
}

const bpMountRoster = document.getElementById('bp-mount-roster');
if (bpMountRoster) {
  bpMountRoster.addEventListener('click', (ev) => {
    const btn = ev.target.closest?.('.bp-cycle[data-bp="hpvariant"]');
    if (!btn || btn.disabled || engine.mode !== 'blueprint') return;
    const key = btn.dataset.key;
    const dir = Number(btn.dataset.dir) || 1;
    const bp = engine.getBlueprint?.();
    const def = engine._sandboxShip?.shipDef;
    if (!bp || !def || !key) return;
    bp.cycleHardpointVariant(def, key, dir);
    syncBlueprintUi();
  });
}

const bpInspectorCopy = document.getElementById('bp-inspector-copy');
if (bpInspectorCopy) {
  bpInspectorCopy.addEventListener('click', async () => {
    const body = document.getElementById('bp-inspector-body');
    const text = body?.textContent || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      bpInspectorCopy.textContent = 'Copied';
      setTimeout(() => {
        bpInspectorCopy.textContent = 'Copy';
      }, 900);
    } catch {
      bpInspectorCopy.textContent = 'Failed';
      setTimeout(() => {
        bpInspectorCopy.textContent = 'Copy';
      }, 900);
    }
  });
}

window.addEventListener('resize', () => {
  if (engine.mode === 'blueprint') syncBlueprintLayoutVars();
});

const bpViewBtn = document.getElementById('bp-view-btn');
if (bpViewBtn) {
  bpViewBtn.addEventListener('click', () => {
    const bp = engine.getBlueprint?.();
    if (!bp) return;
    bp.toggleViewMode();
    syncBlueprintUi();
  });
}
const bpExplodeBtn = document.getElementById('bp-explode-btn');
if (bpExplodeBtn) {
  bpExplodeBtn.addEventListener('click', () => {
    const bp = engine.getBlueprint?.();
    if (!bp) return;
    bp.toggleExplodedView();
    syncBlueprintUi();
  });
}
const bpRotLeft = document.getElementById('bp-rot-left');
const bpRotRight = document.getElementById('bp-rot-right');
if (bpRotLeft) {
  bpRotLeft.addEventListener('click', () => {
    const bp = engine.getBlueprint?.();
    if (!bp) return;
    const fromAngle = engine._sandboxShip?.angle;
    bp.rotateHeading(-1, fromAngle);
    if (engine._sandboxShip) {
      engine._sandboxShip.angle = bp.shipAngle();
      engine._sandboxShip.turretAngle = bp.shipAngle();
      engine._sandboxShip.angularVelocity = 0;
    }
    syncBlueprintUi();
  });
}
if (bpRotRight) {
  bpRotRight.addEventListener('click', () => {
    const bp = engine.getBlueprint?.();
    if (!bp) return;
    const fromAngle = engine._sandboxShip?.angle;
    bp.rotateHeading(1, fromAngle);
    if (engine._sandboxShip) {
      engine._sandboxShip.angle = bp.shipAngle();
      engine._sandboxShip.turretAngle = bp.shipAngle();
      engine._sandboxShip.angularVelocity = 0;
    }
    syncBlueprintUi();
  });
}
const bpSpinBtn = document.getElementById('bp-spin-btn');
if (bpSpinBtn) {
  bpSpinBtn.addEventListener('click', () => {
    const bp = engine.getBlueprint?.();
    if (!bp || bp.liveControls) return;
    bp.autoSpin = !bp.autoSpin;
    syncBlueprintUi();
  });
}
const bpLiveBtn = document.getElementById('bp-live-btn');
if (bpLiveBtn) {
  bpLiveBtn.addEventListener('click', () => {
    const bp = engine.getBlueprint?.();
    if (!bp) return;
    bp.toggleLiveControls();
    if (!bp.liveControls && engine._sandboxShip) {
      // Leaving live: snap to nearest compass heading (inspect mode)
      bp.syncHeadingFromAngle(engine._sandboxShip.angle);
      engine._sandboxShip.angle = bp.shipAngle();
      engine._sandboxShip.turretAngle = bp.shipAngle();
      engine._sandboxShip.angularVelocity = 0;
    }
    syncBlueprintUi();
  });
}
const bpResetBtn = document.getElementById('bp-reset-btn');
if (bpResetBtn) {
  bpResetBtn.addEventListener('click', () => {
    engine.blueprintApplySpec(function () {
      return this.resetStarter();
    });
    const bp = engine.getBlueprint?.();
    if (bp && engine._sandboxShip) {
      engine._sandboxShip.angle = bp.shipAngle();
      engine._sandboxShip.turretAngle = bp.shipAngle();
      engine._sandboxShip.velocity?.set?.(0, 0);
      engine._sandboxShip.angularVelocity = 0;
    }
    const host = document.getElementById('bp-sections');
    if (host) delete host.dataset.rolesKey;
    syncBlueprintUi();
    const status = document.getElementById('bp-status');
    if (status) status.textContent = 'Reset to default starter · Generalist Mid Mk2';
  });
}
const bpRandomBtn = document.getElementById('bp-random-btn');
if (bpRandomBtn) {
  bpRandomBtn.addEventListener('click', () => {
    engine.blueprintApplySpec(function () {
      return this.randomize();
    });
    const host = document.getElementById('bp-sections');
    if (host) delete host.dataset.rolesKey;
    syncBlueprintUi();
  });
}
const bpApplyBtn = document.getElementById('bp-apply-btn');
if (bpApplyBtn) {
  bpApplyBtn.addEventListener('click', () => {
    const ok = engine.applyBlueprintToPlayer();
    const status = document.getElementById('bp-status');
    if (status) {
      status.textContent = ok
        ? 'Applied to player ship — will load on next hangar / flight'
        : 'Nothing to apply';
    }
    const bp = engine.getBlueprint?.();
    if (bp) syncBlueprintInspector(bp);
  });
}

// —— Dev drawer + Blueprint Author + Hangar edit ——
const devDrawerToggle = document.getElementById('dev-drawer-toggle');
if (devDrawerToggle && devDrawer) {
  devDrawerToggle.addEventListener('click', () => {
    if (!Settings.isDevMode()) return;
    DevTools.drawerOpen = !DevTools.drawerOpen;
    devDrawer.classList.toggle('open', DevTools.drawerOpen);
    if (!DevTools.drawerOpen) DevTools.bayPanelOpen = false;
    syncBayOptionsUi();
  });
}

document.getElementById('dev-ov-mounts')?.addEventListener('change', (e) => {
  DevTools.overlay.mounts = !!e.target.checked;
});
document.getElementById('dev-ov-vel')?.addEventListener('change', (e) => {
  DevTools.overlay.velocity = !!e.target.checked;
});
document.getElementById('dev-ov-axes')?.addEventListener('change', (e) => {
  DevTools.overlay.axes = !!e.target.checked;
});

function wireTuneSlider(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    if (!Settings.isDevMode()) return;
    DevTools.applyTuning({ [key]: Number(el.value) });
    setDevStatus(`tuning ${key}=${el.value}`);
  });
}
wireTuneSlider('bp-tune-cup', 'thrusterCupScale');
wireTuneSlider('bp-tune-plume', 'thrusterPlumeScale');
wireTuneSlider('bp-tune-engine', 'genericEngineClassScale');

document.getElementById('bp-save-tuning')?.addEventListener('click', async () => {
  const r = await DevTools.saveTuning();
  setDevStatus(DevTools.status);
  if (!r.ok) await DevTools.exportText('tuning');
});
document.getElementById('bp-save-mounts')?.addEventListener('click', async () => {
  const r = await DevTools.saveMounts();
  setDevStatus(DevTools.status);
  if (!r.ok) await DevTools.exportText('mounts');
});
document.getElementById('bp-export-tuning')?.addEventListener('click', async () => {
  await DevTools.exportText('tuning');
  setDevStatus(DevTools.status);
});
document.getElementById('bp-export-mounts')?.addEventListener('click', async () => {
  await DevTools.exportText('mounts');
  setDevStatus(DevTools.status);
});

function enterHangarEdit() {
  if (!Settings.isDevMode() || engine.mode !== 'hangar') return;
  HangarLayoutEditor.enter();
  engine.setSimSpeed(0);
  syncSimSpeedUi();
  rebuildHangarPalette();
  if (hangarEditPanel) hangarEditPanel.classList.remove('hidden');
  syncHangarEditInspector();
  setDevStatus('Hangar edit — crew frozen');
}

function exitHangarEdit() {
  HangarLayoutEditor.exit();
  if (hangarEditPanel) hangarEditPanel.classList.add('hidden');
  if (engine.getSimSpeed() === 0) {
    engine.setSimSpeed(1);
    syncSimSpeedUi();
  }
  setDevStatus('');
}

function selectedBayIndices() {
  return [0, 1, 2].filter((i) => DevTools.baySel[i]);
}

function bayIsOccupied(bayIndex) {
  return !!engine.hangarBay?.isBayOccupied?.(bayIndex);
}

function bayIsOffline(bayIndex) {
  return !!engine.hangarBay?.isBayOffline?.(bayIndex);
}

function syncBayOptionsUi() {
  if (!devBayPanel) return;
  const open = !!(Settings.isDevMode() && DevTools.bayPanelOpen && DevTools.drawerOpen);
  devBayPanel.classList.toggle('hidden', !open);
  document.querySelectorAll('[data-bay-sel]').forEach((btn) => {
    const i = Number(btn.dataset.baySel);
    btn.classList.toggle('active', !!DevTools.baySel[i]);
  });
  const allBtn = document.getElementById('dev-bay-all-none');
  if (allBtn) {
    const allOn = DevTools.baySel.every(Boolean);
    allBtn.textContent = allOn ? 'None' : 'All';
  }
  const sel = selectedBayIndices();
  const occupyBtn = document.getElementById('dev-bay-occupy');
  const offlineBtn = document.getElementById('dev-bay-offline');
  if (occupyBtn) {
    if (!sel.length) occupyBtn.textContent = 'Empty';
    else {
      const primary = bayIsOccupied(sel[0]);
      occupyBtn.textContent = primary ? 'Empty' : 'Occupy';
    }
  }
  if (offlineBtn) {
    if (!sel.length) offlineBtn.textContent = 'Off';
    else {
      const primary = bayIsOffline(sel[0]);
      offlineBtn.textContent = primary ? 'On' : 'Off';
    }
  }
}

function runBayAction(action) {
  if (!Settings.isDevMode()) return;
  if (engine.mode !== 'hangar') {
    setDevStatus('Bay Options — hangar only');
    return;
  }
  const hb = engine.hangarBay;
  if (!hb) return;
  const sel = selectedBayIndices();
  if (!sel.length) {
    setDevStatus('Bay Options — select a bay');
    return;
  }
  const occupyBtn = document.getElementById('dev-bay-occupy');
  const offlineBtn = document.getElementById('dev-bay-offline');
  const wantEmpty = occupyBtn?.textContent === 'Empty';
  const wantOffline = offlineBtn?.textContent === 'Off';

  for (const bay of sel) {
    switch (action) {
      case 'service':
        hb.devRerollService?.(bay);
        break;
      case 'door':
        hb.devForceDoor?.(bay);
        break;
      case 'elev':
        hb.devForceElev?.(bay);
        break;
      case 'pad':
        hb.devForcePadSpin?.(bay);
        break;
      case 'occupy':
        if (wantEmpty) hb.devForceEmpty?.(bay);
        else hb.devForceOccupy?.(bay);
        break;
      case 'offline':
        hb.devSetBayOffline?.(bay, wantOffline);
        break;
      case 'reset':
        hb.devResetBay?.(bay);
        break;
      default:
        break;
    }
  }
  setDevStatus(`Bay ${action} → ${sel.map((b) => `B${b + 1}`).join(',')}`);
  syncBayOptionsUi();
}

document.getElementById('dev-hangar-edit-btn')?.addEventListener('click', enterHangarEdit);
document.getElementById('dev-bay-options-btn')?.addEventListener('click', () => {
  if (!Settings.isDevMode()) return;
  if (!DevTools.drawerOpen) {
    DevTools.drawerOpen = true;
    if (devDrawer) devDrawer.classList.add('open');
  }
  DevTools.bayPanelOpen = !DevTools.bayPanelOpen;
  syncBayOptionsUi();
});
document.getElementById('dev-bay-close')?.addEventListener('click', () => {
  DevTools.bayPanelOpen = false;
  syncBayOptionsUi();
});
document.querySelectorAll('[data-bay-sel]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!Settings.isDevMode()) return;
    const i = Number(btn.dataset.baySel);
    DevTools.baySel[i] = !DevTools.baySel[i];
    syncBayOptionsUi();
  });
});
document.getElementById('dev-bay-all-none')?.addEventListener('click', () => {
  if (!Settings.isDevMode()) return;
  const allOn = DevTools.baySel.every(Boolean);
  DevTools.baySel = allOn ? [false, false, false] : [true, true, true];
  syncBayOptionsUi();
});
document.querySelectorAll('[data-bay-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    runBayAction(btn.dataset.bayAction);
  });
});
document.getElementById('hangar-edit-done')?.addEventListener('click', exitHangarEdit);
document.getElementById('hangar-edit-save')?.addEventListener('click', async () => {
  const r = await DevTools.saveHangar();
  setDevStatus(DevTools.status);
  if (!r.ok) await DevTools.exportText('hangar');
});
document.getElementById('hangar-edit-export')?.addEventListener('click', async () => {
  await DevTools.exportText('hangar');
  setDevStatus(DevTools.status);
});
document.getElementById('hangar-edit-dup')?.addEventListener('click', () => {
  HangarLayoutEditor.duplicateSelected();
  syncHangarEditInspector();
});
document.getElementById('hangar-edit-rot')?.addEventListener('click', () => {
  HangarLayoutEditor.rotateSelected(1);
  syncHangarEditInspector();
});
document.getElementById('hangar-edit-del')?.addEventListener('click', () => {
  HangarLayoutEditor.deleteSelected();
  syncHangarEditInspector();
});
document.getElementById('hangar-edit-linger')?.addEventListener('click', () => {
  HangarLayoutEditor.addLingerToSelected();
  syncHangarEditInspector();
});

document.getElementById('hangar-edit-palette')?.addEventListener('click', (ev) => {
  const btn = ev.target.closest?.('[data-place]');
  if (!btn) return;
  HangarLayoutEditor.placeKind = btn.dataset.place;
  document.querySelectorAll('#hangar-edit-palette button').forEach((b) => {
    b.classList.toggle('active', b === btn);
  });
});

document.getElementById('hangar-edit-panel')?.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t?.dataset?.hlayer) {
    DevTools.hangarLayers[t.dataset.hlayer] = !!t.checked;
  }
});

document.getElementById('hangar-edit-inspector')?.addEventListener('click', (ev) => {
  const btn = ev.target.closest?.('[data-bay-toggle]');
  if (!btn || DevTools.hangarSel?.type !== 'linger') return;
  const b = Number(btn.dataset.bayToggle);
  const cur = new Set(resolveLingerBays(DevTools.hangarSel.ref, DevTools.hangarSel.prop));
  if (cur.has(b) && cur.size > 1) cur.delete(b);
  else cur.add(b);
  HangarLayoutEditor.setLingerBays([...cur]);
  syncHangarEditInspector();
});

document.getElementById('hangar-edit-inspector')?.addEventListener('change', (ev) => {
  if (ev.target?.id === 'hangar-face-slack') {
    HangarLayoutEditor.setFaceSlack(Number(ev.target.value));
  }
  if (ev.target?.id === 'hangar-gossip-cap') {
    HangarLayoutEditor.setGossipCapacity(Number(ev.target.value));
  }
});

setInterval(() => {
  if (!Settings.isDevMode()) return;
  syncDevInspect();
  if (DevTools.bayPanelOpen) syncBayOptionsUi();
  if (HangarLayoutEditor.isActive()) syncHangarEditInspector();
  const st = document.getElementById('dev-drawer-status');
  if (st && DevTools.status) st.textContent = DevTools.status;
}, 250);

resumeBtn.addEventListener('click', () => {
  if (engine?.paused) engine.togglePause();
});

fullscreenBtn.addEventListener('click', () => {
  engine?.toggleFullscreen();
});

pauseFullscreenBtn.addEventListener('click', () => {
  engine?.toggleFullscreen();
});

if (settingsBtn) {
  settingsBtn.disabled = false;
  settingsBtn.classList.remove('disabled');
  settingsBtn.addEventListener('click', () => openSettings('pause'));
}

if (mainMenuBtn) {
  mainMenuBtn.disabled = false;
  mainMenuBtn.classList.remove('disabled');
  mainMenuBtn.addEventListener('click', () => {
    engine.returnToMainMenu();
    showTitleUi();
  });
}

if (dockHud) {
  dockHud.addEventListener('click', () => engine.requestDock());
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && engine.mode === 'playing' && !engine.paused) {
    engine.requestDock();
  }
  if (e.key === '`' && Settings.isDevMode()) {
    e.preventDefault();
    DevTools.drawerOpen = !DevTools.drawerOpen;
    if (devDrawer) devDrawer.classList.toggle('open', DevTools.drawerOpen);
    if (!DevTools.drawerOpen) DevTools.bayPanelOpen = false;
    syncBayOptionsUi();
  }
  if (HangarLayoutEditor.isActive()) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      HangarLayoutEditor.deleteSelected();
      syncHangarEditInspector();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      HangarLayoutEditor.duplicateSelected();
      syncHangarEditInspector();
    }
    if (e.key === '[' || e.key === ']') {
      HangarLayoutEditor.rotateSelected(e.key === ']' ? 1 : -1);
      syncHangarEditInspector();
    }
  }
});

document.addEventListener('fullscreenchange', () => {
  if (engine) {
    engine._updateFullscreenButtons(!!document.fullscreenElement);
  }
});

syncDevModeUi();
