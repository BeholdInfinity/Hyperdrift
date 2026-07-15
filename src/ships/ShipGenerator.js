/**
 * Ship generation + player starter bill of materials.
 */

import { SHIP_CLASSES, SWAP_GROUPS, getShipClass } from './ShipClasses.js';
import { STARTER_SECTIONS, getSection, listSections } from './SectionCatalog.js';
import { STARTER_ITEMS, getItem, listItems } from './ItemCatalog.js';
import {
  STARTER_THEME,
  STARTER_COLORWAY,
  THEME_IDS,
  VARIANTS,
  MK_TIERS,
  listColorwayIds,
} from './Themes.js';
import { ShipDefinition } from './ShipDefinition.js';
import { canAttachItem, canAttachSection } from './ShipAttach.js';

function rand(rng) {
  return rng ? rng() : Math.random();
}

function pick(arr, rng) {
  if (!arr.length) return null;
  return arr[(rand(rng) * arr.length) | 0];
}

/**
 * Player starter: Generalist · civMid · Mk2 · variant a · worn industrial look · bell BOM.
 * @returns {ShipDefinition}
 */
export function createPlayerStarter() {
  const thrusterId = STARTER_ITEMS.thruster;
  const equipment = {
    mainEngine: STARTER_ITEMS.mainEngine,
    miningLaser: STARTER_ITEMS.miningLaser,
    dorsalTurret: STARTER_ITEMS.smallTurret,
    nosePort: thrusterId,
    noseStarboard: thrusterId,
    aftPort: thrusterId,
    aftStarboard: thrusterId,
    portFore: thrusterId,
    portAft: thrusterId,
    starboardFore: thrusterId,
    starboardAft: thrusterId,
  };

  return new ShipDefinition({
    classId: 'generalist',
    defaultColorway: STARTER_COLORWAY,
    sectionIds: { ...STARTER_SECTIONS },
    equipment,
  });
}

/**
 * @param {object} opts
 * @param {string} opts.classId
 * @param {string} [opts.theme]
 * @param {number} [opts.mk]
 * @param {string} [opts.variant]
 * @param {string} [opts.colorway]
 * @param {boolean} [opts.allowCosmeticMix]
 * @param {boolean} [opts.allowGroupMix] — Standard/Light rare mix
 * @param {() => number} [opts.rng]
 */
export function generateShip(opts) {
  const cls = getShipClass(opts.classId);
  if (!cls) throw new Error(`Unknown class ${opts.classId}`);

  const rng = opts.rng || Math.random;
  const theme = opts.theme || pick(THEME_IDS, rng);
  const mk = opts.mk ?? MK_TIERS[(rand(rng) * MK_TIERS.length) | 0];
  const variant = opts.variant || pick(VARIANTS, rng);
  const colorways = listColorwayIds(theme);
  const colorway = opts.colorway || pick(colorways, rng) || 'stationBlue';

  const allowCosmeticMix = opts.allowCosmeticMix === true;
  const allowGroupMix = opts.allowGroupMix === true && !cls.prebuiltOnly;

  /** @type {Record<string, string>} */
  const sectionIds = {};
  /** @type {Record<string, string>} */
  const colorwayBySection = {};

  for (const role of cls.sectionRoles) {
    let classIdForPart = cls.id;
    if (allowGroupMix && rand(rng) < 0.08) {
      const peers = Object.values(SHIP_CLASSES).filter(
        (c) => c.swapGroup === cls.swapGroup && c.sectionRoles.includes(role)
      );
      classIdForPart = pick(peers, rng)?.id || cls.id;
    }

    let partTheme = theme;
    let partMk = mk;
    let partVariant = variant;
    let partCw = colorway;

    if (allowCosmeticMix && rand(rng) < 0.12) {
      partTheme = pick(THEME_IDS, rng);
      partMk = MK_TIERS[(rand(rng) * MK_TIERS.length) | 0];
      partVariant = pick(VARIANTS, rng);
      const cws = listColorwayIds(partTheme);
      partCw = pick(cws, rng) || partCw;
    }

    const candidates = listSections({
      classId: classIdForPart,
      role,
      theme: partTheme,
      mk: partMk,
      variant: partVariant,
    });
    let sec = candidates[0];
    if (!sec) {
      // Fallback: any variant of class+role+theme
      sec = listSections({ classId: classIdForPart, role, theme: partTheme })[0];
    }
    if (!sec) {
      sec = listSections({ classId: cls.id, role })[0];
    }
    if (!sec) continue;

    if (!cls.prebuiltOnly) {
      const check = canAttachSection(cls.id, sec);
      if (!check.ok && sec.classId !== cls.id) {
        // stick to own class if mix invalid somehow
        sec = listSections({ classId: cls.id, role, theme, mk, variant })[0]
          || listSections({ classId: cls.id, role })[0];
      }
    }
    if (!sec) continue;

    // Keep paint locked to the section's actual theme (fallback picks can differ).
    if (sec.theme && sec.theme !== partTheme) {
      partTheme = sec.theme;
      const cws = listColorwayIds(partTheme);
      partCw = pick(cws, rng) || partCw;
    }

    sectionIds[role] = sec.id;
    colorwayBySection[role] = partCw;
  }

  /** @type {Record<string, string>} */
  const equipment = {};
  for (const role of Object.keys(sectionIds)) {
    const sec = getSection(sectionIds[role]);
    if (!sec) continue;
    for (const hp of sec.hardpoints) {
      let itemTheme = theme;
      let itemMk = Math.min(mk, hp.mk);
      let itemVariant = variant;
      if (allowCosmeticMix && rand(rng) < 0.1) {
        itemTheme = pick(THEME_IDS, rng);
        itemMk = Math.min(MK_TIERS[(rand(rng) * MK_TIERS.length) | 0], hp.mk);
        itemVariant = pick(VARIANTS, rng);
      }
      const items = listItems({
        category: hp.category,
        swapGroup: cls.swapGroup,
        theme: itemTheme,
        mk: itemMk,
        variant: itemVariant,
      });
      let item = items[0];
      if (!item) {
        item = listItems({
          category: hp.category,
          swapGroup: cls.swapGroup,
          mk: itemMk,
        })[0];
      }
      if (!item) continue;
      if (!cls.prebuiltOnly) {
        const check = canAttachItem(cls.id, hp, item);
        if (!check.ok) continue;
      }
      equipment[hp.key] = item.id;
    }
  }

  return new ShipDefinition({
    classId: cls.id,
    defaultColorway: colorway,
    colorwayBySection,
    sectionIds,
    equipment,
  });
}

/**
 * Visitor / NPC helper — rare cosmetic mix; Light/Standard rare group mix.
 * Scout is always a coherent prebuild (no part swap).
 */
export function generateVisitor(classId, rng = Math.random) {
  const cls = getShipClass(classId);
  if (!cls) return generateShip({ classId: 'generalist', rng });

  const rareMix = rand(rng) < 0.05;
  const lightRare = cls.swapGroup === SWAP_GROUPS.light && rand(rng) < 0.03;
  const standardRare =
    cls.swapGroup === SWAP_GROUPS.standard && rand(rng) < 0.05;

  return generateShip({
    classId,
    rng,
    allowCosmeticMix: rareMix,
    allowGroupMix: lightRare || standardRare,
  });
}

/** Map legacy HangarVisitorShips roles → class ids */
export const VISITOR_ROLE_TO_CLASS = {
  scout: 'scout',
  interceptor: 'lightFighter',
  patrol: 'fighter',
  gunship: 'fighter',
  freighter: 'hauler',
  tanker: 'hauler',
  hauler: 'hauler',
  // Standard-group peers — roughly player-sized (Mk2 pool); pad-Mk gated in
  // HangarVisitorShips/HangarBay so these only show up when a side pad rolls
  // the player's own pad tier.
  cruiser: 'generalist',
  warden: 'standardFighter',
  player: 'generalist',
};

export function validateStarterBom() {
  const ship = createPlayerStarter();
  const missing = [];
  for (const id of Object.values(STARTER_SECTIONS)) {
    if (!getSection(id)) missing.push(id);
  }
  for (const id of Object.values(STARTER_ITEMS)) {
    if (!getItem(id)) missing.push(id);
  }
  const mounts = ship.resolveMounts();
  const required = [
    'mainEngine',
    'miningLaser',
    'dorsalTurret',
    'nosePort',
    'noseStarboard',
    'aftPort',
    'aftStarboard',
    'portFore',
    'portAft',
    'starboardFore',
    'starboardAft',
  ];
  for (const k of required) {
    if (!mounts[k]?.item) missing.push(`equip:${k}`);
  }
  return { ok: missing.length === 0, missing, ship };
}
