import { Vec2, clamp } from '../utils/MathUtils.js';
import { PHYSICS } from '../core/Constants.js';
import { PhysicsSystem } from '../systems/PhysicsSystem.js';

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
    this._applyRcsThrusters(thrusters, rotation);

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
        thrusters.brakeAft = brake.aft;
        thrusters.brakeNose = brake.nose;
        thrusters.brakeStarboard = brake.starboard;
        thrusters.brakePort = brake.port;
      }
    } else {
      if (thrust.forward) {
        totalForce.add(forward.clone().scale(PHYSICS.MANEUVER_THRUST));
        thrusters.aft = 1;
      }
      if (thrust.reverse) {
        totalForce.add(forward.clone().scale(-PHYSICS.MANEUVER_THRUST));
        thrusters.nose = 1;
      }
      if (thrust.left) {
        totalForce.add(right.clone().scale(-PHYSICS.MANEUVER_THRUST));
        thrusters.starboard = 1;
      }
      if (thrust.right) {
        totalForce.add(right.clone().scale(PHYSICS.MANEUVER_THRUST));
        thrusters.port = 1;
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
    this.physics.integrate(ship, deltaTime);
  }

  _applyRcsThrusters(thrusters, rotation) {
    if (!rotation.isRotating) return;

    const intensity = clamp(
      Math.abs(rotation.rotationDemand) / PHYSICS.MAX_ROTATION_SPEED,
      0.15,
      1
    );

    if (rotation.diff > 0.02) {
      thrusters.rcsClockwise = intensity;
    } else if (rotation.diff < -0.02) {
      thrusters.rcsCounterClockwise = intensity;
    } else if (rotation.angularAccel > 0.5) {
      thrusters.rcsClockwise = intensity * 0.6;
    } else if (rotation.angularAccel < -0.5) {
      thrusters.rcsCounterClockwise = intensity * 0.6;
    }
  }
}
