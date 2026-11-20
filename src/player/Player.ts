import { CONFIG } from '../config';
import { CollisionMask } from '../world/CollisionMask';

export interface PlayerInput {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

const movement = CONFIG.physics;

function approach(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

/** Fixed-step controller. x/y locate the centre of the square in world pixels. */
export class Player {
  readonly motionEvents: { kind: 'jump' | 'land'; x: number; y: number; impactSpeed: number }[] = [];
  vx = 0;
  vy = 0;
  grounded = false;
  private coyoteRemaining = 0;
  private bufferRemaining = 0;
  private previouslyHeld = false;
  private cuttableJump = false;
  private readonly half = movement.playerSize / 2;
  private readonly maxRise = movement.slopeProbe * Math.tan(movement.maxSlopeDegrees * Math.PI / 180);

  constructor(private readonly mask: CollisionMask, public x: number, public y: number) {}

  reset(centerX: number, centerY: number): void {
    this.motionEvents.length = 0;
    this.x = centerX;
    this.y = centerY;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.coyoteRemaining = 0;
    this.bufferRemaining = 0;
    this.previouslyHeld = false;
    this.cuttableJump = false;
  }

  step(dt: number, input: PlayerInput): void {
    this.motionEvents.length = 0;
    if (dt <= 0) return;
    if (this.grounded) this.coyoteRemaining = movement.coyoteTime;
    if (input.jumpPressed) this.bufferRemaining = movement.jumpBuffer;
    const direction = Number(input.right) - Number(input.left);
    const acceleration = direction ? movement.groundAcceleration : movement.groundDeceleration;
    const control = this.grounded ? 1 : movement.airControl;
    this.vx = approach(this.vx, direction * movement.maxRunSpeed, acceleration * control * dt);

    const jumped = this.consumeJump(input.jumpHeld);
    if (!jumped && this.cuttableJump && !input.jumpHeld && this.previouslyHeld && this.vy < 0) {
      this.vy *= movement.jumpCutMultiplier;
      this.cuttableJump = false;
    }
    this.previouslyHeld = input.jumpHeld;
    this.moveHorizontal(this.vx * dt);

    if (this.grounded) {
      const feet = this.y + this.half;
      const floor = this.mask.landingTop(this.x - this.half, this.x + this.half, feet, feet + movement.groundSnap);
      if (floor !== null) {
        this.y = floor - this.half;
      } else {
        this.grounded = false;
      }
    }
    const oldVy = this.vy;
    this.vy = Math.min(movement.maxFallSpeed, this.vy + movement.gravity * dt);
    this.moveVertical((oldVy + this.vy) * 0.5 * dt);
    // A press just before landing takes effect on the contact tick.
    this.consumeJump(input.jumpHeld);
    this.bufferRemaining = Math.max(0, this.bufferRemaining - dt);
    this.coyoteRemaining = Math.max(0, this.coyoteRemaining - dt);
  }

  private consumeJump(held: boolean): boolean {
    if (this.bufferRemaining <= 0 || (!this.grounded && this.coyoteRemaining <= 0)) return false;
    this.vy = -movement.jumpSpeed * (held ? 1 : movement.jumpCutMultiplier);
    this.motionEvents.push({ kind: 'jump', x: this.x, y: this.y + this.half, impactSpeed: 0 });
    this.cuttableJump = held;
    this.grounded = false;
    this.coyoteRemaining = 0;
    this.bufferRemaining = 0;
    return true;
  }

  private blocked(x: number, y: number, ignoreWalkableRise = 0): boolean {
    return this.mask.overlapsSolid(x - this.half, y - this.half, x + this.half, y + this.half, ignoreWalkableRise);
  }

  private moveHorizontal(distance: number): void {
    const direction = Math.sign(distance);
    let remaining = Math.abs(distance);
    while (remaining > 0) {
      const amount = Math.min(1, remaining);
      const nextX = this.x + direction * amount;
      if (this.blocked(nextX, this.y)) {
        if (!this.grounded || !this.climb(nextX, direction)) {
          this.vx = 0;
          break;
        }
      } else if (this.grounded) {
        this.followOneWayRise(nextX);
      }
      this.x = nextX;
      remaining -= amount;
    }
  }

  private climb(nextX: number, direction: number): boolean {
    const probeX = this.x + direction * movement.slopeProbe;
    const probeY = this.y - this.maxRise;
    if (this.blocked(probeX, probeY, direction) || this.blocked(probeX, probeY - this.mask.cellSize)) return false;

    const feet = this.y + this.half;
    const size = this.mask.cellSize;
    for (let top = (Math.ceil(feet / size) - 1) * size; top >= feet - this.maxRise; top -= size) {
      if (!this.blocked(nextX, top - this.half)) {
        this.y = top - this.half;
        return true;
      }
    }
    return false;
  }

  private followOneWayRise(nextX: number): void {
    const feet = this.y + this.half;
    const support = this.mask.landingTop(this.x - this.half, this.x + this.half, feet, feet, 'oneWay');
    if (support === null) return;
    // Only follow a new top entering at the leading corner. An overlapping
    // bridge already above the feet must remain passable from the side.
    const left = nextX > this.x ? this.x + this.half : nextX - this.half;
    const right = nextX > this.x ? nextX + this.half : this.x - this.half;
    const top = this.mask.landingTop(left, right, feet - this.maxRise, feet, 'walkableOneWay');
    if (top !== null && top < feet && !this.blocked(nextX, top - this.half)) {
      this.y = top - this.half;
    }
  }

  private moveVertical(distance: number): void {
    const direction = Math.sign(distance);
    let remaining = Math.abs(distance);
    while (remaining > 0) {
      const amount = Math.min(1, remaining);
      const nextY = this.y + direction * amount;
      if (direction > 0) {
        const floor = this.mask.landingTop(this.x - this.half, this.x + this.half, this.y + this.half, nextY + this.half);
        if (floor !== null) {
          this.y = floor - this.half;
          const bounce = this.mask.landingImpulse(this.x - this.half, this.x + this.half, floor);
          if (!this.grounded || bounce !== null) {
            this.motionEvents.push({ kind: 'land', x: this.x, y: floor, impactSpeed: this.vy });
          }
          this.vy = bounce === null ? 0 : -bounce;
          this.grounded = bounce === null;
          this.cuttableJump = false;
          if (bounce !== null) {
            this.motionEvents.push({ kind: 'jump', x: this.x, y: floor, impactSpeed: 0 });
            this.bufferRemaining = 0;
            this.coyoteRemaining = 0;
          }
          break;
        }
      } else if (this.blocked(this.x, nextY)) {
        const ceilingBottom = Math.ceil((nextY - this.half) / this.mask.cellSize) * this.mask.cellSize;
        this.y = ceilingBottom + this.half;
        this.vy = 0;
        this.cuttableJump = false;
        break;
      }
      this.y = nextY;
      remaining -= amount;
    }
  }
}
