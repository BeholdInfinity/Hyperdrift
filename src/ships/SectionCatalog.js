/**
 * Section catalog — full Class×Section×Theme×Mk×3-variant matrix (parametric).
 * Starter Generalist Mid Mk2 `a` uses bell geometry (see geometryKey: 'bell').
 */

import { SHIP_CLASSES, socketMkCapForSwapGroup } from './ShipClasses.js';
import { THEME_IDS, VARIANTS, MK_TIERS } from './Themes.js';
import { BELL_MOUNTS, ultraMounts, sectionScale } from './SectionGeometry.js';

/**
 * @typedef {{
 *   id: string,
 *   key: string,
 *   category: string,
 *   x: number,
 *   y: number,
 *   angle: number,
 *   mk: number,
 *   articulation?: 'static'|'pivot'|'slew360'|'slewArc',
 *   face?: 'chin'|'dorsal'|'ventral'|'wing'|'side',
 * }} HardpointSocket
 */

/**
 * @typedef {{
 *   id: string,
 *   classId: string,
 *   swapGroup: string,
 *   role: string,
 *   theme: string,
 *   mk: number,
 *   variant: string,
 *   playerEquipable: boolean,
 *   geometryKey: string,
 *   morph: number,
 *   hardpoints: HardpointSocket[],
 *   joinFore?: number,
 *   joinAft?: number,
 * }} SectionDef
 */

/** Starter bell hardpoints — on bell hull edges (see SectionGeometry / StarterBellDraw). */
export const BELL_HARDPOINTS = {
  bridge: BELL_MOUNTS.bridge.map((m) => ({
    id: m.key,
    key: m.key,
    category: m.category,
    x: m.x,
    y: m.y,
    angle: m.angle,
    mk: 2,
    articulation: m.articulation || 'static',
    face: m.face,
  })),
  body: BELL_MOUNTS.body.map((m) => ({
    id: m.key,
    key: m.key,
    category: m.category,
    x: m.x,
    y: m.y,
    angle: m.angle,
    mk: 2,
    articulation: m.articulation || 'static',
    face: m.face,
  })),
  engine: BELL_MOUNTS.engine.map((m) => ({
    id: m.key,
    key: m.key,
    category: m.category,
    x: m.x,
    y: m.y,
    angle: m.angle,
    mk: 2,
    articulation: m.articulation || 'static',
    face: m.face,
  })),
};

function sectionId(classId, role, theme, mk, variant) {
  return `sec.${classId}.${role}.${theme}.mk${mk}.${variant}`;
}

function scaleHardpoints(hps, mk, morph, scale) {
  const s = sectionScale(scale, morph);
  return hps.map((hp) => ({
    ...hp,
    x: hp.x * s,
    y: hp.y * s,
    mk,
    face: hp.face,
  }));
}

function thruster(key, x, y, angle) {
  return {
    id: key,
    key,
    category: 'maneuverThruster',
    x,
    y,
    angle,
    articulation: 'static',
    face: 'prop',
  };
}

function engine(key, x, y) {
  return {
    id: key,
    key,
    category: 'mainEngine',
    x,
    y,
    angle: Math.PI,
    articulation: 'static',
  };
}

function weapon(key, category, x, y, articulation = 'static', face = 'chin', angle = 0) {
  return { id: key, key, category, x, y, angle, articulation, face };
}

/**
 * Hardpoint budgets by group/class (see GDD / Blueprint plan).
 * Socket Mk = min(sectionMk, group cap).
 */
function defaultHardpointsForRole(classId, role, mk, morph, scale, variant = 'b') {
  const cls = SHIP_CLASSES[classId];
  const group = cls?.swapGroup || 'standard';
  const socketMk = Math.min(mk, socketMkCapForSwapGroup(group));

  // Starter Generalist keeps bell layout (1 eng, 8 thrusters, laser, turret)
  if (classId === 'generalist' && BELL_HARDPOINTS[role]) {
    // Bell mesh (variant a) ignores morph — keep mounts on the fixed hull.
    const m = variant === 'a' ? 0 : morph;
    return scaleHardpoints(BELL_HARDPOINTS[role], socketMk, m, scale);
  }

  // —— UltraLight hull ——
  if (role === 'hull') {
    const mounts = ultraMounts(classId).map((m) => ({
      id: m.key,
      key: m.key,
      category: m.category,
      x: m.x,
      y: m.y,
      angle: m.angle,
      articulation: m.articulation || 'static',
      face: m.face || 'prop',
    }));
    return scaleHardpoints(mounts, socketMk, morph, scale);
  }

  // —— Light cockpit / aft ——
  if (group === 'light') {
    if (role === 'cockpit') {
      const hps = [];
      if (classId === 'fighter') {
        hps.push(weapon('noseGunPort', 'forwardGun', 15.2, -1.0, 'static', 'chin'));
        hps.push(
          weapon('noseGunStarboard', 'forwardGun', 15.2, 1.0, 'static', 'chin')
        );
      }
      hps.push(thruster('nosePort', 10, -5.2, 0));
      hps.push(thruster('noseStarboard', 10, 5.2, 0));
      return scaleHardpoints(hps, socketMk, morph, scale);
    }
    return scaleHardpoints(
      [
        engine('mainEngine', -13.6, 0),
        thruster('aftPort', -10.5, -7.2, Math.PI),
        thruster('aftStarboard', -10.5, 7.2, Math.PI),
      ],
      socketMk,
      morph,
      scale
    );
  }

  // —— Standard / Heavy three-section (unit footprints; class.scale applied in scaleHardpoints) ——
  const isHeavy = group === 'heavy';
  const isFighter =
    classId === 'standardFighter' || classId === 'heavyFighter';
  const isMiner = classId === 'miner' || classId === 'heavyMiner';
  const isScience = classId === 'science' || classId === 'heavyScience';
  const isHauler = classId === 'hauler' || classId === 'heavyHauler';
  const isTransport =
    classId === 'standardTransport' || classId === 'heavyTransport';

  if (role === 'bridge' || role === 'cockpit') {
    const hps = [];
    if (isFighter) {
      hps.push(weapon('noseGunA', 'forwardGun', 17.5, -1.0, 'static', 'chin'));
      hps.push(weapon('noseGunB', 'forwardGun', 17.5, 1.0, 'static', 'chin'));
      hps.push(weapon('noseLaser', 'forwardLaser', 16.5, 0, 'slewArc', 'chin'));
    } else if (isMiner) {
      hps.push(weapon('miningLaser', 'forwardLaser', 17.5, 0, 'slewArc', 'chin'));
    } else if (isScience) {
      hps.push(weapon('scanner', 'scienceArray', 12, 0, 'static', 'dorsal'));
      if (isHeavy) {
        hps.push(
          weapon('miningLaser', 'forwardLaser', 17.5, 0, 'slewArc', 'chin')
        );
      }
    } else if (classId === 'generalist' || classId === 'heavyGeneralist') {
      hps.push(weapon('miningLaser', 'forwardLaser', 18, 0, 'slewArc', 'chin'));
    }
    if (!isHeavy) {
      hps.push(thruster('nosePort', 12, -5.8, 0));
      hps.push(thruster('noseStarboard', 12, 5.8, 0));
    }
    return scaleHardpoints(hps, socketMk, morph, scale);
  }

  if (role === 'body') {
    const hps = [];
    if (isFighter) {
      if (isHeavy) {
        hps.push(weapon('dorsalTurret', 'cannonTurret', 1, 0, 'slew360', 'dorsal'));
        hps.push(
          weapon('dorsalTurretB', 'smallTurret', -6, 0, 'slew360', 'dorsal')
        );
        hps.push(weapon('wingGunPort', 'forwardGun', 2, -12.2, 'static', 'wing'));
        hps.push(
          weapon('wingGunStarboard', 'forwardGun', 2, 12.2, 'static', 'wing')
        );
        hps.push(
          weapon(
            'sideGunPort',
            'forwardGun',
            -4,
            -13.5,
            'static',
            'side',
            -Math.PI / 2
          )
        );
        hps.push(
          weapon(
            'sideGunStarboard',
            'forwardGun',
            -4,
            13.5,
            'static',
            'side',
            Math.PI / 2
          )
        );
      } else {
        hps.push(weapon('dorsalTurret', 'cannonTurret', 0, 0, 'slew360', 'dorsal'));
        hps.push(
          weapon('dorsalTurretB', 'smallTurret', -5, 0, 'slew360', 'dorsal')
        );
        hps.push(weapon('wingGunPort', 'forwardGun', 3, -11.2, 'static', 'wing'));
        hps.push(
          weapon('wingGunStarboard', 'forwardGun', 3, 11.2, 'static', 'wing')
        );
      }
    } else if (isHauler) {
      hps.push(
        weapon(
          'dorsalTurret',
          isHeavy ? 'cannonTurret' : 'smallTurret',
          0,
          0,
          'slew360',
          'dorsal'
        )
      );
      if (isHeavy) {
        hps.push(
          weapon('dorsalTurretB', 'smallTurret', -6, 0, 'slew360', 'dorsal')
        );
      }
    } else if (isTransport) {
      hps.push(weapon('dorsalTurret', 'smallTurret', 0, 0, 'slew360', 'dorsal'));
      if (isHeavy) {
        hps.push(
          weapon('dorsalTurretB', 'smallTurret', -6, 0, 'slew360', 'dorsal')
        );
      }
    } else if (isMiner || isScience || classId === 'heavyGeneralist') {
      hps.push(weapon('dorsalTurret', 'smallTurret', 0, 0, 'slew360', 'dorsal'));
      if (isHeavy && (isMiner || isScience)) {
        hps.push(
          weapon('dorsalTurretB', 'smallTurret', -5, 0, 'slew360', 'dorsal')
        );
      }
    }

    const beam = isHeavy || isFighter || isHauler ? 12.5 : 10.5;
    hps.push(thruster('portFore', 4, -beam + 0.4, -Math.PI / 2));
    hps.push(thruster('starboardFore', 4, beam - 0.4, Math.PI / 2));
    if (isHeavy) {
      hps.push(thruster('nosePort', 9.5, -beam + 1.5, 0));
      hps.push(thruster('noseStarboard', 9.5, beam - 1.5, 0));
      hps.push(thruster('portMid', -2, -beam, -Math.PI / 2));
      hps.push(thruster('starboardMid', -2, beam, Math.PI / 2));
      hps.push(thruster('portFore2', 7, -beam - 0.5, -Math.PI / 2));
      hps.push(thruster('starboardFore2', 7, beam + 0.5, Math.PI / 2));
    }
    return scaleHardpoints(hps, socketMk, morph, scale);
  }

  if (role === 'engine' || role === 'aft') {
    const hps = [];
    if (isHeavy) {
      hps.push(engine('mainEngine', -19.2, -4.2));
      hps.push(engine('mainEngineB', -19.2, 4.2));
    } else {
      hps.push(engine('mainEngine', -19.4, 0));
    }
    hps.push(thruster('aftPort', -14.5, -11.5, Math.PI));
    hps.push(thruster('aftStarboard', -14.5, 11.5, Math.PI));
    hps.push(thruster('portAft', -8.5, -12.2, -Math.PI / 2));
    hps.push(thruster('starboardAft', -8.5, 12.2, Math.PI / 2));
    if (isHeavy) {
      hps.push(thruster('aftPort2', -16.5, -13.5, Math.PI));
      hps.push(thruster('aftStarboard2', -16.5, 13.5, Math.PI));
      hps.push(thruster('portAft2', -5, -14, -Math.PI / 2));
      hps.push(thruster('starboardAft2', -5, 14, Math.PI / 2));
    }
    return scaleHardpoints(hps, socketMk, morph, scale);
  }

  return scaleHardpoints([engine('mainEngine', -16, 0)], socketMk, morph, scale);
}

function geometryKeyFor(classId, role, variant) {
  if (classId === 'generalist' && variant === 'a') return 'bell';
  return `${classId}.${role}.${variant}`;
}

/** @type {Map<string, SectionDef>} */
const SECTION_BY_ID = new Map();

function buildSectionMatrix() {
  for (const cls of Object.values(SHIP_CLASSES)) {
    for (const role of cls.sectionRoles) {
      for (const theme of THEME_IDS) {
        for (const mk of MK_TIERS) {
          for (let vi = 0; vi < VARIANTS.length; vi++) {
            const variant = VARIANTS[vi];
            const morph = (vi - 1) * 0.12;
            const id = sectionId(cls.id, role, theme, mk, variant);
            const sc = cls.scale || 1;
            const joinForeBase =
              role === 'bridge' || role === 'cockpit'
                ? 8
                : role === 'body'
                  ? -6
                  : null;
            const joinAftBase =
              role === 'bridge' || role === 'cockpit'
                ? 8
                : role === 'body'
                  ? -8
                  : -20;
            const def = {
              id,
              classId: cls.id,
              swapGroup: cls.swapGroup,
              role,
              theme,
              mk,
              variant,
              playerEquipable: cls.playerEquipable && !cls.prebuiltOnly,
              geometryKey: geometryKeyFor(cls.id, role, variant),
              morph,
              hardpoints: defaultHardpointsForRole(
                cls.id,
                role,
                mk,
                morph,
                cls.scale,
                variant
              ),
              joinFore: joinForeBase != null ? joinForeBase * sc : null,
              joinAft: joinAftBase * sc,
            };
            // Scout / prebuilt: sections exist for generation but not player equip
            if (cls.prebuiltOnly) def.playerEquipable = false;
            SECTION_BY_ID.set(id, def);
          }
        }
      }
    }
  }
}

buildSectionMatrix();

export function getSection(id) {
  return SECTION_BY_ID.get(id) ?? null;
}

export function listSections(filter = {}) {
  const out = [];
  for (const def of SECTION_BY_ID.values()) {
    if (filter.classId && def.classId !== filter.classId) continue;
    if (filter.swapGroup && def.swapGroup !== filter.swapGroup) continue;
    if (filter.role && def.role !== filter.role) continue;
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

export function sectionCatalogSize() {
  return SECTION_BY_ID.size;
}

/** Canonical starter section ids */
export const STARTER_SECTIONS = {
  bridge: 'sec.generalist.bridge.civMid.mk2.a',
  body: 'sec.generalist.body.civMid.mk2.a',
  engine: 'sec.generalist.engine.civMid.mk2.a',
};
