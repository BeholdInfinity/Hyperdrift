export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  clone() {
    return new Vec2(this.x, this.y);
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = this.x * cos - this.y * sin;
    const y = this.x * sin + this.y * cos;
    this.x = x;
    this.y = y;
    return this;
  }

  static fromAngle(angle, magnitude = 1) {
    return new Vec2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
  }

  static lerp(a, b, t) {
    return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }

  static sub(a, b) {
    return new Vec2(a.x - b.x, a.y - b.y);
  }

  static add(a, b) {
    return new Vec2(a.x + b.x, a.y + b.y);
  }

  static scale(v, s) {
    return new Vec2(v.x * s, v.y * s);
  }

  static dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  static distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function angleDifference(from, to) {
  return normalizeAngle(to - from);
}

export function smoothDamp(current, target, velocity, smoothTime, maxSpeed, deltaTime) {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  const temp = (velocity + omega * change) * deltaTime;
  velocity = (velocity - omega * temp) * exp;
  let result = (current - change) + (change + temp) * exp;
  if ((target - current > 0) === (result > target)) {
    result = target;
    velocity = (result - target) / deltaTime;
  }
  return { value: result, velocity };
}
