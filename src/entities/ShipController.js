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

export class ShipController {
  constructor() {
    this.physics = new PhysicsSystem();
  }

  update(ship, input, targetAngle, deltaTime) {
    const thrust = input.getThrustInput();
    const thrusters = ship.thrusters;

    for (const key of Object.keys(thrusters)) {
      if (typeof thrusters[key] === 'number') thrusters[key] = 0;
    }
    thrusters.retroBurn = false;

    const rotation = this.physics.rotateTowardAngle(ship, targetAngle, deltaTime);
    this._applyYawThrusters(thrusters, ship, rotation);

    this.physics.dampRotation(ship, deltaTime);

    const forward = ship.getForward();
    const right = ship.getRight();
    const totalForce = new Vec2();

    if (thrust.brake) {
      const brake = this.physics.computeBrakingThrust(
        new Vec2(ship.velocity.x, ship.velocity.y),
        ship.angle
      );

      totalForce.add(brake.force);

      if (brake.retroBurn) {
        thrusters.retroBurn = true;
        thrusters.mainEngine = Math.min(1, ship.velocity.length() / 300);
      } else {
        this._lightFace(thrusters, 'aft', brake.aft);
        this._lightFace(thrusters, 'nose', brake.nose);
        this._lightFace(thrusters, 'starboard', brake.starboard);
        this._lightFace(thrusters, 'port', brake.port);
      }
    } else {
      if (thrust.forward) {
        totalForce.add(forward.clone().scale(PHYSICS.MANEUVER_THRUST));
        this._lightFace(thrusters, 'aft', TRANSLATION_INTENSITY);
      }
      if (thrust.reverse) {
        totalForce.add(forward.clone().scale(-PHYSICS.MANEUVER_THRUST));
        this._lightFace(thrusters, 'nose', TRANSLATION_INTENSITY);
      }
      if (thrust.left) {
        totalForce.add(right.clone().scale(-PHYSICS.MANEUVER_THRUST));
        this._lightFace(thrusters, 'starboard', TRANSLATION_INTENSITY);
      }
      if (thrust.right) {
        totalForce.add(right.clone().scale(PHYSICS.MANEUVER_THRUST));
        this._lightFace(thrusters, 'port', TRANSLATION_INTENSITY);
      }

      if (thrust.mainEngine) {
        let enginePower = PHYSICS.MAIN_ENGINE_THRUST;
        if (thrust.afterburner) {
          enginePower *= PHYSICS.AFTERBURNER_MULT;
          thrusters.afterburner = 1;
        }
        totalForce.add(forward.clone().scale(enginePower));
        thrusters.mainEngine = thrust.afterburner ? 1.5 : 1;
      }
    }

    this.physics.applyForce(ship, totalForce, deltaTime);

    // Brakes stop applying force below VELOCITY_THRESHOLD; snap to rest so
    // the ship does not coast forever at a few units/sec (HUD SPD ~4).
    if (thrust.brake && ship.velocity.length() < PHYSICS.VELOCITY_THRESHOLD) {
      ship.velocity.set(0, 0);
    }

    this.physics.integrate(ship, deltaTime);
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

  _applyYawThrusters(thrusters, ship, rotation) {
    if (!rotation.isRotating) return;

    const demand = Math.abs(rotation.rotationDemand) / PHYSICS.MAX_ROTATION_SPEED;
    const turnIntensity = clamp(demand, YAW_INTENSITY_MIN, YAW_INTENSITY_MAX);
    const angVel = ship.angularVelocity;
    const velSign = Math.sign(angVel);
    const diffSign = Math.sign(rotation.diff);

    // Semi-Newtonian stop: opposite group when spinning against demand or settling on aim
    const settling = Math.abs(rotation.diff) < 0.1 && Math.abs(angVel) > 0.08;
    const opposingDemand = diffSign !== 0 && velSign !== 0 && diffSign !== velSign && Math.abs(angVel) > 0.05;
    const accelOpposesSpin =
      Math.abs(angVel) > 0.05 &&
      Math.abs(rotation.angularAccel) > 0.4 &&
      Math.sign(rotation.angularAccel) !== velSign;

    if (opposingDemand || settling || accelOpposesSpin) {
      const stopGroup = velSign > 0 ? YAW_CCW : YAW_CW;
      this._lightYawGroup(thrusters, stopGroup, YAW_STOP_BURST);
      return;
    }

    if (Math.abs(rotation.diff) > 0.02) {
      const turnGroup = rotation.diff > 0 ? YAW_CW : YAW_CCW;
      this._lightYawGroup(thrusters, turnGroup, turnIntensity);
    }
  }
}
