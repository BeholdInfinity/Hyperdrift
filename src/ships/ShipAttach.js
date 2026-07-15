/**
 * Attach / swap validation rules for modular ships.
 */

import { getShipClass, normalizeSwapGroup } from './ShipClasses.js';
import { getSection } from './SectionCatalog.js';
import { getItem } from './ItemCatalog.js';

/**
 * @param {string} shipClassId
 * @param {import('./SectionCatalog.js').SectionDef} section
 */
export function canAttachSection(shipClassId, section) {
  const cls = getShipClass(shipClassId);
  if (!cls || !section) return { ok: false, reason: 'missing' };
  if (cls.prebuiltOnly) {
    return { ok: false, reason: 'prebuilt_only' };
  }
  if (normalizeSwapGroup(section.swapGroup) !== normalizeSwapGroup(cls.swapGroup)) {
    return { ok: false, reason: 'swap_group_mismatch' };
  }
  if (!cls.sectionRoles.includes(section.role)) {
    return { ok: false, reason: 'role_mismatch' };
  }
  return { ok: true };
}

/**
 * @param {string} shipClassId
 * @param {import('./SectionCatalog.js').HardpointSocket} socket
 * @param {import('./ItemCatalog.js').ItemDef} item
 */
export function canAttachItem(shipClassId, socket, item) {
  const cls = getShipClass(shipClassId);
  if (!cls || !socket || !item) return { ok: false, reason: 'missing' };
  if (cls.prebuiltOnly) {
    return { ok: false, reason: 'prebuilt_only' };
  }
  if (normalizeSwapGroup(item.swapGroup) !== normalizeSwapGroup(cls.swapGroup)) {
    return { ok: false, reason: 'swap_group_mismatch' };
  }
  if (item.category !== socket.category) {
    return { ok: false, reason: 'category_mismatch' };
  }
  if (item.mk > socket.mk) {
    return { ok: false, reason: 'item_mk_exceeds_socket' };
  }
  return { ok: true };
}

/**
 * Theme / colorway / Mk may mix freely for the player.
 * Random gen uses separate probability helpers in ShipGenerator.
 */
export function cosmeticsAllowed() {
  return true;
}
