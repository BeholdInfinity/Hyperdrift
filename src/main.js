import { GameEngine } from './core/GameEngine.js';
import { Settings } from './core/Settings.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const quickLaunchBtn = document.getElementById('quick-launch-btn');
const settingsTitleBtn = document.getElementById('settings-title-btn');
const blueprintTitleBtn = document.getElementById('blueprint-title-btn');
const hangarBackBtn = document.getElementById('hangar-back-btn');
const hangarLaunchBtn = document.getElementById('hangar-launch-btn');
const hangarRerollSvcBtn = document.getElementById('hangar-reroll-svc-btn');
const hangarRerollB1Btn = document.getElementById('hangar-reroll-b1-btn');
const hangarElevB1Btn = document.getElementById('hangar-elev-b1-btn');
const hangarRerollB3Btn = document.getElementById('hangar-reroll-b3-btn');
const hangarElevB3Btn = document.getElementById('hangar-elev-b3-btn');
const hangarBlueprintBtn = document.getElementById('hangar-blueprint-btn');
const hangarDevPanel = document.getElementById('hangar-dev-panel');
const hangarSimSpeedReadout = document.getElementById('hangar-sim-speed-readout');
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
  const inHangar =
    engine.mode === 'hangar' ||
    (hangarHud && !hangarHud.classList.contains('hidden'));
  if (hangarDevPanel) {
    hangarDevPanel.classList.toggle('hidden', !(on && inHangar));
  }
  if (blueprintTitleBtn) {
    blueprintTitleBtn.classList.toggle('hidden', !on);
  }
  if (on && inHangar) syncSimSpeedUi();
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
  if (hangarDevPanel) hangarDevPanel.classList.add('hidden');
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
  if (hangarDevPanel) hangarDevPanel.classList.add('hidden');
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
  if (!Settings.isDevMode()) return;
  showBlueprintUi();
  engine.beginBlueprint(from === 'hangar' ? 'hangar' : 'title');
  syncBlueprintUi();
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
if (hangarRerollSvcBtn) {
  hangarRerollSvcBtn.addEventListener('click', () => {
    if (!Settings.isDevMode()) return;
    engine.hangarBay?.rerollPlayerService?.();
  });
}
if (hangarRerollB1Btn) {
  hangarRerollB1Btn.addEventListener('click', () => {
    if (!Settings.isDevMode()) return;
    engine.hangarBay?.rerollSidePadVisitor?.(0);
  });
}
if (hangarElevB1Btn) {
  hangarElevB1Btn.addEventListener('click', () => {
    if (!Settings.isDevMode()) return;
    engine.hangarBay?.forceSidePadElevatorCycle?.(0);
  });
}
if (hangarRerollB3Btn) {
  hangarRerollB3Btn.addEventListener('click', () => {
    if (!Settings.isDevMode()) return;
    engine.hangarBay?.rerollSidePadVisitor?.(2);
  });
}
if (hangarElevB3Btn) {
  hangarElevB3Btn.addEventListener('click', () => {
    if (!Settings.isDevMode()) return;
    engine.hangarBay?.forceSidePadElevatorCycle?.(2);
  });
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
    if (!Settings.isDevMode()) return;
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
});

document.addEventListener('fullscreenchange', () => {
  if (engine) {
    engine._updateFullscreenButtons(!!document.fullscreenElement);
  }
});

syncDevModeUi();
