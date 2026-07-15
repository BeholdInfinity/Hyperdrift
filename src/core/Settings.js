/**
 * Prototype settings (localStorage). DevMode defaults ON until we ship a real toggle culture.
 */

const STORAGE_KEY = 'hyperdrift.settings';

const DEFAULTS = {
  /** Dev tools: hangar service reroll, sim speed, Blueprint sandbox. Default on for now. */
  devMode: true,
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
};
