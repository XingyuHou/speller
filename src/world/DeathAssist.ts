import type Phaser from 'phaser'
import { CHAPTER_FX, DEATH_ASSIST as rules } from '../config'
import { CHAPTER_WORDS, textForLine, type LineId } from '../content/lines'
import type { Point } from '../font/handwriting'
import type { CourseData, CourseText } from '../level/course'
import { CollisionMask } from './CollisionMask'
import { createTextObject, type WorldText } from './TextObject'

export class DeathAssist {
  readonly counts: Record<string, number> = {}
  private readonly commas = new Set<string>()
  private readonly items: ReturnType<typeof createTextObject>[] = []
  private readonly words: Map<string, WorldText>
  private overlay?: CollisionMask
  private highlight = false

  constructor(private readonly scene: Phaser.Scene, private readonly course: CourseData,
    objects: readonly WorldText[], private readonly mask: CollisionMask) {
    this.words = new Map(objects.map(object => [object.definition.id, object]))
  }

  get assistIds(): string[] { return [...this.commas] }

  record(interval: string, death: Point) {
    const count = (this.counts[interval] ?? 0) + 1
    this.counts[interval] = count
    const entry = this.course.assists?.[interval]
    if (!entry) return
    if (count === rules.firstNoteAt) {
      const available = entry.lines.filter(id => textForLine(id))
      if (available.length) this.note(available[Math.floor(Math.random() * available.length)], death, interval)
    }
    if (count === rules.commaAt) this.addComma(interval)
  }

  restore(counts: Record<string, number>, assistIds: readonly string[] = []) {
    this.clear()
    const enabled = new Set(assistIds)
    for (const id of Object.keys(this.course.assists ?? {})) {
      const count = counts[id]
      if (Number.isSafeInteger(count) && count > 0) this.counts[id] = count
      if (enabled.has(id) || count >= rules.commaAt) this.addComma(id)
    }
  }

  private addComma(interval: string) {
    if (this.commas.has(interval)) return
    const entry = this.course.assists?.[interval]
    const left = this.words.get(entry?.leftId ?? '')?.glyphs.filter(g => g.strokes.length).at(-1)
    const right = this.words.get(entry?.rightId ?? '')?.glyphs.find(g => g.strokes.length)
    if (!left || !right) return
    const x = (left.bounds.maxX + right.bounds.minX - rules.commaWidth) / 2
    const y = (left.bounds.minY + right.bounds.minY) / 2 + rules.commaDrop
    if (!this.overlay) {
      this.overlay = new CollisionMask(this.course.width, this.course.height)
      this.mask.setOverlay(this.overlay)
    }
    const definition: CourseText = {
      id: 'assist-' + interval, role: 'terrain', text: CHAPTER_WORDS.comma, size: 'M',
      x, y, inkWidth: rules.commaWidth, inkHeight: rules.commaDrop, seed: rules.seed, oneWay: true,
    }
    this.items.push(createTextObject(this.scene, definition, this.overlay))
    this.commas.add(interval)
    this.note('D09', {x, y}, interval)
    this.scene.events.emit('assist-change')
  }

  private note(id: LineId, point: Point, interval: string) {
    const text = textForLine(id)
    if (!text) return
    const object = createTextObject(this.scene, {
      id: id + '-' + interval, text, lineId: id, size: 'Note', role: 'note',
      x: point.x + rules.noteOffsetX, y: point.y - rules.noteLift, seed: rules.seed,
    }, this.mask)
    object.graphics.setDepth(CHAPTER_FX.depth.glow)
    object.setAppearance({highlightUnapproved: this.highlight})
    this.items.push(object)
  }

  setHighlight(enabled: boolean) {
    this.highlight = enabled
    for (const object of this.items) {
      if (object.definition.lineId) object.setAppearance({highlightUnapproved: enabled})
    }
  }

  clear() {
    for (const id of Object.keys(this.counts)) delete this.counts[id]
    for (const item of this.items) item.graphics.destroy()
    this.items.length = 0
    this.commas.clear()
    if (this.overlay) {
      this.mask.setOverlay()
      this.overlay = undefined
      this.scene.events.emit('assist-change')
    }
  }
}
