import { HANGAR } from '../../core/Constants.js';
import { FACE_NORTH, FACE_SOUTH, ROW, ROW_Y, BAY_COMPUTERS, STAIRS, COL_OFFSET } from './constants.js';
import { getHangarSidePadX } from '../hangar-layout.js';
import { pickVisitorId, equipPadVisitor } from '../HangarVisitorShips.js';
import { rand } from './helpers.js';
import { rollVisitorPadMk } from './cargoCatalog.js';

function colXs() {
  const xs = [];
  for (const px of padCenters()) {
    xs.push(px - COL_OFFSET); // inbound (load)
    xs.push(px + COL_OFFSET); // outbound (unload)
  }
  return xs;
}

function padCenters() {
  const s = HANGAR.SIDE_PAD_X;
  return [-s, 0, s];
}

function bayLabels() {
  return ['B1', 'B2', 'B3'];
}

function syncBayAnchors() {
  const pads = padCenters();
  for (let bay = 0; bay < 3; bay++) {
    BAY_COMPUTERS[bay].x = pads[bay];
    STAIRS[bay].x = pads[bay];
  }
}

export function applyHangarSidePadX(sidePadX, hangarBay = null, delta = 0) {
  const next = Math.round(sidePadX);
  if (!Number.isFinite(next)) return;
  /** Classify with OLD pad centers before mutating SIDE_PAD_X. */
  const floorMoves = [];
  const agentMoves = [];
  let craneBay = null;
  if (hangarBay && delta) {
    if (hangarBay.floorDrops?.length) {
      for (const drop of hangarBay.floorDrops) {
        const bay = bayIndexFromX(drop.x);
        if (bay === 0 || bay === 2) floorMoves.push({ drop, bay });
      }
    }
    for (const npc of hangarBay.npcs || []) {
      const bay =
        typeof npc.homeBay === 'number'
          ? npc.homeBay
          : typeof npc.bay === 'number'
            ? npc.bay
            : bayIndexFromX(npc.x);
      if (bay === 0 || bay === 2) agentMoves.push({ npc, bay });
    }
    if (hangarBay.crane && Number.isFinite(hangarBay.crane.trolleyX)) {
      craneBay = bayIndexFromX(hangarBay.crane.trolleyX);
      if (craneBay !== 0 && craneBay !== 2) craneBay = null;
    }
  }
  HANGAR.SIDE_PAD_X = next;
  syncBayAnchors();
  hangarBay?._syncSidePadPositions?.(delta, floorMoves, agentMoves, craneBay);
}

export function hangarPadX(bayIndex) {
  return padCenters()[bayIndex] ?? 0;
}

export function syncHangarSidePadFromLayout(hangarBay = null) {
  applyHangarSidePadX(getHangarSidePadX(), hangarBay, 0);
}

function bayIndexFromX(x) {
  const pads = padCenters();
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pads.length; i++) {
    const d = Math.abs(pads[i] - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function colMeta(col) {
  const bay = (col / 2) | 0;
  const lane = col % 2 === 0 ? 'in' : 'out';
  return { bay, lane, bayId: bayLabels()[bay] };
}

function rowRole(row) {
  if (row === ROW.N) return 'upgrade';
  if (row === ROW.M) return 'cargo';
  return 'storage';
}

function pileId(row, col) {
  return `r${row}c${col}`;
}

function buildPileHardpoints() {
  const cols = colXs();
  const piles = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      const meta = colMeta(col);
      piles.push({
        id: pileId(row, col),
        row,
        col,
        bay: meta.bay,
        bayId: meta.bayId,
        lane: meta.lane,
        role: rowRole(row),
        x: cols[col],
        y: ROW_Y[row],
        items: [],
      });
    }
  }
  return piles;
}

function rollSidePad(x, bayId, bayIndex, peerPadMk = 2) {
  /**
   * All visitor pads share one roll: mostly the player's pad tier (peer-sized)
   * with an occasional smaller UltraLight/Light ship for variety. Physical discs
   * are Mk2-sized on every bay.
   */
  const padMk = rollVisitorPadMk(peerPadMk);
  const occupied = Math.random() < HANGAR.VISITOR_OCCUPY_CHANCE;
  const visitorId = occupied ? pickVisitorId(padMk) : null;
  const pad = {
    x,
    bayId,
    bayIndex,
    padMk,
    visitorId: null,
    shipDef: null,
    cooldown: occupied
      ? rand(HANGAR.VISITOR_COOLDOWN_BUSY_MIN, HANGAR.VISITOR_COOLDOWN_BUSY_MAX)
      : rand(HANGAR.VISITOR_COOLDOWN_EMPTY_MIN, HANGAR.VISITOR_COOLDOWN_EMPTY_MAX),
    seq: null,
    shipY: 0,
    shipScale: 1,
    shipHover: 0,
    shipAngle: occupied ? FACE_NORTH : FACE_SOUTH,
    /** Turntable facing — empty pads point south; occupied face north */
    padAngle: occupied ? FACE_NORTH : FACE_SOUTH,
    padDrop: 0,
    thrusters: null,
    shipVx: 0,
    shipVy: 0,
    shipState: null,
    service: null,
    /** Request an ambient runway approach (pilot in space view) */
    wantSpaceArrival: false,
  };
  if (visitorId) equipPadVisitor(pad, visitorId);
  return pad;
}

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
