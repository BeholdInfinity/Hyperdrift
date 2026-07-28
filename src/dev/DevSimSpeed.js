/**
 * Shared dev sim-speed toolbar — one markup block, wired once from main.js.
 */

import { Settings } from '../core/Settings.js';

const MIN_SPEED = 0.0625;
const MAX_SPEED = 256;

/** @param {number} speed */
export function formatSimSpeedLabel(speed) {
  if (!(speed > 0)) return '0';
  if (speed === 1) return '1';
  const rounded = Math.round(speed * 1000) / 1000;
  return String(rounded);
}

/** @param {import('../core/GameEngine.js').GameEngine} engine */
export function syncSimSpeedUi(engine, root = document) {
  const toolbar = root.querySelector('.dev-sim-toolbar');
  if (!toolbar || !engine) return;

  const target = engine.getSimSpeedTarget();
  const running = engine.getSimSpeed();
  const input = toolbar.querySelector('.dev-sim-speed-input');
  if (input && document.activeElement !== input) {
    input.value = formatSimSpeedLabel(target);
  }

  toolbar.querySelectorAll('[data-sim-action]').forEach((btn) => {
    const action = btn.dataset.simAction;
    if (action === 'pause') btn.classList.toggle('active', running <= 0);
    else if (action === 'play') btn.classList.toggle('active', running > 0);
    else btn.classList.remove('active');
  });
}

/** @param {import('../core/GameEngine.js').GameEngine} engine */
function applyManualSpeed(engine, raw) {
  const text = String(raw ?? '').trim().replace(/×$/i, '');
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) {
    syncSimSpeedUi(engine);
    return;
  }
  engine.setSimSpeedTarget(n);
  syncSimSpeedUi(engine);
}

/**
 * Wire the dev sim toolbar (idempotent — call once at boot).
 * @param {import('../core/GameEngine.js').GameEngine} engine
 * @param {ParentNode} [root]
 */
export function wireDevSimSpeed(engine, root = document) {
  const toolbar = root.querySelector('.dev-sim-toolbar');
  if (!toolbar || toolbar.dataset.simWired === '1') return;
  toolbar.dataset.simWired = '1';

  toolbar.querySelectorAll('[data-sim-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!Settings.isDevMode()) return;
      switch (btn.dataset.simAction) {
        case 'slow':
          engine.nudgeSimSpeed(0.5);
          break;
        case 'fast':
          engine.nudgeSimSpeed(2);
          break;
        case 'pause':
          engine.pauseSim();
          break;
        case 'play':
          engine.playSim();
          break;
        default:
          break;
      }
      syncSimSpeedUi(engine, root);
    });
  });

  const input = toolbar.querySelector('.dev-sim-speed-input');
  if (input) {
    input.addEventListener('change', () => {
      if (!Settings.isDevMode()) return;
      applyManualSpeed(engine, input.value);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('focus', () => input.select());
  }

  syncSimSpeedUi(engine, root);
}
