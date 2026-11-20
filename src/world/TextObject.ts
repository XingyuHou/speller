import type Phaser from 'phaser'
import { CONFIG, SPELL_VIEW_CONFIG } from '../config'
import { LINES } from '../content/lines'
import type { Handwriting } from '../font/handwriting'
import { boiledStroke } from '../font/inkBoil'
import { layoutCourseText, type CourseText } from '../level/course'
import type { CollisionMask } from './CollisionMask'

export interface TextAppearance {
  consumedBlue?: boolean
  collected?: ReadonlySet<number>
  highlightUnapproved?: boolean
}

export interface WorldText extends Handwriting {
  definition: CourseText
  getTransform?(): { x: number; y: number; available: boolean }
  setAppearance(appearance: TextAppearance): void
  boil?(frame: number): void
}

export function glyphColor(definition: CourseText, index: number, appearance: TextAppearance): number {
  if (appearance.highlightUnapproved && definition.lineId && LINES[definition.lineId].status !== '已批准') {
    return SPELL_VIEW_CONFIG.highlightColor
  }
  if (definition.role === 'note') return CONFIG.colors.note
  if (definition.rearrange && !appearance.consumedBlue) return CONFIG.colors.rearrange
  if (definition.collectible?.includes(index)) {
    return appearance.collected?.has(index) ? CONFIG.colors.collected : CONFIG.colors.collectible
  }
  return CONFIG.colors.terrain
}

export function createTextObject(scene: Phaser.Scene, definition: CourseText, mask: CollisionMask) {
  const ink = layoutCourseText(definition)
  const graphics = scene.add.graphics()
  const width = CONFIG.ink[definition.size]
  if (definition.role === 'terrain') {
    for (const { strokes } of ink.glyphs) {
      for (const stroke of strokes) mask.addStroke(stroke, width, definition.oneWay)
    }
  }

  let appearance: TextAppearance = {}
  let frame = 0
  let customInk: ((index: number, width: number) => { color: number; width: number }) | undefined
  function draw() {
    graphics.clear()
    for (const glyph of ink.glyphs) {
      const style = customInk?.(glyph.index, width)
      const color = style?.color ?? glyphColor(definition, glyph.index, appearance)
      const pen = style?.width ?? width
      graphics.lineStyle(pen, color).fillStyle(color)
      for (const original of glyph.strokes) {
        const stroke = boiledStroke(original, definition.seed, frame)
        if (!stroke.length) continue
        graphics.beginPath().moveTo(stroke[0].x, stroke[0].y)
        for (const point of stroke.slice(1)) graphics.lineTo(point.x, point.y)
        graphics.strokePath()
        for (const point of stroke) graphics.fillCircle(point.x, point.y, pen / 2)
      }
    }
    const tip = definition.pointer
    if (definition.role === 'note' && definition.text && tip) {
      for (const path of [CONFIG.notePointer.shaft, CONFIG.notePointer.head]) {
        const points = path.map(([x, y]) => ({ x: tip.x + x, y: tip.y + y }))
        graphics.strokePoints(points)
      }
    }
  }
  draw()
  return {
    ...ink, definition, graphics,
    setAppearance(next: TextAppearance) { appearance = next; draw() },
    setInkStyle(style?: typeof customInk) { customInk = style; draw() },
    boil(next: number) { if (next !== frame && graphics.visible) { frame = next; draw() } },
  }
}
