/**
 * Resolve place/area/feature shells into draw-ready skin entries.
 */

import { inheritShell, resolveElementLook, defaultShell } from './Shell.js';
import {
  getHangarTheme,
  getHangarColorway,
} from './HangarThemes.js';
import { conditionBand, normalizeTechLevel } from './PlaceKinds.js';

const ELEMENT_KEYS = [
  'floor',
  'wall',
  'ceiling',
  'apron',
  'caution',
  'pad',
  'door',
  'elevator',
  'serviceBoard',
  'scanner',
  'crane',
  'forklift',
  'desk',
  'shelf',
  'storage',
  'tool',
  'yard',
  'decor',
  'anchor',
];

/**
 * Scale theme finish by condition (broke → heavy grit; pristine → clean).
 * @param {import('./HangarThemes.js').HangarFinish} finish
 * @param {number} condition
 */
export function effectiveHangarFinish(finish, condition) {
  const c = Math.max(0, Math.min(1, Number(condition) || 0));
  // Low condition → more grit/soot; high → more sheen/gloss
  const dirt = 1 - c;
  return {
    sheen: (finish.sheen ?? 0.2) * (0.25 + 0.75 * c),
    gloss: (finish.gloss ?? 0.12) * (0.2 + 0.8 * c),
    grit: Math.min(1, (finish.grit ?? 0.5) * (0.35 + 0.9 * dirt)),
    soot: Math.min(1, (finish.soot ?? 0.4) * (0.3 + 1.0 * dirt)),
    seams: finish.seams ?? 0.7,
    mark: finish.mark || 'stencil',
    conditionBand: conditionBand(c).id,
  };
}

function skinEntry(look) {
  const theme = getHangarTheme(look.theme);
  const colors = getHangarColorway(look.theme, look.colorway);
  return {
    techLevel: normalizeTechLevel(look.techLevel),
    techRemnant: look.techRemnant || null,
    theme: look.theme,
    colorway: look.colorway,
    condition: look.condition,
    colors,
    finish: effectiveHangarFinish(theme.finish, look.condition),
  };
}

/**
 * @param {import('./Shell.js').ShellDef} [placeShell]
 * @param {import('./Shell.js').ShellDef} [areaShell]
 * @param {import('./Shell.js').ShellDef} [featureShell]
 */
export function resolveSkin(placeShell, areaShell, featureShell) {
  const shell = inheritShell(placeShell, areaShell, featureShell);
  const deckLook = {
    condition: shell.condition,
    techLevel: shell.techLevel,
    techRemnant: null,
    theme: shell.theme,
    colorway: shell.colorway,
  };
  const deck = skinEntry(deckLook);
  /** @type {Record<string, ReturnType<typeof skinEntry>>} */
  const byElement = {};
  for (const key of ELEMENT_KEYS) {
    byElement[key] = skinEntry(resolveElementLook(shell, key));
  }
  // Also resolve any custom element keys present on the shell
  for (const key of Object.keys(shell.elements || {})) {
    if (!byElement[key]) {
      byElement[key] = skinEntry(resolveElementLook(shell, key));
    }
  }
  return { shell, deck, byElement };
}

/**
 * Convenience: skin for a hangar area (no feature) or a bay feature.
 */
export function resolveHangarSkin(place, area, feature = null) {
  return resolveSkin(
    place?.shell || defaultShell(),
    area?.shell || null,
    feature?.shell || null
  );
}

export { ELEMENT_KEYS as HANGAR_SKIN_ELEMENT_KEYS };
