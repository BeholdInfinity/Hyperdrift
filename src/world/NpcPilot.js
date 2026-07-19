/**
 * Shared Newtonian thruster pilot for ambient NPCs + player hold AI.
 * Turns and burns go through PhysicsSystem + thruster bag lights — no angle/velocity snaps.
 */

import { PHYSICS } from '../core/Constants.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';
import { Vec2, clamp, angleDifference } from '../utils/MathUtils.js';

const YAW_CCW = ['nosePort', 'portAft', 'aftStarboard', 'starboardFore'];
const YAW_CW = ['noseStarboard', 'starboardAft', 'aftPort', 'portFore'];

/** Same face keys as ShipController (incl. Heavy *2 / Mid mounts). */
const FACE_PAIRS = {
  aft: ['aftPort', 'aftStarboard', 'aftPort2', 'aftStarboard2'],
  nose: ['nosePort', 'noseStarboard'],
  port: ['portFore', 'portAft', 'portMid', 'portFore2', 'portAft2'],
  starboard: [
    'starboardFore',
    'starboardAft',
    'starboardMid',
    'starboardFore2',
    'starboardAft2',
  ],
};

const YAW_INTENSITY_MIN = 0.25;
const YAW_INTENSITY_MAX = 0.45;
const YAW_STOP_BURST = 0.5;
/** Match player WASD translation thruster bag intensity. */
const TRANSLATION_INTENSITY = 1;

const physics = new PhysicsSystem();

export function clearThrusters(ship) {
  if (!ship?.thrusters) return;
  for (const k of Object.keys(ship.thrusters)) {
    if (k === 'retroBurn') ship.thrusters[k] = false;
    else ship.thrusters[k] = 0;
  }
}

function addThruster(thrusters, name, amount) {
  if (!amount || amount <= 0 || !thrusters) return;
  thrusters[name] = clamp((thrusters[name] || 0) + amount, 0, 1.5);
}

function lightFace(thrusters, face, amount) {
  if (!amount || amount <= 0) return;
  for (const name of FACE_PAIRS[face]) addThruster(thrusters, name, amount);
}

function lightYawGroup(thrusters, group, amount) {
  for (const name of group) addThruster(thrusters, name, amount);
}

/**
 * Ensure ship has Vec2 position/velocity + mass for PhysicsSystem.
 * Ambient hulls (`ship.x`) sync mirrors → body; player Ship uses position/velocity only.
 */
export function ensureBody(ship) {
  if (!ship) return ship;
  if (ship.mass == null) ship.mass = 1;
  if (ship.angularVelocity == null) ship.angularVelocity = 0;

  if (typeof ship.x === 'number') {
    if (!(ship.position instanceof Vec2)) ship.position = new Vec2(ship.x, ship.y);
    else ship.position.set(ship.x, ship.y);
    if (!(ship.velocity instanceof Vec2)) {
      ship.velocity = new Vec2(ship.vx || 0, ship.vy || 0);
    } else {
      ship.velocity.set(ship.vx || 0, ship.vy || 0);
    }
  } else {
    if (!(ship.velocity instanceof Vec2) && ship.velocity) {
      ship.velocity = new Vec2(ship.velocity.x || 0, ship.velocity.y || 0);
    }
  }

  return ship;
}

/** Sync ambient x/y/vx/vy from physics body (no-op-ish for player Ship). */
export function syncAmbientMirrors(ship) {
  if (!ship?.position || !ship.velocity) return;
  if (typeof ship.x === 'number') {
    ship.x = ship.position.x;
    ship.y = ship.position.y;
  }
  if (typeof ship.vx === 'number') {
    ship.vx = ship.velocity.x;
    ship.vy = ship.velocity.y;
  }
}

function applyYawLights(thrusters, ship, rotation, yawSign, yawMult) {
  if (!rotation.isRotating || !thrusters) return;

  const demand = Math.min(
    1,
    Math.abs(rotation.rotationDemand) / PHYSICS.MAX_ROTATION_SPEED
  );
  const turnIntensity = clamp(
    Math.max(demand, YAW_INTENSITY_MIN) * Math.min(yawMult, 1.5),
    YAW_INTENSITY_MIN,
    YAW_INTENSITY_MAX * Math.min(1.2, yawMult)
  );
  const angVel = ship.angularVelocity;
  const velSign = Math.sign(angVel);

  const settling = yawSign === 0 && Math.abs(angVel) > 0.08;
  const opposingDemand =
    yawSign !== 0 &&
    velSign !== 0 &&
    yawSign !== velSign &&
    Math.abs(angVel) > 0.05;
  const accelOpposesSpin =
    Math.abs(angVel) > 0.05 &&
    Math.abs(rotation.angularAccel) > 0.4 &&
    Math.sign(rotation.angularAccel) !== velSign;

  if (opposingDemand || settling || accelOpposesSpin) {
    const stopGroup = velSign > 0 ? YAW_CCW : YAW_CW;
    lightYawGroup(thrusters, stopGroup, YAW_STOP_BURST);
    return;
  }

  if (yawSign !== 0) {
    const turnGroup = yawSign > 0 ? YAW_CW : YAW_CCW;
    lightYawGroup(thrusters, turnGroup, turnIntensity);
  }
}

/**
 * Yaw toward targetAngle via thrusters. Does not integrate translation.
 * @returns {{ yawSign: number, headingErr: number, rotation: object }}
 */
export function yawToward(ship, targetAngle, dt, yawMult = 1) {
  ensureBody(ship);
  const headingErr = angleDifference(ship.angle, targetAngle);
  let yawSign = 0;
  if (Math.abs(headingErr) > 0.04) {
    yawSign = Math.sign(headingErr);
  }
  const maxRate = PHYSICS.MAX_ROTATION_SPEED * yawMult;
  const accel = PHYSICS.ROTATION_ACCEL * Math.max(yawMult, 0.35);
  const rotation = physics.applyYawInput(ship, yawSign, maxRate, accel, dt);
  if (yawSign === 0) {
    physics.dampRotation(ship, dt);
  }
  applyYawLights(ship.thrusters, ship, rotation, yawSign, yawMult);
  return { yawSign, headingErr, rotation };
}

function integrate(ship, force, dt) {
  physics.applyForce(ship, force, dt);
  physics.integrate(ship, dt);
  syncAmbientMirrors(ship);
}

/**
 * Face heading and coast (no translation thrust). Still integrates.
 */
export function faceHeading(ship, targetAngle, dt, yawMult = 1) {
  ensureBody(ship);
  clearThrusters(ship);
  yawToward(ship, targetAngle, dt, yawMult);
  integrate(ship, new Vec2(), dt);
  return angleDifference(ship.angle, targetAngle);
}

/** Apply braking thruster bag + force from PhysicsSystem.computeBrakingThrust. */
function applyBrakeForce(ship, force, scale = 1) {
  const brake = physics.computeBrakingThrust(ship.velocity, ship.angle);
  force.add(brake.force.scale(scale));
  if (brake.retroBurn) {
    ship.thrusters.retroBurn = true;
    ship.thrusters.mainEngine = Math.min(1, ship.velocity.length() / 300) * scale;
  } else {
    lightFace(ship.thrusters, 'aft', brake.aft * scale);
    lightFace(ship.thrusters, 'nose', brake.nose * scale);
    lightFace(ship.thrusters, 'starboard', brake.starboard * scale);
    lightFace(ship.thrusters, 'port', brake.port * scale);
  }
}

/**
 * Kill residual spin with thrusters; no translation. Used while coasting.
 */
function settleSpin(ship, dt) {
  if (Math.abs(ship.angularVelocity) <= 0.04) {
    ship.angularVelocity = 0;
    return;
  }
  // Counter-yaw toward zero rate (thruster-based), keep nose as-is
  yawToward(ship, ship.angle, dt, 1);
}

/** Velocity heading, or null when nearly stopped. */
function travelAngle(ship, minSpeed = 6) {
  const speed = ship.velocity.length();
  if (speed < minSpeed) return null;
  return Math.atan2(ship.velocity.y, ship.velocity.x);
}

/**
 * Player Alt “Space brakes”: thruster-face brake, or main-engine retro when
 * nose faces into velocity. By default yaws to anti-velocity for the strong
 * retro path (same computeBrakingThrust the player uses).
 */
export function spaceBrake(ship, dt, opts = {}) {
  ensureBody(ship);
  clearThrusters(ship);
  const speed = ship.velocity.length();
  const velAng = travelAngle(ship, PHYSICS.VELOCITY_THRESHOLD);
  const preferRetro = opts.preferRetro !== false;

  let face = opts.faceAngle;
  if (face == null && preferRetro && velAng != null) {
    face = velAng + Math.PI;
  }
  if (face != null) {
    yawToward(ship, face, dt, opts.yawMult ?? 1.25);
  } else {
    physics.dampRotation(ship, dt);
  }

  const force = new Vec2();
  if (speed > (opts.stopSpeed ?? PHYSICS.VELOCITY_THRESHOLD)) {
    applyBrakeForce(ship, force, opts.scale ?? 1);
  } else {
    ship.velocity.set(0, 0);
  }
  integrate(ship, force, dt);
}

/**
 * Face along velocity (prograde). Logical cruise attitude — no nose-backward drifts.
 * @returns {number} |nose − travel| or 0 if too slow
 */
function facePrograde(ship, dt, yawMult = 1) {
  const velAng = travelAngle(ship);
  if (velAng == null) {
    settleSpin(ship, dt);
    return 0;
  }
  const err = Math.abs(angleDifference(ship.angle, velAng));
  // Same deadband as yawToward — keep nose locked to travel while coasting
  if (err > 0.04) yawToward(ship, velAng, dt, Math.max(yawMult, 1.15));
  else settleSpin(ship, dt);
  return err;
}

/**
 * Pure coast: zero translation thrust. Faces travel when moving.
 * Newtonian — velocity unchanged aside from MAX_SPEED clamp in applyForce.
 */
export function coast(ship, dt, opts = {}) {
  ensureBody(ship);
  clearThrusters(ship);
  if (opts.faceTravel !== false) facePrograde(ship, dt, opts.yawMult ?? 1);
  else if (opts.settleSpin !== false) settleSpin(ship, dt);
  else physics.dampRotation(ship, dt);
  integrate(ship, new Vec2(), dt);
}

/**
 * Cruise toward a world point (2D Newtonian).
 * - Burn only when nose is roughly toward the burn direction (turn-then-burn).
 * - Coasting faces prograde so ships don't drift nose-backward.
 * - Brake only for arrival slowdown (not for “over cruise”).
 * - Soft speed ceiling is PHYSICS.MAX_SPEED only.
 * @returns {{ arrived: boolean, dist: number, headingErr: number, coasting: boolean }}
 */
export function cruiseTo(ship, tx, ty, cruiseSpeed, dt, opts = {}) {
  ensureBody(ship);
  clearThrusters(ship);

  const arrivalR = opts.arrivalR ?? 60;
  /** Fraction below cruise before we re-boost (hysteresis). Not an upper band. */
  const reboostFrac = opts.speedBand ?? 0.08;
  const headingTol = opts.headingTol ?? 0.18;
  const trackTol = opts.trackTol ?? 0.22;
  const yawMult = opts.yawMult ?? 1.2;
  const brakeForArrival = opts.brakeForArrival !== false;
  /** Don't main-burn if nose is more than this off the burn axis (~35°). */
  const burnAlign = opts.burnAlign ?? 0.6;

  const dx = tx - ship.position.x;
  const dy = ty - ship.position.y;
  const dist = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);
  const cruise = Math.max(40, cruiseSpeed);
  const speed = ship.velocity.length();
  const velAng = travelAngle(ship, 6) ?? desired;
  const trackErr = angleDifference(velAng, desired);
  const headingErr = angleDifference(ship.angle, desired);
  const noseVsTravel = Math.abs(angleDifference(ship.angle, velAng));
  const atSpeed = speed >= cruise * (1 - reboostFrac);
  const onTrack = Math.abs(trackErr) < trackTol;
  const noseOk = Math.abs(headingErr) < headingTol;
  const force = new Vec2();

  if (dist <= arrivalR) {
    if (brakeForArrival && speed > cruise * 0.35) {
      spaceBrake(ship, dt, { yawMult, stopSpeed: cruise * 0.2 });
      return {
        arrived: true,
        dist,
        headingErr,
        coasting: false,
      };
    }
    facePrograde(ship, dt, yawMult);
    integrate(ship, force, dt);
    return { arrived: true, dist, headingErr, coasting: force.lengthSq() === 0 };
  }

  const stopDist = brakeForArrival
    ? Math.max(
        arrivalR * 1.8,
        (speed * speed) /
          (2 * (PHYSICS.BRAKE_MAIN_THRUST * 0.55 + PHYSICS.BRAKE_MANEUVER_THRUST))
      )
    : 0;

  // Arrival brake — Alt Space-brakes (retro when aligned into velocity)
  if (brakeForArrival && dist < stopDist && speed > cruise * 0.5) {
    spaceBrake(ship, dt, { yawMult, stopSpeed: cruise * 0.25 });
    return { arrived: false, dist, headingErr, coasting: false };
  }

  // Recover from nose-backward / severe misalignment before any other intent
  if (speed > 18 && noseVsTravel > Math.PI * 0.4) {
    yawToward(ship, velAng, dt, yawMult * 1.25);
    integrate(ship, new Vec2(), dt);
    return { arrived: false, dist, headingErr, coasting: true };
  }

  // Straight + at speed → coast facing travel (no engine)
  if (atSpeed && onTrack && dist > arrivalR * 2.2) {
    facePrograde(ship, dt, yawMult);
    integrate(ship, new Vec2(), dt);
    return { arrived: false, dist, headingErr, coasting: true };
  }

  const needBoost = !atSpeed;
  const needTrackFix = atSpeed && !onTrack;
  const wantBurn = needBoost || needTrackFix;

  // Turn-then-burn only when we actually need thrust; otherwise stay prograde
  if (!wantBurn) {
    facePrograde(ship, dt, yawMult);
    integrate(ship, new Vec2(), dt);
    return { arrived: false, dist, headingErr, coasting: true };
  }

  yawToward(ship, desired, dt, yawMult * 1.15);
  const noseToDesired = Math.abs(angleDifference(ship.angle, desired));
  const canBurn = noseToDesired < burnAlign;

  if (!canBurn) {
    // Still swinging onto the burn axis — keep facing the turn target (short window)
    integrate(ship, new Vec2(), dt);
    return { arrived: false, dist, headingErr, coasting: true };
  }

  if (needBoost) {
    const forward = Vec2.fromAngle(ship.angle);
    const power =
      speed < cruise * 0.3 && noseToDesired < headingTol * 2.2
        ? 1
        : speed < cruise * 0.45
          ? 1
          : 0.55;
    if (power >= 0.9) {
      // Match player main-engine bag: main plume only (no aft thruster wash)
      force.add(forward.scale(PHYSICS.MAIN_ENGINE_THRUST * power));
      ship.thrusters.mainEngine = power;
    } else {
      force.add(forward.scale(PHYSICS.MANEUVER_THRUST * 0.85));
      lightFace(ship.thrusters, 'aft', TRANSLATION_INTENSITY * power);
    }
  } else if (needTrackFix && noseToDesired < headingTol) {
    // Small nudge to bend velocity onto the new leg after the nose is lined up
    const forward = Vec2.fromAngle(ship.angle);
    force.add(forward.scale(PHYSICS.MAIN_ENGINE_THRUST * 0.4));
    ship.thrusters.mainEngine = 0.4;
  }

  integrate(ship, force, dt);
  return {
    arrived: false,
    dist,
    headingErr,
    coasting: force.lengthSq() === 0 && noseOk && atSpeed,
  };
}

/**
 * Reach cruiseSpeed along nose, then coast facing travel.
 * Optional faceAngle = intentional course change (turn, then light burn to bend track).
 */
export function holdSpeed(ship, cruiseSpeed, dt, opts = {}) {
  ensureBody(ship);
  clearThrusters(ship);
  const reboostFrac = opts.speedBand ?? 0.08;
  const yawMult = opts.yawMult ?? 1;
  const cruise = Math.max(40, cruiseSpeed);
  const speed = ship.velocity.length();
  const atSpeed = speed >= cruise * (1 - reboostFrac);
  const velAng = travelAngle(ship, 8);
  const force = new Vec2();

  if (opts.faceAngle != null) {
    const faceErr = Math.abs(angleDifference(ship.angle, opts.faceAngle));
    yawToward(ship, opts.faceAngle, dt, yawMult);
    if (!atSpeed && faceErr < 0.9) {
      const forward = Vec2.fromAngle(ship.angle);
      const power = speed < cruise * 0.45 ? 0.85 : 0.5;
      force.add(forward.scale(PHYSICS.MAIN_ENGINE_THRUST * power));
      ship.thrusters.mainEngine = power;
    } else if (atSpeed && faceErr < 0.25 && velAng != null) {
      const trackErr = Math.abs(angleDifference(velAng, opts.faceAngle));
      if (trackErr > 0.35) {
        // Nose on new course but still drifting old track — short prograde burn
        const forward = Vec2.fromAngle(ship.angle);
        force.add(forward.scale(PHYSICS.MAIN_ENGINE_THRUST * 0.35));
        ship.thrusters.mainEngine = 0.35;
      }
    }
  } else if (!atSpeed) {
    // Boost along current nose (or face travel if already moving the wrong way)
    if (velAng != null && Math.abs(angleDifference(ship.angle, velAng)) > Math.PI * 0.4) {
      yawToward(ship, velAng, dt, yawMult * 1.2);
    } else {
      settleSpin(ship, dt);
      const forward = Vec2.fromAngle(ship.angle);
      const power = speed < cruise * 0.45 ? 0.85 : 0.5;
      force.add(forward.scale(PHYSICS.MAIN_ENGINE_THRUST * power));
      ship.thrusters.mainEngine = power;
    }
  } else {
    facePrograde(ship, dt, yawMult);
  }

  integrate(ship, force, dt);
}

/**
 * Thruster-brake toward a stop (or soft speed).
 * Defaults to Space-brakes retro yaw; pass faceAngle to hold a scan/look heading
 * (still uses the same computeBrakingThrust bag as the player Alt brake).
 */
export function brake(ship, dt, opts = {}) {
  spaceBrake(ship, dt, {
    ...opts,
    preferRetro: opts.faceAngle == null && opts.preferRetro !== false,
  });
}

/**
 * Translate toward a world point with face thrusters (nose not required).
 * Still applies yaw if faceAngle provided.
 */
export function strafeToward(ship, tx, ty, dt, opts = {}) {
  ensureBody(ship);
  clearThrusters(ship);
  const power = opts.power ?? 0.7;
  if (opts.faceAngle != null) {
    yawToward(ship, opts.faceAngle, dt, opts.yawMult ?? 1);
  } else {
    physics.dampRotation(ship, dt);
  }

  const dx = tx - ship.position.x;
  const dy = ty - ship.position.y;
  const dist = Math.hypot(dx, dy);
  const force = new Vec2();
  if (dist > 4) {
    const desired = new Vec2(dx / dist, dy / dist);
    const forward = Vec2.fromAngle(ship.angle);
    const right = Vec2.fromAngle(ship.angle + Math.PI / 2);
    const fwd = clamp(Vec2.dot(forward, desired), -1, 1);
    const stbd = clamp(Vec2.dot(right, desired), -1, 1);
    force.add(forward.clone().scale(fwd * PHYSICS.MANEUVER_THRUST * power));
    force.add(right.clone().scale(stbd * PHYSICS.MANEUVER_THRUST * power));
    if (fwd > 0.05) {
      lightFace(ship.thrusters, 'aft', Math.abs(fwd) * TRANSLATION_INTENSITY * power);
    }
    if (fwd < -0.05) {
      lightFace(ship.thrusters, 'nose', Math.abs(fwd) * TRANSLATION_INTENSITY * power);
    }
    if (stbd > 0.05) {
      lightFace(ship.thrusters, 'port', Math.abs(stbd) * TRANSLATION_INTENSITY * power);
    }
    if (stbd < -0.05) {
      lightFace(
        ship.thrusters,
        'starboard',
        Math.abs(stbd) * TRANSLATION_INTENSITY * power
      );
    }
  }
  integrate(ship, force, dt);
  return dist;
}

/** Burn main engine along nose at `power` (0–1). */
export function thrustAlongNose(ship, power, dt, opts = {}) {
  ensureBody(ship);
  clearThrusters(ship);
  if (opts.faceAngle != null) {
    yawToward(ship, opts.faceAngle, dt, opts.yawMult ?? 1);
  } else {
    physics.dampRotation(ship, dt);
  }
  const p = clamp(power, 0, 1.5);
  const force = new Vec2();
  if (p > 0) {
    force.add(Vec2.fromAngle(ship.angle).scale(PHYSICS.MAIN_ENGINE_THRUST * p));
    ship.thrusters.mainEngine = Math.min(1.5, p);
  }
  integrate(ship, force, dt);
}

/**
 * Follow waypoint ring (hex/racetrack). Advances ship.patrolLeg / holdLeg.
 * @param {object} ship
 * @param {{ x: number, y: number }[]} corners
 * @param {string} legKey - property name for leg index ('patrolLeg' | 'holdLeg')
 */
export function followWaypointRing(ship, corners, cruiseSpeed, dt, opts = {}) {
  if (!corners?.length) {
    holdSpeed(ship, cruiseSpeed, dt);
    return { arrived: false, leg: 0 };
  }
  const legKey = opts.legKey || 'patrolLeg';
  const arrivalR = opts.arrivalR ?? 65;
  let leg = ship[legKey] | 0;
  if (leg < 0 || leg >= corners.length) leg = 0;
  const wp = corners[leg];
  const result = cruiseTo(ship, wp.x, wp.y, cruiseSpeed, dt, {
    arrivalR,
    speedBand: opts.speedBand,
    headingTol: opts.headingTol,
    yawMult: opts.yawMult,
    brakeForArrival: opts.brakeForArrival ?? true,
  });
  if (result.arrived || result.dist < arrivalR) {
    const dir = opts.reverse ? -1 : 1;
    leg = (leg + dir + corners.length * 4) % corners.length;
    ship[legKey] = leg;
  } else {
    ship[legKey] = leg;
  }
  return { ...result, leg };
}

/** Regular polygon waypoints around a center. */
export function polygonWaypoints(cx, cy, radius, sides, phase = 0) {
  const n = Math.max(3, sides | 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i * Math.PI * 2) / n;
    out.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return out;
}

/** Nearest corner index to a world point. */
export function nearestWaypointIndex(corners, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < corners.length; i++) {
    const d = Math.hypot(corners[i].x - x, corners[i].y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Station holding racetrack — axis-aligned rectangle of straight legs
 * entirely north of the furthest approach lights (runway mouth).
 * @param {{ x: number, furthestApproachLightY: () => number }} station
 * @param {{ HOLD_RUNWAY_CLEARANCE: number, HOLD_HALF_W: number, HOLD_HALF_H: number }} ambient
 */
export function holdRacetrackCorners(station, ambient) {
  const lightY = station.furthestApproachLightY();
  const clear = ambient.HOLD_RUNWAY_CLEARANCE;
  const hw = ambient.HOLD_HALF_W;
  const hh = ambient.HOLD_HALF_H;
  // South edge of pattern stays north of the lights
  const southY = lightY - clear;
  const cy = southY - hh;
  const cx = station.x;
  return [
    { x: cx - hw, y: cy - hh }, // NW
    { x: cx + hw, y: cy - hh }, // NE
    { x: cx + hw, y: cy + hh }, // SE
    { x: cx - hw, y: cy + hh }, // SW
  ];
}

/** Init hold-leg index for a ship entering the racetrack. */
export function initHoldLeg(ship, corners) {
  const x = typeof ship.x === 'number' ? ship.x : ship.position.x;
  const y = typeof ship.y === 'number' ? ship.y : ship.position.y;
  ship.holdLeg = nearestWaypointIndex(corners, x, y);
  ship.holdReverse = !!(ship.id & 1);
}
