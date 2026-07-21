import { PHYSICS } from '../core/Constants.js';

const BURST_KEYS = ['q', 'w', 'e', 'a', 's', 'd'];
/** Discrete edge-triggered keys: registered once per press, consumed by name. */
const TAP_KEYS = ['r', 'v'];

export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    /** Edge-triggered key taps awaiting consumption (see TAP_KEYS). */
    this._taps = new Set();
    this.mouseDown = false;
    this.mouseRightDown = false;
    this.mouseScreen = { x: 0, y: 0 };
    this.isFullscreen = false;
    this.enabled = false;
    this.paused = false;
    this.zoomDelta = 0;
    this.pauseToggle = false;
    this.capsLockDesired = false;
    /** Hangar: LMB drag pans the camera (fire still uses LMB when a ship is selected). */
    this.hangarPanEnabled = false;
    this._pan = {
      tracking: false,
      dragged: false,
      lastX: 0,
      lastY: 0,
      dx: 0,
      dy: 0,
    };
    /** Hangar: true after LMB up without a pan drag (consumed via consumeClick). */
    this._clickPending = false;
    /** Space cockpit: last LMB-up screen point (consumed via consumeClickPos). */
    this._clickPos = null;
    /** Space cockpit: last RMB-up screen point (consumed via consumeRightClickPos). */
    this._rightClickPos = null;

    this._burst = Object.fromEntries(
      BURST_KEYS.map((k) => [k, { lastPress: -Infinity, armed: false }])
    );

    this._blockedKeys = new Set(['Tab', 'F5', 'F11', 'F12']);
    this._onFullscreenChange = this._handleFullscreenChange.bind(this);
    this._bindEvents();
  }

  _bindEvents() {
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    // Capture phase so Alt+letter browser menu chords are stopped early
    window.addEventListener('keydown', this._onKeyDown, true);
    window.addEventListener('keyup', this._onKeyUp, true);
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
    window.addEventListener('focus', () => this._syncCapsLock());

    window.addEventListener('blur', () => {
      this.keys.clear();
      this._taps.clear();
      this.mouseDown = false;
      this.mouseRightDown = false;
      this._resetPan();
      this._clearBurstArms();
    });
  }

  enable() {
    this.enabled = true;
    this._syncCapsLock();
  }

  disable() {
    this.enabled = false;
    this.paused = false;
    this.keys.clear();
    this.mouseDown = false;
    this.mouseRightDown = false;
    this.zoomDelta = 0;
    this.pauseToggle = false;
    this.hangarPanEnabled = false;
    this._clickPos = null;
    this._taps.clear();
    this._resetPan();
    this._clearBurstArms();
  }

  _resetPan() {
    this._pan.tracking = false;
    this._pan.dragged = false;
    this._pan.dx = 0;
    this._pan.dy = 0;
    this._clickPending = false;
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

  /** Flight letters by key or code (Ctrl chords can make e.key unreliable). */
  _flightLetterKey(e) {
    const key = e.key.toLowerCase();
    if (BURST_KEYS.includes(key)) return key;
    if (key === ' ' || key === 'spacebar') return ' ';
    const fromCode = {
      KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyA: 'a', KeyS: 's', KeyD: 'd', Space: ' ',
    };
    return fromCode[e.code] || null;
  }

  _blockBrowserChord(e) {
    if (!this.enabled || this.paused) return false;
    if (!(e.ctrlKey || e.altKey || e.metaKey)) return false;
    if (!this._flightLetterKey(e)) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  _onKeyDown(e) {
    if (!this.enabled) return;

    this._syncCapsLock(e);

    const key = e.key.toLowerCase();
    const flightKey = this._flightLetterKey(e);

    if (key === 'escape') {
      e.preventDefault();
      this.pauseToggle = true;
      return;
    }

    if (this.paused) return;

    // Alt alone can focus the browser menu bar — swallow while playing
    if (key === 'alt') {
      e.preventDefault();
    }

    // Must run in capture (see _bindEvents) — Alt+letter menu chords, etc.
    this._blockBrowserChord(e);

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

    const trackKey = flightKey || key;
    if (BURST_KEYS.includes(trackKey) && !e.repeat) {
      const now = performance.now() / 1000;
      const state = this._burst[trackKey];
      if (now - state.lastPress <= PHYSICS.DOUBLE_TAP_WINDOW) {
        state.armed = true;
      }
      state.lastPress = now;
    }

    if (!e.repeat && TAP_KEYS.includes(key)) this._taps.add(key);

    this.keys.add(trackKey);
  }

  _onKeyUp(e) {
    this._syncCapsLock(e);
    const flightKey = this._flightLetterKey(e);
    const key = flightKey || e.key.toLowerCase();
    if (key === 'alt') {
      e.preventDefault();
    }
    if (BURST_KEYS.includes(key)) {
      this._burst[key].armed = false;
    }
    this.keys.delete(key);
  }

  _onMouseDown(e) {
    if (!this.enabled || this.paused) return;
    if (e.button === 0) {
      this.mouseDown = true;
      if (this.hangarPanEnabled) {
        this._pan.tracking = true;
        this._pan.dragged = false;
        this._pan.lastX = e.clientX;
        this._pan.lastY = e.clientY;
      }
    }
    if (e.button === 2) this.mouseRightDown = true;
  }

  _onMouseUp(e) {
    if (e.button === 0) {
      if (this.hangarPanEnabled && !this._pan.dragged) {
        this._clickPending = true;
      }
      if (this.enabled && !this.paused && !this._pan.dragged) {
    this._clickPos = { x: e.clientX, y: e.clientY, shiftKey: e.shiftKey };
      }
      this.mouseDown = false;
      this._pan.tracking = false;
    }
    if (e.button === 2) this.mouseRightDown = false;
    if (e.button === 2 && this.enabled && !this.paused) {
      this._rightClickPos = { x: e.clientX, y: e.clientY };
    }
  }

  _onMouseMove(e) {
    this.mouseScreen.x = e.clientX;
    this.mouseScreen.y = e.clientY;
    if (this._pan.tracking && this.hangarPanEnabled) {
      const dx = e.clientX - this._pan.lastX;
      const dy = e.clientY - this._pan.lastY;
      this._pan.lastX = e.clientX;
      this._pan.lastY = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        this._pan.dx += dx;
        this._pan.dy += dy;
        if (Math.abs(this._pan.dx) + Math.abs(this._pan.dy) > 6) {
          this._pan.dragged = true;
        }
      }
    }
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

  /** Consume a one-shot key tap (TAP_KEYS), true if pressed since last consume. */
  consumeTap(key) {
    const k = key.toLowerCase();
    const v = this._taps.has(k);
    this._taps.delete(k);
    return v;
  }

  /** Screen-space pan delta since last consume (hangar camera). */
  consumePanDelta() {
    const d = { x: this._pan.dx, y: this._pan.dy };
    this._pan.dx = 0;
    this._pan.dy = 0;
    return d;
  }

  /** Drop an in-progress hangar pan (e.g. layout editor grabbed the pointer). */
  cancelHangarPan() {
    this._pan.tracking = false;
    this._pan.dragged = false;
    this._pan.dx = 0;
    this._pan.dy = 0;
  }

  /** True while an LMB hangar pan drag is past the click threshold. */
  isPanDragging() {
    return !!(this.hangarPanEnabled && this._pan.dragged && this.mouseDown);
  }

  /** Hangar: consume a completed click (mouseup without pan). */
  consumeClick() {
    const v = this._clickPending;
    this._clickPending = false;
    return v;
  }

  /** Space cockpit: consume the last LMB-up screen point (or null). */
  consumeClickPos() {
    const v = this._clickPos;
    this._clickPos = null;
    return v;
  }

  /** Space cockpit: consume the last RMB-up screen point (or null). */
  consumeRightClickPos() {
    const v = this._rightClickPos;
    this._rightClickPos = null;
    return v;
  }

  /** True if the current/last LMB gesture was a pan drag. */
  wasPanDrag() {
    return !!this._pan.dragged;
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
      brake: this.isKeyDown('alt'),
      capsDesired: this.capsLockDesired,
      // Hangar: LMB fires while a ship is selected and also pans on drag.
      // Deselect the ship to stop shooting; GameEngine suppresses fire on ship-click.
      firePrimary: this.mouseDown,
      fireLaser: this.mouseRightDown,
    };
  }

  /** @deprecated use getFlightInput */
  getThrustInput() {
    return this.getFlightInput();
  }
}
