import { describe, expect, it } from 'vitest'
import { CONFIG } from '../src/config'
import { GLYPHS } from '../src/font/glyphs'
import { layoutHandwriting } from '../src/font/handwriting'

describe('seeded handwriting', () => {
  it('keeps source indices including whitespace, and supplies every required glyph', () => {
    const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789.,!?'_-/:+[]"
    const layout = layoutHandwriting({ text, size: 'S', seed: 0 })
    for (const [index, glyph] of layout.glyphs.entries()) {
      expect(GLYPHS[glyph.char]).toBeDefined()
      expect(glyph.index).toBe(index)
      expect(glyph.char).toBe(text[index])
      expect(glyph.strokes.length === 0).toBe(glyph.char === ' ')
    }
    const empty = layoutHandwriting({ text: ' ', seed: 3, size: 'S', x: 3, y: 9 })
    expect(empty.bounds).toEqual({ minX: 3, minY: 9, maxX: 3, maxY: 9 })
  })

  it('returns identical ink for the same seed and varies the ink with the seed', () => {
    const options = { text: 'PLATFORM', size: CONFIG.sizes.XL, seed: 41 }
    const ink = layoutHandwriting(options)
    expect(layoutHandwriting(options)).toEqual(ink)
    expect(layoutHandwriting({ ...options, seed: 42 })).not.toEqual(ink)
    const points = ink.glyphs.flatMap(letter => letter.strokes.flat())
    expect(ink.bounds.minX).toBe(Math.min(...points.map(point => point.x)))
    expect(ink.bounds.maxY).toBe(Math.max(...points.map(point => point.y)))
  })

  it('keeps closed pen loops and shared intersections joined after jitter', () => {
    const [o, t] = layoutHandwriting({ text: 'OT', seed: 13, size: 'XL' }).glyphs
    expect(o.strokes[0][0]).toEqual(o.strokes[0][o.strokes[0].length - 1])
    expect(t.strokes[0][1]).toEqual(t.strokes[1][0])
  })

  it('rotates and translates exactly the same ink as a straight polyline baseline', () => {
    const options = { text: 'STEP', size: 40, seed: 12 }
    const straight = layoutHandwriting(options)
    const offset = { x: 10, y: 30 }
    const rotated = layoutHandwriting({ ...options, ...offset, rotation: Math.PI / 2 })
    const vertical = layoutHandwriting({
      ...options,
      ...offset,
      baseline: { type: 'polyline', points: [{ x: 0, y: 0 }, { x: 0, y: 1000 }] },
    })
    const first = straight.glyphs.flatMap(letter => letter.strokes.flat())
    for (const layout of [rotated, vertical]) {
      const second = layout.glyphs.flatMap(letter => letter.strokes.flat())
      second.forEach((p, i) => {
        expect(p.x).toBeCloseTo(offset.x - first[i].y)
        expect(p.y).toBeCloseTo(offset.y + first[i].x)
      })
    }
  })

  it('follows a quadratic baseline and turns each letter with the local tangent', () => {
    const options = { text: 'TTTTTTTTT', size: 40, seed: 7 }
    const curved = layoutHandwriting({
      ...options,
      baseline: { type: 'quad', p0: { x: 0, y: 0 }, c: { x: 120, y: 130 }, p1: { x: 240, y: 0 } },
    })
    const barRise = (index: number) => {
      const cap = curved.glyphs[index].strokes[0]
      return cap[cap.length - 1].y - cap[0].y
    }
    expect(barRise(0)).toBeGreaterThan(0)
    expect(barRise(curved.glyphs.length - 1)).toBeLessThan(0)
    expect(curved.glyphs[3].bounds.minY).toBeGreaterThan(curved.glyphs[0].bounds.minY)
  })
})
