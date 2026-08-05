/**
 * Prototype settings (localStorage). DevMode defaults ON until we ship a real toggle culture.
 */

const STORAGE_KEY = 'hyperdrift.settings';

const DEFAULTS = {
  /** Dev tools: hangar service reroll, sim speed, Blueprint sandbox. Default on for now. */
  devMode: true,
  /** Frame-rate readout (top-right during play). */
  showFps: true,
  /** Live ship sandbox beside Controls tab in Settings. */
  controlsSandbox: true,
  /** Contact occlusion (LOS visibility gates, viewport umbra, SCAN wedges). */
  occlusion: false,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

let _state = load();

export const Settings = {
  getAll() {
    return { ..._state };
  },

  get(key) {
    return _state[key];
  },

  set(key, value) {
    _state = { ..._state, [key]: value };
    save(_state);
    return _state[key];
  },

  isDevMode() {
    return !!_state.devMode;
  },

  setDevMode(on) {
    return this.set('devMode', !!on);
  },

  isShowFps() {
    return _state.showFps !== false;
  },

  setShowFps(on) {
    return this.set('showFps', !!on);
  },

  isControlsSandbox() {
    return _state.controlsSandbox !== false;
  },

  setControlsSandbox(on) {
    return this.set('controlsSandbox', !!on);
  },

  isOcclusion() {
    return !!_state.occlusion;
  },

  setOcclusion(on) {
    return this.set('occlusion', !!on);
  },
};
