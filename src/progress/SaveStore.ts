import { SPELL_CONFIG } from '../config'
import { SPELL_WORDS, SWORD_WORDS } from '../content/lines'
import type { CourseData } from '../level/course'
import type { BarSnapshot } from '../spell/SpellBar'
import { isEgg, isSpell, type BookSnapshot } from '../spell/spells'

export const SAVE_KEY = 'speller.progress'
const VERSION = 1
// Index-based saves used this order before the rope bridge checkpoint existed.
const originalChapterCheckpoints = [
  'save-dark', 'save-palm', 'save-pillars', 'save-exit', 'save-quiet', 'save-listen', 'save-corridor-exit', 'save-sprint',
]

export interface ProgressSnapshot {
  checkpointId: string | null
  bridgeReturnCheckpointId?: string
  elapsed: number
  deaths: number
  intervalDeaths: Record<string, number>
  assistIds: string[]
  bar: BarSnapshot
  book: BookSnapshot
  completed?: boolean
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type RecordValue = Record<string, unknown>

function record(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function futureVersion(value: unknown): boolean {
  const version = record(value).version
  return typeof version === 'number' && version > VERSION
}

export class SaveStore {
  private readonly checkpoints: string[]
  private readonly letters = new Map<string, string>()
  private readonly blue = new Map<string, string>()
  private observed: string | null | undefined

  constructor(course: CourseData, private readonly storage?: StorageLike | null) {
    this.checkpoints = (course.checkpoints ?? []).map(checkpoint => checkpoint.id)
    for (const object of course.texts) {
      if (object.role !== 'terrain') continue
      if (object.rearrange) this.blue.set(object.id, object.text)
      for (const index of object.collectible ?? []) {
        const char = object.text[index]
        if (char && /^[A-Z]$/.test(char)) this.letters.set(object.id + ':' + index, char)
      }
    }
  }

  private get backend(): StorageLike | null | undefined {
    // In some privacy modes merely accessing window.localStorage throws.
    return this.storage === undefined ? globalThis.localStorage : this.storage
  }

  load(): ProgressSnapshot | null {
    try {
      const text = this.backend?.getItem(SAVE_KEY) ?? null
      this.observed = text
      return text ? this.decode(JSON.parse(text)) : null
    } catch {
      return null
    }
  }

  save(progress: ProgressSnapshot): boolean {
    try {
      const storage = this.backend
      if (!storage) return false
      // Leave newer saves intact when an older cached tab is still running.
      const previous = storage.getItem(SAVE_KEY)
      if (this.observed !== undefined && this.observed !== previous) return false
      if (previous) {
        try {
          if (futureVersion(JSON.parse(previous))) return false
        } catch {
          // An unreadable previous value can be replaced by this valid run.
        }
      }
      const normalized = this.decode({ ...progress, version: VERSION })
      if (!normalized) return false
      const text = JSON.stringify({ version: VERSION, ...normalized })
      storage.setItem(SAVE_KEY, text)
      this.observed = text
      return true
    } catch {
      return false
    }
  }

  clear(): boolean {
    try {
      const storage = this.backend
      if (!storage) return false
      storage.removeItem(SAVE_KEY)
      this.observed = null
      return true
    } catch {
      return false
    }
  }

  private decode(value: unknown): ProgressSnapshot | null {
    const saved = record(value)
    const legacy = saved.version === undefined || saved.version === 0
    if (!legacy && saved.version !== VERSION) return null
    if (!['checkpointId', 'checkpoint', 'bar', 'book', 'collectedIds', 'collectedLetters', 'foundSpells', 'foundEggs']
      .some(key => Object.hasOwn(saved, key))) return null

    const checkpoint = saved.checkpointId ?? (legacy ? saved.checkpoint : null)
    let checkpointId: string | null = null
    if (typeof checkpoint === 'string' && this.checkpoints.includes(checkpoint)) checkpointId = checkpoint
    if (legacy && typeof checkpoint === 'number' && Number.isInteger(checkpoint)) {
      const order = this.checkpoints.includes('save-dark') && this.checkpoints.includes('save-sprint')
        ? originalChapterCheckpoints : this.checkpoints
      const id = order[checkpoint]
      if (this.checkpoints.includes(id)) checkpointId = id
    }

    const bar = this.readBar(saved, legacy)
    const book = this.readBook(saved, legacy)
    for (const [source, spell] of [[SPELL_WORDS.palm, 'LAMP'], [SWORD_WORDS.words, SWORD_WORDS.sword]] as const) {
      const ids = [...this.blue].filter(([, word]) => word === source).map(([id]) => id)
      if (bar.spentWords.some(id => ids.includes(id)) && !book.spells.includes(spell)) book.spells.push(spell)
      if (book.spells.includes(spell) && ids.length === 1 && !bar.spentWords.includes(ids[0])) bar.spentWords.push(ids[0])
    }
    if (bar.loaded && bar.spentWords.includes(bar.loaded.id)) bar.loaded = null

    const isInterval = (id: unknown): id is string => id === 'start' || (typeof id === 'string' && this.checkpoints.includes(id))
    const counts = Object.entries(record(saved.intervalDeaths ?? (legacy ? saved.deathCounts : null)))
      .filter(([id]) => isInterval(id))
      .map(([id, deaths]) => [id, count(deaths)] as const)
      .filter(([, deaths]) => deaths > 0)
    const elapsed = saved.elapsed
    const summedDeaths = Math.min(Number.MAX_SAFE_INTEGER, counts.reduce((sum, [, deaths]) => sum + deaths, 0))
    const returnId = saved.bridgeReturnCheckpointId
    const exit = this.checkpoints.indexOf('save-exit')
    const visitingBridge = saved.completed !== true && checkpointId === 'save-sword' && exit >= 0
      && typeof returnId === 'string' && this.checkpoints.indexOf(returnId) >= exit

    return {
      checkpointId, elapsed: typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0,
      deaths: Math.max(count(saved.deaths), summedDeaths), intervalDeaths: Object.fromEntries(counts),
      assistIds: [...new Set(list(saved.assistIds).filter(isInterval))], bar, book,
      ...(visitingBridge ? {bridgeReturnCheckpointId: returnId} : {}),
      ...(saved.completed === true ? {completed: true} : {}),
    }
  }

  private readBar(saved: RecordValue, legacy: boolean): BarSnapshot {
    const source = record(saved.bar)
    const rawLetters = source.collection ?? (legacy ? saved.collectedIds ?? saved.collectedLetters : undefined)
    const collection = new Map<string, string>()
    for (const candidate of list(rawLetters)) {
      if (collection.size === SPELL_CONFIG.capacity) break
      let id = typeof candidate === 'string' ? candidate : record(candidate).id
      if (legacy && typeof id === 'string' && !this.letters.has(id)) {
        // A bare letter in an unversioned save must identify one unique pickup.
        const matches = [...this.letters].filter(([, char]) => char === id)
        if (matches.length === 1) id = matches[0][0]
      }
      if (typeof id !== 'string') continue
      const char = this.letters.get(id)
      if (char) collection.set(id, char)
    }

    const spentWords = [...new Set(list(source.spentWords)
      .filter((id): id is string => typeof id === 'string' && this.blue.has(id)))]
    const loaded = record(source.loaded)
    let active: BarSnapshot['loaded'] = null
    if (typeof loaded.id === 'string' && !spentWords.includes(loaded.id)) {
      const original = this.blue.get(loaded.id)
      if (original && original.length <= SPELL_CONFIG.capacity) {
        const order = list(loaded.order)
        const valid = order.length === original.length && new Set(order).size === original.length &&
          order.every((index): index is number => typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < original.length)
        active = { id: loaded.id, original, order: valid ? [...order] : Array.from(original, (_, i) => i) }
      }
    }
    return { collection: [...collection].map(([id, char]) => ({id, char})), spentWords, loaded: active }
  }

  private readBook(saved: RecordValue, legacy: boolean): BookSnapshot {
    const raw = record(saved.book)
    const spells = new Set(list(raw.spells ?? (legacy ? saved.foundSpells : undefined)).filter(isSpell))
    const eggs = new Set(list(raw.eggs ?? (legacy ? saved.foundEggs : undefined)).filter(isEgg))
    return { spells: [...spells], eggs: [...eggs] }
  }
}
