import { describe, expect, it } from 'vitest'
import type { CourseData } from '../src/level/course'
import { SAVE_KEY, SaveStore, type ProgressSnapshot } from '../src/progress/SaveStore'
import { SpellBar } from '../src/spell/SpellBar'
import { SpellBook } from '../src/spell/spells'

const pos = { x: 0, y: 0 }
const course: CourseData = {
  width: 800, height: 500, spawn: pos, finishId: 'end', stations: [],
  checkpoints: [{ id: 'dark', spawn: pos }, { id: 'listen-cp', spawn: pos }],
  texts: [
    { id: 'palm', role: 'terrain', text: 'PALM', size: 'L', seed: 1, ...pos, rearrange: true },
    ...Array.from('LISTEN', char => ({
      id: char.toLowerCase(), text: char, role: 'terrain' as const, size: 'L' as const,
      seed: 1, ...pos, collectible: [0],
    })),
  ],
}

function memory() {
  const records = new Map<string, string>()
  return {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => { records.set(key, value) },
    removeItem: (key: string) => { records.delete(key) },
  }
}

function progress(bar = new SpellBar(), book = new SpellBook()): ProgressSnapshot {
  return {
    checkpointId: 'dark', elapsed: 34.5, deaths: 8, intervalDeaths: { start: 2, dark: 6 },
    assistIds: ['dark'], bar: bar.snapshot(), book: book.snapshot(),
  }
}

describe('saved progress', () => {
  it('keeps released pickups available after a reload, including under a stashed blue word', () => {
    const store = new SaveStore(course, memory())
    const original = new SpellBar()
    original.collect('l:0', 'L')
    original.collect('i:0', 'I')
    original.deleteLetter(0)
    original.loadWord('palm', 'PALM')
    store.save(progress(original))
    const resumed = new SpellBar()
    resumed.restore(store.load()!.bar)
    expect(resumed.deleteLetter()).toBe(false)
    expect(resumed.collected('l:0')).toBe(false)
    expect(resumed.collected('i:0')).toBe(true)
    resumed.releaseWord()
    expect(resumed.word).toBe('I')
    expect(resumed.collect('l:0', 'L')).toBe(true)
    expect(resumed.word).toBe('IL')
  })
  it('restores the current blue arrangement and the separate collected stash by identity', () => {
    const store = new SaveStore(course, memory())
    const original = new SpellBar()
    original.collect('l:0', 'L')
    original.collect('i:0', 'I')
    original.swap(0, 1)
    original.loadWord('palm', 'PALM')
    original.insert(0, 3)
    original.swap(0, 1)
    original.collect('s:0', 'S')
    expect(store.save(progress(original))).toBe(true)
    const saved = store.load()!
    const bar = new SpellBar()
    bar.restore(saved.bar)
    expect(bar.word).toBe('LAMP')
    expect(bar.loadWord('palm', 'PALM')).toBe(false)
    expect(bar.letters.map(tile => tile.id)).toEqual(['palm:2', 'palm:1', 'palm:3', 'palm:0'])
    const book = new SpellBook()
    book.restore(saved.book)
    expect(book.submit(bar, { inDarkZone: true }).kind).toBe('spell')
    expect(bar.word).toBe('ILS')
    expect(bar.collect('i:0', 'I')).toBe(false)
    expect(bar.canUndo).toBe(false)
    store.save(progress(bar, book))
    expect(store.load()!.bar.spentWords).toEqual(['palm'])
    expect(store.load()!.bar.loaded).toBeNull()
  })

  it('preserves spells, eggs, checkpoint, help, elapsed time and completed statistics', () => {
    const store = new SaveStore(course, memory())
    const bar = new SpellBar()
    const book = new SpellBook()
    bar.loadWord('palm', 'PALM')
    book.submit(bar, { inDarkZone: true })
    bar.insert(0, 3)
    bar.swap(0, 1)
    book.submit(bar, { inDarkZone: true })
    for (const char of 'LISTEN') bar.collect(char.toLowerCase() + ':0', char)
    book.submit(bar, { inDarkZone: false })
    for (let i = 0; i < 'SILENT'.length; i++) bar.insert(bar.word.indexOf('SILENT'[i]), i)
    book.submit(bar, { inDarkZone: false })
    const complete = { ...progress(bar, book), completed: true }
    store.save(complete)
    expect(store.load()).toEqual(complete)
    const resumed = new SpellBook()
    resumed.restore(store.load()!.book)
    expect(resumed.lamp && resumed.listen).toBe(true)
    expect(resumed.silentRemaining).toBe(0)
    expect(resumed.cooldownRemaining).toBe(0)
    expect(resumed.foundEggs.has('PALM')).toBe(true)
    expect(resumed.foundSpells.size).toBe(3)
  })

  it('recovers supported fields from unversioned saves, even without modern counters', () => {
    const storage = memory()
    storage.setItem(SAVE_KEY, JSON.stringify({
      checkpoint: 1, collectedLetters: ['I', 'l:0', 'I', 'unknown'],
      foundSpells: ['LISTEN', 'LAMP', 'invalid'], foundEggs: ['NET', 'NET'],
    }))
    const saved = new SaveStore(course, storage).load()!
    expect(saved.checkpointId).toBe('listen-cp')
    expect(saved.bar.collection).toEqual([{ id: 'i:0', char: 'I' }, { id: 'l:0', char: 'L' }])
    expect(saved.bar.spentWords).toEqual(['palm'])
    expect(saved.book.eggs).toEqual(['NET'])
    expect([saved.elapsed, saved.deaths]).toEqual([0, 0])
    expect(saved.assistIds).toEqual([])
  })

  it('drops stale map IDs and repairs malformed letter order and missing lamp acquisition', () => {
    const storage = memory()
    const store = new SaveStore(course, storage)
    const corrupted = {
      version: 1, checkpointId: 'removed', elapsed: -1, deaths: 'lots',
      intervalDeaths: { start: 2, removed: 10, dark: -3 }, assistIds: ['bad', 'start', 'start'],
      bar: { collection: [{ id: 'i:0', char: 'X' }, { id: 'removed', char: 'Z' }, null],
        loaded: { id: 'palm', original: 'WRONG', order: [1, 1, 2, 3] }, spentWords: ['missing'] },
      book: { spells: [null, 'UNKNOWN'], eggs: ['BAD', 'TEN'] }, completed: 'true',
    }
    storage.setItem(SAVE_KEY, JSON.stringify(corrupted))
    const saved = store.load()!
    expect(saved.bar.collection).toEqual([{ id: 'i:0', char: 'I' }])
    expect(saved.bar.loaded).toEqual({ id: 'palm', original: 'PALM', order: [0, 1, 2, 3] })
    expect(saved.checkpointId).toBeNull()
    expect(saved.completed).toBeUndefined()
    expect(saved.deaths).toBe(2)
    expect(saved.elapsed).toBe(0)
    expect(saved.intervalDeaths).toEqual({ start: 2 })
    expect(saved.assistIds).toEqual(['start'])
    corrupted.bar.spentWords = ['palm']
    storage.setItem(SAVE_KEY, JSON.stringify(corrupted))
    expect(store.load()!.bar.loaded).toBeNull()
    expect(store.load()!.book.spells).toEqual(['LAMP'])
  })

  it('does not overwrite a later format from a cached game client', () => {
    const storage = memory()
    const store = new SaveStore(course, storage)
    const future = JSON.stringify({ version: 2, chapter: { later: true } })
    storage.setItem(SAVE_KEY, future)
    expect(store.load()).toBeNull()
    expect(store.save(progress())).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(future)
  })

  it('prevents a background tab from replacing newer progress on pagehide', () => {
    const disk = memory()
    const first = new SaveStore(course, disk)
    const second = new SaveStore(course, disk)
    expect(first.load()).toBeNull()
    const before = progress()
    first.save(before)
    expect(second.load()).toEqual(before)
    const latest = { ...before, elapsed: 90, checkpointId: 'listen-cp' }
    expect(second.save(latest)).toBe(true)
    expect(first.save({ ...before, elapsed: 50 })).toBe(false)
    expect(first.save(before)).toBe(false)
    expect(second.load()).toEqual(latest)
    // Only an explicit replay can replace the other tab's run.
    expect(first.clear()).toBe(true)
    expect(first.save({ ...before, elapsed: 0 })).toBe(true)
    expect(second.save(latest)).toBe(false)
    expect(first.load()!.elapsed).toBe(0)
  })

  it('can replace corrupt JSON and clears only game progress on a fresh start', () => {
    const storage = memory()
    const store = new SaveStore(course, storage)
    storage.setItem('unrelated', 'retain')
    for (const invalid of ['{', '[]', 'null', '{}', '{"unexpected":1}']) {
      storage.setItem(SAVE_KEY, invalid)
      expect(store.load()).toBeNull()
    }
    expect(store.save(progress())).toBe(true)
    expect(store.clear()).toBe(true)
    expect(store.load()).toBeNull()
    expect(storage.getItem('unrelated')).toBe('retain')
  })

  it('safely falls back when storage is disabled or quota is exhausted', () => {
    const denied = () => { throw new Error('storage blocked') }
    for (const storage of [null, { getItem: denied, setItem: denied, removeItem: denied }]) {
      const store = new SaveStore(course, storage)
      expect(store.load()).toBeNull()
      expect(store.save(progress())).toBe(false)
      expect(store.clear()).toBe(false)
    }
    const disk = memory()
    const store = new SaveStore(course, disk)
    expect(store.save(progress())).toBe(true)
    const full = new SaveStore(course, { ...disk, setItem: denied })
    expect(full.save({ ...progress(), elapsed: 90 })).toBe(false)
    expect(full.load()!.elapsed).toBe(34.5)
  })
})
