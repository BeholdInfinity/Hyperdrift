import { GameEngine } from './core/GameEngine.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const viewShipBtn = document.getElementById('view-ship-btn');
const hangarBackBtn = document.getElementById('hangar-back-btn');
const hangarHud = document.getElementById('hangar-hud');
const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');
const cornerUi = document.getElementById('corner-ui');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const pauseFullscreenBtn = document.getElementById('pause-fullscreen-btn');

const engine = new GameEngine(canvas);
engine.startTitle();

function showTitleUi() {
  overlay.classList.remove('hidden');
  startScreen.classList.remove('hidden');
  if (hangarHud) hangarHud.classList.add('hidden');
  hud.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.add('hidden');
}

function startGame() {
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  if (hangarHud) hangarHud.classList.add('hidden');
  hud.classList.remove('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.remove('hidden');

  engine.beginPlay();
}

function openHangar() {
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.add('hidden');
  if (hangarHud) hangarHud.classList.remove('hidden');

  engine.beginHangar();
}

function leaveHangar() {
  engine.exitHangar();
  showTitleUi();
}

engine.onHangarExit = () => {
  showTitleUi();
};

startBtn.addEventListener('click', startGame);
if (viewShipBtn) viewShipBtn.addEventListener('click', openHangar);
if (hangarBackBtn) hangarBackBtn.addEventListener('click', leaveHangar);

resumeBtn.addEventListener('click', () => {
  if (engine?.paused) engine.togglePause();
});

fullscreenBtn.addEventListener('click', () => {
  engine?.toggleFullscreen();
});

pauseFullscreenBtn.addEventListener('click', () => {
  engine?.toggleFullscreen();
});

document.addEventListener('fullscreenchange', () => {
  if (engine) {
    engine._updateFullscreenButtons(!!document.fullscreenElement);
  }
});
