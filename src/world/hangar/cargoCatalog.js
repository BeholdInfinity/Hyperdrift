import { HANGAR } from '../../core/Constants.js';
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

export function nextServiceSeq() {
  return _serviceSeq++;
}

function pickHoldCrateSkin() {
  const k = pick(CRATE_VARIANTS);
  return { color: k.color, accent: k.accent, variant: k.variant };
}

function holdBlockSkinFromCargo(cargo) {
  if (!cargo?.color) return pickHoldCrateSkin();
  return {
    color: cargo.color,
    accent: cargo.accent || '#c9a020',
    variant: cargo.variant ?? 0,
  };
}

function crateKindFromHoldBlock(block) {
  if (!block) return pick(CRATE_VARIANTS);
  const byVar = CRATE_VARIANTS.find((k) => k.variant === block.variant);
  if (byVar) return byVar;
  const byColor = CRATE_VARIANTS.find((k) => k.color === block.color);
  if (byColor) return byColor;
  return {
    ...CRATE_VARIANTS[0],
    color: block.color || CRATE_VARIANTS[0].color,
    accent: block.accent || CRATE_VARIANTS[0].accent,
    variant: block.variant ?? 0,
  };
}

function cargoBaySpec(mk) {
  const m = Math.max(0, Math.min(9, mk | 0));
  return CARGO_BAY_SPECS[m];
}

function cargoMkForVisitor(visitorId, shipDef = null) {
  if (shipDef?.classDef?.cargoMkDefault != null) {
    return Math.max(0, Math.min(9, shipDef.classDef.cargoMkDefault | 0));
  }
  if (visitorId && VISITOR_CARGO_MK[visitorId] != null) return VISITOR_CARGO_MK[visitorId];
  if (visitorId && VISITOR_CATALOG[visitorId]?.cargoMk != null) {
    return VISITOR_CATALOG[visitorId].cargoMk;
  }
  return 5;
}

function packCargoHold(mk, cargoSpace) {
  const spec = cargoBaySpec(mk);
  if (!spec.slots) {
    return { mk: 0, slots: 0, cols: 0, rows: 0, cells: [] };
  }
  const occupied = Math.max(0, Math.min(1, 1 - cargoSpace));
  let fill = Math.round(spec.slots * occupied);
  fill = Math.max(0, Math.min(spec.slots, fill));
  const grid = Array.from({ length: spec.rows }, () => Array(spec.cols).fill(false));
  const cells = [];
  const tryPlace = (c, r, w, h, skin) => {
    if (c + w > spec.cols || r + h > spec.rows) return false;
    for (let yy = r; yy < r + h; yy++) {
      for (let xx = c; xx < c + w; xx++) {
        if (grid[yy][xx]) return false;
      }
    }
    for (let yy = r; yy < r + h; yy++) {
      for (let xx = c; xx < c + w; xx++) grid[yy][xx] = true;
    }
    cells.push({ c, r, w, h, ...skin });
    return true;
  };
  let left = fill;
  // 1×1 slots only (one load/unload = one cargo slot)
  for (let r = 0; r < spec.rows && left > 0; r++) {
    for (let c = 0; c < spec.cols && left > 0; c++) {
      if (!grid[r][c] && tryPlace(c, r, 1, 1, pickHoldCrateSkin())) left -= 1;
    }
  }
  return {
    mk: spec.mk,
    slots: spec.slots,
    cols: spec.cols,
    rows: spec.rows,
    cells,
  };
}

function statColorForPct(pct01) {
  if (pct01 >= 0.7) return 'green';
  if (pct01 >= 0.4) return 'yellow';
  return 'red';
}

function cargoSpaceFromHold(hold) {
  if (!hold?.slots) return 1;
  let used = 0;
  for (const c of hold.cells || []) used += (c.w || 1) * (c.h || 1);
  return Math.max(0, Math.min(1, 1 - used / hold.slots));
}

function syncCargoSpace(st) {
  if (!st?.cargoHold) return;
  st.cargoSpace = cargoSpaceFromHold(st.cargoHold);
}

function addCargoHoldBlock(hold, skinOrCargo = null) {
  if (!hold?.slots || !hold.cols || !hold.rows) return false;
  if (!hold.cells) hold.cells = [];
  const grid = Array.from({ length: hold.rows }, () => Array(hold.cols).fill(false));
  for (const b of hold.cells) {
    for (let yy = b.r; yy < b.r + (b.h || 1); yy++) {
      for (let xx = b.c; xx < b.c + (b.w || 1); xx++) {
        if (yy < hold.rows && xx < hold.cols) grid[yy][xx] = true;
      }
    }
  }
  const skin = holdBlockSkinFromCargo(skinOrCargo);
  for (let r = 0; r < hold.rows; r++) {
    for (let c = 0; c < hold.cols; c++) {
      if (!grid[r][c]) {
        hold.cells.push({ c, r, w: 1, h: 1, ...skin });
        return true;
      }
    }
  }
  return false;
}

function removeCargoHoldBlock(hold) {
  if (!hold?.cells?.length) return null;
  // Prefer removing a 1×1
  let idx = hold.cells.findIndex((b) => (b.w || 1) * (b.h || 1) === 1);
  if (idx < 0) idx = hold.cells.length - 1;
  const [removed] = hold.cells.splice(idx, 1);
  return removed || null;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function pingPong01(t) {
  const x = t - Math.floor(t / 2) * 2;
  return x < 1 ? x : 2 - x;
}

function pipRevealDelays(revealOrder, typeById) {
  const delays = [];
  let prevType = null;
  for (let i = 0; i < revealOrder.length; i++) {
    const type = typeById.get(revealOrder[i]) || '';
    if (i > 0 && type && type === prevType) {
      delays.push(
        rand(HANGAR.BOARD_REVEAL_PIP_GAP_SAME_MIN, HANGAR.BOARD_REVEAL_PIP_GAP_SAME_MAX)
      );
    } else {
      delays.push(
        rand(HANGAR.BOARD_REVEAL_PIP_GAP_DIFF_MIN, HANGAR.BOARD_REVEAL_PIP_GAP_DIFF_MAX)
      );
    }
    prevType = type;
  }
  return delays;
}

function needRequestChance(need) {
  const n = Math.max(0, Math.min(1, need));
  return n ** 2.2;
}

function unitsFromNeed(need) {
  const n = Math.max(0, Math.min(1, need));
  if (n <= 0) return 0;
  return Math.max(1, Math.min(3, 1 + Math.floor(n * 2)));
}

function meterServiceUnits(meter01, bias = 1) {
  const m = Math.max(0, Math.min(1, meter01));
  if (m >= STAT_GREEN) return 0;
  const need = Math.min(1, (1 - m) * Math.max(0.5, bias));
  if (m < STAT_RED) return Math.max(1, unitsFromNeed(need));
  if (Math.random() >= needRequestChance(need)) return 0;
  return unitsFromNeed(need);
}

function hullPipHealAmount() {
  return HULL_PIP_HEAL_MIN + Math.random() * (HULL_PIP_HEAL_MAX - HULL_PIP_HEAL_MIN);
}

function hullRepairPipCount(hull01, bias = 1) {
  const m = Math.max(0, Math.min(1, hull01));
  if (m >= STAT_GREEN) return 0;
  const need = Math.min(1, (1 - m) * Math.max(0.5, bias));
  if (m >= STAT_RED && Math.random() >= needRequestChance(need)) return 0;
  const deficit = Math.max(0, 1 - m);
  let n = Math.max(1, Math.round(deficit / HULL_PIP_HEAL_AVG));
  n = Math.min(HULL_PIP_COUNT_MAX, n);
  if (m < STAT_RED) return Math.max(1, n);
  return n;
}

function cargoServiceUnits(slotCount, fraction01, bias = 1) {
  const slots = Math.max(0, slotCount | 0);
  if (slots <= 0) return 0;
  const frac = Math.max(0, Math.min(1, fraction01 * Math.max(0.5, bias)));
  if (frac <= 0.05) return 0;
  const cap = Math.min(slots, 8);
  if (frac < 0.35 && Math.random() >= needRequestChance(frac)) return 0;
  if (frac >= 0.7) {
    return Math.max(1, Math.min(cap, Math.round(slots * frac)));
  }
  if (Math.random() >= needRequestChance(frac)) return 0;
  return Math.max(1, Math.min(cap, Math.round(slots * Math.max(0.35, frac))));
}

function visitorServiceBias(visitorId) {
  const combat = ['scout', 'interceptor', 'patrol', 'gunship', 'warden'];
  const cargoHeavy = ['hauler', 'freighter', 'tanker'];
  if (combat.includes(visitorId)) return { ammo: 1.15, hull: 1.1, fuel: 1, cargo: 0.85 };
  if (cargoHeavy.includes(visitorId)) return { ammo: 0.9, hull: 1, fuel: 1, cargo: 1.2 };
  return { ammo: 1, hull: 1, fuel: 1, cargo: 1 };
}

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function clearVisitorThrusters(pad) {
  if (!pad.thrusters) return;
  for (const k of Object.keys(pad.thrusters)) pad.thrusters[k] = 0;
}

function makeCargo(kind = null) {
  let k;
  if (!kind) {
    k = { ...pick(CRATE_VARIANTS) };
  } else if (kind.label === 'CRATE' && kind.variant == null) {
    k = { ...pick(CRATE_VARIANTS) };
  } else {
    k = { ...kind };
  }
  const cargo = {
    id: _cargoSeq++,
    label: k.label,
    family: k.family || 'cargo',
    shape: k.shape || 'crate',
    variant: k.variant ?? 0,
    w: k.w,
    h: k.h,
    color: k.color,
    accent: k.accent || null,
    hp: k.hp,
    maxHp: k.hp,
    /** Resting 8-dir yaw on piles / floor (carrier overrides while held). */
    restHeading: ((Math.random() * 8) | 0) * CREW_VIS_OCT,
  };
  if (k.catalogItemId) {
    cargo.catalogItemId = k.catalogItemId;
    cargo.catalogCategory = k.catalogCategory;
    cargo.catalogMk = k.catalogMk;
    cargo.catalogTheme = k.catalogTheme;
    cargo.catalogVariant = k.catalogVariant;
  }
  if (k.targetHardpointKey) cargo.targetHardpointKey = k.targetHardpointKey;
  return cargo;
}

function makeCatalogUpgradeCargo(itemId) {
  const kind = upgradeKindFromItemId(itemId);
  if (kind) return makeCargo(kind);
  return makeCargo(pick(UPGRADE_KINDS));
}

function makeInboundCargo() {
  // Forklift arrivals: mostly generic crates; upgrades from ItemCatalog only
  if (Math.random() < 0.18) {
    const id = pickAmbientCatalogUpgradeId('standard');
    if (id) return makeCatalogUpgradeCargo(id);
  }
  if (Math.random() < 0.12) return makeCargo(pick(SERVICE_CARGO));
  return makeCargo(pick(CRATE_VARIANTS));
}

function rollVisitorPadMk(peerPadMk) {
  if (peerPadMk <= 1) return 1;
  return Math.random() < HANGAR.VISITOR_PEER_MK_CHANCE ? peerPadMk : 1;
}

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
