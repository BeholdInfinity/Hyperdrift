/**
 * Item catalog — Class-group × category × Theme × Mk × 3 variants (parametric).
 * Starter items are real rows rebuildable in a future Upgrade UI.
 */

import { SWAP_GROUPS, SHIP_CLASSES } from './ShipClasses.js';
import { THEME_IDS, VARIANTS, MK_TIERS } from './Themes.js';

export const ITEM_CATEGORIES = [
  'maneuverThruster',
  'mainEngine',
  'forwardLaser',
  'forwardGun',
  'smallTurret',
  'cannonTurret',
  'scienceArray',
];

/**
 * Which swap groups may equip each category (items are tagged per group).
 * UltraLight prebuilds (drone/scout) use group-tagged items; racers / light fighters are player-equipable.
 */
const CATEGORY_GROUPS = {
  maneuverThruster: [
    SWAP_GROUPS.ultraLight,
    SWAP_GROUPS.light,
    SWAP_GROUPS.standard,
    SWAP_GROUPS.heavy,
  ],
  mainEngine: [
    SWAP_GROUPS.ultraLight,
    SWAP_GROUPS.light,
    SWAP_GROUPS.standard,
    SWAP_GROUPS.heavy,
  ],
  forwardLaser: [
    SWAP_GROUPS.ultraLight,
    SWAP_GROUPS.light,
    SWAP_GROUPS.standard,
    SWAP_GROUPS.heavy,
  ],
  forwardGun: [SWAP_GROUPS.ultraLight, SWAP_GROUPS.light, SWAP_GROUPS.standard],
  smallTurret: [
    SWAP_GROUPS.ultraLight,
    SWAP_GROUPS.light,
    SWAP_GROUPS.standard,
    SWAP_GROUPS.heavy,
  ],
  cannonTurret: [SWAP_GROUPS.standard, SWAP_GROUPS.heavy],
  scienceArray: [SWAP_GROUPS.standard, SWAP_GROUPS.heavy],
};

const ARTICULATION = {
  maneuverThruster: 'static',
  mainEngine: 'static',
  forwardLaser: 'slewArc',
  forwardGun: 'static',
  smallTurret: 'slew360',
  cannonTurret: 'slew360',
  scienceArray: 'static',
};

/**
 * @typedef {{
 *   id: string,
 *   category: string,
 *   swapGroup: string,
 *   theme: string,
 *   mk: number,
 *   variant: string,
 *   articulation: string,
 *   playerEquipable: boolean,
 *   geometryKey: string,
 *   morph: number,
 *   stats: { thrust?: number, dps?: number, mass?: number }
 * }} ItemDef
 */

function itemId(category, swapGroup, theme, mk, variant) {
  return `item.${category}.${swapGroup}.${theme}.mk${mk}.${variant}`;
}

/** @type {Map<string, ItemDef>} */
const ITEM_BY_ID = new Map();

function buildItemMatrix() {
  for (const category of ITEM_CATEGORIES) {
    const groups = CATEGORY_GROUPS[category] || [];
    for (const swapGroup of groups) {
      // Catalog rows are group-tagged; class.playerEquipable / prebuiltOnly gate Upgrade UI
      const playerEquipable = true;
      for (const theme of THEME_IDS) {
        for (const mk of MK_TIERS) {
          for (let vi = 0; vi < VARIANTS.length; vi++) {
            const variant = VARIANTS[vi];
            const id = itemId(category, swapGroup, theme, mk, variant);
            const mkMult = 0.85 + mk * 0.15;
            /** @type {ItemDef} */
            const def = {
              id,
              category,
              swapGroup,
              theme,
              mk,
              variant,
              articulation: ARTICULATION[category] || 'static',
              playerEquipable,
              geometryKey:
                category === 'mainEngine' &&
                swapGroup === 'standard' &&
                theme === 'civMid' &&
                mk === 2 &&
                variant === 'a'
                  ? 'bell.mainEngine'
                  : category === 'maneuverThruster' &&
                      swapGroup === 'standard' &&
                      theme === 'civMid' &&
                      mk === 2 &&
                      variant === 'a'
                    ? 'bell.thruster'
                    : category === 'forwardLaser' &&
                        swapGroup === 'standard' &&
                        theme === 'civMid' &&
                        mk === 2 &&
                        variant === 'a'
                      ? 'bell.miningLaser'
                      : category === 'smallTurret' &&
                          swapGroup === 'standard' &&
                          theme === 'civMid' &&
                          mk === 2 &&
                          variant === 'a'
                        ? 'bell.smallTurret'
                        : `${category}.${swapGroup}.${variant}`,
              morph: (vi - 1) * 0.1,
              stats: {
                thrust:
                  category === 'mainEngine'
                    ? 1 * mkMult
                    : category === 'maneuverThruster'
                      ? 0.35 * mkMult
                      : undefined,
                dps:
                  category === 'forwardLaser'
                    ? 40 * mkMult
                    : category === 'smallTurret'
                      ? 25 * mkMult
                      : category === 'cannonTurret'
                        ? 45 * mkMult
                        : category === 'forwardGun'
                          ? 30 * mkMult
                          : undefined,
                mass: 0.05 * mkMult,
              },
            };
            ITEM_BY_ID.set(id, def);
          }
        }
      }
    }
  }
}

buildItemMatrix();

export function getItem(id) {
  return ITEM_BY_ID.get(id) ?? null;
}

export function listItems(filter = {}) {
  const out = [];
  for (const def of ITEM_BY_ID.values()) {
    if (filter.category && def.category !== filter.category) continue;
    if (filter.swapGroup && def.swapGroup !== filter.swapGroup) continue;
    if (filter.theme && def.theme !== filter.theme) continue;
    if (filter.mk != null && def.mk !== filter.mk) continue;
    if (filter.variant && def.variant !== filter.variant) continue;
    if (filter.playerEquipable != null && def.playerEquipable !== filter.playerEquipable) {
      continue;
    }
    out.push(def);
  }
  return out;
}

export function itemCatalogSize() {
  return ITEM_BY_ID.size;
}

/** Starter bill-of-materials item ids (Standard / civMid / Mk2 / a) */
export const STARTER_ITEMS = {
  mainEngine: 'item.mainEngine.standard.civMid.mk2.a',
  thruster: 'item.maneuverThruster.standard.civMid.mk2.a',
  miningLaser: 'item.forwardLaser.standard.civMid.mk2.a',
  smallTurret: 'item.smallTurret.standard.civMid.mk2.a',
};

/** Map class → its swap group for item lookup */
export function swapGroupForClass(classId) {
  return SHIP_CLASSES[classId]?.swapGroup ?? null;
}
