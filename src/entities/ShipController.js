import { Vec2, clamp } from '../utils/MathUtils.js';
import { PHYSICS } from '../core/Constants.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';

const TRANSLATION_INTENSITY = 1;
const YAW_INTENSITY_MIN = 0.25;
const YAW_INTENSITY_MAX = 0.45;
const YAW_STOP_BURST = 0.5;

/** Counter-clockwise yaw couple (4 of 8). */
const YAW_CCW = ['nosePort', 'portAft', 'aftStarboard', 'starboardFore'];
/** Clockwise yaw couple (the other 4). */
const YAW_CW = ['noseStarboard', 'starboardAft', 'aftPort', 'portFore'];

const FACE_PAIRS = {
  aft: ['aftPort', 'aftStarboard'],
  nose: ['nosePort', 'noseStarboard'],
  port: ['portFore', 'portAft'],
  starboard: ['starboardFore', 'starboardAft'],
};

function axisPower(held, burst, precisionActive) {
  if (!held) return 0;
  if (precisionActive) {
    return burst ? PHYSICS.PRECISION_BURST_MULT : PHYSICS.PRECISION_THRUST_MULT;
  }
  return burst ? PHYSICS.MANEUVER_BURST_MULT : 1;
}

export class ShipController {
  constructor() {
    this.physics = new PhysicsSystem();
  }

  update(ship, input, precisionActive, deltaTime) {
    const flight = input.getFlightInput();
    const thrusters = ship.thrusters;

    for (const key of Object.keys(thrusters)) {
      if (typeof thrusters[key] === 'number') thrusters[key] = 0;
    }
    thrusters.retroBurn = false;

    let yawSign = 0;
    if (flight.yawLeft && !flight.yawRight) yawSign = -1;
    else if (flight.yawRight && !flight.yawLeft) yawSign = 1;

    let yawMult = 1;
    if (precisionActive) {
      yawMult = PHYSICS.PRECISION_THRUST_MULT;
      if (
        (yawSign < 0 && flight.yawLeftBurst) ||
        (yawSign > 0 && flight.yawRightBurst)
      ) {
        yawMult = PHYSICS.PRECISION_BURST_MULT;
      }
    } else if (
      (yawSign < 0 && flight.yawLeftBurst) ||
      (yawSign > 0 && flight.yawRightBurst)
    ) {
      yawMult = PHYSICS.YAW_FAST_MULT;
    }

    const maxRate = PHYSICS.MAX_ROTATION_SPEED * yawMult;
    const accel = PHYSICS.ROTATION_ACCEL * Math.max(yawMult, 0.35);
    const rotation = this.physics.applyYawInput(
      ship,
      yawSign,
      maxRate,
      accel,
      deltaTime
    );
    this._applyYawThrusters(thrusters, ship, rotation, yawSign, yawMult);

    if (yawSign === 0) {
      this.physics.dampRotation(ship, deltaTime);
    }

    const forward = ship.getForward();
    const right = ship.getRight();
    const totalForce = new Vec2();
    const precisionScale = precisionActive ? PHYSICS.PRECISION_THRUST_MULT : 1;

    if (flight.brake) {
      const brake = this.physics.computeBrakingThrust(
        new Vec2(ship.velocity.x, ship.velocity.y),
        ship.angle
      );

      totalForce.add(brake.force.clone().scale(precisionScale));

      if (brake.retroBurn) {
        thrusters.retroBurn = true;
        thrusters.mainEngine =
          Math.min(1, ship.velocity.length() / 300) * precisionScale;
      } else {
        this._lightFace(thrusters, 'aft', brake.aft * precisionScale);
        this._lightFace(thrusters, 'nose', brake.nose * precisionScale);
        this._lightFace(thrusters, 'starboard', brake.starboard * precisionScale);
        this._lightFace(thrusters, 'port', brake.port * precisionScale);
      }
    } else {
      const fwdPow = axisPower(flight.forward, flight.forwardBurst, precisionActive);
      const revPow = axisPower(flight.reverse, flight.reverseBurst, precisionActive);
      const leftPow = axisPower(flight.left, flight.leftBurst, precisionActive);
      const rightPow = axisPower(flight.right, flight.rightBurst, precisionActive);

      if (fwdPow > 0) {
        totalForce.add(forward.clone().scale(PHYSICS.MANEUVER_THRUST * fwdPow));
        this._lightFace(thrusters, 'aft', TRANSLATION_INTENSITY * fwdPow);
      }
      if (revPow > 0) {
        totalForce.add(forward.clone().scale(-PHYSICS.MANEUVER_THRUST * revPow));
        this._lightFace(thrusters, 'nose', TRANSLATION_INTENSITY * revPow);
      }
      if (leftPow > 0) {
        totalForce.add(right.clone().scale(-PHYSICS.MANEUVER_THRUST * leftPow));
        this._lightFace(thrusters, 'starboard', TRANSLATION_INTENSITY * leftPow);
      }
      if (rightPow > 0) {
        totalForce.add(right.clone().scale(PHYSICS.MANEUVER_THRUST * rightPow));
        this._lightFace(thrusters, 'port', TRANSLATION_INTENSITY * rightPow);
      }

      if (flight.mainEngine) {
        if (precisionActive) {
          ship.mainEngineWarmup += deltaTime;
          const warm = Math.min(1, ship.mainEngineWarmup / PHYSICS.MAIN_ENGINE_WARMUP);
          thrusters.mainEngine = warm * 0.35;
          if (ship.mainEngineWarmup >= PHYSICS.MAIN_ENGINE_WARMUP) {
            totalForce.add(
              forward
                .clone()
                .scale(PHYSICS.MAIN_ENGINE_THRUST * PHYSICS.PRECISION_THRUST_MULT)
            );
            thrusters.mainEngine = PHYSICS.PRECISION_THRUST_MULT;
          }
        } else {
          ship.mainEngineWarmup = 0;
          let enginePower = PHYSICS.MAIN_ENGINE_THRUST;
          if (flight.afterburner) {
            enginePower *= PHYSICS.AFTERBURNER_MULT;
            thrusters.afterburner = 1;
          }
          totalForce.add(forward.clone().scale(enginePower));
          thrusters.mainEngine = flight.afterburner ? 1.5 : 1;
        }
      } else {
        ship.mainEngineWarmup = 0;
      }
    }

    this.physics.applyForce(ship, totalForce, deltaTime);

    if (flight.brake && ship.velocity.length() < PHYSICS.VELOCITY_THRESHOLD) {
      ship.velocity.set(0, 0);
    }

    this.physics.integrate(ship, deltaTime);

    // While Precision is active, engage speed is a hard velocity ceiling
    if (precisionActive) {
      const spd = ship.velocity.length();
      if (spd > PHYSICS.PRECISION_ENGAGE_SPEED) {
        ship.velocity.normalize().scale(PHYSICS.PRECISION_ENGAGE_SPEED);
      }
    }
  }

  _addThruster(thrusters, name, amount) {
    if (!amount || amount <= 0) return;
    thrusters[name] = clamp((thrusters[name] || 0) + amount, 0, 1.5);
  }

  _lightFace(thrusters, face, amount) {
    if (!amount || amount <= 0) return;
    for (const name of FACE_PAIRS[face]) {
      this._addThruster(thrusters, name, amount);
    }
  }

  _lightYawGroup(thrusters, group, amount) {
    for (const name of group) {
      this._addThruster(thrusters, name, amount);
    }
  }

  _applyYawThrusters(thrusters, ship, rotation, yawSign, yawMult) {
    if (!rotation.isRotating) return;

    const demand = Math.min(1, Math.abs(rotation.rotationDemand) / PHYSICS.MAX_ROTATION_SPEED);
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
      this._lightYawGroup(thrusters, stopGroup, YAW_STOP_BURST);
      return;
    }

    if (yawSign !== 0) {
      const turnGroup = yawSign > 0 ? YAW_CW : YAW_CCW;
      this._lightYawGroup(thrusters, turnGroup, turnIntensity);
    }
  }
}
