import { Vec2, clamp, normalizeAngle, angleDifference } from '../utils/MathUtils.js';
import { PHYSICS } from '../core/Constants.js';

export class PhysicsSystem {
  applyForce(entity, force, deltaTime) {
    const ax = force.x / entity.mass;
    const ay = force.y / entity.mass;
    entity.velocity.x += ax * deltaTime;
    entity.velocity.y += ay * deltaTime;

    const speed = entity.velocity.length();
    if (speed > PHYSICS.MAX_SPEED) {
      entity.velocity.normalize().scale(PHYSICS.MAX_SPEED);
    }
  }

  integrate(entity, deltaTime) {
    entity.position.x += entity.velocity.x * deltaTime;
    entity.position.y += entity.velocity.y * deltaTime;
    entity.angle += entity.angularVelocity * deltaTime;
    entity.angle = normalizeAngle(entity.angle);
  }

  dampRotation(entity, deltaTime) {
    const damping = Math.exp(-PHYSICS.ROTATION_DAMPING * deltaTime);
    entity.angularVelocity *= damping;
    if (Math.abs(entity.angularVelocity) < 0.01) {
      entity.angularVelocity = 0;
    }
  }

  computeBrakingThrust(velocity, shipAngle) {
    const speed = velocity.length();
    if (speed < PHYSICS.VELOCITY_THRESHOLD) {
      return { force: new Vec2(), retroBurn: false, port: 0, starboard: 0, aft: 0, nose: 0 };
    }

    const velDir = velocity.clone().normalize();
    const desiredForce = velDir.clone().scale(-1);

    const forward = Vec2.fromAngle(shipAngle);
    const right = Vec2.fromAngle(shipAngle + Math.PI / 2);

    // Projection of desired brake force onto ship axes
    const forwardComponent = clamp(Vec2.dot(forward, desiredForce), -1, 1);
    const starboardComponent = clamp(Vec2.dot(right, desiredForce), -1, 1);

    // Nose into the velocity (facing anti-velocity) → main engine is a strong brake
    if (forwardComponent > 0.7) {
      const retroMagnitude = PHYSICS.BRAKE_MAIN_THRUST * Math.min(1, speed / 200);
      return {
        force: forward.clone().scale(retroMagnitude),
        retroBurn: true,
        port: 0,
        starboard: 0,
        aft: 0,
        nose: 0,
      };
    }

    // Otherwise use maneuvering thrusters. Force along +forward comes from aft,
    // +starboard from port (exhaust opposite the acceleration).
    const force = new Vec2();
    force.add(right.clone().scale(starboardComponent * PHYSICS.BRAKE_MANEUVER_THRUST));
    force.add(forward.clone().scale(forwardComponent * PHYSICS.BRAKE_MANEUVER_THRUST));

    return {
      force,
      retroBurn: false,
      port: Math.max(0, starboardComponent),
      starboard: Math.max(0, -starboardComponent),
      aft: Math.max(0, forwardComponent),
      nose: Math.max(0, -forwardComponent),
    };
  }

  rotateTowardAngle(entity, targetAngle, deltaTime) {
    const diff = angleDifference(entity.angle, targetAngle);
    const prevAngularVel = entity.angularVelocity;

    const targetAngularVel = clamp(
      diff * PHYSICS.ROTATION_ACCEL,
      -PHYSICS.MAX_ROTATION_SPEED,
      PHYSICS.MAX_ROTATION_SPEED
    );
    entity.angularVelocity = lerpAngular(
      entity.angularVelocity,
      targetAngularVel,
      1 - Math.exp(-PHYSICS.ROTATION_ACCEL * deltaTime)
    );

    const angularAccel = (entity.angularVelocity - prevAngularVel) / Math.max(deltaTime, 0.001);
    const rotationDemand = clamp(diff * PHYSICS.ROTATION_ACCEL, -PHYSICS.MAX_ROTATION_SPEED, PHYSICS.MAX_ROTATION_SPEED);

    return {
      diff,
      rotationDemand,
      angularAccel,
      isRotating: Math.abs(diff) > 0.02 || Math.abs(entity.angularVelocity) > 0.05,
    };
  }

  /**
   * Keyboard yaw: yawSign -1 (Q) / 0 / +1 (E).
   * When yawSign is 0, caller should damp; this only accelerates toward ±maxRate.
   */
  applyYawInput(entity, yawSign, maxRate, accel, deltaTime) {
    const prevAngularVel = entity.angularVelocity;
    const targetAngularVel = yawSign * maxRate;

    if (yawSign !== 0) {
      entity.angularVelocity = lerpAngular(
        entity.angularVelocity,
        targetAngularVel,
        1 - Math.exp(-accel * deltaTime)
      );
    }

    const angularAccel = (entity.angularVelocity - prevAngularVel) / Math.max(deltaTime, 0.001);
    const rotationDemand = targetAngularVel;

    return {
      diff: yawSign !== 0 ? yawSign : Math.sign(entity.angularVelocity) || 0,
      rotationDemand,
      angularAccel,
      isRotating: yawSign !== 0 || Math.abs(entity.angularVelocity) > 0.05,
    };
  }
}

function lerpAngular(a, b, t) {
  return a + (b - a) * t;
}
