import { SPELL_CONFIG } from '../config'

export interface SpellLetter {
  readonly id: string
  readonly char: string
  readonly origin: 'word' | 'collected'
}

export interface BarSnapshot {
  collection: { id: string; char: string }[]
  spentWords: string[]
  loaded: { id: string; original: string; order: number[] } | null
}

interface Arrangement {
  letters: SpellLetter[]
  history: SpellLetter[][]
}

interface LoadedWord extends Arrangement {
  id: string
  original: string
}

export class SpellBar {
  private collection: Arrangement = { letters: [], history: [] }
  private loaded: LoadedWord | null = null
  private readonly spent = new Set<string>()

  private get visible(): Arrangement {
    return this.loaded ?? this.collection
  }

  get letters(): readonly SpellLetter[] {
    return this.visible.letters
  }

  get collectedLetters(): readonly SpellLetter[] {
    return this.collection.letters
  }

  get word(): string {
    return this.letters.map(letter => letter.char).join('')
  }

  get sourceId(): string | null {
    return this.loaded?.id ?? null
  }

  get sourceWord(): string | null {
    return this.loaded?.original ?? null
  }

  get canUndo(): boolean {
    return this.visible.history.length > 0
  }

  collected(id: string): boolean {
    return this.collectedLetters.some(letter => letter.id === id)
  }

  spentWord(id: string): boolean {
    return this.spent.has(id)
  }

  loadWord(id: string, word: string): boolean {
    const original = word.toUpperCase()
    if (this.spent.has(id) || this.loaded?.id === id || !/^[A-Z]+$/.test(original) || original.length > SPELL_CONFIG.capacity) return false
    this.loaded = {
      id,
      original,
      letters: Array.from(original, (char, index) => ({ id: id + ':' + index, char, origin: 'word' })),
      history: [],
    }
    return true
  }

  collect(id: string, char: string): boolean {
    const letter = char.toUpperCase()
    if (this.collected(id) || this.collection.letters.length >= SPELL_CONFIG.capacity || !/^[A-Z]$/.test(letter)) return false
    this.collection.letters = [...this.collection.letters, { id, char: letter, origin: 'collected' }]
    return true
  }

  deleteLetter(selected: number | null = null): boolean {
    if (this.loaded) return false
    const letters = this.collection.letters
    const index = selected ?? letters.length - 1
    if (!Number.isInteger(index) || !letters[index]) return false
    this.collection.history.push(letters)
    this.collection.letters = letters.filter((_, i) => i !== index)
    return true
  }

  private canReorder(from: number, to: number): boolean {
    const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < this.letters.length
    return from !== to && valid(from) && valid(to)
  }

  insert(from: number, to: number): boolean {
    if (!this.canReorder(from, to)) return false
    const arrangement = this.visible
    const letters = [...arrangement.letters]
    arrangement.history.push(arrangement.letters)
    const [letter] = letters.splice(from, 1)
    letters.splice(to, 0, letter)
    arrangement.letters = letters
    return true
  }

  swap(first: number, second: number): boolean {
    if (!this.canReorder(first, second)) return false
    const arrangement = this.visible
    const letters = [...arrangement.letters]
    arrangement.history.push(arrangement.letters)
    const original = letters[first]
    letters[first] = letters[second]
    letters[second] = original
    arrangement.letters = letters
    return true
  }

  undo(): boolean {
    const arrangement = this.visible
    const previous = arrangement.history.pop()
    if (!previous) return false
    // A re-collected glyph returns to its former slot by map ID. Keep newer
    // pickups at the end. Any overflow remains available at its source.
    const ids = new Set(previous.map(letter => letter.id))
    const later = arrangement.letters.filter(letter => !ids.has(letter.id))
    arrangement.letters = previous.concat(later).slice(0, SPELL_CONFIG.capacity)
    return true
  }

  releaseWord(): void {
    this.loaded = null
  }

  consumeWord(): void {
    if (!this.loaded) return
    this.spent.add(this.loaded.id)
    this.loaded = null
  }

  snapshot(): BarSnapshot {
    const source = this.loaded
    return {
      collection: this.collection.letters.map(({id, char}) => ({id, char})),
      spentWords: [...this.spent],
      loaded: source ? {
        id: source.id, original: source.original,
        order: source.letters.map(letter => Number(letter.id.slice(source.id.length + 1))),
      } : null,
    }
  }

  restore(snapshot: BarSnapshot): void {
    this.reset()
    for (const {id, char} of snapshot.collection) this.collect(id, char)
    for (const id of snapshot.spentWords) this.spent.add(id)
    const source = snapshot.loaded
    if (!source || !this.loadWord(source.id, source.original)) return
    const original = [...this.letters]
    if (source.order.length === original.length && new Set(source.order).size === original.length &&
        source.order.every(index => Number.isInteger(index) && index >= 0 && index < original.length)) {
      this.visible.letters = source.order.map(index => original[index])
    }
  }

  reset(): void {
    this.collection = { letters: [], history: [] }
    this.loaded = null
    this.spent.clear()
  }
}
