/**
 * Hangar / place look themes — parallel to ship Themes.js.
 * Default colorway matches today's Jennings paint literals (migrate draw over time).
 */

/**
 * @typedef {{
 *   label: string,
 *   floor: string,
 *   floorAccent: string,
 *   wall: string,
 *   wallTrim: string,
 *   ceiling: string,
 *   pad: string,
 *   padRing: string,
 *   caution: string,
 *   apron: string,
 *   door: string,
 *   doorFrame: string,
 *   boardFace: string,
 *   boardBezel: string,
 *   metal: string,
 *   accent: string,
 *   glow: string,
 *   dirt: string,
 * }} HangarColorway
 *
 * @typedef {{
 *   sheen: number,
 *   gloss: number,
 *   grit: number,
 *   soot: number,
 *   seams: number,
 *   mark: string,
 * }} HangarFinish
 */

/** @type {Record<string, { id: string, label: string, finish: HangarFinish, colorways: Record<string, HangarColorway> }>} */
export const HANGAR_THEMES = {
  stationYard: {
    id: 'stationYard',
    label: 'Station Yard',
    finish: {
      sheen: 0.2,
      gloss: 0.12,
      grit: 0.55,
      soot: 0.4,
      seams: 0.7,
      mark: 'stencil',
    },
    colorways: {
      jenningsBlue: {
        label: 'Jennings Blue',
        floor: '#2a3038',
        floorAccent: '#3a4450',
        wall: '#3a424c',
        wallTrim: '#5a6878',
        ceiling: '#1e242c',
        pad: '#4a5560',
        padRing: '#6a7888',
        caution: '#c9a227',
        apron: '#353c46',
        door: '#4a5868',
        doorFrame: '#2a323c',
        boardFace: '#1a222a',
        boardBezel: '#5a6870',
        metal: '#6a727c',
        accent: '#4a9fd4',
        glow: '#60c0ff',
        dirt: '#2a2018',
      },
    },
  },
  derelictRust: {
    id: 'derelictRust',
    label: 'Derelict Rust',
    finish: {
      sheen: 0.05,
      gloss: 0.02,
      grit: 0.95,
      soot: 0.9,
      seams: 1,
      mark: 'patches',
    },
    colorways: {
      coldDark: {
        label: 'Cold Dark',
        floor: '#1a1816',
        floorAccent: '#2a2420',
        wall: '#2a221c',
        wallTrim: '#4a3830',
        ceiling: '#121010',
        pad: '#3a322c',
        padRing: '#5a4840',
        caution: '#6a5020',
        apron: '#221c18',
        door: '#3a3028',
        doorFrame: '#1a1410',
        boardFace: '#121010',
        boardBezel: '#3a3028',
        metal: '#4a4038',
        accent: '#805030',
        glow: '#402010',
        dirt: '#100c08',
      },
    },
  },
  militaryOlive: {
    id: 'militaryOlive',
    label: 'Military Olive',
    finish: {
      sheen: 0.25,
      gloss: 0.15,
      grit: 0.35,
      soot: 0.25,
      seams: 0.6,
      mark: 'stencil',
    },
    colorways: {
      armorGray: {
        label: 'Armor Gray',
        floor: '#2a3028',
        floorAccent: '#3a4438',
        wall: '#3a4438',
        wallTrim: '#6a7858',
        ceiling: '#1e241c',
        pad: '#4a5448',
        padRing: '#7a8870',
        caution: '#c09020',
        apron: '#32382e',
        door: '#4a5440',
        doorFrame: '#2a3228',
        boardFace: '#1a2018',
        boardBezel: '#5a6848',
        metal: '#6a7060',
        accent: '#80a040',
        glow: '#a0c060',
        dirt: '#201810',
      },
    },
  },
  megaCorp: {
    id: 'megaCorp',
    label: 'MegaCorp',
    finish: {
      sheen: 0.85,
      gloss: 0.75,
      grit: 0.08,
      soot: 0.05,
      seams: 0.25,
      mark: 'badge',
    },
    colorways: {
      chromeWhite: {
        label: 'Chrome White',
        floor: '#e8eef4',
        floorAccent: '#d0d8e0',
        wall: '#f4f8fc',
        wallTrim: '#a0b0c0',
        ceiling: '#dce4ec',
        pad: '#c8d0d8',
        padRing: '#8090a0',
        caution: '#e0a020',
        apron: '#d4dce4',
        door: '#b0bcc8',
        doorFrame: '#607080',
        boardFace: '#101820',
        boardBezel: '#c0c8d0',
        metal: '#90a0b0',
        accent: '#2080e0',
        glow: '#40a0ff',
        dirt: '#c0b8b0',
      },
    },
  },
  backwaterRust: {
    id: 'backwaterRust',
    label: 'Backwater Rust',
    finish: {
      sheen: 0.1,
      gloss: 0.05,
      grit: 0.8,
      soot: 0.65,
      seams: 0.9,
      mark: 'stencil',
    },
    colorways: {
      rustSteel: {
        label: 'Rust Steel',
        floor: '#3a3028',
        floorAccent: '#4a3830',
        wall: '#4a3c34',
        wallTrim: '#8a6850',
        ceiling: '#2a221c',
        pad: '#5a4840',
        padRing: '#8a7060',
        caution: '#c87828',
        apron: '#403830',
        door: '#5a4838',
        doorFrame: '#2a2018',
        boardFace: '#1a1814',
        boardBezel: '#6a5848',
        metal: '#7a6858',
        accent: '#c06030',
        glow: '#e08040',
        dirt: '#281810',
      },
    },
  },
};

export const HANGAR_THEME_IDS = Object.keys(HANGAR_THEMES);

export function getHangarTheme(themeId) {
  return HANGAR_THEMES[themeId] || HANGAR_THEMES.stationYard;
}

export function getHangarColorway(themeId, colorwayId) {
  const t = getHangarTheme(themeId);
  return t.colorways[colorwayId] || Object.values(t.colorways)[0];
}

export function listHangarColorwayIds(themeId) {
  return Object.keys(getHangarTheme(themeId).colorways);
}
