import { describe, expect, it } from 'vitest'
import { SPELL_CONFIG } from '../src/config'
import { textForLine } from '../src/content/lines'
import { SpellBar } from '../src/spell/SpellBar'
import { SpellBook } from '../src/spell/spells'

const light = { inDarkZone: false }
const dark = { inDarkZone: true }

function picked(word: string): SpellBar {
  const bar = new SpellBar()
  Array.from(word).forEach((char, i) => bar.collect(String(i), char))
  return bar
}

describe('spell dispatch', () => {
  it('keeps PALM after its egg and after a blocked cast, then consumes only the successful blue spell', () => {
    const book = new SpellBook()
    const bar = picked('IS')
    bar.loadWord('palm-terrain', 'PALM')
    expect(book.submit(bar, dark)).toEqual({ kind: 'egg', word: 'PALM', lineId: 'E01' })
    expect(bar.word).toBe('PALM')
    bar.insert(0, 3)
    bar.swap(0, 1)
    expect(book.submit(bar, light)).toEqual({ kind: 'blocked', word: 'LAMP', lineId: 'S01', reason: 'area' })
    expect(bar.word).toBe('LAMP')
    expect(book.lamp).toBe(false)
    expect(book.submit(bar, dark)).toEqual({ kind: 'spell', word: 'LAMP', sourceId: 'palm-terrain' })
    expect(bar.word).toBe('IS')
    expect(bar.spentWord('palm-terrain')).toBe(true)
    expect(book.lamp).toBe(true)
  })

  it('only consumes the specified source for LAMP and uses the whole bar', () => {
    const book = new SpellBook()
    const collectedLamp = picked('LAMP')
    expect(book.submit(collectedLamp, dark).kind).toBe('fallback')
    expect(collectedLamp.word).toBe('LAMP')
    expect(book.submit(picked('LISTENX'), dark).kind).toBe('fallback')
    expect(book.submit(new SpellBar(), dark).kind).toBe('empty')
  })

  it('uses the same six collected tiles for both spells and retains each cast order', () => {
    const bar = picked('LISTEN')
    const book = new SpellBook()
    expect(book.submit(bar, light)).toEqual({ kind: 'spell', word: 'LISTEN' })
    expect(book.listen).toBe(true)
    expect(bar.word).toBe('LISTEN')
    for (let i = 0; i < 'SILENT'.length; i++) bar.insert(bar.word.indexOf('SILENT'[i]), i)
    expect(book.submit(bar, light)).toEqual({ kind: 'spell', word: 'SILENT' })
    expect(bar.word).toBe('SILENT')
    expect(book.foundSpells).toEqual(new Set(['LISTEN', 'SILENT']))
  })

  it('allows SILENT first, blocks refreshing an active effect, and unlocks after two seconds of cooldown', () => {
    const book = new SpellBook()
    const bar = picked('SILENT')
    expect(book.submit(bar, light).kind).toBe('spell')
    expect(book.listen).toBe(false)
    book.update(3)
    expect(book.submit(bar, light)).toMatchObject({ kind: 'blocked', reason: 'active' })
    expect(book.silentRemaining).toBe(SPELL_CONFIG.silentSeconds - 3)
    book.update(book.silentRemaining)
    expect(book.silentRemaining).toBe(0)
    expect(book.cooldownRemaining).toBe(SPELL_CONFIG.cooldownSeconds)
    expect(book.submit(bar, light)).toMatchObject({ kind: 'blocked', reason: 'cooldown', lineId: 'S02' })
    book.update(SPELL_CONFIG.cooldownSeconds)
    expect(book.submit(bar, light).kind).toBe('spell')
    book.update(SPELL_CONFIG.silentSeconds + 1)
    expect(book.silentRemaining).toBe(0)
    expect(book.cooldownRemaining).toBe(SPELL_CONFIG.cooldownSeconds - 1)
    expect(book.foundSpells.size).toBe(1)
  })

  it.each([
    ['TINSEL', 'E02'], ['ENLIST', 'E03'], ['INLETS', 'E04'], ['LIST', 'E05'], ['TEN', 'E06'], ['NET', 'E07'],
  ])('matches the complete %s egg and keeps its tiles', (word, lineId) => {
    const book = new SpellBook()
    const bar = picked(word)
    expect(book.submit(bar, light)).toEqual({ kind: 'egg', word, lineId })
    expect(bar.word).toBe(word)
    book.submit(bar, light)
    expect(book.foundEggs.size).toBe(1)
    expect(book.foundSpells.size).toBe(0)
  })

  it('selects available author fallback lines without consecutive repetition', () => {
    const book = new SpellBook(() => 0)
    const bar = picked('ZZ')
    let last: string | undefined
    for (let i = 0; i < 12; i++) {
      const result = book.submit(bar, light)
      expect(result.kind).toBe('fallback')
      expect(result.lineId).not.toBe(last)
      expect(textForLine(result.lineId!)).toBeTruthy()
      last = result.lineId
    }
    expect(bar.word).toBe('ZZ')
  })

  it('clears active and cooling SILENT on death while preserving learned spells and eggs', () => {
    const book = new SpellBook()
    const blue = new SpellBar()
    blue.loadWord('palm', 'PALM')
    book.submit(blue, dark)
    blue.insert(0, 3)
    blue.swap(0, 1)
    book.submit(blue, dark)
    book.submit(picked('LISTEN'), light)
    const silent = picked('SILENT')
    book.submit(silent, light)
    book.onDeath()
    expect(book.silentRemaining).toBe(0)
    expect(book.submit(silent, light).kind).toBe('spell')
    book.update(SPELL_CONFIG.silentSeconds)
    book.onDeath()
    expect(book.cooldownRemaining).toBe(0)
    expect(book.lamp && book.listen).toBe(true)
    expect(book.foundEggs.size).toBe(1)
    book.reset()
    expect(book.lamp || book.listen).toBe(false)
    expect(book.foundEggs.size + book.foundSpells.size).toBe(0)
  })
})
