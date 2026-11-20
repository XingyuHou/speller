import { describe, expect, it } from 'vitest';
import { CollisionMask } from '../src/world/CollisionMask';
import { CONFIG } from '../src/config';

describe('stroke masks', () => {
  it('rasterizes capsules with round caps, a minimum width, and thicker wide strokes', () => {
    const mask = new CollisionMask(200, 180);
    mask.addStroke([{ x: 30, y: 50 }, { x: 110, y: 50 }], 3);
    expect(mask.pointAt(26, 50).solid).toBe(true);
    expect(mask.pointAt(26, 54).solid).toBe(false);
    expect(mask.pointAt(70, 54).solid).toBe(true);
    expect(mask.pointAt(70, 58).solid).toBe(false);
    mask.addStroke([{ x: 70, y: 110 }], 20);
    expect(mask.pointAt(70, 122).solid).toBe(true);
    expect(mask.pointAt(70, 126).solid).toBe(false);
  });

  it('keeps holes, one-way layers and clipped world boundaries distinct', () => {
    const mask = new CollisionMask(100, 100);
    mask.addStroke([{ x: 10, y: 10 }, { x: 70, y: 10 }, { x: 70, y: 70 }, { x: 10, y: 70 }, { x: 10, y: 10 }], 3);
    mask.addStroke([{ x: -100, y: 38 }, { x: 130, y: 38 }], 3, true);
    expect(mask.pointAt(50, 50)).toEqual({ solid: false, oneWay: false });
    expect(mask.pointAt(50, 38)).toEqual({ solid: false, oneWay: true });
    expect(mask.pointAt(70, 38)).toEqual({ solid: true, oneWay: true });
    expect(mask.pointAt(-1, 38)).toEqual({ solid: false, oneWay: false });
    expect(mask.pointAt(101, 38)).toEqual({ solid: false, oneWay: false });
    expect(mask.landingTop(46, 50, 25, 60)).toEqual(32);
    expect(mask.landingTop(46, 50, 35, 60)).toBeNull();
    expect(mask.overlapsSolid(46, 32, 50, 44)).toBe(false);
  });

  it('reports only occupied cells intersecting the visible bounds in the overlay', () => {
    const mask = new CollisionMask(96, 96);
    mask.addStroke([{ x: 12, y: 50 }, { x: 82, y: 50 }], 3);
    mask.addStroke([{ x: 30, y: 18 }, { x: 30, y: 72 }], 3, true);
    const seen = new Set<string>();
    mask.forEachSolidCell({ x: 24, y: 32, width: 24, height: 28 }, (x, y, size, oneWay) => {
      expect(size).toBe(CONFIG.collision.cellSize);
      expect(x).toBeGreaterThanOrEqual(24);
      expect(x).toBeLessThan(48);
      expect(y).toBeGreaterThanOrEqual(32);
      expect(y).toBeLessThan(60);
      seen.add([x, y, oneWay].join(','));
    });
    for (let x = 24; x < 48; x += mask.cellSize) {
      for (let y = 32; y < 60; y += mask.cellSize) {
        const flags = mask.pointAt(x, y);
        expect(seen.has([x, y, true].join(','))).toBe(flags.oneWay);
        expect(seen.has([x, y, false].join(','))).toBe(flags.solid);
      }
    }
  });
});
