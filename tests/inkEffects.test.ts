import { describe, expect, it } from 'vitest'
import { BOIL } from '../src/config'
import { layoutHandwriting } from '../src/font/handwriting'
import { boiledStroke } from '../src/font/inkBoil'
import { checklistRows } from '../src/spell/effects/EggEffects'
import { textForLine } from '../src/content/lines'

describe('visual ink effects', () => {
  it('animates the same closed pen stroke without changing any collision point', () => {
    const stroke = layoutHandwriting({ text: 'O', seed: 136, size: 'XL' }).glyphs[0].strokes[0]
    const original = structuredClone(stroke)
    const frame = boiledStroke(stroke, 136, 4)
    expect(frame).toEqual(boiledStroke(stroke, 136, 4))
    expect(frame).not.toEqual(boiledStroke(stroke, 136, 5))
    expect(frame[0]).toEqual(frame.at(-1))
    frame.forEach((point,i) => expect(Math.hypot(point.x-stroke[i].x,point.y-stroke[i].y)).toBeLessThanOrEqual(BOIL.amplitude + 1e-8))
    expect(stroke).toEqual(original)
  })

  it('lists each of the six letters with the current author clue only while missing', () => {
    const missing = checklistRows(new Set())
    expect(missing.map(x=>x.id).sort()).toEqual(['L01','L02','L03','L04','L05','L06'])
    for (const row of missing) expect(row.text).toBe(textForLine(row.id))
    const list = checklistRows(new Set('LIST'))
    expect(list.filter(row=>row.found).map(row=>row.text).join('')).toBe('LIST')
    expect(list.find(row=>row.char==='E')?.text).toBe(textForLine('L05'))
    expect(list.find(row=>row.char==='N')?.text).toBe(textForLine('L04'))
  })
})
