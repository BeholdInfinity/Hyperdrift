import { Vec2, lerp, clamp } from '../utils/MathUtils.js';
import { CAMERA, PHYSICS } from '../core/Constants.js';

export class CameraSystem {
  constructor() {
    this.position = new Vec2();
    this.offset = new Vec2();
    this.targetOffset = new Vec2();
    this.userZoom = 1;
    this.targetUserZoom = 1;
    this.speedZoom = 1;
    this.effectiveZoom = 1;
  }

  update(shipPosition, shipVelocity, deltaTime, viewportRadius, zoomWheelDelta = 0) {
    this.position.copy(shipPosition);

    if (zoomWheelDelta !== 0) {
      this.targetUserZoom = clamp(
        this.targetUserZoom + zoomWheelDelta * CAMERA.ZOOM_WHEEL_STEP,
        CAMERA.ZOOM_MIN,
        CAMERA.ZOOM_MAX
      );
    }

    const speed = shipVelocity.length();
    const speedRatio = Math.min(1, speed / PHYSICS.MAX_SPEED);
    const targetSpeedZoom = lerp(CAMERA.SPEED_ZOOM_MAX, CAMERA.SPEED_ZOOM_MIN, speedRatio);

    const zoomT = 1 - Math.exp(-CAMERA.ZOOM_SMOOTHING * deltaTime);
    this.userZoom = lerp(this.userZoom, this.targetUserZoom, zoomT);
    this.speedZoom = lerp(this.speedZoom, targetSpeedZoom, zoomT);
    this.effectiveZoom = this.userZoom * this.speedZoom;

    if (speed < CAMERA.STATIONARY_THRESHOLD) {
      this.targetOffset.set(0, 0);
    } else {
      const velDir = shipVelocity.clone().normalize();
      const maxOffset = viewportRadius * CAMERA.MAX_OFFSET_RATIO;
      this.targetOffset.set(
        -velDir.x * maxOffset * speedRatio,
        -velDir.y * maxOffset * speedRatio
      );
    }

    const t = 1 - Math.exp(-CAMERA.OFFSET_SMOOTHING * deltaTime);
    this.offset.x = lerp(this.offset.x, this.targetOffset.x, t);
    this.offset.y = lerp(this.offset.y, this.targetOffset.y, t);
  }

  worldToScreen(worldX, worldY, screenCenterX, screenCenterY) {
    return {
      x: (worldX - this.position.x) * this.effectiveZoom + screenCenterX + this.offset.x,
      y: (worldY - this.position.y) * this.effectiveZoom + screenCenterY + this.offset.y,
    };
  }

  screenToWorld(screenX, screenY, screenCenterX, screenCenterY) {
    return {
      x: (screenX - screenCenterX - this.offset.x) / this.effectiveZoom + this.position.x,
      y: (screenY - screenCenterY - this.offset.y) / this.effectiveZoom + this.position.y,
    };
  }

  getShipScreenPosition(screenCenterX, screenCenterY) {
    return {
      x: screenCenterX + this.offset.x,
      y: screenCenterY + this.offset.y,
    };
  }
}
