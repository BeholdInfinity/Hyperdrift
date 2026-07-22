#!/usr/bin/env python3
"""Mechanical HangarBay.js split — phases 1–3."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/world/HangarBay.js"
HANGAR = ROOT / "src/world/hangar"


def read_lines():
    return SRC.read_text(encoding="utf-8").splitlines(keepends=True)


def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def slice_lines(lines, start_1, end_1):
    return "".join(lines[start_1 - 1 : end_1])


def phase1(lines):
    """Extract pre-class modules + move class to hangar/HangarBay.js."""
    pre = lines[:983]
    cls = lines[983:]

    constants_header = '''/**
 * Hangar bay geometry, tuning constants, and camera zoom helpers.
 */

import { HANGAR, SHIP } from '../../core/Constants.js';
import { clamp } from '../../utils/MathUtils.js';
import { SERVICE_BOARD_BOTTOM } from './layoutInternals.js';

'''

    layout_internals = '''/**
 * Layout internals shared with constants (SERVICE_BOARD_* derived from ROW_Y).
 * Imported by constants.js for zoom framing; re-exported via layout.js for sim.
 */

import { HANGAR, SHIP } from '../../core/Constants.js';

export const FACE_SOUTH = Math.PI / 2;
export const FACE_NORTH = SHIP.SPAWN_ANGLE;

export const BAY = {
  HALF_W: 340,
  HALF_H: 200,
  PAD_R: HANGAR.PAD_R,
  DOOR_HALF: 52,
  DOOR_H: 42,
  VIEWPORT_W: 96,
  VIEWPORT_H: 22,
  PATH_Y: 148,
  BULK_DOOR_HALF: 32,
  BULK_THICK: 16,
  RUNWAY_INSET: 26,
};

export const ROW = { N: 0, M: 1, S: 2 };
export const COL_OFFSET = 58;
export const ROW_Y = [-78, 8, 118];
export const DANGER_ZONE_SOUTH = (ROW_Y[1] + ROW_Y[2]) / 2;
export const SERVICE_BOARD_TOP = DANGER_ZONE_SOUTH + 14 - 28;
export const BACKSPLASH_HALF_W = 62;
export const SERVICE_BOARD_H = 48;
export const SERVICE_BOARD_BOTTOM = SERVICE_BOARD_TOP + SERVICE_BOARD_H;
'''

    # Build constants body from original lines 178-413 (after zoom funcs use SERVICE_BOARD_BOTTOM)
    constants_body = slice_lines(pre, 178, 413)

    constants_zoom = slice_lines(pre, 134, 176)

    constants_file = constants_header + constants_zoom + "\n" + constants_body

    layout_header = '''/**
 * Hangar pad layout — bay spacing, pad centers, sidePadX apply.
 */

import { HANGAR } from '../../core/Constants.js';
import { getHangarSidePadX } from '../hangar-layout.js';
import {
  BAY,
  BAY_COMPUTERS,
  COL_OFFSET,
  FACE_NORTH,
  FACE_SOUTH,
  ROW,
  ROW_Y,
  STAIRS,
} from './constants.js';
import {
  bayLabels,
  padCenters,
  syncBayAnchors,
} from './layoutInternals.js';

'''

    layout_internals_header = '''/**
 * Core pad geometry — padCenters, syncBayAnchors, col helpers.
 */

import { HANGAR } from '../../core/Constants.js';
import { getHangarSidePadX } from '../hangar-layout.js';
import {
  BAY,
  COL_OFFSET,
  FACE_NORTH,
  FACE_SOUTH,
  ROW,
  ROW_Y,
  SERVICE_BOARD_BOTTOM,
  SERVICE_BOARD_TOP,
  BACKSPLASH_HALF_W,
  SERVICE_BOARD_H,
  DANGER_ZONE_SOUTH,
} from './constants.js';

export const APRON_SAFE_Y = SERVICE_BOARD_BOTTOM + 14;

export const BAY_COMPUTERS = [0, 1, 2].map((bay) => ({
  id: `bayComputer${bay}`,
  x: 0,
  y: APRON_SAFE_Y + 8,
  bay,
  kind: 'computer',
}));

export const STAIRS = BAY_COMPUTERS.map((c) => ({
  x: c.x,
  y: c.y + 10,
  bay: c.bay,
  col: c.bay * 2,
}));

export function padCenters() {
  const s = HANGAR.SIDE_PAD_X;
  return [-s, 0, s];
}

export function bayLabels() {
  return ['B1', 'B2', 'B3'];
}

export function syncBayAnchors() {
  const pads = padCenters();
  for (let bay = 0; bay < 3; bay++) {
    BAY_COMPUTERS[bay].x = pads[bay];
    STAIRS[bay].x = pads[bay];
  }
}

export function colXs() {
  const xs = [];
  for (const px of padCenters()) {
    xs.push(px - COL_OFFSET);
    xs.push(px + COL_OFFSET);
  }
  return xs;
}

export function bayIndexFromX(x) {
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

export function colMeta(col) {
  const bay = (col / 2) | 0;
  const lane = col % 2 === 0 ? 'in' : 'out';
  return { bay, lane, bayId: bayLabels()[bay] };
}

export function pileId(row, col) {
  return `r${row}c${col}`;
}

export function rowRole(row) {
  if (row === ROW.N) return 'upgrade';
  if (row === ROW.M) return 'cargo';
  return 'storage';
}

export function buildPileHardpoints() {
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

// Honor baked hangar-layout sidePadX at module load.
HANGAR.SIDE_PAD_X = getHangarSidePadX();
syncBayAnchors();
'''

    layout_exports = slice_lines(pre, 443, 491)

    cargo_header = '''/**
 * Hangar cargo catalog, hold packing, and service meter helpers.
 */

import { HANGAR } from '../../core/Constants.js';
import {
  upgradeKindFromItemId,
  pickAmbientCatalogUpgradeId,
} from '../../ships/HangarLoadout.js';
import { VISITOR_CATALOG, equipPadVisitor, pickVisitorId } from '../HangarVisitorShips.js';
import {
  CRATE_VARIANTS,
  CREW_VIS_OCT,
  CARGO_KINDS,
  HOLD_CARGO,
  PILE_SLOTS,
  SERVICE_CARGO,
  UPGRADE_KINDS,
  FACE_NORTH,
  FACE_SOUTH,
} from './constants.js';
import { buildPileHardpoints, colMeta, colXs, pileId, rowRole } from './layoutInternals.js';
import { pick, rand, randInt } from './helpers.js';

'''

    helpers_content = '''/**
 * Shared hangar math / random helpers.
 */

import { CREW_VIS_OCT, WELD_SPOTS_MAX, WELD_SPOTS_MIN } from './constants.js';

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

export function randInt(lo, hi) {
  return lo + ((Math.random() * (hi - lo + 1)) | 0);
}

export function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

export function pingPong01(t) {
  const x = t - Math.floor(t / 2) * 2;
  return x < 1 ? x : 2 - x;
}

export function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function weldSpotsForPip() {
  return WELD_SPOTS_MIN + ((Math.random() * (WELD_SPOTS_MAX - WELD_SPOTS_MIN + 1)) | 0);
}

export function thrusterActivity(ship) {
  if (!ship?.thrusters) return { maneuver: 0, engine: 0 };
  const t = ship.thrusters;
  let maneuver = 0;
  for (const k of [
    'aftPort', 'aftStarboard', 'nosePort', 'noseStarboard',
    'portFore', 'portAft', 'starboardFore', 'starboardAft',
  ]) {
    maneuver = Math.max(maneuver, t[k] || 0);
  }
  const engine = Math.max(t.mainEngine || 0, t.afterburner || 0);
  return { maneuver, engine };
}

export function craneJobDistScale() {
  return Math.max(120, HANGAR.SIDE_PAD_X * 0.97);
}

export function bayLaneHalf() {
  const halfGap = HANGAR.SIDE_PAD_X / 2;
  return Math.min(72, Math.max(52, halfGap - 6));
}
'''

    # Fix helpers - need HANGAR import
    helpers_content = helpers_content.replace(
        'export function craneJobDistScale()',
        "import { HANGAR } from '../../core/Constants.js';\n\nexport function craneJobDistScale()",
    )

    cargo_body = slice_lines(pre, 493, 982)

    write(HANGAR / "layoutInternals.js", layout_internals_header)
    write(HANGAR / "constants.js", constants_file)
    write(HANGAR / "helpers.js", helpers_content)
    write(HANGAR / "cargoCatalog.js", cargo_header + cargo_body)
    write(
        HANGAR / "layout.js",
        layout_header + layout_exports + "\nexport * from './layoutInternals.js';\n",
    )

    print("Phase 1 modules written")


if __name__ == "__main__":
    phase1(read_lines())
