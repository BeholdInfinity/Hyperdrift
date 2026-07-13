import { GameEngine } from './core/GameEngine.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const quickLaunchBtn = document.getElementById('quick-launch-btn');
const settingsTitleBtn = document.getElementById('settings-title-btn');
const hangarBackBtn = document.getElementById('hangar-back-btn');
const hangarLaunchBtn = document.getElementById('hangar-launch-btn');
const hangarHud = document.getElementById('hangar-hud');
const controlsHud = document.getElementById('controls-hud');
const controlsBackBtn = document.getElementById('controls-back-btn');
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

function showTitleUi() {
  overlay.classList.remove('hidden');
  startScreen.classList.remove('hidden');
  if (hangarHud) hangarHud.classList.add('hidden');
  if (controlsHud) controlsHud.classList.add('hidden');
  hud.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.add('hidden');
  if (dockHud) dockHud.classList.add('hidden');
}

function showPlayingUi() {
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  if (hangarHud) hangarHud.classList.add('hidden');
  if (controlsHud) controlsHud.classList.add('hidden');
  hud.classList.remove('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.remove('hidden');
}

function showHangarUi() {
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.add('hidden');
  if (controlsHud) controlsHud.classList.add('hidden');
  if (hangarHud) hangarHud.classList.remove('hidden');
  if (dockHud) dockHud.classList.add('hidden');
}

function showControlsUi() {
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.add('hidden');
  if (hangarHud) hangarHud.classList.add('hidden');
  if (controlsHud) controlsHud.classList.remove('hidden');
  if (dockHud) dockHud.classList.add('hidden');
}

function startGame() {
  showPlayingUi();
  engine.beginPlay();
}

function openHangar() {
  showHangarUi();
  engine.beginHangar({ fromMenu: true });
}

function leaveHangar() {
  engine.exitHangar();
  showTitleUi();
}

function openSettings(from = 'title') {
  showControlsUi();
  engine.beginControls(from === 'pause' ? 'pause' : 'title');
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

if (startBtn) startBtn.addEventListener('click', openHangar);
if (quickLaunchBtn) quickLaunchBtn.addEventListener('click', startGame);
if (settingsTitleBtn) settingsTitleBtn.addEventListener('click', () => openSettings('title'));
if (hangarBackBtn) hangarBackBtn.addEventListener('click', leaveHangar);
if (hangarLaunchBtn) {
  hangarLaunchBtn.addEventListener('click', () => engine.requestLaunch());
}
if (controlsBackBtn) {
  controlsBackBtn.addEventListener('click', () => {
    const dest = engine.exitControls();
    leaveControls(dest);
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
