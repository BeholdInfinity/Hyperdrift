/**
 * Shared bay-traffic records for HangarBay ↔ HangarPresence ↔ AmbientTraffic.
 */
import { cloneShipDef } from '../../ships/index.js';
import { VISITOR_ROLE_TO_CLASS } from '../../ships/ShipGenerator.js';
import { HANGAR } from '../../core/Constants.js';

let _nextToken = 1;

/** @typedef {'doorArrive'|'elevRaise'|'doorDepart'|'elevLower'} BayTransition */

export function nextPresenceToken() {
  return `bp-${_nextToken++}-${(Math.random() * 1e6) | 0}`;
}

/**
 * @param {number} bayIndex
 * @param {object} shipDef
 * @param {string} visitorId
 * @param {'door'|'elevator'} path
 */
export function createInboundReservation(bayIndex, shipDef, visitorId, path = 'door') {
  return {
    token: nextPresenceToken(),
    bayIndex: ((bayIndex | 0) + 3) % 3,
    shipDef: cloneBayShip(shipDef),
    visitorId: visitorId || 'hauler',
    path,
    bookedAt: 0,
  };
}

/**
 * @param {number} bayIndex
 * @param {object} shipDef
 * @param {string} visitorId
 */
export function createEgressRecord(bayIndex, shipDef, visitorId) {
  return {
    bayIndex: ((bayIndex | 0) + 3) % 3,
    shipDef: cloneBayShip(shipDef),
    visitorId: visitorId || 'patrol',
  };
}

/** @param {object|null|undefined} def */
export function cloneBayShip(def) {
  if (!def) return null;
  return cloneShipDef(def);
}

/** @param {string|null|undefined} visitorId */
export function visitorIdToClassId(visitorId) {
  if (!visitorId) return 'generalist';
  return VISITOR_ROLE_TO_CLASS[visitorId] || 'generalist';
}

/** Rough remaining service seconds from an active hangar pad service blob. */
export function estimateServiceRemaining(pad, now = 0) {
  const svc = pad?.service;
  if (!svc) return null;
  if (svc.phase === 'dwell') {
    return Math.max(0, (svc.dwellMax || 0) - (svc.dwellT || 0));
  }
  if (svc.phase === 'active' || svc.phase === 'reveal') {
    const items = svc.items?.length || 3;
    return items * 8 + randBand(6, 14);
  }
  return randBand(30, 75);
}

function randBand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

/** Map hangar pad seq / lane into presence transition + phase snapshot. */
export function transitionFromHangarPad(pad, hangarBay, bayIndex) {
  const seqKind = pad?.seq?.kind || '';
  const lane = hangarBay?.bayLaneMode?.[bayIndex] || 'idle';
  const phase = pad?.seq?.phase || 'warn';
  const t = pad?.seq?.t || 0;

  if (seqKind === 'depart' || seqKind === 'doorDepart' || lane === 'departing') {
    return { transition: 'doorDepart', transitionPhase: phase, transitionT: t };
  }
  if (seqKind === 'lower' || seqKind === 'lowerCycle' || (lane === 'elevator' && pad?.visitorId)) {
    return { transition: 'elevLower', transitionPhase: phase, transitionT: t };
  }
  if (seqKind === 'raiseArrive' || seqKind === 'raiseLaunch' || (lane === 'elevator' && !pad?.visitorId)) {
    return { transition: 'elevRaise', transitionPhase: phase, transitionT: t };
  }
  if (seqKind === 'arrive' || seqKind === 'doorArrive' || lane === 'incoming') {
    return { transition: 'doorArrive', transitionPhase: phase, transitionT: t };
  }
  return { transition: null, transitionPhase: 'warn', transitionT: 0 };
}

/** Total door-depart shadow duration until mouth egress (sum of visitor depart beats). */
export function doorDepartDurationToEgress() {
  return (
    1.2 +
    3.2 +
    HANGAR.VISITOR_DOOR_TIME +
    0.15 +
    HANGAR.VISITOR_LIFT_TIME +
    5
  );
}

export function elevLowerDuration() {
  return 1.0 + 3.0 + HANGAR.VISITOR_SINK_TIME + HANGAR.VISITOR_BELOW_TIME + HANGAR.VISITOR_RISE_TIME;
}

export function elevRaiseDuration() {
  return (
    0.9 +
    2.8 +
    HANGAR.VISITOR_SINK_TIME +
    HANGAR.VISITOR_BELOW_TIME * 0.85 +
    HANGAR.VISITOR_RISE_TIME
  );
}
