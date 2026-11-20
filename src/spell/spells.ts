import { SPELL_CONFIG } from '../config'
import { SWORD_WORDS, textForLine, type LineId } from '../content/lines'
import type { SpellBar } from './SpellBar'

const eggLines = {
  PALM: 'E01',
  TINSEL: 'E02',
  ENLIST: 'E03',
  INLETS: 'E04',
  LIST: 'E05',
  TEN: 'E06',
  NET: 'E07',
  [SWORD_WORDS.words]: 'E08',
} as const satisfies Record<string, LineId>

export type EggName = keyof typeof eggLines
export const EGG_CATALOG: readonly EggName[] = Object.keys(eggLines) as EggName[]
export const SPELL_CATALOG = ['LAMP', 'LISTEN', 'SILENT', SWORD_WORDS.sword] as const
export type SpellName = typeof SPELL_CATALOG[number]
export interface BookSnapshot { spells: SpellName[]; eggs: EggName[] }

export function isSpell(value: unknown): value is SpellName {
  return SPELL_CATALOG.some(spell => spell === value)
}

export function isEgg(value: unknown): value is EggName {
  return typeof value === 'string' && Object.hasOwn(eggLines, value)
}
const fallbackLines: readonly LineId[] = ['F01', 'F02', 'F03', 'F04', 'F05']

interface ResolvedSpell {
  kind: 'spell' | 'egg' | 'blocked' | 'fallback' | 'empty'
  word: string
  lineId?: LineId
  sourceId?: string
  reason?: 'area' | 'cooldown' | 'active'
}

export type SpellResult = ResolvedSpell | {
  kind: 'pending'
  word: typeof SWORD_WORDS.sword
  sourceId: string
  castId: number
  lineId?: never
  reason?: never
}

export class SpellBook {
  lamp = false
  listen = false
  silentRemaining = 0
  cooldownRemaining = 0
  readonly foundSpells = new Set<SpellName>()
  readonly foundEggs = new Set<EggName>()
  private lastFallback?: LineId
  private pendingSword: { sourceId: string; castId: number } | null = null
  private nextCastId = 0

  get pendingSwordSource(): string | null { return this.pendingSword?.sourceId ?? null }

  constructor(private readonly random: () => number = Math.random) {}

  submit(bar: SpellBar, context: { inDarkZone: boolean; inSwordZone?: boolean; swordSourceId?: string }): SpellResult {
    const word = bar.word
    if (this.pendingSword) return { kind: 'blocked', word, reason: 'active' }
    if (!word) return { kind: 'empty', word }

    if (word === SWORD_WORDS.sword && bar.sourceWord === SWORD_WORDS.words && bar.sourceId !== null) {
      if (!context.inSwordZone || context.swordSourceId !== bar.sourceId) {
        return { kind: 'blocked', word, reason: 'area', lineId: 'S01' }
      }
      this.pendingSword = { sourceId: bar.sourceId, castId: ++this.nextCastId }
      return { kind: 'pending', word, ...this.pendingSword }
    }
    if (word === 'LAMP' && bar.sourceWord === 'PALM' && bar.sourceId !== null) {
      if (!context.inDarkZone) return { kind: 'blocked', word, reason: 'area', lineId: 'S01' }
      const sourceId = bar.sourceId
      this.lamp = true
      this.foundSpells.add(word)
      bar.consumeWord()
      return { kind: 'spell', word, sourceId }
    }
    if (bar.sourceId === null && (word === 'LISTEN' || word === 'SILENT')) {
      if (word === 'LISTEN') {
        this.listen = true
      } else {
        if (this.silentRemaining > 0) return { kind: 'blocked', word, reason: 'active' }
        if (this.cooldownRemaining > 0) return { kind: 'blocked', word, reason: 'cooldown', lineId: 'S02' }
        this.silentRemaining = SPELL_CONFIG.silentSeconds
      }
      this.foundSpells.add(word)
      return { kind: 'spell', word }
    }
    if (Object.hasOwn(eggLines, word) && (word !== SWORD_WORDS.words || bar.sourceWord === SWORD_WORDS.words)) {
      const egg = word as EggName
      this.foundEggs.add(egg)
      return { kind: 'egg', word, lineId: eggLines[egg] }
    }

    const available = fallbackLines.filter(id => textForLine(id) && id !== this.lastFallback)
    const lineId = available[Math.floor(this.random() * available.length)]
    this.lastFallback = lineId
    return { kind: 'fallback', word, lineId }
  }

  commitSword(bar: SpellBar, sourceId: string, castId: number): boolean {
    if (this.pendingSword?.sourceId !== sourceId || this.pendingSword.castId !== castId) return false
    this.pendingSword = null
    if (bar.sourceId !== sourceId || bar.sourceWord !== SWORD_WORDS.words || bar.word !== SWORD_WORDS.sword) return false
    bar.consumeWord()
    this.foundSpells.add(SWORD_WORDS.sword)
    return true
  }

  cancelSword(): void { this.pendingSword = null }

  update(worldSeconds: number): void {
    if (!Number.isFinite(worldSeconds) || worldSeconds <= 0) return
    if (this.silentRemaining > worldSeconds) {
      this.silentRemaining -= worldSeconds
      return
    }
    if (this.silentRemaining > 0) {
      worldSeconds -= this.silentRemaining
      this.silentRemaining = 0
      this.cooldownRemaining = SPELL_CONFIG.cooldownSeconds
    }
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - worldSeconds)
  }

  onDeath(): void {
    this.cancelSword()
    this.silentRemaining = 0
    this.cooldownRemaining = 0
  }

  snapshot(): BookSnapshot {
    return { spells: [...this.foundSpells], eggs: [...this.foundEggs] }
  }

  restore(snapshot: BookSnapshot): void {
    this.reset()
    for (const spell of snapshot.spells) if (isSpell(spell)) this.foundSpells.add(spell)
    for (const egg of snapshot.eggs) if (isEgg(egg)) this.foundEggs.add(egg)
    this.lamp = this.foundSpells.has('LAMP')
    this.listen = this.foundSpells.has('LISTEN')
  }

  reset(): void {
    this.onDeath()
    this.lamp = false
    this.listen = false
    this.lastFallback = undefined
    this.foundSpells.clear()
    this.foundEggs.clear()
  }
}
