export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseScreen = { x: 0, y: 0 };
    this.isFullscreen = false;
    this.enabled = false;
    this.paused = false;
    this.zoomDelta = 0;

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

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
  }

  enable() {
    this.enabled = true;
  }

  _onKeyDown(e) {
    if (!this.enabled) return;

    const key = e.key.toLowerCase();

    if (key === 'escape') {
      e.preventDefault();
      this.pauseToggle = true;
      return;
    }

    if (this.paused) return;

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

    this.keys.add(key);
  }

  _onKeyUp(e) {
    this.keys.delete(e.key.toLowerCase());
  }

  _onMouseDown(e) {
    if (!this.enabled || this.paused) return;
    if (e.button === 0) {
      this.mouseDown = true;
    }
  }

  _onMouseUp(e) {
    if (e.button === 0) {
      this.mouseDown = false;
    }
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

  getThrustInput() {
    return {
      forward: this.isKeyDown('w'),
      reverse: this.isKeyDown('s'),
      left: this.isKeyDown('a'),
      right: this.isKeyDown('d'),
      mainEngine: this.isKeyDown(' '),
      afterburner: this.isKeyDown('shift'),
      brake: this.isKeyDown('control'),
    };
  }
}
