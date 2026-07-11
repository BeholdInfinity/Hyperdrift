import { PHYSICS } from '../core/Constants.js';

const BURST_KEYS = ['q', 'w', 'e', 'a', 's', 'd'];

export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseRightDown = false;
    this.mouseScreen = { x: 0, y: 0 };
    this.isFullscreen = false;
    this.enabled = false;
    this.paused = false;
    this.zoomDelta = 0;
    this.capsLockDesired = false;

    this._burst = Object.fromEntries(
      BURST_KEYS.map((k) => [k, { lastPress: -Infinity, armed: false }])
    );

    this._blockedKeys = new Set(['Tab', 'F5', 'F11', 'F12']);
    this._onFullscreenChange = this._handleFullscreenChange.bind(this);
    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
    window.addEventListener('focus', () => this._syncCapsLock());

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.mouseRightDown = false;
      this._clearBurstArms();
    });
  }

  enable() {
    this.enabled = true;
    this._syncCapsLock();
  }

  _syncCapsLock(e) {
    try {
      if (e && typeof e.getModifierState === 'function') {
        this.capsLockDesired = e.getModifierState('CapsLock');
        return;
      }
      // No event: leave last known; key handlers keep it fresh
    } catch (_) {
      /* ignore */
    }
  }

  _clearBurstArms() {
    for (const k of BURST_KEYS) {
      this._burst[k].armed = false;
    }
  }

  _onKeyDown(e) {
    if (!this.enabled) return;

    this._syncCapsLock(e);

    const key = e.key.toLowerCase();

    if (key === 'escape') {
      e.preventDefault();
      this.pauseToggle = true;
      return;
    }

    if (this.paused) return;

    // Block browser chords that fight flight keys (Ctrl+E search, Ctrl+W close tab, etc.)
    // Fullscreen gets a wider net; windowed play at least covers QWEASD.
    if (e.ctrlKey || e.altKey || e.metaKey) {
      if (BURST_KEYS.includes(key) || key === ' ') {
        e.preventDefault();
      }
    }

    if (this.isFullscreen) {
      if (this._blockedKeys.has(e.key)) {
        e.preventDefault();
      }
      if (e.ctrlKey || e.altKey || e.metaKey) {
        const allowed = ['r'];
        if (!allowed.includes(key)) {
          e.preventDefault();
        }
      }
    }

    if (BURST_KEYS.includes(key) && !e.repeat) {
      const now = performance.now() / 1000;
      const state = this._burst[key];
      if (now - state.lastPress <= PHYSICS.DOUBLE_TAP_WINDOW) {
        state.armed = true;
      }
      state.lastPress = now;
    }

    this.keys.add(key);
  }

  _onKeyUp(e) {
    this._syncCapsLock(e);
    const key = e.key.toLowerCase();
    if (BURST_KEYS.includes(key)) {
      this._burst[key].armed = false;
    }
    this.keys.delete(key);
  }

  _onMouseDown(e) {
    if (!this.enabled || this.paused) return;
    if (e.button === 0) this.mouseDown = true;
    if (e.button === 2) this.mouseRightDown = true;
  }

  _onMouseUp(e) {
    if (e.button === 0) this.mouseDown = false;
    if (e.button === 2) this.mouseRightDown = false;
  }

  _onMouseMove(e) {
    this.mouseScreen.x = e.clientX;
    this.mouseScreen.y = e.clientY;
  }

  _onWheel(e) {
    if (!this.enabled || this.paused) return;
    e.preventDefault();
    this.zoomDelta += e.deltaY > 0 ? -1 : 1;
  }

  _handleFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
    document.body.classList.toggle('fullscreen-active', this.isFullscreen);
    if (this.onFullscreenChange) {
      this.onFullscreenChange(this.isFullscreen);
    }
  }

  async toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  consumePauseToggle() {
    const v = this.pauseToggle;
    this.pauseToggle = false;
    return v;
  }

  consumeZoomDelta() {
    const v = this.zoomDelta;
    this.zoomDelta = 0;
    return v;
  }

  isKeyDown(key) {
    return this.keys.has(key.toLowerCase());
  }

  _burstHeld(key) {
    return this.isKeyDown(key) && this._burst[key].armed;
  }

  getFlightInput() {
    return {
      forward: this.isKeyDown('w'),
      reverse: this.isKeyDown('s'),
      left: this.isKeyDown('a'),
      right: this.isKeyDown('d'),
      forwardBurst: this._burstHeld('w'),
      reverseBurst: this._burstHeld('s'),
      leftBurst: this._burstHeld('a'),
      rightBurst: this._burstHeld('d'),
      yawLeft: this.isKeyDown('q'),
      yawRight: this.isKeyDown('e'),
      yawLeftBurst: this._burstHeld('q'),
      yawRightBurst: this._burstHeld('e'),
      mainEngine: this.isKeyDown(' '),
      afterburner: this.isKeyDown('shift'),
      brake: this.isKeyDown('control'),
      capsDesired: this.capsLockDesired,
      firePrimary: this.mouseDown,
      fireLaser: this.mouseRightDown,
    };
  }

  /** @deprecated use getFlightInput */
  getThrustInput() {
    return this.getFlightInput();
  }
}
