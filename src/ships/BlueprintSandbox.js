/**
 * Dev blueprint sandbox — Group → Class → Section, then per-section
 * Theme / Color / Mk / Variant.
 */

import {
  SHIP_CLASSES,
  SWAP_GROUP_ORDER,
  getShipClass,
  classesInSwapGroup,
  labelSwapGroup,
  padMkForClass,
  normalizeSwapGroup,
} from './ShipClasses.js';
import {
  THEME_IDS,
  THEMES,
  VARIANTS,
  MK_TIERS,
  STARTER_THEME,
  STARTER_COLORWAY,
  listColorwayIds,
  effectiveWear,
} from './Themes.js';
import { ShipDefinition } from './ShipDefinition.js';
import { getSection, listSections } from './SectionCatalog.js';
import { getItem, listItems } from './ItemCatalog.js';
import { canAttachItem } from './ShipAttach.js';
import {
  createPlayerStarter,
  generateShip,
} from './ShipGenerator.js';
import {
  VIEW_TOP_DOWN,
  VIEW_ANGLED,
  ANGLED_HEADING_COUNT,
  headingIndexFromAngle,
  topDownView,
  angledView,
  labelCompassHeading,
} from './ShipViews.js';

export function cloneShipDef(def) {
  if (!def) return createPlayerStarter();
  return new ShipDefinition({
    classId: def.classId,
    defaultColorway: def.defaultColorway,
    colorwayBySection: { ...(def.colorwayBySection || {}) },
    sectionIds: { ...def.sectionIds },
    equipment: { ...def.equipment },
    seatsOccupied: def.seatsOccupied | 0,
    seatsReserved: def.seatsReserved | 0,
  });
}

export function listBlueprintClassIds(group = null) {
  if (!group) return Object.keys(SHIP_CLASSES);
  return classesInSwapGroup(group).map((c) => c.id);
}

const SECTION_LABELS = {
  bridge: 'Bridge',
  cockpit: 'Cockpit',
  body: 'Body',
  hull: 'Hull',
  aft: 'Aft',
  engine: 'Engine',
};

/**
 * @typedef {{ theme: string, mk: number, variant: string, colorway: string }} SectionSpec
 */

/**
 * Mutable blueprint editor state bound to a Ship entity's shipDef.
 */
export class BlueprintSandbox {
  constructor() {
    this.groupId = 'standard';
    this.classId = 'generalist';
    this.activeSectionRole = 'body';
    /** @type {Record<string, SectionSpec>} */
    this.sectionSpecs = {};
    /** @type {'topDown'|'angled'} */
    this.viewMode = VIEW_TOP_DOWN;
    this.headingIndex = 12;
    this.autoSpin = false;
    this.spinRadPerSec = 0.55;
    /**
     * Hangar-style live input: thruster / engine / weapon anims, no translation.
     * When on, auto-spin is disabled so modes do not fight.
     */
    this.liveControls = false;
    /** Separate sections + items with dotted mate lines */
    this.explodedView = false;
  }

  _defaultSpec() {
    return {
      theme: STARTER_THEME,
      mk: 2,
      variant: 'a',
      colorway: STARTER_COLORWAY,
    };
  }

  _ensureSpec(role) {
    if (!this.sectionSpecs[role]) {
      this.sectionSpecs[role] = this._defaultSpec();
    }
    return this.sectionSpecs[role];
  }

  _activeSpec() {
    this._ensureActiveSection();
    return this._ensureSpec(this.activeSectionRole);
  }

  _roles() {
    return getShipClass(this.classId)?.sectionRoles || ['body'];
  }

  _ensureActiveSection() {
    const roles = this._roles();
    if (!roles.includes(this.activeSectionRole)) {
      this.activeSectionRole = roles[0];
    }
  }

  _ensureClassInGroup() {
    const ids = listBlueprintClassIds(this.groupId);
    if (!ids.includes(this.classId)) {
      this.classId = ids[0] || 'generalist';
    }
  }

  _initSpecsForClass() {
    this.sectionSpecs = {};
    for (const role of this._roles()) {
      this.sectionSpecs[role] = this._defaultSpec();
    }
    const roles = this._roles();
    this.activeSectionRole = roles.includes('body')
      ? 'body'
      : roles.includes('hull')
        ? 'hull'
        : roles[0] || 'body';
  }

  /** Find catalog section row matching class + role + spec. */
  _findSection(role, spec) {
    const s = spec || this._ensureSpec(role);
    let list = listSections({
      classId: this.classId,
      role,
      theme: s.theme,
      mk: s.mk,
      variant: s.variant,
    });
    if (!list.length) {
      list = listSections({
        classId: this.classId,
        role,
        theme: s.theme,
        mk: s.mk,
      });
    }
    if (!list.length) {
      list = listSections({ classId: this.classId, role, theme: s.theme });
    }
    if (!list.length) {
      list = listSections({ classId: this.classId, role });
    }
    return list[0] || null;
  }

  /** Drop / retarget equipment after hardpoints change. */
  _reconcileEquipment(def) {
    if (!def) return;
    def.invalidateMounts();
    const mounts = def.resolveMounts();
    const swap = normalizeSwapGroup(def.swapGroup);
    /** @type {Record<string, string>} */
    const next = {};
    for (const [key, m] of Object.entries(mounts)) {
      const prevId = def.equipment[key];
      const prev = prevId ? getItem(prevId) : null;
      if (
        prev &&
        prev.category === m.socket.category &&
        prev.mk <= m.socket.mk &&
        normalizeSwapGroup(prev.swapGroup) === swap
      ) {
        next[key] = prevId;
        continue;
      }
      const sec = def.section(m.sectionRole);
      const theme = sec?.theme || STARTER_THEME;
      let items = listItems({
        category: m.socket.category,
        swapGroup: swap,
        theme,
        mk: Math.min(m.socket.mk, sec?.mk || m.socket.mk),
        variant: sec?.variant || 'a',
      });
      if (!items.length) {
        items = listItems({
          category: m.socket.category,
          swapGroup: swap,
          mk: m.socket.mk,
        });
      }
      if (items[0]) next[key] = items[0].id;
    }
    def.equipment = next;
    def.invalidateMounts();
  }

  /** Apply all section specs onto a definition (geometry + paint). */
  applySpecsToDef(def) {
    if (!def) return createPlayerStarter();
    for (const role of this._roles()) {
      const spec = this._ensureSpec(role);
      const sec = this._findSection(role, spec);
      if (sec) {
        def.setSection(role, sec.id);
        // Keep spec in sync if catalog fell back
        spec.theme = sec.theme;
        spec.mk = sec.mk;
        spec.variant = sec.variant;
      }
      const cws = listColorwayIds(spec.theme);
      if (!cws.includes(spec.colorway)) {
        spec.colorway = cws[0] || STARTER_COLORWAY;
      }
      def.setColorwayForSection(role, spec.colorway);
    }
    def.defaultColorway =
      this._ensureSpec(this.activeSectionRole).colorway || STARTER_COLORWAY;
    this._reconcileEquipment(def);
    this._ensureActiveSection();
    return def;
  }

  /** Apply one section's theme/mk/variant/color onto a live def. */
  applySectionToDef(def, role) {
    if (!def || !role) return def;
    const spec = this._ensureSpec(role);
    const sec = this._findSection(role, spec);
    if (sec) {
      def.setSection(role, sec.id);
      spec.theme = sec.theme;
      spec.mk = sec.mk;
      spec.variant = sec.variant;
    }
    const cws = listColorwayIds(spec.theme);
    if (!cws.includes(spec.colorway)) {
      spec.colorway = cws[0] || STARTER_COLORWAY;
    }
    def.setColorwayForSection(role, spec.colorway);
    this._reconcileEquipment(def);
    return def;
  }

  /** @deprecated use applySectionToDef */
  applyActiveSectionToDef(def) {
    return this.applySectionToDef(def, this.activeSectionRole);
  }

  /** Sync selectors from an existing definition. */
  syncFromDef(def) {
    if (!def) return;
    this.classId = def.classId || 'generalist';
    const cls = getShipClass(this.classId);
    this.groupId = cls?.swapGroup || 'standard';
    this.sectionSpecs = {};
    const roles =
      typeof def.sectionRoles === 'function'
        ? def.sectionRoles()
        : Object.keys(def.sectionIds || {});
    for (const role of roles) {
      const sec = def.section(role);
      const cw =
        def.colorwayBySection?.[role] ||
        def.defaultColorway ||
        STARTER_COLORWAY;
      this.sectionSpecs[role] = {
        theme: sec?.theme || STARTER_THEME,
        mk: sec?.mk ?? 2,
        variant: sec?.variant || 'a',
        colorway: cw,
      };
    }
    this.activeSectionRole = roles.includes('body')
      ? 'body'
      : roles.includes('hull')
        ? 'hull'
        : roles[0] || 'body';
  }

  resetStarter() {
    this.groupId = 'standard';
    this.classId = 'generalist';
    this._initSpecsForClass();
    // View / camera chrome back to Blueprint defaults
    this.viewMode = VIEW_TOP_DOWN;
    this.headingIndex = 12;
    this.autoSpin = false;
    this.liveControls = false;
    this.explodedView = false;
    const def = createPlayerStarter();
    return this.applySpecsToDef(def);
  }

  rebuild() {
    try {
      // Seed equipment / structure from generator, then stamp per-section specs
      const seed = this._activeSpec();
      const def = generateShip({
        classId: this.classId,
        theme: seed.theme,
        colorway: seed.colorway,
        mk: seed.mk,
        variant: seed.variant,
        allowCosmeticMix: false,
        allowGroupMix: false,
      });
      return this.applySpecsToDef(def);
    } catch {
      return this.resetStarter();
    }
  }

  cycleGroup(dir) {
    const i = Math.max(0, SWAP_GROUP_ORDER.indexOf(this.groupId));
    this.groupId =
      SWAP_GROUP_ORDER[(i + dir + SWAP_GROUP_ORDER.length) % SWAP_GROUP_ORDER.length];
    this._ensureClassInGroup();
    this._initSpecsForClass();
    return this.rebuild();
  }

  cycleClass(dir) {
    const ids = listBlueprintClassIds(this.groupId);
    if (!ids.length) return this.rebuild();
    const i = Math.max(0, ids.indexOf(this.classId));
    this.classId = ids[(i + dir + ids.length) % ids.length];
    this._initSpecsForClass();
    return this.rebuild();
  }

  cycleSection(dir) {
    const roles = this._roles();
    const i = Math.max(0, roles.indexOf(this.activeSectionRole));
    this.activeSectionRole = roles[(i + dir + roles.length) % roles.length];
    return null;
  }

  /** @param {number} dir @param {string} [role] */
  cycleTheme(dir, role) {
    const spec = this._ensureSpec(role || this.activeSectionRole);
    const i = Math.max(0, THEME_IDS.indexOf(spec.theme));
    spec.theme = THEME_IDS[(i + dir + THEME_IDS.length) % THEME_IDS.length];
    const cws = listColorwayIds(spec.theme);
    if (!cws.includes(spec.colorway)) {
      spec.colorway = cws[0] || STARTER_COLORWAY;
    }
    return null;
  }

  /** @param {number} dir @param {string} [role] */
  cycleColorway(dir, role) {
    const spec = this._ensureSpec(role || this.activeSectionRole);
    const cws = listColorwayIds(spec.theme);
    if (!cws.length) return null;
    const i = Math.max(0, cws.indexOf(spec.colorway));
    spec.colorway = cws[(i + dir + cws.length) % cws.length];
    return null;
  }

  /** @param {number} dir @param {string} [role] */
  cycleMk(dir, role) {
    const spec = this._ensureSpec(role || this.activeSectionRole);
    const i = Math.max(0, MK_TIERS.indexOf(spec.mk));
    spec.mk = MK_TIERS[(i + dir + MK_TIERS.length) % MK_TIERS.length];
    return null;
  }

  /** @param {number} dir @param {string} [role] */
  cycleVariant(dir, role) {
    const spec = this._ensureSpec(role || this.activeSectionRole);
    const i = Math.max(0, VARIANTS.indexOf(spec.variant));
    spec.variant = VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length];
    return null;
  }

  /** @deprecated use applyActiveSectionToDef / applySpecsToDef */
  applyColorwaysToDef(def) {
    return this.applyActiveSectionToDef(def);
  }

  randomize() {
    this.groupId =
      SWAP_GROUP_ORDER[(Math.random() * SWAP_GROUP_ORDER.length) | 0];
    const ids = listBlueprintClassIds(this.groupId);
    this.classId = ids[(Math.random() * ids.length) | 0] || 'generalist';
    this.sectionSpecs = {};
    for (const role of this._roles()) {
      const theme = THEME_IDS[(Math.random() * THEME_IDS.length) | 0];
      const cws = listColorwayIds(theme);
      this.sectionSpecs[role] = {
        theme,
        mk: MK_TIERS[(Math.random() * MK_TIERS.length) | 0],
        variant: VARIANTS[(Math.random() * VARIANTS.length) | 0],
        colorway: cws[(Math.random() * cws.length) | 0] || STARTER_COLORWAY,
      };
    }
    this.activeSectionRole = this._roles()[0] || 'body';
    return this.rebuild();
  }

  setViewMode(mode) {
    this.viewMode = mode === VIEW_ANGLED ? VIEW_ANGLED : VIEW_TOP_DOWN;
  }

  toggleViewMode() {
    this.viewMode =
      this.viewMode === VIEW_ANGLED ? VIEW_TOP_DOWN : VIEW_ANGLED;
  }

  /**
   * Snap headingIndex to the nearest of 16 compass headings from a live angle.
   * @param {number} angleRad
   * @returns {number} 0..15
   */
  syncHeadingFromAngle(angleRad) {
    this.headingIndex = headingIndexFromAngle(angleRad);
    return this.headingIndex;
  }

  /**
   * Step ±1 among 16 headings. Pass `fromAngle` to base the step on the
   * latest live yaw (rounded), not a stale index.
   * @param {number} steps
   * @param {number} [fromAngle]
   */
  rotateHeading(steps, fromAngle) {
    if (fromAngle != null && Number.isFinite(fromAngle)) {
      this.syncHeadingFromAngle(fromAngle);
    }
    this.headingIndex =
      (((this.headingIndex + steps) % ANGLED_HEADING_COUNT) +
        ANGLED_HEADING_COUNT) %
      ANGLED_HEADING_COUNT;
  }

  addYaw(deltaRad) {
    const step = (Math.PI * 2) / ANGLED_HEADING_COUNT;
    const angle = this.headingIndex * step + deltaRad;
    this.headingIndex = headingIndexFromAngle(angle);
  }

  shipAngle() {
    return (this.headingIndex / ANGLED_HEADING_COUNT) * Math.PI * 2;
  }

  toggleLiveControls() {
    this.liveControls = !this.liveControls;
    if (this.liveControls) this.autoSpin = false;
    return this.liveControls;
  }

  labelLiveControls() {
    return this.liveControls ? 'Live controls · on' : 'Live controls';
  }

  shipView() {
    if (this.viewMode === VIEW_ANGLED) {
      return {
        ...angledView(this.headingIndex),
        explode: this.explodedView,
      };
    }
    return { ...topDownView(), explode: this.explodedView };
  }

  toggleExplodedView() {
    this.explodedView = !this.explodedView;
  }

  /** Roles for the current class (fore → aft). */
  sectionRoles() {
    return this._roles();
  }

  labelSectionRole(role) {
    return SECTION_LABELS[role] || role;
  }

  labelThemeFor(role) {
    const t = this._ensureSpec(role).theme;
    return THEMES[t]?.label || t;
  }

  /** Short finish blurb for the active / given section theme. */
  labelThemeBlurb(role) {
    const t = this._ensureSpec(role || this.activeSectionRole).theme;
    return THEMES[t]?.blurb || '';
  }

  labelColorwayFor(role) {
    const spec = this._ensureSpec(role);
    return THEMES[spec.theme]?.colorways?.[spec.colorway]?.label || spec.colorway;
  }

  labelMkFor(role) {
    return String(this._ensureSpec(role).mk);
  }

  labelVariantFor(role) {
    return this._ensureSpec(role).variant;
  }

  labelExploded() {
    return this.explodedView ? 'Exploded · on' : 'Exploded view';
  }

  /** Current projection: 2D top-down vs 2.5D angled. */
  labelViewMode() {
    return this.viewMode === VIEW_ANGLED ? '2.5D · angled' : '2D · top-down';
  }

  /** Toggle button text. */
  labelViewToggle() {
    return this.viewMode === VIEW_ANGLED ? 'Switch to 2D' : 'Switch to 2.5D';
  }

  /** Compass heading of the ship nose on screen (N, N-NE, …). */
  labelHeading() {
    return labelCompassHeading(this.headingIndex);
  }

  /** @deprecated use labelViewMode / labelViewToggle */
  labelView() {
    return this.labelViewMode();
  }

  labelGroup() {
    return labelSwapGroup(this.groupId);
  }

  labelClass() {
    return SHIP_CLASSES[this.classId]?.label || this.classId;
  }

  labelSection() {
    return SECTION_LABELS[this.activeSectionRole] || this.activeSectionRole;
  }

  labelTheme() {
    return this.labelThemeFor(this.activeSectionRole);
  }

  labelColorway() {
    return this.labelColorwayFor(this.activeSectionRole);
  }

  labelMk() {
    return this.labelMkFor(this.activeSectionRole);
  }

  labelVariant() {
    return this.labelVariantFor(this.activeSectionRole);
  }

  labelPadMk() {
    return `Pad Mk${padMkForClass(this.classId)}`;
  }

  setActiveSection(role) {
    const roles = this._roles();
    if (roles.includes(role)) this.activeSectionRole = role;
    return this.activeSectionRole;
  }

  statusLine(def = null) {
    const explode = this.explodedView ? ' · exploded' : '';
    let hold = '';
    if (def && typeof def.cargoCapacity === 'function') {
      const cargo = def.cargoCapacity();
      const seats = def.seatCapacity();
      const occ = def.seatsOccupied | 0;
      hold = ` · Cargo ${cargo} · Seats ${seats}`;
      if (occ > 0) hold += ` (${occ} aboard)`;
    }
    return `${this.labelGroup()} · ${this.labelClass()} · ${this.labelViewMode()} · ${this.labelHeading()} · ${this.labelPadMk()}${hold}${explode}`;
  }

  /**
   * Full selection dump for the Blueprint inspector (debug + polish).
   * @param {import('./ShipDefinition.js').ShipDefinition|null} def
   */
  debugReport(def = null) {
    const cls = getShipClass(this.classId);
    const role = this.activeSectionRole;
    const spec = this._ensureSpec(role);
    const lines = [];
    lines.push(`SHIP  ${this.labelGroup()} › ${this.labelClass()}  (${this.classId})`);
    lines.push(
      `      scale ${cls?.scale ?? '?'}  pad Mk${padMkForClass(this.classId)}  roles [${this._roles().join(', ')}]`
    );
    if (def) {
      lines.push(
        `HOLD  cargo ${def.cargoCapacity?.() ?? 0}  seats ${def.seatCapacity?.() ?? 0}  occupied ${def.seatsOccupied | 0}`
      );
    }
    lines.push(
      `VIEW  ${this.labelViewMode()}  heading ${this.labelHeading()} (#${this.headingIndex})  angle ${(this.shipAngle() * (180 / Math.PI)).toFixed(1)}°  ${this.explodedView ? 'EXPLODED' : 'assembled'}  ${this.autoSpin ? 'spin ON' : 'spin off'}  ${this.liveControls ? 'LIVE CTRL' : 'inspect'}`
    );
    lines.push('');
    lines.push(`SELECTED SECTION  ${this.labelSectionRole(role)}  (${role})`);
    lines.push(
      `  theme ${spec.theme}  color ${spec.colorway}  mk ${spec.mk}  variant ${spec.variant}`
    );
    const blurb = THEMES[spec.theme]?.blurb;
    if (blurb) lines.push(`  finish  ${blurb}`);
    const fin = THEMES[spec.theme]?.finish;
    if (fin) {
      lines.push(
        `  skin    stripe=${fin.stripe} mark=${fin.mark} seams=${fin.seams} grit=${fin.grit} sheen=${fin.sheen} wear=${effectiveWear(spec.theme, spec.mk).toFixed(2)}`
      );
    }

    const sec = def?.section?.(role) || this._findSection(role, spec);
    if (sec) {
      lines.push(`  id          ${sec.id}`);
      lines.push(
        `  geometryKey ${sec.geometryKey}  morph ${Number(sec.morph || 0).toFixed(3)}`
      );
      lines.push(
        `  joinFore ${sec.joinFore ?? '—'}  joinAft ${sec.joinAft ?? '—'}  equipable ${sec.playerEquipable !== false}`
      );
    } else {
      lines.push('  (no catalog section resolved)');
    }

    lines.push('');
    lines.push('HARDPOINTS');
    const mounts = def?.resolveMounts?.() || null;
    const hps = sec?.hardpoints || [];
    if (!hps.length) {
      lines.push('  (none)');
    } else {
      for (const hp of hps) {
        const m = mounts?.[hp.key];
        const item = m?.item;
        const face = hp.face || '—';
        const itemBit = item
          ? `item ${item.id}  mk${item.mk}  ${item.geometryKey || ''}`
          : 'item — empty —';
        lines.push(
          `  ${hp.key.padEnd(18)} ${String(hp.category).padEnd(18)} face=${face.padEnd(6)}  xy=(${Number(hp.x).toFixed(1)}, ${Number(hp.y).toFixed(1)})  ∠${((hp.angle || 0) * (180 / Math.PI)).toFixed(0)}°  sockMk${hp.mk}`
        );
        lines.push(`    ${itemBit}`);
      }
    }

    if (def) {
      lines.push('');
      lines.push('ALL SECTIONS');
      for (const r of def.sectionRoles()) {
        const s = def.section(r);
        if (!s) continue;
        const mark = r === role ? '▸' : ' ';
        lines.push(
          `  ${mark} ${r.padEnd(8)} ${s.id}  gk=${s.geometryKey}  mk${s.mk}  ${s.theme}/${s.variant}`
        );
      }
    }

    return lines.join('\n');
  }

  /** Compact mount roster for the right dock. */
  mountRosterLines(def = null) {
    if (!def?.resolveMounts) return ['(no ship def)'];
    const mounts = def.resolveMounts();
    const lines = [];
    for (const [key, m] of Object.entries(mounts)) {
      const face = m.socket?.face || '—';
      const filled = m.item ? `mk${m.item.mk}` : 'empty';
      lines.push(`${key}  ·  ${m.socket.category}  ·  ${face}  ·  ${filled}`);
    }
    return lines.length ? lines : ['(no mounts)'];
  }

  /**
   * Structured per-hardpoint roster for the interactive mount picker.
   * Each entry's `variant` cycles the mounted item's shape variant (a/b/c)
   * independently of the owning section's variant — the item's theme + Mk
   * still follow the socket / current item so livery stays coherent.
   * @param {import('./ShipDefinition.js').ShipDefinition|null} def
   */
  mountRosterEntries(def = null) {
    if (!def?.resolveMounts) return [];
    const mounts = def.resolveMounts();
    const out = [];
    for (const [key, m] of Object.entries(mounts)) {
      const item = m.item;
      out.push({
        key,
        category: m.socket.category,
        face: m.socket.face || null,
        sectionRole: m.sectionRole,
        sockMk: m.socket.mk,
        hasItem: !!item,
        itemId: item?.id || null,
        theme: item?.theme || null,
        mk: item?.mk ?? null,
        variant: item?.variant || null,
      });
    }
    return out;
  }

  /**
   * Cycle the shape variant (a/b/c) of the item mounted at one hardpoint,
   * independent of that hardpoint's owning section variant. Keeps the
   * item's current theme + Mk so the livery stays coherent; falls back to
   * the section's theme / socket Mk cap when nothing is mounted yet.
   * @param {import('./ShipDefinition.js').ShipDefinition} def
   * @param {string} key hardpoint key
   * @param {number} dir +1 / -1
   * @returns {import('./ItemCatalog.js').ItemDef|null} newly mounted item, or null
   */
  cycleHardpointVariant(def, key, dir) {
    if (!def) return null;
    const mounts = def.resolveMounts();
    const m = mounts[key];
    if (!m) return null;
    const swap = normalizeSwapGroup(def.swapGroup);
    const current = m.item;
    const sectionTheme = def.section(m.sectionRole)?.theme || STARTER_THEME;
    const theme = current?.theme || sectionTheme;
    const mk = current?.mk ?? m.socket.mk;
    const curVariant = current?.variant || 'a';
    const i = Math.max(0, VARIANTS.indexOf(curVariant));
    const nextVariant = VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length];

    let items = listItems({
      category: m.socket.category,
      swapGroup: swap,
      theme,
      mk,
      variant: nextVariant,
    });
    if (!items.length) {
      items = listItems({
        category: m.socket.category,
        swapGroup: swap,
        mk,
        variant: nextVariant,
      });
    }
    if (!items.length) {
      items = listItems({
        category: m.socket.category,
        swapGroup: swap,
        variant: nextVariant,
      });
    }
    const next = items.find((it) => canAttachItem(def.classId, m.socket, it).ok) || items[0];
    if (!next) return null;
    def.setEquipment(key, next.id);
    return next;
  }

  labelMountRole(role) {
    return SECTION_LABELS[role] || role;
  }
}
