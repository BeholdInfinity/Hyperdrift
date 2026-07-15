/**
 * Bridge between hangar upgrade freight and modular ItemCatalog / ShipDefinition.
 */

import { getItem, listItems } from './ItemCatalog.js';
import { getShipClass, normalizeSwapGroup } from './ShipClasses.js';
import { VARIANTS, THEME_IDS } from './Themes.js';

/** Freight presentation for catalog categories (pile / carry draw). */
export const CATEGORY_FREIGHT = {
  maneuverThruster: {
    label: 'THRUSTER',
    shape: 'thruster',
    w: 8,
    h: 12,
    color: '#5a8aaa',
    hp: 38,
  },
  mainEngine: {
    label: 'ENGINE',
    shape: 'engine',
    w: 11,
    h: 12,
    color: '#c87840',
    hp: 55,
  },
  forwardLaser: {
    label: 'LASER',
    shape: 'laser',
    w: 14,
    h: 7,
    color: '#50a0c8',
    hp: 40,
  },
  forwardGun: {
    label: 'GUN',
    shape: 'laser',
    w: 12,
    h: 7,
    color: '#70a0b8',
    hp: 36,
  },
  smallTurret: {
    label: 'TURRET',
    shape: 'turret',
    w: 11,
    h: 10,
    color: '#708898',
    hp: 45,
  },
  cannonTurret: {
    label: 'CANNON',
    shape: 'turret',
    w: 12,
    h: 11,
    color: '#607080',
    hp: 50,
  },
  scienceArray: {
    label: 'SENSOR',
    shape: 'sensor',
    w: 10,
    h: 9,
    color: '#60b090',
    hp: 32,
  },
};

const LABEL_TO_CATEGORY = {
  THRUSTER: 'maneuverThruster',
  ENGINE: 'mainEngine',
  LASER: 'forwardLaser',
  GUN: 'forwardGun',
  TURRET: 'smallTurret',
  CANNON: 'cannonTurret',
  SENSOR: 'scienceArray',
  ARMOR: null, // not a hardpoint item yet
};

export function categoryFromFreightLabel(label) {
  return LABEL_TO_CATEGORY[label] || null;
}

export function freightMetaForCategory(category) {
  return CATEGORY_FREIGHT[category] || CATEGORY_FREIGHT.smallTurret;
}

/**
 * Build hangar cargo object fields from a catalog item id.
 * Caller still assigns id via makeCargo-style seq.
 */
export function upgradeKindFromItemId(itemId) {
  const item = getItem(itemId);
  if (!item) return null;
  const meta = freightMetaForCategory(item.category);
  return {
    label: meta.label,
    family: 'upgrade',
    shape: meta.shape,
    w: meta.w,
    h: meta.h,
    color: meta.color,
    hp: meta.hp,
    catalogItemId: item.id,
    catalogCategory: item.category,
    catalogMk: item.mk,
    catalogTheme: item.theme,
    catalogVariant: item.variant,
  };
}

/** Compact service-board labels for hardpoint keys. */
export const HARDPOINT_BOARD_LABELS = {
  mainEngine: 'Eng',
  miningLaser: 'Laser',
  dorsalTurret: 'Turret',
  nosePort: 'nPort',
  noseStarboard: 'nStbd',
  aftPort: 'aPort',
  aftStarboard: 'aStbd',
  portFore: 'pFore',
  portAft: 'pAft',
  starboardFore: 'sFore',
  starboardAft: 'sAft',
};

export function hardpointBoardLabel(key) {
  if (!key) return 'HP';
  return HARDPOINT_BOARD_LABELS[key] || String(key).slice(0, 8);
}

/** Pick a random catalog item for a ship's swap group + category. */
export function pickCatalogItemId(swapGroup, category, opts = {}) {
  const theme = opts.theme || THEME_IDS[(Math.random() * THEME_IDS.length) | 0];
  const mk = opts.mk ?? 1 + ((Math.random() * 4) | 0);
  const variant = opts.variant || VARIANTS[(Math.random() * VARIANTS.length) | 0];
  let list = listItems({ category, swapGroup, theme, mk, variant });
  if (!list.length) list = listItems({ category, swapGroup, mk });
  if (!list.length) list = listItems({ category, swapGroup });
  if (opts.playerEquipable != null) {
    list = list.filter((i) => i.playerEquipable === opts.playerEquipable);
  }
  if (opts.excludeItemId) {
    const filtered = list.filter((i) => i.id !== opts.excludeItemId);
    if (filtered.length) list = filtered;
  }
  if (!list.length) return null;
  return list[(Math.random() * list.length) | 0].id;
}

/** Ambient forklift upgrade freight — player-equipable catalog only. */
export function pickAmbientCatalogUpgradeId(swapGroup = 'standard') {
  const list = listItems({ swapGroup, playerEquipable: true });
  if (!list.length) return null;
  return list[(Math.random() * list.length) | 0].id;
}

/** Catalog item that fits a specific socket (Mk / category / swap group). */
export function pickCatalogItemForSocket(shipDef, socket, opts = {}) {
  if (!shipDef || !socket) return null;
  const swapGroup = shipDefSwapGroup(shipDef) || 'standard';
  const maxMk = socket.mk || 2;
  const mk = Math.min(opts.mk ?? 1 + ((Math.random() * maxMk) | 0), maxMk);
  return pickCatalogItemId(swapGroup, socket.category, {
    mk,
    excludeItemId: opts.excludeItemId,
    playerEquipable: true,
  });
}

/**
 * Roll one Install request: exact hardpoint + matching catalog item.
 * @returns {{ hardpointKey, catalogItemId, catalogCategory, kindLabel, boardLabel } | null}
 */
export function pickUpgradeInstallRequest(shipDef, opts = {}) {
  if (!shipDef) return null;
  const exclude = new Set(opts.excludeKeys || []);
  const mounts = shipDef.resolveMounts();
  const hps = Object.entries(mounts)
    .filter(([key]) => !exclude.has(key))
    .map(([key, m]) => ({ key, socket: m.socket, item: m.item }));
  if (!hps.length) return null;

  const preferred = hps.filter((h) =>
    [
      'mainEngine',
      'forwardLaser',
      'smallTurret',
      'cannonTurret',
      'scienceArray',
      'maneuverThruster',
    ].includes(h.socket.category)
  );
  const pool = preferred.length ? preferred : hps;
  const hp = pool[(Math.random() * pool.length) | 0];
  const itemId = pickCatalogItemForSocket(shipDef, hp.socket, {
    excludeItemId: hp.item?.id,
  });
  if (!itemId) return null;
  const kind = upgradeKindFromItemId(itemId);
  if (!kind) return null;
  return {
    hardpointKey: hp.key,
    catalogItemId: itemId,
    catalogCategory: hp.socket.category,
    kindLabel: kind.label,
    boardLabel: hardpointBoardLabel(hp.key),
  };
}

/** True if this hardpoint currently has an equipped item. */
export function socketNeedsStrip(shipDef, hardpointKey) {
  if (!shipDef || !hardpointKey) return false;
  return !!shipDef.resolveMounts()[hardpointKey]?.item;
}

export function shipDefSwapGroup(shipDef) {
  const raw =
    shipDef?.swapGroup || getShipClass(shipDef?.classId)?.swapGroup || 'standard';
  return normalizeSwapGroup(raw);
}

/** Occupied hardpoint keys (have an equipped item). */
export function equippedKeys(shipDef) {
  if (!shipDef) return [];
  const mounts = shipDef.resolveMounts();
  return Object.keys(mounts).filter((k) => mounts[k].item);
}

/** Empty sockets matching category. */
export function emptySocketsForCategory(shipDef, category) {
  if (!shipDef || !category) return [];
  const mounts = shipDef.resolveMounts();
  return Object.entries(mounts)
    .filter(([, m]) => m.socket.category === category && !m.item)
    .map(([key, m]) => ({ key, socket: m.socket }));
}

/** Equipped sockets matching category. */
export function equippedSocketsForCategory(shipDef, category) {
  if (!shipDef || !category) return [];
  const mounts = shipDef.resolveMounts();
  return Object.entries(mounts)
    .filter(([, m]) => m.socket.category === category && m.item)
    .map(([key, m]) => ({ key, socket: m.socket, item: m.item }));
}

/**
 * Unequip a hardpoint. Returns removed item id or null.
 */
export function unequipHardpoint(shipDef, key) {
  if (!shipDef?.equipment || !key) return null;
  const id = shipDef.equipment[key];
  if (!id) return null;
  delete shipDef.equipment[key];
  shipDef.invalidateMounts?.();
  return id;
}

/**
 * Equip item onto hardpoint if empty and category/mk compatible.
 */
export function equipHardpoint(shipDef, key, itemId) {
  if (!shipDef || !key || !itemId) return { ok: false, reason: 'missing' };
  const item = getItem(itemId);
  if (!item) return { ok: false, reason: 'unknown_item' };
  const mounts = shipDef.resolveMounts();
  const m = mounts[key];
  if (!m) return { ok: false, reason: 'no_socket' };
  if (m.item) return { ok: false, reason: 'occupied' };
  if (m.socket.category !== item.category) {
    return { ok: false, reason: 'category_mismatch' };
  }
  if (item.mk > m.socket.mk) return { ok: false, reason: 'mk_too_high' };
  if (item.swapGroup !== shipDefSwapGroup(shipDef)) {
    return { ok: false, reason: 'swap_group_mismatch' };
  }
  shipDef.equipment[key] = itemId;
  shipDef.invalidateMounts?.();
  return { ok: true };
}

/**
 * Pick which equipped part to strip.
 * Prefer an exact hardpoint key; else only matching category.
 */
export function pickStripKey(shipDef, category, preferKey = null) {
  if (!shipDef) return null;
  if (preferKey) {
    return socketNeedsStrip(shipDef, preferKey) ? preferKey : null;
  }
  if (!category) return null;
  const same = equippedSocketsForCategory(shipDef, category);
  if (!same.length) return null;
  return same[(Math.random() * same.length) | 0].key;
}

/**
 * True if install of this category needs a strip first.
 * False if the ship has no sockets of that category (don't strip forever).
 * Prefer `needsStripBeforeInstallKey` when the target hardpoint is known.
 */
export function needsStripBeforeInstall(shipDef, category) {
  if (!shipDef || !category) return false;
  const mounts = shipDef.resolveMounts();
  const hasSocket = Object.values(mounts).some(
    (m) => m.socket.category === category
  );
  if (!hasSocket) return false;
  return emptySocketsForCategory(shipDef, category).length === 0;
}

/** True if the named hardpoint must be cleared before install. */
export function needsStripBeforeInstallKey(shipDef, hardpointKey) {
  return socketNeedsStrip(shipDef, hardpointKey);
}

/** Categories that have hardpoint sockets on this ship. */
export function categoriesOnShip(shipDef) {
  if (!shipDef) return [];
  const set = new Set();
  for (const m of Object.values(shipDef.resolveMounts())) {
    if (m.socket?.category) set.add(m.socket.category);
  }
  return [...set];
}

/** Max socket Mk for a category on this ship (0 if none). */
export function maxSocketMkForCategory(shipDef, category) {
  if (!shipDef || !category) return 0;
  let max = 0;
  for (const m of Object.values(shipDef.resolveMounts())) {
    if (m.socket.category === category) {
      max = Math.max(max, m.socket.mk || 1);
    }
  }
  return max;
}
