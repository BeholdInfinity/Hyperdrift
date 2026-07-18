/**
 * Look shell: condition, techLevel, theme, colorway, sparse element overrides.
 */

import { normalizeTechLevel } from './PlaceKinds.js';

/** @typedef {{
 *   condition?: number,
 *   techLevel?: string,
 *   theme?: string,
 *   colorway?: string,
 *   elements?: Record<string, {
 *     condition?: number,
 *     conditionNudge?: number,
 *     techLevel?: string,
 *     techRemnant?: string,
 *     theme?: string,
 *     colorway?: string,
 *   }>,
 * }} ShellDef
 */

export function defaultShell(partial = {}) {
  return {
    condition: 0.55,
    techLevel: 'mid',
    theme: 'stationYard',
    colorway: 'jenningsBlue',
    elements: {},
    ...partial,
    elements: { ...(partial.elements || {}) },
  };
}

export function cloneShell(shell) {
  return JSON.parse(JSON.stringify(shell || defaultShell()));
}

/**
 * Merge shells bottom-up: base ← overlay (overlay wins when set).
 * @param {ShellDef} base
 * @param {ShellDef} overlay
 */
export function mergeShells(base, overlay) {
  const a = defaultShell(base || {});
  const b = overlay || {};
  const elements = { ...a.elements };
  if (b.elements) {
    for (const [k, v] of Object.entries(b.elements)) {
      elements[k] = { ...(elements[k] || {}), ...v };
    }
  }
  return {
    condition: b.condition != null ? b.condition : a.condition,
    techLevel: normalizeTechLevel(b.techLevel != null ? b.techLevel : a.techLevel),
    theme: b.theme != null ? b.theme : a.theme,
    colorway: b.colorway != null ? b.colorway : a.colorway,
    elements,
  };
}

/**
 * Resolve place → area → feature shell chain.
 * @param {ShellDef} [placeShell]
 * @param {ShellDef} [areaShell]
 * @param {ShellDef} [featureShell]
 */
export function inheritShell(placeShell, areaShell, featureShell) {
  return mergeShells(mergeShells(placeShell, areaShell), featureShell);
}

/**
 * Effective look for one element key under a resolved shell.
 * @param {ShellDef} shell
 * @param {string} elementKey
 */
export function resolveElementLook(shell, elementKey) {
  const s = defaultShell(shell || {});
  const o = (s.elements && s.elements[elementKey]) || {};
  let condition = o.condition != null ? o.condition : s.condition;
  if (o.conditionNudge != null) {
    condition = Math.max(0, Math.min(1, condition + o.conditionNudge));
  }
  return {
    condition,
    techLevel: normalizeTechLevel(o.techLevel != null ? o.techLevel : s.techLevel),
    techRemnant: o.techRemnant || null,
    theme: o.theme != null ? o.theme : s.theme,
    colorway: o.colorway != null ? o.colorway : s.colorway,
  };
}

/** Feature/module is operational for sim when tech is not broken and condition above broke-down floor. */
export function isOperationalLook(look) {
  if (!look) return false;
  if (look.techLevel === 'broken') return false;
  return (look.condition ?? 0) >= 0.12;
}
