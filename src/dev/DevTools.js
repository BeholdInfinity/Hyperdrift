/**
 * Dev Mode draft state — visual tuning, mount layouts, hangar layout.
 */

import { SHIP } from '../core/Constants.js';
import { VISUAL_TUNING } from '../ships/data/visualTuning.js';
import {
  MOUNT_LAYOUTS,
  BELL_MOUNTS,
  ULTRA_MOUNTS,
} from '../ships/data/mountLayouts.js';
import {
  HANGAR_LAYOUT,
  cloneHangarLayout,
  setHangarLayout,
} from '../world/hangar-layout.js';
import { SAVE_PATHS, saveToRepo, exportToClipboard } from './DevSave.js';

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

function serializeMount(m) {
  const parts = [
    `key: ${JSON.stringify(m.key)}`,
    `category: ${JSON.stringify(m.category)}`,
    `x: ${fmtNum(m.x)}`,
    `y: ${fmtNum(m.y)}`,
    `angle: ${fmtNum(m.angle)}`,
  ];
  if (m.articulation) parts.push(`articulation: ${JSON.stringify(m.articulation)}`);
  if (m.face) parts.push(`face: ${JSON.stringify(m.face)}`);
  return `    {\n      ${parts.join(',\n      ')},\n    }`;
}

export const DevTools = {
  overlay: {
    mounts: false,
    velocity: false,
    axes: false,
  },
  hangarEdit: false,
  hangarLayers: {
    bays: true,
    props: true,
    linger: true,
    gossip: true,
    warn: true,
  },
  dirty: {
    tuning: false,
    mounts: false,
    hangar: false,
  },
  /** @type {null|{ key: string, layout: 'bell'|'ultra', roleOrClass: string }} */
  selectedMount: null,
  /** Hangar editor selection */
  hangarSel: null,
  drawerOpen: false,
  /** Bay Options side panel open */
  bayPanelOpen: false,
  /** Place composer side panel open */
  placePanelOpen: false,
  /** Selected bay indices for Bay Options actions */
  baySel: [true, true, true],
  status: '',

  applyTuning(partial = {}) {
    if (partial.thrusterCupScale != null) {
      VISUAL_TUNING.thrusterCupScale = partial.thrusterCupScale;
      SHIP.THRUSTER_CUP_SCALE = partial.thrusterCupScale;
    }
    if (partial.thrusterPlumeScale != null) {
      VISUAL_TUNING.thrusterPlumeScale = partial.thrusterPlumeScale;
      SHIP.THRUSTER_PLUME_SCALE = partial.thrusterPlumeScale;
    }
    if (partial.genericEngineClassScale != null) {
      VISUAL_TUNING.genericEngineClassScale = partial.genericEngineClassScale;
      SHIP.GENERIC_ENGINE_CLASS_SCALE = partial.genericEngineClassScale;
    }
    this.dirty.tuning = true;
  },

  getTuning() {
    return {
      thrusterCupScale: SHIP.THRUSTER_CUP_SCALE,
      thrusterPlumeScale: SHIP.THRUSTER_PLUME_SCALE,
      genericEngineClassScale: SHIP.GENERIC_ENGINE_CLASS_SCALE ?? 1,
    };
  },

  serializeVisualTuning() {
    const t = this.getTuning();
    return (
      '/**\n' +
      ' * Ship visual tuning — machine-editable via Dev Mode Blueprint Author.\n' +
      ' */\n\n' +
      'export const VISUAL_TUNING = {\n' +
      `  thrusterCupScale: ${fmtNum(t.thrusterCupScale)},\n` +
      `  thrusterPlumeScale: ${fmtNum(t.thrusterPlumeScale)},\n` +
      `  genericEngineClassScale: ${fmtNum(t.genericEngineClassScale)},\n` +
      '};\n'
    );
  },

  serializeMountLayouts() {
    const bellRoles = Object.keys(BELL_MOUNTS);
    let bellBody = '{\n';
    for (const role of bellRoles) {
      bellBody += `  ${JSON.stringify(role)}: [\n`;
      bellBody += BELL_MOUNTS[role].map(serializeMount).join(',\n');
      bellBody += '\n  ],\n';
    }
    bellBody += '}';

    let ultraBody = '{\n';
    for (const id of Object.keys(ULTRA_MOUNTS)) {
      ultraBody += `  ${JSON.stringify(id)}: [\n`;
      ultraBody += ULTRA_MOUNTS[id].map(serializeMount).join(',\n');
      ultraBody += '\n  ],\n';
    }
    ultraBody += '}';

    return (
      '/**\n' +
      ' * Unit-space mount layouts — machine-editable via Dev Mode Blueprint Author.\n' +
      ' */\n\n' +
      '/** @typedef {{ key: string, category: string, x: number, y: number, angle: number, articulation?: string, face?: string }} MountT */\n\n' +
      `export const BELL_MOUNTS = ${bellBody};\n\n` +
      `export const ULTRA_MOUNTS = ${ultraBody};\n\n` +
      'export const MOUNT_LAYOUTS = {\n  bell: BELL_MOUNTS,\n  ultra: ULTRA_MOUNTS,\n};\n\n' +
      'export function ultraMountsFromData(classId) {\n' +
      '  const m = ULTRA_MOUNTS[classId];\n' +
      '  if (m) return m.map((x) => ({ ...x }));\n' +
      '  const engX = -13.5;\n' +
      '  const noseX = 14.2;\n' +
      '  const noseY = 3.6;\n' +
      '  return [\n' +
      "    { key: 'mainEngine', category: 'mainEngine', x: engX, y: 0, angle: Math.PI, face: 'prop' },\n" +
      "    { key: 'nosePort', category: 'maneuverThruster', x: noseX * 0.55, y: -noseY, angle: 0, face: 'prop' },\n" +
      "    { key: 'noseStarboard', category: 'maneuverThruster', x: noseX * 0.55, y: noseY, angle: 0, face: 'prop' },\n" +
      '  ];\n' +
      '}\n'
    );
  },

  serializeHangarLayout() {
    const layout = cloneHangarLayout(HANGAR_LAYOUT);
    if (!Number.isFinite(layout.sidePadX)) layout.sidePadX = 155;
    delete layout.yardProps;
    const json = JSON.stringify(layout, null, 2);
    return (
      '/**\n' +
      ' * Hangar flavor layout — props, linger stands, gossip path-to points.\n' +
      ' * Machine-editable via Dev Mode Hangar Layout Editor.\n' +
      ' * `sidePadX` = B1/B3 pad offset from center (outer bays stay symmetric).\n' +
      ' * Props use one list + `category` (desk/shelf/storage/tool/yard/decor/anchor).\n' +
      ' */\n\n' +
      'export const HANGAR_SIDE_PAD_DEFAULT = 155;\n' +
      'export const HANGAR_SIDE_PAD_MIN = 145;\n' +
      'export const HANGAR_SIDE_PAD_MAX = 240;\n' +
      'export const HANGAR_BAY_UNIT_HALF = 120;\n\n' +
      `export let HANGAR_LAYOUT = ${json};\n\n` +
      '/**\n' +
      ' * Prop catalog themes — one prop class; `category` filters future item browsers.\n' +
      ' * desk / shelf / storage / tool / yard / decor / anchor\n' +
      ' * decor = wall art / posters (engine-drawn, higher-fidelity faces)\n' +
      ' */\n' +
      'export const HANGAR_PROP_CATEGORY_KINDS = {\n' +
      "  desk: ['workbench', 'bayTerminal', 'shiftBoard'],\n" +
      "  shelf: ['partsRack', 'bottleRack', 'suitLocker'],\n" +
      "  storage: ['drumStack', 'pallet', 'breakCrate', 'cableSpool', 'diagCart'],\n" +
      "  tool: ['weldScreen'],\n" +
      "  yard: ['forkCharger', 'forkTireRack', 'forkCones', 'forkCrate'],\n" +
      "  decor: ['wallPoster'],\n" +
      "  anchor: ['computer'],\n" +
      '};\n\n' +
      '/** Flat kind list for the editor palette (excludes linger-only anchors). */\n' +
      'export const HANGAR_PROP_KINDS = Object.entries(HANGAR_PROP_CATEGORY_KINDS)\n' +
      "  .filter(([cat]) => cat !== 'anchor')\n" +
      '  .flatMap(([, kinds]) => kinds);\n\n' +
      '/** @deprecated use HANGAR_PROP_CATEGORY_KINDS.yard */\n' +
      'export const HANGAR_YARD_KINDS = HANGAR_PROP_CATEGORY_KINDS.yard;\n\n' +
      '/** @param {string} kind */\n' +
      'export function categoryForPropKind(kind) {\n' +
      '  for (const [cat, kinds] of Object.entries(HANGAR_PROP_CATEGORY_KINDS)) {\n' +
      '    if (kinds.includes(kind)) return cat;\n' +
      '  }\n' +
      "  return 'storage';\n" +
      '}\n\n' +
      '/**\n' +
      ' * Merge legacy yardProps into props and ensure every prop has a category.\n' +
      ' * @param {typeof HANGAR_LAYOUT} layout\n' +
      ' */\n' +
      'export function normalizeHangarLayout(layout) {\n' +
      '  if (!layout) return layout;\n' +
      '  if (!Array.isArray(layout.props)) layout.props = [];\n' +
      '  if (Array.isArray(layout.yardProps) && layout.yardProps.length) {\n' +
      '    for (const p of layout.yardProps) {\n' +
      '      if (!p.category) p.category = categoryForPropKind(p.kind);\n' +
      '      layout.props.push(p);\n' +
      '    }\n' +
      '  }\n' +
      '  delete layout.yardProps;\n' +
      '  for (const p of layout.props) {\n' +
      '    if (!p.category) p.category = categoryForPropKind(p.kind);\n' +
      '  }\n' +
      '  if (!Number.isFinite(layout.sidePadX)) {\n' +
      '    layout.sidePadX = HANGAR_SIDE_PAD_DEFAULT;\n' +
      '  }\n' +
      '  return layout;\n' +
      '}\n\n' +
      'export function cloneHangarLayout(layout = HANGAR_LAYOUT) {\n' +
      '  return normalizeHangarLayout(JSON.parse(JSON.stringify(layout)));\n' +
      '}\n\n' +
      'export function setHangarLayout(next) {\n' +
      '  HANGAR_LAYOUT = normalizeHangarLayout(next);\n' +
      '}\n\n' +
      'export function getHangarProps() {\n' +
      '  return HANGAR_LAYOUT.props;\n' +
      '}\n\n' +
      '/** @param {string} category */\n' +
      'export function getHangarPropsByCategory(category) {\n' +
      '  return HANGAR_LAYOUT.props.filter((p) => (p.category || categoryForPropKind(p.kind)) === category);\n' +
      '}\n\n' +
      "/** @deprecated use getHangarPropsByCategory('yard') */\n" +
      'export function getYardProps() {\n' +
      "  return getHangarPropsByCategory('yard');\n" +
      '}\n\n' +
      'export function getGossipWaypoints() {\n' +
      '  return HANGAR_LAYOUT.gossip;\n' +
      '}\n\n' +
      'export function getHangarSidePadX(layout = HANGAR_LAYOUT) {\n' +
      '  const v = layout?.sidePadX;\n' +
      '  return Number.isFinite(v) ? v : HANGAR_SIDE_PAD_DEFAULT;\n' +
      '}\n\n' +
      'export function clampHangarSidePadX(value) {\n' +
      '  const n = Math.round(Number(value));\n' +
      '  if (!Number.isFinite(n)) return HANGAR_SIDE_PAD_DEFAULT;\n' +
      '  return Math.max(HANGAR_SIDE_PAD_MIN, Math.min(HANGAR_SIDE_PAD_MAX, n));\n' +
      '}\n\n' +
      'export function isBayUnitProp(prop, bay, sidePadX) {\n' +
      '  if (!prop || prop.bay !== bay) return false;\n' +
      '  if (bay !== 0 && bay !== 2) return false;\n' +
      '  const cx = bay === 0 ? -sidePadX : sidePadX;\n' +
      '  return Math.abs(prop.x - cx) <= HANGAR_BAY_UNIT_HALF;\n' +
      '}\n\n' +
      'export function shiftBayUnitFlavor(layout, oldSide, newSide) {\n' +
      '  const d = Math.round(newSide) - Math.round(oldSide);\n' +
      '  if (!d || !layout?.props) return;\n' +
      '  for (const prop of layout.props) {\n' +
      '    let shift = 0;\n' +
      '    if (isBayUnitProp(prop, 0, oldSide)) shift = -d;\n' +
      '    else if (isBayUnitProp(prop, 2, oldSide)) shift = d;\n' +
      '    if (!shift) continue;\n' +
      '    prop.x = Math.round(prop.x + shift);\n' +
      '    for (const L of prop.linger || []) {\n' +
      '      L.x = Math.round(L.x + shift);\n' +
      '    }\n' +
      '  }\n' +
      '}\n\n' +
      'export function setHangarSidePadX(next, opts = {}) {\n' +
      '  const shiftFlavor = opts.shiftFlavor !== false;\n' +
      '  const old = getHangarSidePadX();\n' +
      '  const clamped = clampHangarSidePadX(next);\n' +
      '  const delta = clamped - old;\n' +
      '  if (delta && shiftFlavor) shiftBayUnitFlavor(HANGAR_LAYOUT, old, clamped);\n' +
      '  HANGAR_LAYOUT.sidePadX = clamped;\n' +
      '  return { old, next: clamped, delta };\n' +
      '}\n\n' +
      'export function resolveLingerBays(stand, prop) {\n' +
      '  if (stand?.bays && Array.isArray(stand.bays) && stand.bays.length) {\n' +
      '    return stand.bays.filter((b) => b === 0 || b === 1 || b === 2);\n' +
      '  }\n' +
      '  if (typeof stand?.bay === "number" && stand.bay >= 0 && stand.bay <= 2) {\n' +
      '    return [stand.bay];\n' +
      '  }\n' +
      '  if (typeof prop?.bay === "number" && prop.bay >= 0 && prop.bay <= 2) {\n' +
      '    return [prop.bay];\n' +
      '  }\n' +
      '  return [0, 1, 2];\n' +
      '}\n\n' +
      'export function lingerAllowsBay(bays, homeBay) {\n' +
      '  return bays.includes(homeBay);\n' +
      '}\n\n' +
      'normalizeHangarLayout(HANGAR_LAYOUT);\n'
    );
  },

  async saveTuning() {
    const r = await saveToRepo(SAVE_PATHS.visualTuning, this.serializeVisualTuning());
    if (r.ok) this.dirty.tuning = false;
    this.status = r.ok ? 'Saved visualTuning.js' : `Save failed: ${r.error}`;
    return r;
  },

  async saveMounts() {
    const r = await saveToRepo(SAVE_PATHS.mountLayouts, this.serializeMountLayouts());
    if (r.ok) this.dirty.mounts = false;
    this.status = r.ok ? 'Saved mountLayouts.js' : `Save failed: ${r.error}`;
    return r;
  },

  async saveHangar() {
    const r = await saveToRepo(SAVE_PATHS.hangarLayout, this.serializeHangarLayout());
    if (r.ok) this.dirty.hangar = false;
    this.status = r.ok ? 'Saved hangar-layout.js' : `Save failed: ${r.error}`;
    return r;
  },

  async exportText(kind) {
    let text = '';
    if (kind === 'tuning') text = this.serializeVisualTuning();
    else if (kind === 'mounts') text = this.serializeMountLayouts();
    else text = this.serializeHangarLayout();
    const ok = await exportToClipboard(text);
    this.status = ok ? `Copied ${kind} to clipboard` : 'Clipboard failed';
    return ok;
  },

  /**
   * Update a unit-space mount pose in bell/ultra data.
   * @param {'bell'|'ultra'} layout
   * @param {string} roleOrClass
   * @param {string} key
   * @param {{ x?: number, y?: number, angle?: number }} patch
   */
  patchMount(layout, roleOrClass, key, patch) {
    const table = layout === 'ultra' ? ULTRA_MOUNTS : BELL_MOUNTS;
    const list = table[roleOrClass];
    if (!list) return false;
    const m = list.find((x) => x.key === key);
    if (!m) return false;
    if (patch.x != null) m.x = patch.x;
    if (patch.y != null) m.y = patch.y;
    if (patch.angle != null) m.angle = patch.angle;
    this.dirty.mounts = true;
    return true;
  },

  getHangarDraft() {
    return HANGAR_LAYOUT;
  },

  replaceHangar(layout) {
    setHangarLayout(layout);
    this.dirty.hangar = true;
  },

  cloneHangar() {
    return cloneHangarLayout();
  },

  markHangarDirty() {
    this.dirty.hangar = true;
  },
};

// Ensure MOUNT_LAYOUTS stays linked
void MOUNT_LAYOUTS;
