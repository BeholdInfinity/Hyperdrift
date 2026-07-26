/**
 * Lightweight Jennings hangar bay state while the pilot is in exterior space.
 * Drives pad beacons, mouth traffic, and locked ship identity without full InteriorSession sim.
 */
import { HANGAR } from '../../core/Constants.js';
import {
  cloneBayShip,
  createEgressRecord,
  createInboundReservation,
  doorDepartDurationToEgress,
  elevLowerDuration,
  elevRaiseDuration,
  estimateServiceRemaining,
  transitionFromHangarPad,
} from './BayTrafficManifest.js';
import {
  pickVisitorId,
  equipPadVisitor,
  clearPadVisitor,
  makeVisitorThrusters,
} from '../HangarVisitorShips.js';
import { rollVisitorPadMk } from './cargoCatalog.js';
import { FACE_NORTH } from './constants.js';
import { rand } from './helpers.js';

const BAY_COUNT = 3;
const SERVICE_MIN = 42;
const SERVICE_MAX = 88;

function emptyPadSnap(bayIndex) {
  return {
    bayIndex,
    occupied: false,
    wantSpaceArrival: false,
    cooldown: rand(HANGAR.VISITOR_COOLDOWN_EMPTY_MIN, HANGAR.VISITOR_COOLDOWN_EMPTY_MAX),
    transition: null,
    transitionPhase: 'warn',
    transitionT: 0,
    serviceUntil: 0,
    elevatorOnly: false,
    shipDef: null,
    visitorId: null,
    padMk: 2,
    inboundReservation: null,
  };
}

export class HangarPresence {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.playerBayIndex = 1;
    this.bayOffline = [false, false, false];
    this.pads = [0, 1, 2].map(emptyPadSnap);
    this.pendingSpaceEgress = [];
    this.inboundActive = [];
    this.preferExternalDoorTraffic = true;
    this.spaceTrafficActive = true;
    this.time = 0;
  }

  seedDefault(playerBayIndex = 1, peerPadMk = 2) {
    this.reset();
    this.active = true;
    this.playerBayIndex = ((playerBayIndex | 0) + BAY_COUNT) % BAY_COUNT;
    for (const snap of this.pads) {
      if (snap.bayIndex === this.playerBayIndex) continue;
      if (Math.random() < HANGAR.VISITOR_OCCUPY_CHANCE) {
        this._bookAndOccupy(snap, peerPadMk);
        snap.serviceUntil = this.time + rand(SERVICE_MIN, SERVICE_MAX);
      }
    }
  }

  exportFromHangar(hangarBay) {
    if (!hangarBay) return;
    this.reset();
    this.active = true;
    this.playerBayIndex = hangarBay.playerBayIndex ?? 1;
    this.bayOffline = (hangarBay.bayOffline || []).slice(0, BAY_COUNT);
    while (this.bayOffline.length < BAY_COUNT) this.bayOffline.push(false);
    this.time = hangarBay.time || 0;

    for (const eg of hangarBay.pendingSpaceEgress || []) {
      if (eg?.shipDef) {
        this.pendingSpaceEgress.push(createEgressRecord(eg.bayIndex, eg.shipDef, eg.visitorId));
      }
    }

    for (let i = 0; i < BAY_COUNT; i++) {
      const snap = emptyPadSnap(i);
      if (this.bayOffline[i]) {
        this.pads[i] = snap;
        continue;
      }
      if (i === this.playerBayIndex) {
        this.pads[i] = snap;
        continue;
      }
      const pad = hangarBay.sidePads?.find((p) => p.bayIndex === i);
      if (!pad) {
        this.pads[i] = snap;
        continue;
      }

      snap.cooldown = pad.cooldown ?? snap.cooldown;
      snap.wantSpaceArrival = !!pad.wantSpaceArrival;
      snap.elevatorOnly = !!pad.service?.elevatorOnly;

      const tr = transitionFromHangarPad(pad, hangarBay, i);
      snap.transition = tr.transition;
      snap.transitionPhase = tr.transitionPhase;
      snap.transitionT = tr.transitionT;

      if (pad.visitorId && pad.shipDef) {
        snap.occupied = true;
        snap.visitorId = pad.visitorId;
        snap.shipDef = cloneBayShip(pad.shipDef);
        snap.padMk = pad.padMk ?? 2;
        const rem = estimateServiceRemaining(pad, this.time);
        snap.serviceUntil =
          rem != null ? this.time + rem : this.time + rand(SERVICE_MIN, SERVICE_MAX);
      } else if (pad.wantSpaceArrival && pad.shipDef) {
        snap.inboundReservation = createInboundReservation(
          i,
          pad.shipDef,
          pad.visitorId || 'hauler',
          'door'
        );
        snap.inboundSince = this.time;
      } else if (snap.transition === 'doorArrive' && pad.shipDef) {
        snap.inboundReservation = createInboundReservation(
          i,
          pad.shipDef,
          pad.visitorId || 'hauler',
          'door'
        );
        snap.wantSpaceArrival = true;
      } else if (snap.transition === 'elevRaise' && pad.shipDef) {
        snap.inboundReservation = createInboundReservation(
          i,
          pad.shipDef,
          pad.visitorId || 'hauler',
          'elevator'
        );
      }

      if (
        snap.transition === 'doorDepart' &&
        pad.shipDef
      ) {
        snap.occupied = true;
        snap.shipDef = cloneBayShip(pad.shipDef);
        snap.visitorId = pad.visitorId;
        if (
          snap.transitionPhase === 'thrust' ||
          snap.transitionPhase === 'doorsClose' ||
          snap.transitionT >= doorDepartDurationToEgress() * 0.85
        ) {
          this._queueEgress(snap);
        }
      }

      this.pads[i] = snap;
    }
  }

  applyToHangar(hangarBay) {
    if (!hangarBay || !this.active) return;
    for (const snap of this.pads) {
      if (snap.bayIndex === this.playerBayIndex) continue;
      const pad = hangarBay.sidePads?.find((p) => p.bayIndex === snap.bayIndex);
      if (!pad) continue;

      pad.cooldown = snap.cooldown;
      pad.wantSpaceArrival = snap.wantSpaceArrival;

      if (snap.transition === 'elevRaise' || snap.transition === 'elevLower') {
        this._applyTransitionToPad(hangarBay, pad, snap);
        continue;
      }

      if (snap.occupied && snap.shipDef) {
        clearPadVisitor(pad);
        pad.padMk = snap.padMk ?? pad.padMk ?? 2;
        pad.visitorId = snap.visitorId;
        pad.shipDef = cloneBayShip(snap.shipDef);
        pad.thrusters = makeVisitorThrusters(pad.shipDef);
        pad.padAngle = FACE_NORTH;
        pad.shipAngle = FACE_NORTH;
        hangarBay._beginCaptainService?.(pad);
      } else if (snap.inboundReservation?.path === 'door') {
        pad.wantSpaceArrival = !!snap.wantSpaceArrival;
      } else {
        clearPadVisitor(pad);
      }
    }
    this.active = false;
  }

  captureInboundFromAmbient(ambientTraffic) {
    if (!this.active || !ambientTraffic?.ships) return;
    for (const ship of ambientTraffic.ships) {
      if (!this._isCustomerState(ship.state)) continue;
      const lane = ship.targetLane;
      if (lane == null || this.isPlayerBay(lane)) continue;
      const bi = ((lane | 0) + 3) % BAY_COUNT;
      const snap = this.pads[bi];
      if (!snap || snap.occupied) continue;
      const token = ship.presenceToken || snap.inboundReservation?.token;
      if (!token) continue;
      this.inboundActive.push({
        token,
        bayIndex: bi,
        shipDef: cloneBayShip(ship.shipDef),
        visitorId: ship.visitorId || 'hauler',
        ambientId: ship.id,
      });
    }
  }

  handoffInboundToHangar(hangarBay, ambientTraffic, station) {
    if (!hangarBay) return;

    for (const entry of this.inboundActive) {
      const ship = ambientTraffic?.ships?.find((s) => s.id === entry.ambientId);
      if (ship && station) {
        const underRoof =
          station.worldToLocal?.(ship.x, ship.y)?.y >
          station.stripeLocalY?.() + (station.EXIT_NEST || 0);
        if (underRoof) {
          const ok = hangarBay.acceptSpaceArrival?.(
            entry.bayIndex,
            entry.shipDef,
            entry.visitorId,
            entry.token
          );
          if (ok) {
            ship.pendingCull = true;
            ship.state = 'leave';
          }
          continue;
        }
      }
      if (hangarBay.syncSpaceApproachReservations) {
        hangarBay.syncSpaceApproachReservations([
          {
            lane: entry.bayIndex,
            shipId: entry.ambientId ?? entry.token,
            shipDef: entry.shipDef,
            visitorId: entry.visitorId,
          },
        ]);
      }
    }

    this.inboundActive = [];
  }

  syncSpaceApproachReservations() {}

  tick(dt, gameTime = 0) {
    if (!this.active) return;
    this.time += dt;
    const t = Number.isFinite(gameTime) ? gameTime : this.time;

    for (const snap of this.pads) {
      const bi = snap.bayIndex;
      if (this.bayOffline[bi] || bi === this.playerBayIndex) continue;

      if (snap.transition) {
        this._tickTransition(snap, dt, t);
        continue;
      }

      if (snap.occupied) {
        if (t >= snap.serviceUntil) {
          this._beginEgress(snap);
        }
        continue;
      }

      if (snap.wantSpaceArrival || snap.inboundReservation) {
        const since = snap.inboundSince ?? t;
        if (
          snap.inboundReservation?.path === 'door' &&
          snap.wantSpaceArrival &&
          t - since >= HANGAR.INBOUND_RESERVATION_STALL_SEC
        ) {
          this.cancelInboundReservation(
            snap.bayIndex,
            snap.inboundReservation.token
          );
        }
        continue;
      }

      snap.cooldown -= dt;
      if (snap.cooldown > 0) continue;

      this._scheduleEmptyBayEvent(snap);
    }
  }

  isPlayerBay(bayIndex) {
    return bayIndex === this.playerBayIndex;
  }

  getBaySignal(bayIndex) {
    const i = ((bayIndex | 0) + 3) % BAY_COUNT;
    if (this.bayOffline[i]) return 'red';
    const snap = this.pads[i];
    if (!snap) return 'green';
    if (snap.transition === 'elevRaise' || snap.transition === 'elevLower') return 'elevator';
    if (snap.transition === 'doorDepart') return 'departing';
    // Empty pad waiting for mouth traffic stays green; runway approach → pulse-green via Station lane reservations.
    if (snap.occupied) return 'red';
    return 'green';
  }

  getBaySignals() {
    return [0, 1, 2].map((i) => this.getBaySignal(i));
  }

  getSpaceArrivalRequestLanes() {
    return this.getSpaceArrivalRequests().map((r) => r.bayIndex);
  }

  getSpaceArrivalRequests() {
    if (!this.preferExternalDoorTraffic || !this.spaceTrafficActive) return [];
    const out = [];
    for (const snap of this.pads) {
      if (!snap?.inboundReservation || snap.inboundReservation.path !== 'door') continue;
      if (!snap.wantSpaceArrival) continue;
      if (snap.occupied || snap.transition === 'elevRaise' || snap.transition === 'elevLower') {
        continue;
      }
      if (this.bayOffline[snap.bayIndex]) continue;
      if (this.isPlayerBay(snap.bayIndex)) continue;
      out.push({
        bayIndex: snap.bayIndex,
        token: snap.inboundReservation.token,
        shipDef: snap.inboundReservation.shipDef,
        visitorId: snap.inboundReservation.visitorId,
      });
    }
    return out;
  }

  cancelInboundReservation(bayIndex, token) {
    const bi = ((bayIndex | 0) + 3) % BAY_COUNT;
    const snap = this.pads[bi];
    if (!snap?.inboundReservation) return;
    if (token && snap.inboundReservation.token !== token) return;
    snap.inboundReservation = null;
    snap.inboundSince = 0;
    snap.wantSpaceArrival = false;
    snap.transition = null;
    snap.cooldown = rand(
      HANGAR.VISITOR_COOLDOWN_EMPTY_MIN,
      HANGAR.VISITOR_COOLDOWN_EMPTY_MAX
    );
  }

  acceptSpaceArrival(bayIndex, shipDef, visitorId = 'hauler', token) {
    const bi = ((bayIndex | 0) + 3) % BAY_COUNT;
    if (this.isPlayerBay(bi) || this.bayOffline[bi]) return false;
    const snap = this.pads[bi];
    if (!snap || snap.occupied || snap.transition === 'elevRaise' || snap.transition === 'elevLower') {
      return false;
    }

    const res = snap.inboundReservation;
    if (res && token && res.token !== token) return false;

    snap.occupied = true;
    snap.wantSpaceArrival = false;
    snap.transition = null;
    snap.transitionT = 0;
    snap.inboundReservation = null;
    snap.visitorId = visitorId || res?.visitorId || 'hauler';
    if (shipDef) {
      snap.shipDef = cloneBayShip(shipDef);
    } else if (res?.shipDef) {
      snap.shipDef = cloneBayShip(res.shipDef);
    } else {
      this._bookAndOccupy(snap, 2);
    }
    snap.serviceUntil = this.time + rand(SERVICE_MIN, SERVICE_MAX);
    snap.cooldown = rand(HANGAR.VISITOR_COOLDOWN_BUSY_MIN, HANGAR.VISITOR_COOLDOWN_BUSY_MAX);
    return true;
  }

  drainSpaceEgress() {
    const q = this.pendingSpaceEgress || [];
    this.pendingSpaceEgress = [];
    return q;
  }

  _scheduleEmptyBayEvent(snap) {
    if (Math.random() < HANGAR.VISITOR_EMPTY_ELEVATOR_CHANCE) {
      const res = this._rollInboundShip(snap, 2);
      snap.inboundReservation = createInboundReservation(
        snap.bayIndex,
        res.shipDef,
        res.visitorId,
        'elevator'
      );
      snap.transition = 'elevRaise';
      snap.transitionPhase = 'warn';
      snap.transitionT = 0;
    } else {
      const res = this._rollInboundShip(snap, 2);
      snap.inboundReservation = createInboundReservation(
        snap.bayIndex,
        res.shipDef,
        res.visitorId,
        'door'
      );
      snap.wantSpaceArrival = true;
      snap.inboundSince = this.time;
      snap.cooldown = rand(
        HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MIN,
        HANGAR.SPACE_ARRIVAL_REQUEST_RETRY_MAX
      );
    }
  }

  _beginEgress(snap) {
    const useElev = snap.elevatorOnly || Math.random() < HANGAR.VISITOR_ELEVATOR_CHANCE;
    if (useElev) {
      snap.transition = 'elevLower';
      snap.transitionPhase = 'warn';
      snap.transitionT = 0;
    } else {
      snap.transition = 'doorDepart';
      snap.transitionPhase = 'warn';
      snap.transitionT = 0;
    }
  }

  _tickTransition(snap, dt, t) {
    snap.transitionT += dt;
    switch (snap.transition) {
      case 'elevRaise':
        if (snap.transitionT >= elevRaiseDuration()) {
          this._finishElevRaise(snap, t);
        }
        break;
      case 'elevLower':
        if (snap.transitionT >= elevLowerDuration()) {
          this._clearSnap(snap);
        }
        break;
      case 'doorDepart':
        if (snap.transitionT >= doorDepartDurationToEgress()) {
          this._queueEgress(snap);
          this._clearSnap(snap);
        }
        break;
      case 'doorArrive':
        break;
      default:
        break;
    }
  }

  _finishElevRaise(snap, t) {
    const res = snap.inboundReservation;
    if (res?.shipDef) {
      snap.occupied = true;
      snap.visitorId = res.visitorId;
      snap.shipDef = cloneBayShip(res.shipDef);
      snap.padMk = snap.padMk || 2;
    } else {
      this._bookAndOccupy(snap, 2);
    }
    snap.inboundReservation = null;
    snap.transition = null;
    snap.transitionT = 0;
    snap.serviceUntil = t + rand(SERVICE_MIN, SERVICE_MAX);
    snap.cooldown = rand(HANGAR.VISITOR_COOLDOWN_BUSY_MIN, HANGAR.VISITOR_COOLDOWN_BUSY_MAX);
  }

  _rollInboundShip(snap, peerPadMk) {
    const padMk = rollVisitorPadMk(peerPadMk);
    const visitorId = pickVisitorId(padMk);
    const stub = { padMk, visitorId: null, shipDef: null };
    equipPadVisitor(stub, visitorId);
    snap.padMk = padMk;
    return { visitorId: stub.visitorId, shipDef: stub.shipDef };
  }

  _bookAndOccupy(snap, peerPadMk) {
    const { visitorId, shipDef } = this._rollInboundShip(snap, peerPadMk);
    snap.occupied = true;
    snap.visitorId = visitorId;
    snap.shipDef = cloneBayShip(shipDef);
    snap.wantSpaceArrival = false;
  }

  _clearSnap(snap) {
    snap.occupied = false;
    snap.shipDef = null;
    snap.visitorId = null;
    snap.wantSpaceArrival = false;
    snap.inboundReservation = null;
    snap.transition = null;
    snap.transitionPhase = 'warn';
    snap.transitionT = 0;
    snap.serviceUntil = 0;
    snap.elevatorOnly = false;
    snap.cooldown = rand(
      HANGAR.VISITOR_COOLDOWN_EMPTY_MIN,
      HANGAR.VISITOR_COOLDOWN_EMPTY_MAX
    );
  }

  _queueEgress(snap) {
    if (!snap?.shipDef || !Number.isFinite(snap.bayIndex)) return;
    if (this.pendingSpaceEgress.some((e) => e.bayIndex === snap.bayIndex)) return;
    this.pendingSpaceEgress.push(
      createEgressRecord(snap.bayIndex, snap.shipDef, snap.visitorId)
    );
  }

  _applyTransitionToPad(hangarBay, pad, snap) {
    if (snap.inboundReservation?.shipDef) {
      pad.visitorId = snap.inboundReservation.visitorId;
      pad.shipDef = cloneBayShip(snap.inboundReservation.shipDef);
      pad.thrusters = makeVisitorThrusters(pad.shipDef);
      pad.padMk = snap.padMk ?? 2;
    } else if (snap.shipDef) {
      pad.visitorId = snap.visitorId;
      pad.shipDef = cloneBayShip(snap.shipDef);
      pad.thrusters = makeVisitorThrusters(pad.shipDef);
    }
    const kind =
      snap.transition === 'elevRaise'
        ? Math.random() < HANGAR.VISITOR_RAISE_LAUNCH_CHANCE
          ? 'raiseLaunch'
          : 'raiseArrive'
        : 'lower';
    hangarBay._startVisitorSeq?.(pad, kind);
    if (pad.seq) {
      pad.seq.phase = snap.transitionPhase || 'warn';
      pad.seq.t = snap.transitionT || 0;
    }
  }

  _isCustomerState(state) {
    return (
      state === 'bayInbound' ||
      state === 'bayApproach' ||
      state === 'bayIngress' ||
      state === 'bayHold'
    );
  }
}
