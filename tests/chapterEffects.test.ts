import { describe, it, expect } from 'vitest'
import { CHAPTER_FX as fx, CONFIG } from '../src/config'
import { DarknessState } from '../src/spell/effects/Darkness'
import { debrisAt, saveInk } from '../src/world/ChapterEffects'

const zone = { x0: 300, x1: 1000 }
const inside = { x: 400, y: 360 }
const outside = { x: 1200, y: 380 }

describe('chapter lighting', () => {
  it('fades on entry and expands with elapsed world seconds when LAMP is cast', () => {
    const s = new DarknessState(zone)
    s.advance(0, { x: 0, y: 360 }, false)
    s.advance(fx.fadeSeconds / 2, inside, false)
    expect(s.alpha).toBeCloseTo(0.5)
    expect(s.radius).toBe(fx.baseRadius)
    s.advance(fx.lampGrowSeconds / 2, inside, true)
    expect(s.alpha).toBe(1)
    expect(s.radius).toBeCloseTo((fx.baseRadius + fx.lampRadius) / 2)
    const pose = { ...s.lampPosition }
    s.advance(0, inside, true)
    expect(s.lampPosition).toEqual(pose)
    expect(s.radius).toBeCloseTo((fx.baseRadius + fx.lampRadius) / 2)
    s.advance(fx.lampGrowSeconds / 2, inside, true)
    expect(s.radius).toBe(fx.lampRadius)
  })

  it('blinks twice on the far-side exit and drifts away from its departure point', () => {
    const s = new DarknessState(zone)
    s.advance(0, inside, true, true)
    const blink = fx.lampDepart.flickerSeconds / 4
    s.advance(0, outside, true)
    expect(s.lampVisible).toBe(true)
    const y = s.lampPosition.y
    for (const alpha of [fx.lampDepart.dim, 1, fx.lampDepart.dim, 1]) {
      s.advance(blink, outside, true)
      expect(s.lampAlpha).toBeCloseTo(alpha)
    }
    s.advance(fx.lampDepart.flySeconds / 2, { x: 1500, y: 600 }, true)
    expect(s.lampPosition.y).toBeLessThan(y)
    expect(s.alpha).toBe(0)
    s.advance(fx.lampDepart.flySeconds, outside, true)
    expect(s.lampVisible).toBe(false)
  })

  it('restores earned light at a dark checkpoint and skips exit effects on warps', () => {
    const s = new DarknessState(zone)
    s.advance(0, inside, true, true)
    expect(s.radius).toBe(fx.lampRadius)
    expect(s.lampVisible).toBe(true)
    s.advance(0, outside, true, true)
    expect(s.lampVisible).toBe(false)
    s.advance(0, inside, false, true)
    expect(s.radius).toBe(fx.baseRadius)
    expect(s.lampVisible).toBe(false)
  })
})

describe('checkpoint and death visuals', () => {
  it('lights the SAVE letters in sequence and settles to green without changing the pen size', () => {
    const time = fx.saveStepSeconds / 2
    expect(saveInk(0, time, 4).width).toBeGreaterThan(4)
    expect(saveInk(1, time, 4)).toEqual({ color: CONFIG.colors.terrain, width: 4 })
    for (const index of [0, 1, 2, 3]) expect(saveInk(index, Infinity, 4)).toEqual({ color: CONFIG.colors.collected, width: 4 })
  })

  it('splits the player into four distinct pieces that fade by the respawn time', () => {
    const origin = { x: 50, y: 100 }
    const pieces = [0, 1, 2, 3].map(i => debrisAt(origin, i, 0))
    expect(new Set(pieces.map(p => p.x + ',' + p.y)).size).toBe(4)
    expect(debrisAt(origin, 0, 0.1).x).toBeLessThan(pieces[0].x)
    expect(debrisAt(origin, 1, 0.1).y).toBeLessThan(pieces[1].y)
    expect(debrisAt(origin, 3, fx.deathSeconds).alpha).toBe(0)
  })
})
