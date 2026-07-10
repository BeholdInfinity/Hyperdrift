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

    const dotForward = Vec2.dot(forward, desiredForce);
    const dotRight = Vec2.dot(right, desiredForce);

    const facingOpposite = dotForward < -0.7;

    if (facingOpposite) {
      const retroMagnitude = PHYSICS.BRAKE_MAIN_THRUST * Math.min(1, speed / 200);
      return {
        force: forward.clone().scale(-retroMagnitude),
        retroBurn: true,
        port: 0,
        starboard: 0,
        aft: 0,
        nose: 0,
      };
    }

    const portComponent = clamp(dotRight, -1, 1);
    const noseComponent = clamp(dotForward, -1, 1);

    const force = new Vec2();
    force.add(right.clone().scale(portComponent * PHYSICS.BRAKE_MANEUVER_THRUST));
    force.add(forward.clone().scale(noseComponent * PHYSICS.BRAKE_MANEUVER_THRUST));

    return {
      force,
      retroBurn: false,
      port: Math.max(0, portComponent),
      starboard: Math.max(0, -portComponent),
      nose: Math.max(0, noseComponent),
      aft: Math.max(0, -noseComponent),
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
}

function lerpAngular(a, b, t) {
  return a + (b - a) * t;
}
