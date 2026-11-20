import { describe, expect, it } from 'vitest'
import { SPELL_CONFIG } from '../src/config'
import { WorldClock } from '../src/spell/WorldClock'

describe('world time', () => {
  it('slows only during a drag and restores normal speed over real time', () => {
    const clock = new WorldClock()
    expect(clock.advance(1)).toBe(1)
    clock.setDragging(true)
    expect(clock.advance(1)).toBe(SPELL_CONFIG.dragScale)
    clock.setDragging(false)
    const half = SPELL_CONFIG.releaseSeconds / 2
    const halfwayScale = (1 + SPELL_CONFIG.dragScale) / 2
    expect(clock.advance(half)).toBeCloseTo(half * (SPELL_CONFIG.dragScale + halfwayScale) / 2)
    expect(clock.scale).toBeCloseTo(halfwayScale)
    clock.setDragging(false)
    clock.advance(half)
    expect(clock.scale).toBeCloseTo(1)
    expect(clock.advance(1)).toBeCloseTo(1)
  })

  it('integrates recovery consistently over one large frame and many small ones', () => {
    const coarse = new WorldClock()
    const fine = new WorldClock()
    for (const clock of [coarse, fine]) {
      clock.setDragging(true)
      clock.setDragging(false)
    }
    const expected = SPELL_CONFIG.releaseSeconds * (1 + SPELL_CONFIG.dragScale) / 2 + (1 - SPELL_CONFIG.releaseSeconds)
    expect(coarse.advance(1)).toBeCloseTo(expected)
    let elapsed = 0
    for (let i = 0; i < 120; i++) elapsed += fine.advance(1 / 120)
    expect(elapsed).toBeCloseTo(expected)
  })

  it('can disable, re-enable, and start another drag during recovery', () => {
    const clock = new WorldClock()
    clock.setEnabled(false)
    clock.setDragging(true)
    expect(clock.advance(1)).toBe(1)
    clock.setEnabled(true)
    expect(clock.scale).toBe(SPELL_CONFIG.dragScale)
    clock.setDragging(false)
    clock.advance(SPELL_CONFIG.releaseSeconds / 2)
    clock.setDragging(true)
    expect(clock.scale).toBe(SPELL_CONFIG.dragScale)
    clock.setEnabled(false)
    clock.setDragging(false)
    expect(clock.advance(0)).toBe(0)
    expect(clock.advance(1)).toBe(1)
  })
})
