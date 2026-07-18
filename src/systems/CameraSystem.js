import { Vec2, lerp, clamp } from '../utils/MathUtils.js';
import { CAMERA, HANGAR, BLUEPRINT, PHYSICS } from '../core/Constants.js';

export class CameraSystem {
  constructor() {
    this.position = new Vec2();
    this.offset = new Vec2();
    this.targetOffset = new Vec2();
    this.userZoom = 1;
    this.targetUserZoom = 1;
    this.speedZoom = 1;
    this.effectiveZoom = 1;
    /** World→screen rotation (rad). Title vignette uses this; play/hangar stay 0. */
    this.rotation = 0;
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

  /**
   * Docked hangar view: free look when idle (GameEngine locks to the ship
   * during launch/land/elevator sequences via setHangarAnchor).
   * Pan is screen-space drag → world via zoom; wheel zooms. No lead / speed zoom.
   * @param {number} deltaTime
   * @param {number} [zoomWheelDelta]
   * @param {{ x: number, y: number }|null} [panScreenDelta]
   * @param {number} [zoomMin]
   * @param {number} [zoomMax]
   */
  updateHangar(
    deltaTime,
    zoomWheelDelta = 0,
    panScreenDelta = null,
    zoomMin = HANGAR.ZOOM_MIN,
    zoomMax = HANGAR.ZOOM_MAX
  ) {
    this.offset.set(0, 0);
    this.targetOffset.set(0, 0);
    this.speedZoom = 1;

    const zMin = Number.isFinite(zoomMin) ? zoomMin : HANGAR.ZOOM_MIN;
    const zMax = Number.isFinite(zoomMax) ? zoomMax : HANGAR.ZOOM_MAX;

    if (zoomWheelDelta !== 0) {
      this.targetUserZoom = clamp(
        this.targetUserZoom + zoomWheelDelta * HANGAR.ZOOM_WHEEL_STEP,
        zMin,
        zMax
      );
    } else {
      // Keep current zoom inside limits when sidePadX / viewport changes.
      this.targetUserZoom = clamp(this.targetUserZoom, zMin, zMax);
    }

    const zoomT = 1 - Math.exp(-CAMERA.ZOOM_SMOOTHING * deltaTime);
    this.userZoom = lerp(this.userZoom, this.targetUserZoom, zoomT);
    this.effectiveZoom = this.userZoom;

    if (panScreenDelta && (panScreenDelta.x || panScreenDelta.y)) {
      const z = Math.max(0.001, this.effectiveZoom);
      this.position.x -= panScreenDelta.x / z;
      this.position.y -= panScreenDelta.y / z;
      const maxX = HANGAR.SIDE_PAD_X + HANGAR.PAD_R * 2.5;
      const maxY = HANGAR.BAY_HALF_H + 40;
      this.position.x = clamp(this.position.x, -maxX, maxX);
      this.position.y = clamp(this.position.y, -maxY, maxY);
    }
  }

  /** Snap hangar camera to a world anchor (ship / dock on enter). */
  setHangarAnchor(x, y) {
    this.position.set(x, y);
    this.offset.set(0, 0);
    this.targetOffset.set(0, 0);
  }

  /** Blueprint sandbox: no lead offset; zoom in until the hull fills the circle. */
  updateBlueprint(shipPosition, deltaTime, zoomWheelDelta = 0) {
    this.position.copy(shipPosition);
    this.offset.set(0, 0);
    this.targetOffset.set(0, 0);
    this.speedZoom = 1;

    if (zoomWheelDelta !== 0) {
      this.targetUserZoom = clamp(
        this.targetUserZoom + zoomWheelDelta * BLUEPRINT.ZOOM_WHEEL_STEP,
        BLUEPRINT.ZOOM_MIN,
        BLUEPRINT.ZOOM_MAX
      );
    }

    const zoomT = 1 - Math.exp(-CAMERA.ZOOM_SMOOTHING * deltaTime);
    this.userZoom = lerp(this.userZoom, this.targetUserZoom, zoomT);
    this.effectiveZoom = this.userZoom;
  }

  worldToScreen(worldX, worldY, screenCenterX, screenCenterY) {
    let dx = (worldX - this.position.x) * this.effectiveZoom;
    let dy = (worldY - this.position.y) * this.effectiveZoom;
    const r = this.rotation || 0;
    if (r) {
      const c = Math.cos(r);
      const s = Math.sin(r);
      const rx = dx * c - dy * s;
      const ry = dx * s + dy * c;
      dx = rx;
      dy = ry;
    }
    return {
      x: dx + screenCenterX + this.offset.x,
      y: dy + screenCenterY + this.offset.y,
    };
  }

  screenToWorld(screenX, screenY, screenCenterX, screenCenterY) {
    let dx = screenX - screenCenterX - this.offset.x;
    let dy = screenY - screenCenterY - this.offset.y;
    const r = this.rotation || 0;
    if (r) {
      const c = Math.cos(-r);
      const s = Math.sin(-r);
      const rx = dx * c - dy * s;
      const ry = dx * s + dy * c;
      dx = rx;
      dy = ry;
    }
    return {
      x: dx / this.effectiveZoom + this.position.x,
      y: dy / this.effectiveZoom + this.position.y,
    };
  }

  getShipScreenPosition(screenCenterX, screenCenterY, shipPosition = null) {
    if (shipPosition) {
      return this.worldToScreen(
        shipPosition.x,
        shipPosition.y,
        screenCenterX,
        screenCenterY
      );
    }
    return {
      x: screenCenterX + this.offset.x,
      y: screenCenterY + this.offset.y,
    };
  }
}
