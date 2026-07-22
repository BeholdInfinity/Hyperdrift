/**
 * Split HangarBay.js into hangar/ modules.
 * Run: node scripts/split-hangar-bay.mjs
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src/world/HangarBay.js');
const OUT = path.join(ROOT, 'src/world/hangar');

const raw = fs.readFileSync(SRC, 'utf8');
const lines = raw.split('\n');

const classLineIdx = lines.findIndex((l) => l.startsWith('export class HangarBay'));
if (classLineIdx < 0) throw new Error('HangarBay class not found');

const headerImports = lines.slice(0, 82).join('\n');
const preLines = lines.slice(82, classLineIdx);
const classLines = lines.slice(classLineIdx);

function extractMethods(classSrcLines) {
  const methods = [];
  let i = 1;
  while (i < classSrcLines.length) {
    const line = classSrcLines[i];
    const m = line.match(/^  (\w+)\s*\(/);
    if (m) {
      const name = m[1];
      const start = i;
      let depth = 0;
      let started = false;
      const buf = [];
      for (let j = i; j < classSrcLines.length; j++) {
        const ln = classSrcLines[j];
        for (const ch of ln) {
          if (ch === '{') {
            depth++;
            started = true;
          } else if (ch === '}') depth--;
        }
        buf.push(ln);
        if (started && depth === 0) {
          i = j + 1;
          break;
        }
      }
      methods.push({ name, body: buf.join('\n'), startLine: classLineIdx + start + 1 });
    } else if (line.trim() === '}') {
      break;
    } else {
      i++;
    }
  }
  return methods;
}

function extractPreFunctions(preL) {
  const funcs = {};
  let i = 0;
  while (i < preL.length) {
    const line = preL[i];
    const fm = line.match(/^(export )?function (\w+)/);
    if (fm) {
      const fnName = fm[2];
      let depth = 0;
      let started = false;
      const buf = [];
      for (let j = i; j < preL.length; j++) {
        const ln = preL[j];
        for (const ch of ln) {
          if (ch === '{') {
            depth++;
            started = true;
          } else if (ch === '}') depth--;
        }
        buf.push(ln);
        if (started && depth === 0) {
          funcs[fnName] = buf.join('\n');
          i = j + 1;
          break;
        }
      }
    } else {
      i++;
    }
  }
  return funcs;
}

const methods = extractMethods(classLines);
const preFuncs = extractPreFunctions(preLines);

const LAYOUT_NAMES = new Set([
  'colXs', 'padCenters', 'bayLabels', 'syncBayAnchors', 'applyHangarSidePadX',
  'hangarPadX', 'syncHangarSidePadFromLayout', 'bayIndexFromX', 'colMeta',
  'rowRole', 'pileId', 'buildPileHardpoints', 'rollSidePad',
]);
const CARGO_NAMES = new Set([
  'pickHoldCrateSkin', 'holdBlockSkinFromCargo', 'crateKindFromHoldBlock', 'cargoBaySpec',
  'cargoMkForVisitor', 'packCargoHold', 'statColorForPct', 'cargoSpaceFromHold',
  'syncCargoSpace', 'addCargoHoldBlock', 'removeCargoHoldBlock', 'shuffleInPlace',
  'pingPong01', 'pipRevealDelays', 'needRequestChance', 'unitsFromNeed',
  'meterServiceUnits', 'hullPipHealAmount', 'hullRepairPipCount', 'cargoServiceUnits',
  'visitorServiceBias', 'smoothstep', 'clearVisitorThrusters', 'makeCargo',
  'makeCatalogUpgradeCargo', 'makeInboundCargo', 'rollVisitorPadMk',
]);
const HELPER_NAMES = new Set(['rand', 'pick', 'randInt', 'thrusterActivity', 'craneJobDistScale', 'weldSpotsForPip', 'bayLaneHalf']);
const ZOOM_NAMES = new Set(['hangarZoomMin', 'hangarZoomMax', 'hangarDefaultZoom', 'hangarElevatorZoom']);
const MOVED_FUNCS = new Set([...LAYOUT_NAMES, ...CARGO_NAMES, ...HELPER_NAMES]);

function assignModule(name) {
  if (/^render|^renderWeld|^renderDeck|^renderCrew|^renderElevator|^renderVisitors|^renderOverhead/.test(name)) return 'HangarRender';
  if (name.startsWith('_draw') || name === '_visitorArrivalShipVisible') return 'HangarRender';
  if (/^_cargoMix$|^_dangerYellowLit$|^_shipScanTarget$|^_strokeScanSegment$|^_paintSparkDeckGlow$|^_drawSparkles$|^_drawDebris$|^_drawHazardWash$/.test(name)) return 'HangarRender';
  if (/^_moveToward$|^_crew/.test(name)) return 'CrewShared';
  if (/Visitor|Captain|PlayerBayService|tickVisitor|startVisitor|finishVisitor|beginCaptain|fireVisitor|rollVisitorPadMk/.test(name)) return 'VisitorTraffic';
  if (/^hasCrane$|^playerMayManCrane$|^canTurretSwap$/.test(name)) return 'HangarBay';
  if (/Crane|crane|divertCrane|enumerateCrane|pickCrane|applyCrane|resetCrane|moveCrane|findCrane/.test(name)) return 'CraneSim';
  if (/Fork|fork|Forklift|forklift/.test(name)) return 'ForkliftAI';
  if (/Mechanic|Mech|mech|Weld|weld|emitWeld|dockTargets|pickMidPile|pickSouthPile|softPriorityMech|bayMateActive|stagingTaskIsDirect|shipHoldHasLoadRoom|mechanicStaging|floorDropClaimedByMechanic|abandonMechanic|bindActiveServiceForMech|abortMechanic/.test(name)) return 'MechanicAI';
  return 'HangarBay';
}

const buckets = {
  HangarBay: [],
  HangarRender: [],
  VisitorTraffic: [],
  CraneSim: [],
  ForkliftAI: [],
  MechanicAI: [],
  CrewShared: [],
};

for (const meth of methods) {
  buckets[assignModule(meth.name)].push(meth);
}

// --- constants.js: pre-class lines minus moved functions ---
const constLines = [];
for (let i = 0; i < preLines.length; i++) {
  const line = preLines[i];
  const fm = line.match(/^(export )?function (\w+)/);
  if (fm) {
    const fn = fm[2];
    if (MOVED_FUNCS.has(fn) || ZOOM_NAMES.has(fn)) {
      let depth = 0;
      let started = false;
      for (let j = i; j < preLines.length; j++) {
        for (const ch of preLines[j]) {
          if (ch === '{') {
            depth++;
            started = true;
          } else if (ch === '}') depth--;
        }
        if (started && depth === 0) {
          i = j;
          break;
        }
      }
      continue;
    }
  }
  if (line.startsWith('let _cargoSeq') || line.startsWith('let _serviceSeq')) continue;
  if (line.includes('HANGAR.SIDE_PAD_X = getHangarSidePadX()')) continue;
  if (line.trim() === 'syncBayAnchors();') continue;
  if (line.includes('Honor baked hangar-layout')) continue;
  constLines.push(line);
}

const constantsExports = `
export {
  FACE_SOUTH,
  FACE_NORTH,
  BAY,
  ROW,
  COL_OFFSET,
  ROW_Y,
  DANGER_ZONE_SOUTH,
  SERVICE_BOARD_TOP,
  BACKSPLASH_HALF_W,
  SERVICE_BOARD_H,
  SERVICE_BOARD_BOTTOM,
  BACKSPLASH_Y,
  BACKSPLASH_BAND,
  BACKSPLASH_BYPASS,
  MECH_BODY_R,
  DANGER_ZONE_PAD,
  FLOOR_DROP_CRANE_AGE,
  APRON_SAFE_Y,
  BAY_COMPUTERS,
  CREW_VIS_OCT,
  WELD_SPOTS_MIN,
  WELD_SPOTS_MAX,
  CREW_VIS_TURN,
  CREW_VIS_TURN_LOCK,
  MECH_TURN_ALIGN,
  MECH_TURN_STOP,
  MECH_BAY_THEMES,
  FORK_TRUCK_LEN,
  FORKLIFT_HUB_W,
  FORKLIFT_HUB_HALF_W,
  FORKLIFT_PARK_MIN_PITCH,
  FORKLIFT_PARK_COUNT,
  FORKLIFT_PARK_PITCH,
  FORKLIFT_PARK_SPOT_W,
  FORKLIFT_PARK_SPOT_H,
  FORKLIFT_HUB_Y,
  FORKLIFT_PARKS,
  FORKLIFT_ACTIVE,
  CRANE_HOME,
  STAIRS,
  STAIR_Y,
  MECH_LINGER_Y_MAX,
  GOSSIP_RING_RADIUS,
  BRIDGE_Y_MIN,
  BRIDGE_Y_MAX,
  RUNWAY_X,
  HOIST_RAISED,
  HOIST_MAX,
  TROLLEY_NORTH,
  CLAW_OPEN,
  CLAW_GRIP,
  CLAW_PALM,
  CLAW_FINGER,
  CRANE_CREW,
  FORK_RAISED,
  FORK_LOWERED,
  FORK_ANIM_SPEED,
  FORK_LANE_OFFSET,
  FORK_APPROACH_SOUTH,
  FORK_CREEP_NORTH,
  FORK_TINE_TIP_X,
  FORK_OVERSHOOT,
  FORK_TINE_Y_BASE,
  FORK_DROP_VIS,
  MECH_LANE_OFFSET,
  MECH_APPROACH_ALONG,
  MECH_CREEP_IN,
  MECH_HAND_REACH_X,
  MECH_HAND_GRIP_Y,
  MECH_HANDOFF_SPEED,
  WELD_TORCH_REACH,
  CARGO_MIN,
  CARGO_MAX,
  PILE_CAP,
  INBOUND_SOFT_CAP,
  CRATE_VARIANTS,
  SERVICE_CARGO,
  HOLD_CARGO,
  UPGRADE_KINDS,
  CARGO_KINDS,
  PILE_SLOTS,
  CARGO_BAY_SPECS,
  VISITOR_CARGO_MK,
  STAT_RED,
  STAT_GREEN,
  HULL_PIP_HEAL_MIN,
  HULL_PIP_HEAL_MAX,
  HULL_PIP_HEAL_AVG,
  HULL_PIP_COUNT_MAX,
  SERVICE_STAGING_TYPES,
};
`;

const constantsJs = `import { HANGAR, SHIP } from '../../core/Constants.js';
import { clamp } from '../../utils/MathUtils.js';

${constLines.join('\n')}

${[...ZOOM_NAMES].map((n) => preFuncs[n]).join('\n\n')}

${constantsExports}
`;

const helpersJs = `import { HANGAR } from '../../core/Constants.js';
import { WELD_SPOTS_MIN, WELD_SPOTS_MAX } from './constants.js';

${[...HELPER_NAMES].map((n) => preFuncs[n]).filter(Boolean).join('\n\n')}

export { rand, pick, randInt, thrusterActivity, craneJobDistScale, weldSpotsForPip, bayLaneHalf };
`;

const layoutJs = `import { HANGAR } from '../../core/Constants.js';
import { FACE_NORTH, FACE_SOUTH, ROW, ROW_Y, BAY_COMPUTERS, STAIRS, COL_OFFSET } from './constants.js';
import { getHangarSidePadX } from '../hangar-layout.js';
import { pickVisitorId, equipPadVisitor } from '../HangarVisitorShips.js';
import { rand } from './helpers.js';
import { rollVisitorPadMk } from './cargoCatalog.js';

${[...LAYOUT_NAMES].map((n) => preFuncs[n]).join('\n\n')}

HANGAR.SIDE_PAD_X = getHangarSidePadX();
syncBayAnchors();

export {
  colXs,
  padCenters,
  bayLabels,
  syncBayAnchors,
  bayIndexFromX,
  colMeta,
  rowRole,
  pileId,
  buildPileHardpoints,
  rollSidePad,
};
`;

const cargoCatalogJs = `import { HANGAR } from '../../core/Constants.js';
import { VISITOR_CATALOG } from '../HangarVisitorShips.js';
import {
  upgradeKindFromItemId,
  pickAmbientCatalogUpgradeId,
} from '../../ships/HangarLoadout.js';
import {
  CRATE_VARIANTS,
  SERVICE_CARGO,
  UPGRADE_KINDS,
  CREW_VIS_OCT,
  CARGO_BAY_SPECS,
  VISITOR_CARGO_MK,
  STAT_RED,
  STAT_GREEN,
  HULL_PIP_HEAL_MIN,
  HULL_PIP_HEAL_MAX,
  HULL_PIP_HEAL_AVG,
  HULL_PIP_COUNT_MAX,
  SERVICE_STAGING_TYPES,
} from './constants.js';
import { rand, pick, randInt } from './helpers.js';

let _cargoSeq = 1;
let _serviceSeq = 1;

${[...CARGO_NAMES].map((n) => preFuncs[n]).join('\n\n')}

export {
  pickHoldCrateSkin,
  holdBlockSkinFromCargo,
  crateKindFromHoldBlock,
  cargoBaySpec,
  cargoMkForVisitor,
  packCargoHold,
  statColorForPct,
  cargoSpaceFromHold,
  syncCargoSpace,
  addCargoHoldBlock,
  removeCargoHoldBlock,
  shuffleInPlace,
  pingPong01,
  pipRevealDelays,
  needRequestChance,
  unitsFromNeed,
  meterServiceUnits,
  hullPipHealAmount,
  hullRepairPipCount,
  cargoServiceUnits,
  visitorServiceBias,
  smoothstep,
  clearVisitorThrusters,
  makeCargo,
  makeCatalogUpgradeCargo,
  makeInboundCargo,
  rollVisitorPadMk,
  CARGO_BAY_SPECS,
  VISITOR_CARGO_MK,
  SERVICE_STAGING_TYPES,
};
`;

function toMixinMethods(methodsList) {
  return methodsList
    .map((m) => {
      const match = m.body.match(/^  (\w+)\(([\s\S]*?)\)\s*\{/);
      if (!match) throw new Error(`Bad method: ${m.name}`);
      const [, name, params] = match;
      const inner = m.body.split('\n').slice(1, -1).join('\n');
      return `  HangarBay.prototype.${name} = function (${params}) {\n${inner}\n  };`;
    })
    .join('\n\n');
}

const MIXIN_IMPORTS = `import { HANGAR, SHIP } from '../../core/Constants.js';
import { clamp, normalizeAngle } from '../../utils/MathUtils.js';
import { SHIP_EXTENT, HARDPOINTS } from '../../entities/ShipHardpoints.js';
import {
  drawVisitorShip,
  makeVisitorThrusters,
  getVisitorPropulsion,
  VISITOR_CATALOG,
  equipPadVisitor,
  clearPadVisitor,
  createVisitorShipDef,
} from '../HangarVisitorShips.js';
import {
  upgradeKindFromItemId,
  pickCatalogItemId,
  pickAmbientCatalogUpgradeId,
  pickUpgradeInstallRequest,
  unequipHardpoint,
  equipHardpoint,
  emptySocketsForCategory,
  pickStripKey,
  needsStripBeforeInstall,
  needsStripBeforeInstallKey,
  categoryFromFreightLabel,
  shipDefSwapGroup,
} from '../../ships/HangarLoadout.js';
import { createPlayerStarter } from '../../ships/ShipGenerator.js';
import {
  hangarShipView,
  headingIndexFromAngle,
  angledLiftLocal,
  angledDepthScale,
} from '../../ships/ShipViews.js';
import { padMkForSwapGroup } from '../../ships/ShipClasses.js';
import { getItem } from '../../ships/ItemCatalog.js';
import { Settings } from '../../core/Settings.js';
import {
  getHangarProps,
  getGossipWaypoints,
  resolveLingerBays,
  lingerAllowsBay,
} from '../hangar-layout.js';
import {
  applyServiceScrollWheel,
  buildServiceBoardRows,
  createServiceScrollState,
  drawServiceChecklistColumn,
  hitServiceColumn,
  hitServiceScrollbar,
  hitServiceScrollbarThumb,
  notifyServiceScrollUser,
  offsetFromScrollbarY,
  serviceBoardFixedMetrics,
  sortServiceDisplayRows,
  tickServiceBoardScroll,
} from '../ServiceBoard.js';
import {
  placeRegistry,
  resolveHangarSkin,
  hasModule,
  isTurretMountCategory,
  canPerformTurretCraneStage,
  canPlayerStartTurretSwap,
  applyHullHeal,
  ensureVesselSimState,
} from '../place/index.js';
import {
  FACE_SOUTH,
  FACE_NORTH,
  BAY,
  ROW,
  ROW_Y,
  DANGER_ZONE_SOUTH,
  SERVICE_BOARD_TOP,
  SERVICE_BOARD_BOTTOM,
  BACKSPLASH_Y,
  BACKSPLASH_BAND,
  BACKSPLASH_BYPASS,
  BACKSPLASH_HALF_W,
  MECH_BODY_R,
  DANGER_ZONE_PAD,
  FLOOR_DROP_CRANE_AGE,
  APRON_SAFE_Y,
  BAY_COMPUTERS,
  CREW_VIS_OCT,
  CREW_VIS_TURN,
  CREW_VIS_TURN_LOCK,
  MECH_TURN_ALIGN,
  MECH_TURN_STOP,
  MECH_BAY_THEMES,
  FORK_TRUCK_LEN,
  FORKLIFT_HUB_W,
  FORKLIFT_PARKS,
  FORKLIFT_ACTIVE,
  CRANE_HOME,
  STAIRS,
  STAIR_Y,
  MECH_LINGER_Y_MAX,
  GOSSIP_RING_RADIUS,
  BRIDGE_Y_MIN,
  BRIDGE_Y_MAX,
  RUNWAY_X,
  HOIST_RAISED,
  HOIST_MAX,
  TROLLEY_NORTH,
  CLAW_OPEN,
  CLAW_GRIP,
  CLAW_PALM,
  CLAW_FINGER,
  CRANE_CREW,
  FORK_RAISED,
  FORK_LOWERED,
  FORK_ANIM_SPEED,
  FORK_LANE_OFFSET,
  FORK_APPROACH_SOUTH,
  FORK_CREEP_NORTH,
  FORK_TINE_TIP_X,
  FORK_OVERSHOOT,
  FORK_TINE_Y_BASE,
  FORK_DROP_VIS,
  MECH_LANE_OFFSET,
  MECH_APPROACH_ALONG,
  MECH_CREEP_IN,
  MECH_HAND_REACH_X,
  MECH_HAND_GRIP_Y,
  MECH_HANDOFF_SPEED,
  WELD_TORCH_REACH,
  CARGO_MIN,
  CARGO_MAX,
  PILE_CAP,
  INBOUND_SOFT_CAP,
  CRATE_VARIANTS,
  SERVICE_CARGO,
  HOLD_CARGO,
  UPGRADE_KINDS,
  PILE_SLOTS,
  COL_OFFSET,
  CARGO_KINDS,
} from './constants.js';
import {
  padCenters,
  colXs,
  bayIndexFromX,
  colMeta,
  buildPileHardpoints,
  hangarPadX,
  rollSidePad,
  bayLabels,
} from './layout.js';
import {
  makeCargo,
  makeCatalogUpgradeCargo,
  makeInboundCargo,
  packCargoHold,
  meterServiceUnits,
  hullRepairPipCount,
  hullPipHealAmount,
  cargoServiceUnits,
  visitorServiceBias,
  syncCargoSpace,
  addCargoHoldBlock,
  removeCargoHoldBlock,
  crateKindFromHoldBlock,
  holdBlockSkinFromCargo,
  pickHoldCrateSkin,
  statColorForPct,
  cargoSpaceFromHold,
  cargoMkForVisitor,
  cargoBaySpec,
  smoothstep,
  pingPong01,
  pipRevealDelays,
  clearVisitorThrusters,
  rollVisitorPadMk,
  shuffleInPlace,
  needRequestChance,
  unitsFromNeed,
  SERVICE_STAGING_TYPES,
} from './cargoCatalog.js';
import { rand, pick, randInt, thrusterActivity, bayLaneHalf, weldSpotsForPip, craneJobDistScale } from './helpers.js';
`;

function writeMixin(filename, attachName, methodsList) {
  const content = `/**
 * ${path.basename(filename, '.js')} — HangarBay prototype mixin.
 */
${MIXIN_IMPORTS}

export function ${attachName}(HangarBay) {
${toMixinMethods(methodsList)}
}
`;
  fs.writeFileSync(path.join(OUT, filename), content);
}

fs.mkdirSync(OUT, { recursive: true });

fs.writeFileSync(path.join(OUT, 'constants.js'), constantsJs);
fs.writeFileSync(path.join(OUT, 'helpers.js'), helpersJs);
fs.writeFileSync(path.join(OUT, 'layout.js'), layoutJs);
fs.writeFileSync(path.join(OUT, 'cargoCatalog.js'), cargoCatalogJs);

writeMixin('CrewShared.js', 'attachCrewShared', buckets.CrewShared);
writeMixin('VisitorTraffic.js', 'attachVisitorTraffic', buckets.VisitorTraffic);
writeMixin('CraneSim.js', 'attachCraneSim', buckets.CraneSim);
writeMixin('ForkliftAI.js', 'attachForkliftAI', buckets.ForkliftAI);
writeMixin('MechanicAI.js', 'attachMechanicAI', buckets.MechanicAI);
writeMixin('HangarRender.js', 'attachHangarRender', buckets.HangarRender);

const coreBody = buckets.HangarBay.map((m) => m.body).join('\n\n');

const hangarImports = headerImports
  .replace(/from '\.\.\/(core|utils|entities|ships)\//g, "from '../../$1/")
  .replace("from '../hangar-layout.js'", "from '../hangar-layout.js'")
  .replace("from '../ServiceBoard.js'", "from '../ServiceBoard.js'")
  .replace("from '../HangarVisitorShips.js'", "from '../HangarVisitorShips.js'")
  .replace("from '../place/index.js'", "from '../place/index.js'");

const hangarBayJs = `${hangarImports}
import {
  hangarZoomMin,
  hangarZoomMax,
  hangarDefaultZoom,
  hangarElevatorZoom,
  FACE_SOUTH,
  FACE_NORTH,
  BAY,
  ROW,
  ROW_Y,
  DANGER_ZONE_SOUTH,
  SERVICE_BOARD_TOP,
  SERVICE_BOARD_BOTTOM,
  BACKSPLASH_Y,
  BACKSPLASH_BAND,
  BACKSPLASH_BYPASS,
  BACKSPLASH_HALF_W,
  MECH_BODY_R,
  DANGER_ZONE_PAD,
  FLOOR_DROP_CRANE_AGE,
  APRON_SAFE_Y,
  BAY_COMPUTERS,
  CREW_VIS_OCT,
  CREW_VIS_TURN,
  CREW_VIS_TURN_LOCK,
  MECH_TURN_ALIGN,
  MECH_TURN_STOP,
  MECH_BAY_THEMES,
  FORK_TRUCK_LEN,
  FORKLIFT_HUB_W,
  FORKLIFT_PARKS,
  FORKLIFT_ACTIVE,
  CRANE_HOME,
  STAIRS,
  STAIR_Y,
  MECH_LINGER_Y_MAX,
  GOSSIP_RING_RADIUS,
  BRIDGE_Y_MIN,
  BRIDGE_Y_MAX,
  RUNWAY_X,
  HOIST_RAISED,
  HOIST_MAX,
  TROLLEY_NORTH,
  CLAW_OPEN,
  CLAW_GRIP,
  CLAW_PALM,
  CLAW_FINGER,
  CRANE_CREW,
  FORK_RAISED,
  FORK_LOWERED,
  FORK_ANIM_SPEED,
  FORK_LANE_OFFSET,
  FORK_APPROACH_SOUTH,
  FORK_CREEP_NORTH,
  FORK_TINE_TIP_X,
  FORK_OVERSHOOT,
  FORK_TINE_Y_BASE,
  FORK_DROP_VIS,
  MECH_LANE_OFFSET,
  MECH_APPROACH_ALONG,
  MECH_CREEP_IN,
  MECH_HAND_REACH_X,
  MECH_HAND_GRIP_Y,
  MECH_HANDOFF_SPEED,
  WELD_TORCH_REACH,
  CARGO_MIN,
  CARGO_MAX,
  PILE_CAP,
  INBOUND_SOFT_CAP,
  CRATE_VARIANTS,
  SERVICE_CARGO,
  HOLD_CARGO,
  UPGRADE_KINDS,
  PILE_SLOTS,
  COL_OFFSET,
  CARGO_KINDS,
} from './constants.js';
import {
  padCenters,
  colXs,
  applyHangarSidePadX,
  hangarPadX,
  syncHangarSidePadFromLayout,
  bayIndexFromX,
  colMeta,
  buildPileHardpoints,
  rollSidePad,
  bayLabels,
} from './layout.js';
import {
  makeCargo,
  makeCatalogUpgradeCargo,
  makeInboundCargo,
  packCargoHold,
  meterServiceUnits,
  hullRepairPipCount,
  hullPipHealAmount,
  cargoServiceUnits,
  visitorServiceBias,
  syncCargoSpace,
  addCargoHoldBlock,
  removeCargoHoldBlock,
  crateKindFromHoldBlock,
  holdBlockSkinFromCargo,
  pickHoldCrateSkin,
  statColorForPct,
  cargoSpaceFromHold,
  cargoMkForVisitor,
  cargoBaySpec,
  smoothstep,
  pingPong01,
  pipRevealDelays,
  clearVisitorThrusters,
  rollVisitorPadMk,
  shuffleInPlace,
  needRequestChance,
  unitsFromNeed,
  SERVICE_STAGING_TYPES,
} from './cargoCatalog.js';
import { rand, pick, randInt, thrusterActivity, bayLaneHalf, weldSpotsForPip, craneJobDistScale } from './helpers.js';
import { attachHangarRender } from './HangarRender.js';
import { attachCraneSim } from './CraneSim.js';
import { attachForkliftAI } from './ForkliftAI.js';
import { attachMechanicAI } from './MechanicAI.js';
import { attachVisitorTraffic } from './VisitorTraffic.js';
import { attachCrewShared } from './CrewShared.js';

export {
  hangarZoomMin,
  hangarZoomMax,
  hangarDefaultZoom,
  hangarElevatorZoom,
} from './constants.js';
export {
  applyHangarSidePadX,
  hangarPadX,
  syncHangarSidePadFromLayout,
} from './layout.js';

export class HangarBay {
${coreBody}
}

attachCrewShared(HangarBay);
attachVisitorTraffic(HangarBay);
attachCraneSim(HangarBay);
attachForkliftAI(HangarBay);
attachMechanicAI(HangarBay);
attachHangarRender(HangarBay);
`;

fs.writeFileSync(path.join(OUT, 'HangarBay.js'), hangarBayJs);

fs.writeFileSync(
  SRC,
  `/** Barrel — re-exports hangar module split (import path unchanged). */
export {
  HangarBay,
  hangarZoomMin,
  hangarZoomMax,
  hangarDefaultZoom,
  hangarElevatorZoom,
  applyHangarSidePadX,
  hangarPadX,
  syncHangarSidePadFromLayout,
} from './hangar/HangarBay.js';
`
);

console.log('Method counts:');
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k}: ${v.length}`);
console.log('\nLine counts:');
for (const f of fs.readdirSync(OUT).sort()) {
  const n = fs.readFileSync(path.join(OUT, f), 'utf8').split('\n').length;
  console.log(`  ${f}: ${n}`);
}
