/**
 * Ship aesthetics: theme skins, color-ways, finish/wear dial.
 * Themes carry finish profiles (seams, grit, stripes, marks) — not just hexes.
 * Wear is theme-driven — not hangar grit on every hull.
 */

export const THEME_IDS = [
  'industrial',
  'military',
  'police',
  'civPoor',
  'civMid',
  'civUpper',
  'elite',
];

export const VARIANTS = ['a', 'b', 'c'];
export const MK_TIERS = [1, 2, 3, 4, 5];

/**
 * @typedef {{
 *   sheen: number,
 *   gloss: number,
 *   grit: number,
 *   soot: number,
 *   seams: number,
 *   rivets: number,
 *   weld: number,
 *   matte: number,
 *   stripe: 'none'|'hazard'|'military'|'police'|'civ'|'chrome'|'elite'|'racing',
 *   mark: 'none'|'stencil'|'patches'|'badge'|'pinstripe'|'lights',
 * }} ThemeFinish
 *
 * @typedef {{
 *   label: string,
 *   hull: string,
 *   trim: string,
 *   accent: string,
 *   canopy: string,
 *   metal: string,
 *   stripe?: string,
 *   secondary?: string,
 *   glow?: string,
 *   dirt?: string,
 * }} ColorwayDef
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   blurb: string,
 *   wear: number,
 *   finish: ThemeFinish,
 *   colorways: Record<string, ColorwayDef>
 * }} ThemeDef
 */

/** @type {Record<string, ThemeDef>} */
export const THEMES = {
  industrial: {
    id: 'industrial',
    label: 'Industrial',
    blurb: 'Yard steel, hazard tape, weld beads, soot-stained nozzles.',
    wear: 0.85,
    finish: {
      sheen: 0.12,
      gloss: 0.08,
      grit: 0.9,
      soot: 0.75,
      seams: 0.95,
      rivets: 1,
      weld: 0.85,
      matte: 0.55,
      stripe: 'hazard',
      mark: 'stencil',
    },
    colorways: {
      grayOrange: {
        label: 'Gray / Orange',
        hull: '#3a4248',
        trim: '#8a9098',
        accent: '#c87840',
        canopy: '#4a9fd4',
        metal: '#2a3238',
        stripe: '#e09028',
        secondary: '#5a5048',
        glow: '#ffb060',
        dirt: '#2a2018',
      },
      rustSteel: {
        label: 'Rust Steel',
        hull: '#4a3c34',
        trim: '#8a7868',
        accent: '#b05030',
        canopy: '#5a88a8',
        metal: '#322820',
        stripe: '#c86828',
        secondary: '#6a4838',
        glow: '#e08040',
        dirt: '#281810',
      },
      slateAmber: {
        label: 'Slate / Amber',
        hull: '#2e3844',
        trim: '#6a7888',
        accent: '#d0a040',
        canopy: '#48a0c8',
        metal: '#1e2830',
        stripe: '#e0b038',
        secondary: '#3a4858',
        glow: '#f0c860',
        dirt: '#1a1410',
      },
    },
  },
  military: {
    id: 'military',
    label: 'Military',
    blurb: 'Matte IR-suppress, stencil numbers, subdued service bands.',
    wear: 0.45,
    finish: {
      sheen: 0.06,
      gloss: 0.05,
      grit: 0.4,
      soot: 0.35,
      seams: 0.7,
      rivets: 0.55,
      weld: 0.25,
      matte: 0.85,
      stripe: 'military',
      mark: 'stencil',
    },
    colorways: {
      olive: {
        label: 'Olive',
        hull: '#3a4838',
        trim: '#6a7860',
        accent: '#8a9a50',
        canopy: '#3a6860',
        metal: '#2a3228',
        stripe: '#4a5840',
        secondary: '#505848',
        glow: '#90a860',
        dirt: '#1e2418',
      },
      charcoal: {
        label: 'Charcoal',
        hull: '#2a2e32',
        trim: '#5a6068',
        accent: '#4a6a48',
        canopy: '#2a4850',
        metal: '#1a1e22',
        stripe: '#3a4048',
        secondary: '#34383c',
        glow: '#68a060',
        dirt: '#121418',
      },
      desert: {
        label: 'Desert',
        hull: '#5a5040',
        trim: '#8a7860',
        accent: '#a08040',
        canopy: '#406860',
        metal: '#3a3428',
        stripe: '#6a5840',
        secondary: '#706050',
        glow: '#c0a050',
        dirt: '#2a2218',
      },
    },
  },
  police: {
    id: 'police',
    label: 'Police',
    blurb: 'High-vis flanks, authority stripe, chilled canopy glow.',
    wear: 0.35,
    finish: {
      sheen: 0.28,
      gloss: 0.35,
      grit: 0.2,
      soot: 0.15,
      seams: 0.55,
      rivets: 0.35,
      weld: 0.1,
      matte: 0.25,
      stripe: 'police',
      mark: 'lights',
    },
    colorways: {
      blackWhite: {
        label: 'Black / White',
        hull: '#1e242c',
        trim: '#d0d4d8',
        accent: '#3060c0',
        canopy: '#4080c8',
        metal: '#14181e',
        stripe: '#f0f4f8',
        secondary: '#203050',
        glow: '#60a0ff',
        dirt: '#101418',
      },
      navyGold: {
        label: 'Navy / Gold',
        hull: '#1a2840',
        trim: '#c0a848',
        accent: '#4068c0',
        canopy: '#3888c0',
        metal: '#101828',
        stripe: '#d8c060',
        secondary: '#243860',
        glow: '#70b0ff',
        dirt: '#0c1420',
      },
      slateBlue: {
        label: 'Slate Blue',
        hull: '#2a3848',
        trim: '#7890a8',
        accent: '#5090d0',
        canopy: '#50a0d8',
        metal: '#1a2430',
        stripe: '#a0c0e0',
        secondary: '#304860',
        glow: '#80c8ff',
        dirt: '#141c28',
      },
    },
  },
  civPoor: {
    id: 'civPoor',
    label: 'Civilian Poor',
    blurb: 'Mismatched plates, tape patches, sun-bleached paint.',
    wear: 0.95,
    finish: {
      sheen: 0.05,
      gloss: 0.04,
      grit: 1,
      soot: 0.65,
      seams: 0.8,
      rivets: 0.7,
      weld: 0.55,
      matte: 0.7,
      stripe: 'none',
      mark: 'patches',
    },
    colorways: {
      patched: {
        label: 'Patched',
        hull: '#4a4440',
        trim: '#7a7068',
        accent: '#a07040',
        canopy: '#5a8898',
        metal: '#322e2a',
        stripe: '#6a5850',
        secondary: '#5a5048',
        glow: '#c09050',
        dirt: '#2a221c',
      },
      fadedBlue: {
        label: 'Faded Blue',
        hull: '#3a4850',
        trim: '#688088',
        accent: '#7090a0',
        canopy: '#60a0b0',
        metal: '#283038',
        stripe: '#4a6870',
        secondary: '#486068',
        glow: '#80b0c0',
        dirt: '#1c2428',
      },
      scrapGreen: {
        label: 'Scrap Green',
        hull: '#3e4840',
        trim: '#708070',
        accent: '#908050',
        canopy: '#508898',
        metal: '#2a322c',
        stripe: '#586850',
        secondary: '#485848',
        glow: '#a0b070',
        dirt: '#1c2018',
      },
    },
  },
  civMid: {
    id: 'civMid',
    label: 'Civilian Middle',
    blurb: 'Station working paint — honest wear, company trim stripe.',
    /** Player starter: industrial space-worn working ship */
    wear: 0.7,
    finish: {
      sheen: 0.18,
      gloss: 0.2,
      grit: 0.55,
      soot: 0.4,
      seams: 0.75,
      rivets: 0.65,
      weld: 0.35,
      matte: 0.35,
      stripe: 'civ',
      mark: 'badge',
    },
    colorways: {
      stationBlue: {
        label: 'Station Blue',
        hull: '#1e2d3d',
        trim: '#5a8ab0',
        accent: '#c47840',
        canopy: '#4a9fd4',
        metal: '#1a2834',
        stripe: '#3a6a90',
        secondary: '#2a4050',
        glow: '#70c0e8',
        dirt: '#121820',
      },
      tealGray: {
        label: 'Teal Gray',
        hull: '#243840',
        trim: '#5a9098',
        accent: '#d08050',
        canopy: '#48b0c8',
        metal: '#1a2830',
        stripe: '#3a7880',
        secondary: '#2a4850',
        glow: '#60d0e0',
        dirt: '#141c20',
      },
      steelCyan: {
        label: 'Steel Cyan',
        hull: '#2a3844',
        trim: '#68a0b8',
        accent: '#e09050',
        canopy: '#50b0d8',
        metal: '#1e2a34',
        stripe: '#4888a8',
        secondary: '#304858',
        glow: '#70d8f0',
        dirt: '#161e28',
      },
    },
  },
  civUpper: {
    id: 'civUpper',
    label: 'Civilian Upper',
    blurb: 'Polished flanks, chrome pin-stripe, soft canopy bloom.',
    wear: 0.2,
    finish: {
      sheen: 0.55,
      gloss: 0.65,
      grit: 0.08,
      soot: 0.05,
      seams: 0.35,
      rivets: 0.15,
      weld: 0,
      matte: 0.1,
      stripe: 'chrome',
      mark: 'pinstripe',
    },
    colorways: {
      pearl: {
        label: 'Pearl',
        hull: '#6a7078',
        trim: '#c0c8d0',
        accent: '#80b0d0',
        canopy: '#70c8e8',
        metal: '#4a5058',
        stripe: '#e8f0f8',
        secondary: '#8890a0',
        glow: '#a0e0ff',
        dirt: '#3a4048',
      },
      champagne: {
        label: 'Champagne',
        hull: '#6a6050',
        trim: '#c0b090',
        accent: '#d0a860',
        canopy: '#68b0c8',
        metal: '#4a4438',
        stripe: '#e8d8b0',
        secondary: '#887868',
        glow: '#f0d080',
        dirt: '#3a3428',
      },
      arcticSilver: {
        label: 'Arctic Silver',
        hull: '#5a6870',
        trim: '#b8c8d0',
        accent: '#70a8c8',
        canopy: '#78d0e8',
        metal: '#3a4850',
        stripe: '#d8e8f0',
        secondary: '#708088',
        glow: '#90e0ff',
        dirt: '#2a3438',
      },
    },
  },
  elite: {
    id: 'elite',
    label: 'Elite',
    blurb: 'Mirror edges, razor accent line, almost no wear.',
    wear: 0.05,
    finish: {
      sheen: 0.85,
      gloss: 0.9,
      grit: 0,
      soot: 0,
      seams: 0.2,
      rivets: 0.05,
      weld: 0,
      matte: 0,
      stripe: 'elite',
      mark: 'pinstripe',
    },
    colorways: {
      obsidian: {
        label: 'Obsidian',
        hull: '#14181e',
        trim: '#a0a8b0',
        accent: '#60c0e0',
        canopy: '#40d0f0',
        metal: '#0a0e12',
        stripe: '#70d8f0',
        secondary: '#242830',
        glow: '#80f0ff',
        dirt: '#080a0e',
      },
      whiteGold: {
        label: 'White / Gold',
        hull: '#c8ccd0',
        trim: '#e8eef2',
        accent: '#d0b050',
        canopy: '#60c8e8',
        metal: '#909498',
        stripe: '#f0d878',
        secondary: '#d0d4d8',
        glow: '#ffe090',
        dirt: '#707478',
      },
      voidPurple: {
        label: 'Void',
        hull: '#1a1424',
        trim: '#8870a8',
        accent: '#c060e0',
        canopy: '#8050c8',
        metal: '#100e18',
        stripe: '#d070f0',
        secondary: '#2a2038',
        glow: '#e090ff',
        dirt: '#0c0a12',
      },
    },
  },
};

/** Player starter palette (matches current Renderer hull). */
export const STARTER_THEME = 'civMid';
export const STARTER_COLORWAY = 'stationBlue';

export function getTheme(id) {
  return THEMES[id] ?? null;
}

export function getColorway(themeId, colorwayId) {
  const t = THEMES[themeId];
  return t?.colorways?.[colorwayId] ?? null;
}

export function listColorwayIds(themeId) {
  const t = THEMES[themeId];
  return t ? Object.keys(t.colorways) : [];
}

export function getThemeFinish(themeId) {
  return THEMES[themeId]?.finish ?? null;
}

/**
 * Effective wear: theme baseline, nudged by Mk (higher Mk = slightly cleaner within theme).
 * Elite Mk1 still cleaner than Industrial Mk4.
 */
export function effectiveWear(themeId, mk = 2) {
  const t = THEMES[themeId];
  if (!t) return 0.5;
  const mkClean = ((mk - 1) / Math.max(1, MK_TIERS.length - 1)) * 0.18;
  return Math.max(0, Math.min(1, t.wear - mkClean));
}

/**
 * Resolved palette packet for drawing (colors + finish + wear).
 * @param {string} themeId
 * @param {string} colorwayId
 * @param {number} [mk]
 */
export function resolvePalette(themeId, colorwayId, mk = 2) {
  const theme = THEMES[themeId] || THEMES.civMid;
  const colors =
    theme.colorways[colorwayId] ||
    theme.colorways[Object.keys(theme.colorways)[0]];
  return {
    theme: theme.id,
    colorway: colorwayId,
    colors,
    wear: effectiveWear(theme.id, mk),
    finish: { ...theme.finish },
    blurb: theme.blurb,
  };
}

/** Parse #rgb / #rrggbb to {r,g,b}. */
export function parseHexColor(hex) {
  const n = String(hex || '').replace('#', '');
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 100, g: 180, b: 255 };
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

export function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = parseHexColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
