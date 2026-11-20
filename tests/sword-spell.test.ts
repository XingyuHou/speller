import { describe, expect, it } from 'vitest'
import { SWORD_WORDS, textForLine } from '../src/content/lines'
import type { CourseData } from '../src/level/course'
import { SAVE_KEY, SaveStore, type ProgressSnapshot } from '../src/progress/SaveStore'
import { SpellBar } from '../src/spell/SpellBar'
import { EGG_CATALOG, SPELL_CATALOG, SpellBook } from '../src/spell/spells'

const source = 'words-at-bridge'
const zone = { inDarkZone: true, inSwordZone: true, swordSourceId: source }

function loadedSword() {
  const bar = new SpellBar()
  bar.collect('hello:2', 'L')
  bar.loadWord(source, SWORD_WORDS.words)
  bar.insert(4, 0)
  expect(bar.word).toBe('SWORD')
  return bar
}

function begin(book: SpellBook, bar: SpellBar) {
  const result = book.submit(bar, zone)
  if (result.kind !== 'pending') throw new Error('The sword did not start its swing')
  return result
}

function storage() {
  const memory = new Map<string, string>()
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
    removeItem: (key: string) => { memory.delete(key) },
  }
}

const point = { x: 0, y: 0 }
const world: CourseData = {
  width: 300, height: 300, spawn: point, finishId: 'next', stations: [],
  checkpoints: ['save-dark', 'save-palm', 'save-pillars', 'save-sword', 'save-exit',
    'save-quiet', 'save-listen', 'save-corridor-exit', 'save-sprint'].map(id => ({ id, spawn: point })),
  texts: [
    { id: source, role: 'terrain', text: SWORD_WORDS.words, size: 'M', ...point, seed: 1, rearrange: true },
    { id: 'hello', role: 'terrain', text: 'HELLO', size: 'M', ...point, seed: 2, collectible: [2] },
  ],
}

function progress(bar: SpellBar, book: SpellBook): ProgressSnapshot {
  return { checkpointId: 'save-sword', elapsed: 12, deaths: 0, intervalDeaths: {}, assistIds: [],
    bar: bar.snapshot(), book: book.snapshot() }
}

describe('SWORD and the blue WORDS source', () => {
  it('registers exactly four spells and eight eggs and uses the author placeholder for WORDS', () => {
    expect(new Set(SPELL_CATALOG).size).toBe(4)
    expect(new Set(EGG_CATALOG).size).toBe(8)
    const bar = new SpellBar()
    bar.loadWord(source, SWORD_WORDS.words)
    const book = new SpellBook()
    expect(book.submit(bar, zone)).toEqual({ kind: 'egg', word: 'WORDS', lineId: 'E08' })
    expect(textForLine('E08')).toBe('[TODO: E08]')
    expect(book.foundEggs.has('WORDS')).toBe(true)
    expect(book.pendingSwordSource).toBeNull()
    expect(bar.sourceId).toBe(source)
    const green = new SpellBar()
    for (const char of SWORD_WORDS.words) green.collect(char, char)
    expect(book.submit(green, zone).kind).toBe('fallback')
  })

  it('requires the correct active source in the rope area and preserves an out-of-area arrangement', () => {
    const book = new SpellBook()
    const bar = loadedSword()
    expect(book.submit(bar, { ...zone, inSwordZone: false })).toMatchObject({kind: 'blocked', lineId: 'S01'})
    expect(book.submit(bar, { inDarkZone: false, inSwordZone: true })).toMatchObject({kind: 'blocked', lineId: 'S01'})
    expect(book.submit(bar, { ...zone, swordSourceId: 'other-words' })).toMatchObject({kind: 'blocked', lineId: 'S01'})
    expect(bar.word).toBe('SWORD')
    expect(bar.spentWord(source)).toBe(false)
    expect(book.pendingSwordSource).toBeNull()
    const collected = new SpellBar()
    for (const char of SWORD_WORDS.sword) collected.collect(char, char)
    expect(book.submit(collected, zone).kind).toBe('fallback')
  })

  it('consumes exactly once on impact and restores the stashed green letters', () => {
    const book = new SpellBook()
    const bar = loadedSword()
    const swing = begin(book, bar)
    expect(book.pendingSwordSource).toBe(source)
    expect(book.submit(bar, zone)).toEqual({kind: 'blocked', word: 'SWORD', reason:'active'})
    expect(bar.sourceId).toBe(source)
    expect(book.foundSpells.size).toBe(0)
    expect(book.commitSword(bar, 'other', swing.castId)).toBe(false)
    expect(book.commitSword(bar, swing.sourceId, swing.castId)).toBe(true)
    expect(book.commitSword(bar, swing.sourceId, swing.castId)).toBe(false)
    expect(book.pendingSwordSource).toBeNull()
    expect(bar.word).toBe('L')
    expect(bar.loadWord(source, SWORD_WORDS.words)).toBe(false)
    expect(book.foundSpells).toEqual(new Set(['SWORD']))
  })

  it('interrupts the swing on death and prevents a late callback from committing a later cast', () => {
    const book = new SpellBook()
    const bar = loadedSword()
    const old = begin(book, bar)
    book.onDeath()
    expect(bar.word).toBe('SWORD')
    expect(book.pendingSwordSource).toBeNull()
    const current = begin(book, bar)
    expect(book.commitSword(bar, source, old.castId)).toBe(false)
    expect(book.pendingSwordSource).toBe(source)
    expect(book.commitSword(bar, source, current.castId)).toBe(true)
  })

  it('preserves the loaded word if the arrangement changes during the swing', () => {
    const book = new SpellBook()
    const bar = loadedSword()
    const cast = begin(book, bar)
    bar.undo()
    expect(book.commitSword(bar, source, cast.castId)).toBe(false)
    expect(book.pendingSwordSource).toBeNull()
    expect(bar.word).toBe('WORDS')
    expect(bar.spentWord(source)).toBe(false)
    expect(book.foundSpells.has('SWORD')).toBe(false)
  })

  it('resumes an interrupted save with the same arrangement and restores a cut as permanent', () => {
    const disk = storage()
    const store = new SaveStore(world, disk)
    const bar = loadedSword()
    const book = new SpellBook()
    begin(book, bar)
    store.save(progress(bar, book))
    const pendingSave = store.load()!
    book.restore(pendingSave.book)
    bar.restore(pendingSave.bar)
    expect(book.pendingSwordSource).toBeNull()
    expect(book.foundSpells.has('SWORD')).toBe(false)
    expect(bar.word).toBe('SWORD')
    const cast = begin(book, bar)
    book.commitSword(bar, source, cast.castId)
    store.save(progress(bar, book))
    const cutSave = store.load()!
    const restored = new SpellBar()
    restored.restore(cutSave.bar)
    expect(restored.spentWord(source)).toBe(true)
    expect(restored.word).toBe('L')
    expect(cutSave.book.spells).toContain('SWORD')
  })

  it('keeps a later return checkpoint during a bridge visit and clears it when the visit ends', () => {
    const store = new SaveStore(world, storage())
    const visit = { ...progress(loadedSword(), new SpellBook()), bridgeReturnCheckpointId: 'save-sprint' }
    expect(store.save(visit)).toBe(true)
    expect(store.load()?.bridgeReturnCheckpointId).toBe('save-sprint')
    for (const snapshot of [
      { ...visit, checkpointId: 'save-sprint' },
      { ...visit, bridgeReturnCheckpointId: 'obsolete' },
      { ...visit, bridgeReturnCheckpointId: 'save-dark' },
      { ...visit, completed: true },
    ]) {
      expect(store.save(snapshot)).toBe(true)
      expect(store.load()?.bridgeReturnCheckpointId).toBeUndefined()
    }
  })

  it('maps numeric checkpoint indices from before the bridge and leaves old completions intact', () => {
    const disk = storage()
    const store = new SaveStore(world, disk)
    disk.setItem(SAVE_KEY, JSON.stringify({ version: 0, checkpoint: 3, foundSpells: ['LAMP', 'LISTEN', 'SILENT'], completed: true }))
    const old = store.load()!
    expect(old.checkpointId).toBe('save-exit')
    expect(old.completed).toBe(true)
    expect(old.book.spells).not.toContain('SWORD')
    expect(old.bar.spentWords).not.toContain(source)
    disk.setItem(SAVE_KEY, JSON.stringify({ version: 1, checkpointId: 'save-sprint', bar: { spentWords: [source] } }))
    expect(store.load()!.book.spells).toContain('SWORD')
  })
})
