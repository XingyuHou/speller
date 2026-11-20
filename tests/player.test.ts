import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { layoutHandwriting } from '../src/font/handwriting';
import { Player, type PlayerInput } from '../src/player/Player';
import { CollisionMask } from '../src/world/CollisionMask';

const dt = CONFIG.simulation.step;
const idle: PlayerInput = { left: false, right: false, jumpPressed: false, jumpHeld: false };
const run = { ...idle, right: true };
const jump = { ...idle, jumpPressed: true, jumpHeld: true };

function advance(player: Player, frames: number, input = idle): void {
  for (let tick = 0; tick < frames; tick++) player.step(dt, input);
}

function flatGround(end = 780): CollisionMask {
  const mask = new CollisionMask(800, 600);
  mask.addStroke([{ x: 0, y: 402 }, { x: end, y: 402 }], 4);
  return mask;
}

function land(mask: CollisionMask, x = 50, y = 350): Player {
  const player = new Player(mask, x, y);
  advance(player, 60);
  expect(player.grounded).toBe(true);
  return player;
}

describe('player on ink', () => {
  it.each(['O', 'L', 'T'])('lands on the actual %s stroke', (char) => {
    const ink = layoutHandwriting({ text: char, x: 140, y: 360, size: 'XL', seed: 11 });
    const mask = new CollisionMask(500, 500);
    for (const stroke of ink.glyphs[0].strokes) mask.addStroke(stroke, CONFIG.ink.XL);
    const { minX, maxX, minY, maxY } = ink.bounds;
    const player = land(mask, (minX + maxX) / 2, minY - 50);
    const feet = player.y + CONFIG.physics.playerSize / 2;
    const expectedY = char === 'L' ? maxY : minY;
    expect(Math.abs(feet - expectedY)).toBeLessThan(CONFIG.collision.minStrokeWidth + CONFIG.collision.cellSize);
    expect(mask.landingTop(player.x - 12, player.x + 12, feet, feet)).toBe(feet);
  });

  it('accelerates to full speed, decelerates and stops', () => {
    const player = land(flatGround());
    player.step(dt, run);
    expect(player.vx).toBeCloseTo(CONFIG.physics.groundAcceleration * dt);
    advance(player, 35, run);
    expect(player.vx).toBe(CONFIG.physics.maxRunSpeed);
    advance(player, 30);
    expect(player.vx).toBe(0);
    expect(player.grounded).toBe(true);
  });

  it('makes a held jump reach the designed height and cuts a released jump', () => {
    function height(held: boolean): number {
      const player = land(flatGround());
      const start = player.y;
      player.step(dt, jump);
      let peak = player.y;
      for (let i = 0; i < 100; i++) {
        player.step(dt, { ...idle, jumpHeld: held });
        peak = Math.min(peak, player.y);
      }
      expect(player.grounded).toBe(true);
      return start - peak;
    }
    expect(height(true)).toBeCloseTo(CONFIG.physics.jumpSpeed ** 2 / (2 * CONFIG.physics.gravity), 0);
    expect(height(false)).toBeLessThan(height(true) / 2);
  });

  it('allows a coyote jump just past an edge, then expires and prevents midair jumps', () => {
    function offEdge(): Player {
      const player = land(flatGround(150));
      for (let i = 0; i < 150 && player.grounded; i++) player.step(dt, run);
      expect(player.grounded).toBe(false);
      return player;
    }
    const early = offEdge();
    advance(early, 5, run);
    early.step(dt, jump);
    expect(early.vy).toBeLessThan(0);
    const previous = early.vy;
    early.step(dt, jump);
    expect(early.vy).toBeGreaterThan(previous);
    const late = offEdge();
    advance(late, Math.ceil(CONFIG.physics.coyoteTime / dt) + 1, run);
    late.step(dt, jump);
    expect(late.vy).toBeGreaterThan(0);
  });

  it('consumes a buffered jump on landing and expires an early press', () => {
    const mask = flatGround();
    const near = new Player(mask, 100, 370);
    near.vy = 380;
    near.step(dt, jump);
    advance(near, 6, { ...idle, jumpHeld: true });
    expect(near.vy).toBeLessThan(0);
    const far = new Player(mask, 100, 200);
    far.step(dt, jump);
    advance(far, 110, { ...idle, jumpHeld: true });
    expect(far.grounded).toBe(true);
  });

  it('caps fall speed and still catches the first thin surface', () => {
    const player = new Player(flatGround(), 60, -1000);
    advance(player, 130);
    expect(player.vy).toBe(CONFIG.physics.maxFallSpeed);
    advance(player, 130);
    expect(player.grounded).toBe(true);
    expect(player.y).toBe(384);
  });

  it('passes through a one-way stroke from below, then lands on its top', () => {
    const mask = flatGround();
    mask.addStroke([{ x: 28, y: 340 }, { x: 280, y: 340 }], 4, true);
    const player = land(mask, 100, 365);
    player.step(dt, jump);
    let apex = player.y;
    for (let i = 0; i < 115; i++) {
      player.step(dt, { ...idle, jumpHeld: true });
      apex = Math.min(apex, player.y);
    }
    expect(apex).toBeLessThan(300);
    expect(player.grounded).toBe(true);
    expect(player.y).toBe(324);
  });

  it('passes through the side of a one-way stroke and stops against a solid wall', () => {
    const mask = flatGround();
    mask.addStroke([{ x: 90, y: 380 }, { x: 150, y: 380 }], 4, true);
    mask.addStroke([{ x: 210, y: 200 }, { x: 210, y: 402 }], 4);
    const player = land(mask);
    advance(player, 200, run);
    expect(player.x).toBeGreaterThan(185);
    expect(player.x).toBeLessThanOrEqual(192);
    expect(player.y).toBe(384);
    expect(player.vx).toBe(0);
  });

  it.each([false, true])('walks up a 50° incline and follows it downhill (one-way %s)', (oneWay) => {
    const mask = new CollisionMask(700, 600);
    const height = 150 * Math.tan(CONFIG.physics.maxSlopeDegrees * Math.PI / 180);
    mask.addStroke([{ x: 0, y: 420 }, { x: 150, y: 420 }, { x: 300, y: 420 - height }, { x: 500, y: 420 - height }], 4, oneWay);
    const player = land(mask, 76, 360);
    advance(player, 145, run);
    expect(player.x).toBeGreaterThan(320);
    expect(player.y).toBeLessThan(242);
    for (let tick = 0; tick < 145; tick++) {
      player.step(dt, { ...idle, left: true });
      expect(player.grounded).toBe(true);
    }
    expect(player.y).toBeGreaterThan(390);
  });

  it('blocks a steep incline and never climbs a ceiling', () => {
    const mask = flatGround();
    mask.addStroke([{ x: 150, y: 402 }, { x: 230, y: 230 }], 4);
    mask.addStroke([{ x: 10, y: 300 }, { x: 130, y: 300 }], 4);
    const player = land(mask);
    player.step(dt, jump);
    advance(player, 22, { ...idle, jumpHeld: true });
    expect(player.y).toBeGreaterThanOrEqual(316);
    advance(player, 120);
    advance(player, 100, run);
    expect(player.x).toBeLessThan(155);
    expect(player.y).toBeGreaterThan(375);
  });

  it('passes the side of a steep one-way incline without ratcheting upward', () => {
    const mask = new CollisionMask(800, 600);
    mask.addStroke([{ x: 0, y: 402 }, { x: 700, y: 402 }], 4, true);
    mask.addStroke([{ x: 150, y: 402 }, { x: 230, y: 230 }], 4, true);
    const player = land(mask);
    let highest = player.y;
    for (let tick = 0; tick < 180; tick++) {
      player.step(dt, run);
      highest = Math.min(highest, player.y);
    }
    expect(highest).toBeGreaterThan(370);
    expect(player.x).toBeGreaterThan(300);
    expect(player.grounded).toBe(true);
  });
});
