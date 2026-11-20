import { CONFIG } from '../config';
import type { BehaviorTerrain } from './behaviors/BehaviorTerrain';

interface Point {
  x: number;
  y: number;
}

interface Bounds extends Point {
  width: number;
  height: number;
}

const SOLID = 1;
const ONE_WAY = 2;
const RISES_LEFT = 4;
const RISES_RIGHT = 8;
const WALKABLE_ONE_WAY = 16;

/** Coordinates are world pixels, with +y down. Box intervals are half-open. */
export class CollisionMask {
  readonly cellSize = CONFIG.collision.cellSize;
  private readonly columns: number;
  private readonly rows: number;
  private readonly cells: Uint8Array;
  private behaviors?: BehaviorTerrain;
  private overlay?: CollisionMask;
  private mechanism?: { mask: CollisionMask; col0: number; row0: number; col1: number; row1: number };

  /** A separate local mask for moving pen strokes; death-assist ink lives in overlay. */
  setMechanismLayer(mask?: CollisionMask, x = 0, y = 0): void {
    if (!mask) { this.mechanism = undefined; return; }
    const col0 = x / this.cellSize;
    const row0 = y / this.cellSize;
    if (!Number.isInteger(col0) || !Number.isInteger(row0)) throw new Error('Mechanism must align to the collision grid');
    this.mechanism = { mask, col0, row0, col1: col0 + mask.columns, row1: row0 + mask.rows };
  }

  clearStrokes(): void {
    this.cells.fill(0);
  }

  // Optional ink added during play, with its own lifetime (e.g. assist commas).
  setOverlay(overlay?: CollisionMask): void {
    if (overlay && (overlay.rows !== this.rows || overlay.columns !== this.columns)) {
      throw new Error('Collision mask layers must use the same world bounds');
    }
    this.overlay = overlay;
  }

  private flagsAt(row: number, col: number): number {
    const index = row * this.columns + col;
    let flags = this.cells[index] | (this.overlay?.cells[index] ?? 0);
    const m = this.mechanism;
    if (m && col >= m.col0 && col < m.col1 && row >= m.row0 && row < m.row1) {
      flags |= m.mask.cells[(row - m.row0) * m.mask.columns + col - m.col0];
    }
    return flags;
  }

  constructor(width: number, height: number) {
    this.columns = Math.ceil(width / this.cellSize);
    this.rows = Math.ceil(height / this.cellSize);
    this.cells = new Uint8Array(this.columns * this.rows);
  }

  attachBehaviors(behaviors: BehaviorTerrain): void {
    this.behaviors = behaviors;
  }

  landingImpulse(left: number, right: number, feet: number): number | null {
    return this.behaviors?.onLanding(left, right, feet) ?? null;
  }

  addStroke(points: readonly Point[], visualWidth: number, oneWay = false): void {
    if (points.length === 0) return;
    const radius = Math.max(CONFIG.collision.minStrokeWidth, visualWidth + CONFIG.collision.strokePadding) / 2;
    // A one-point stroke represents a round dot as well.
    for (let i = 0; i < Math.max(1, points.length - 1); i++) {
      const start = points[i];
      const end = points[i + 1] ?? start;
      this.fillCapsule(start, end, radius, oneWay);
    }
  }

  private fillCapsule(start: Point, end: Point, radius: number, oneWay: boolean): void {
    const size = this.cellSize;
    const left = Math.max(0, Math.floor((Math.min(start.x, end.x) - radius) / size));
    const right = Math.min(this.columns - 1, Math.floor((Math.max(start.x, end.x) + radius) / size));
    const top = Math.max(0, Math.floor((Math.min(start.y, end.y) - radius) / size));
    const bottom = Math.min(this.rows - 1, Math.floor((Math.max(start.y, end.y) + radius) / size));
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    let flags = oneWay ? ONE_WAY : SOLID;
    // Preserve the segment direction so rounding a 50° slope to the grid
    // cannot turn a two-column sample into an artificial 12px ledge.
    const maximumGradient = Math.tan(CONFIG.physics.maxSlopeDegrees * Math.PI / 180);
    const walkable = lengthSquared === 0 || (dx !== 0 && Math.abs(dy / dx) <= maximumGradient * (1 + Number.EPSILON));
    if (walkable) {
      if (oneWay) flags |= WALKABLE_ONE_WAY;
      else if (dy !== 0) flags |= dy / dx < 0 ? RISES_RIGHT : RISES_LEFT;
    }

    for (let row = top; row <= bottom; row++) {
      const cy = (row + 0.5) * size;
      for (let column = left; column <= right; column++) {
        const cx = (column + 0.5) * size;
        const projected = lengthSquared === 0 ? 0 : ((cx - start.x) * dx + (cy - start.y) * dy) / lengthSquared;
        const t = Math.max(0, Math.min(1, projected));
        const ax = cx - (start.x + t * dx);
        const ay = cy - (start.y + t * dy);
        if (ax * ax + ay * ay <= radius * radius) {
          this.cells[row * this.columns + column] |= flags;
        }
      }
    }
  }

  pointAt(x: number, y: number): { solid: boolean; oneWay: boolean } {
    const column = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    const value = column < 0 || column >= this.columns || row < 0 || row >= this.rows
      ? 0 : this.flagsAt(row, column);
    return { solid: (value & SOLID) !== 0, oneWay: (value & ONE_WAY) !== 0 };
  }

  overlapsSolid(left: number, top: number, right: number, bottom: number, ignoreWalkableRise = 0): boolean {
    if (this.behaviors?.overlapsSolid(left, top, right, bottom)) return true;
    const size = this.cellSize;
    const firstColumn = Math.max(0, Math.floor(left / size));
    const lastColumn = Math.min(this.columns - 1, Math.ceil(right / size) - 1);
    const firstRow = Math.max(0, Math.floor(top / size));
    const lastRow = Math.min(this.rows - 1, Math.ceil(bottom / size) - 1);
    const excluded = ignoreWalkableRise > 0 ? RISES_RIGHT : ignoreWalkableRise < 0 ? RISES_LEFT : 0;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstColumn; col <= lastColumn; col++) {
        const value = this.flagsAt(row, col);
        if ((value & SOLID) && !(value & excluded)) return true;
      }
    }
    return false;
  }

  /** First exposed top crossed between the two foot heights (both inclusive). */
  landingTop(left: number, right: number, fromFeet: number, toFeet: number, surface: 'any' | 'oneWay' | 'walkableOneWay' = 'any'): number | null {
    const dynamicTop = surface === 'any' ? this.behaviors?.landingTop(left, right, fromFeet, toFeet) ?? null : null;
    const size = this.cellSize;
    const firstColumn = Math.max(0, Math.floor(left / size));
    const lastColumn = Math.min(this.columns - 1, Math.ceil(right / size) - 1);
    const firstRow = Math.max(0, Math.ceil(fromFeet / size));
    const lastRow = Math.min(this.rows - 1, Math.floor(toFeet / size));
    const layers = surface === 'any' ? SOLID | ONE_WAY : ONE_WAY;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstColumn; col <= lastColumn; col++) {
        const flags = this.flagsAt(row, col);
        if (surface === 'walkableOneWay' && !(flags & WALKABLE_ONE_WAY)) continue;
        const present = flags & layers;
        const above = row > 0 ? this.flagsAt(row - 1, col) : 0;
        if (present & ~above) return dynamicTop === null ? row * size : Math.min(row * size, dynamicTop);
      }
    }
    return dynamicTop;
  }

  forEachSolidCell(bounds: Bounds, visit: (x: number, y: number, size: number, oneWay: boolean) => void): void {
    const size = this.cellSize;
    const firstColumn = Math.max(0, Math.floor(bounds.x / size));
    const lastColumn = Math.min(this.columns - 1, Math.ceil((bounds.x + bounds.width) / size) - 1);
    const firstRow = Math.max(0, Math.floor(bounds.y / size));
    const lastRow = Math.min(this.rows - 1, Math.ceil((bounds.y + bounds.height) / size) - 1);
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = firstColumn; col <= lastColumn; col++) {
        const value = this.flagsAt(row, col);
        if (value & SOLID) visit(col * size, row * size, size, false);
        if (value & ONE_WAY) visit(col * size, row * size, size, true);
      }
    }
  }
}
