import { Entity } from './Entity.js';
import { Vec2 } from '../utils/MathUtils.js';
import { HARDPOINTS } from './ShipHardpoints.js';
import { SHIP } from '../core/Constants.js';

export class Ship extends Entity {
  constructor(x = 0, y = 0) {
    super(x, y);
    this.angle = SHIP.SPAWN_ANGLE;
    this.mass = 1;
    this.momentOfInertia = 1;
    this.thrusters = {
      aftPort: 0,
      aftStarboard: 0,
      nosePort: 0,
      noseStarboard: 0,
      portFore: 0,
      portAft: 0,
      starboardFore: 0,
      starboardAft: 0,
      mainEngine: 0,
      afterburner: 0,
      retroBurn: false,
    };
    /** World-space combat turret aim (gyro) */
    this.turretAngle = SHIP.SPAWN_ANGLE;
    /** Ship-relative mining laser aim (clamped to arc) */
    this.miningLaserRelAngle = 0;
    this.fireCooldown = 0;
    this.muzzleFlash = 0;
    /** 1 → 0 recoil amount for black barrel */
    this.turretRecoil = 0;
    this.miningLaserFiring = false;
    this.miningLaserBeamLength = SHIP.MINING_LASER_RANGE;
    /** Seconds Space has been held (Precision warm-up) */
    this.mainEngineWarmup = 0;
  }

  getForward() {
    return Vec2.fromAngle(this.angle);
  }

  getRight() {
    return Vec2.fromAngle(this.angle + Math.PI / 2);
  }

  /** Local aim of dorsal turret relative to hull */
  getTurretLocalAngle() {
    return this.turretAngle - this.angle;
  }

  getMiningLaserWorldAngle() {
    return this.angle + this.miningLaserRelAngle;
  }

  _localToWorld(lx, ly) {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    return {
      x: this.position.x + lx * cos - ly * sin,
      y: this.position.y + lx * sin + ly * cos,
    };
  }

  /** Muzzle tip in world space (accounts for recoil) */
  getTurretMuzzle() {
    const recoil = this.turretRecoil * SHIP.TURRET_RECOIL_DIST;
    const tipDist =
      SHIP.TURRET_BARREL_LENGTH + SHIP.TURRET_MUZZLE_EXTRA - recoil;
    const dir = Vec2.fromAngle(this.turretAngle);
    return {
      x: this.position.x + dir.x * tipDist,
      y: this.position.y + dir.y * tipDist,
    };
  }

  getMiningLaserOrigin() {
    const hp = HARDPOINTS.miningLaser;
    return this._localToWorld(hp.x, hp.y);
  }

  update(deltaTime) {
    if (this.fireCooldown > 0) this.fireCooldown -= deltaTime;
    if (this.muzzleFlash > 0) this.muzzleFlash -= deltaTime;
    if (this.turretRecoil > 0) {
      this.turretRecoil = Math.max(
        0,
        this.turretRecoil - deltaTime / SHIP.TURRET_RECOIL_RECOVER
      );
    }
  }
}
