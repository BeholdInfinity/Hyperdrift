import { GameEngine } from './core/GameEngine.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const pauseFullscreenBtn = document.getElementById('pause-fullscreen-btn');

let engine = null;

function startGame() {
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  hud.classList.remove('hidden');
  pauseMenu.classList.add('hidden');

  engine = new GameEngine(canvas);
  engine.start();
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
