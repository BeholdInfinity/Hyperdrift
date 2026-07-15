/**
 * View modes for modular ships.
 * topDown — flight
 * angled — hangar / inspection; headingIndex 0..15 (22.5° steps)
 *
 * Heading index 0 = nose screen-east (canvas +X). Positive angles are
 * clockwise (canvas), so index 12 = nose screen-north.
 */

export const VIEW_TOP_DOWN = 'topDown';
export const VIEW_ANGLED = 'angled';
export const ANGLED_HEADING_COUNT = 16;

/**
 * Compass labels for headingIndex 0..15 (nose direction on screen).
 * Order: E → clockwise → N → … back to E-NE.
 */
export const COMPASS_LABELS = [
  'E',
  'E-SE',
  'SE',
  'S-SE',
  'S',
  'S-SW',
  'SW',
  'W-SW',
  'W',
  'W-NW',
  'NW',
  'N-NW',
  'N',
  'N-NE',
  'NE',
  'E-NE',
];

/**
 * @param {number} headingIndex 0..15
 * @returns {string}
 */
export function labelCompassHeading(headingIndex) {
  const i =
    ((Math.round(headingIndex) % ANGLED_HEADING_COUNT) + ANGLED_HEADING_COUNT) %
    ANGLED_HEADING_COUNT;
  return COMPASS_LABELS[i] || 'E';
}

/**
 * @param {number} angleRad ship or visual heading
 * @returns {number} 0..15
 */
export function headingIndexFromAngle(angleRad) {
  const twoPi = Math.PI * 2;
  let a = angleRad % twoPi;
  if (a < 0) a += twoPi;
  // 0 = nose screen-east in ship-local after rotate; hangar often uses world angle
  const step = twoPi / ANGLED_HEADING_COUNT;
  return Math.round(a / step) % ANGLED_HEADING_COUNT;
}

/**
 * Depth cue for angled views (screen-up height factor).
 * @param {number} headingIndex 0..15
 */
export function angledDepthScale(headingIndex) {
  // Mild Y foreshortening; side peeks come from extrude lift, not squash alone.
  // Kept close to 1 so North-facing proportions stay near the flat 2D silhouette.
  const t = headingIndex / ANGLED_HEADING_COUNT;
  return 0.9 + 0.05 * Math.cos(t * Math.PI * 2);
}

/**
 * Screen-up lift in ship-local space for a given compass heading.
 * After the caller rotates by ship angle (= heading), this maps to canvas −Y
 * so the deck shifts toward the top of the screen and hull sides peek below.
 * @param {number} headingIndex 0..15
 * @param {number} height px lift strength
 * @returns {{ x: number, y: number }}
 */
export function angledLiftLocal(headingIndex, height) {
  const i =
    ((Math.round(headingIndex) % ANGLED_HEADING_COUNT) + ANGLED_HEADING_COUNT) %
    ANGLED_HEADING_COUNT;
  const a = (i / ANGLED_HEADING_COUNT) * Math.PI * 2;
  return {
    x: -Math.sin(a) * height,
    y: -Math.cos(a) * height,
  };
}

/**
 * @typedef {{ mode: 'topDown'|'angled', headingIndex?: number, explode?: boolean }} ShipView
 */

/** Active view for nested draws (extrude / theme skin). Set by ShipRenderer. */
let _activeShipView = { mode: VIEW_TOP_DOWN };

/** Deck lift from the last angled extrude — skins/overlays follow the raised face. */
let _lastDeckLift = { x: 0, y: 0 };

export function beginShipDraw(view) {
  _activeShipView = view && view.mode ? view : topDownView();
  _lastDeckLift = { x: 0, y: 0 };
}

export function endShipDraw() {
  _activeShipView = topDownView();
  _lastDeckLift = { x: 0, y: 0 };
}

export function activeShipView() {
  return _activeShipView;
}

export function isAngledShipDraw() {
  return _activeShipView.mode === VIEW_ANGLED;
}

export function setLastDeckLift(x, y) {
  _lastDeckLift = { x, y };
}

export function lastDeckLift() {
  return _lastDeckLift;
}

/** Run deck-overlay draws in the lifted top-face space (no-op when flat). */
export function withDeckLift(ctx, fn) {
  const lift = _lastDeckLift;
  if (!lift.x && !lift.y) {
    fn();
    return;
  }
  ctx.save();
  ctx.translate(lift.x, lift.y);
  fn();
  ctx.restore();
}

export function topDownView() {
  return { mode: VIEW_TOP_DOWN };
}

export function angledView(headingIndex = 0) {
  return {
    mode: VIEW_ANGLED,
    headingIndex:
      ((headingIndex % ANGLED_HEADING_COUNT) + ANGLED_HEADING_COUNT) %
      ANGLED_HEADING_COUNT,
  };
}
