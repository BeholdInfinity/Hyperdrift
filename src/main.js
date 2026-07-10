import { GameEngine } from './core/GameEngine.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');
const cornerUi = document.getElementById('corner-ui');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const pauseFullscreenBtn = document.getElementById('pause-fullscreen-btn');

const engine = new GameEngine(canvas);
engine.startTitle();

function startGame() {
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  pauseMenu.classList.add('hidden');
  if (cornerUi) cornerUi.classList.remove('hidden');

  engine.beginPlay();
}

startBtn.addEventListener('click', startGame);

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
