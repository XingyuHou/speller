import { CONFIG, SPELL_CONFIG } from '../config'
import type { Bounds, GlyphShape, Point } from '../font/handwriting'
import { CollisionMask } from './CollisionMask'
import type { WorldText } from './TextObject'

export interface BlueContact {
  id: string
  word: string
  point: Point
  points: Point[]
}

export interface LetterContact {
  id: string
  objectId: string
  index: number
  char: string
  point: Point
  distance: number
  top: number
}

function center(bounds: Bounds): Point {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
}

function distanceToStroke(x: number, y: number, glyph: GlyphShape) {
  let closestSquared = Infinity
  for (const stroke of glyph.strokes) {
    if (!stroke.length) continue
    for (let i = 0; i < Math.max(1, stroke.length - 1); i++) {
      const a = stroke[i]
      const b = stroke[i + 1] ?? a
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSquared = dx * dx + dy * dy
      const projection = lengthSquared === 0 ? 0 : ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared
      const t = Math.max(0, Math.min(1, projection))
      const rx = x - (a.x + dx * t)
      const ry = y - (a.y + dy * t)
      closestSquared = Math.min(closestSquared, rx * rx + ry * ry)
    }
  }
  return Math.sqrt(closestSquared)
}

// A local, grid-aligned copy distinguishes this word's collision cells from the
// surrounding terrain, including when a neighboring letter shares its bounds.
function blueFootprint(object: WorldText) {
  const { cellSize, minStrokeWidth, strokePadding } = CONFIG.collision
  const width = CONFIG.ink[object.definition.size]
  const padding = Math.max(minStrokeWidth, width + strokePadding) / 2
  const x = Math.floor((object.bounds.minX - padding) / cellSize) * cellSize
  const y = Math.floor((object.bounds.minY - padding) / cellSize) * cellSize
  const mask = new CollisionMask(object.bounds.maxX - x + padding, object.bounds.maxY - y + padding)
  for (const glyph of object.glyphs) {
    for (const stroke of glyph.strokes) mask.addStroke(stroke.map(p => ({ x: p.x - x, y: p.y - y })), width)
  }
  const points = object.glyphs.filter(glyph => glyph.strokes.length).map(glyph => center(glyph.bounds))
  return { x, y, mask, contact: { id: object.definition.id, word: object.definition.text, point: center(object.bounds), points } }
}

export class SpellTerrain {
  readonly collectedIds = new Set<string>()
  readonly consumedBlueIds = new Set<string>()
  private readonly blues: ReturnType<typeof blueFootprint>[] = []
  private readonly letters = new Map<string, { object: WorldText; glyph: GlyphShape }>()
  private readonly byId = new Map<string, WorldText>()
  private highlight = false

  constructor(private readonly objects: readonly WorldText[]) {
    for (const object of objects) {
      const { definition } = object
      this.byId.set(definition.id, object)
      if (definition.role !== 'terrain') continue
      if (definition.rearrange) this.blues.push(blueFootprint(object))
      for (const glyph of object.glyphs) {
        if (glyph.strokes.length && definition.collectible?.includes(glyph.index)) {
          this.letters.set(definition.id + ':' + glyph.index, { object, glyph })
        }
      }
    }
  }

  blueContact(x: number, y: number): BlueContact | undefined {
    const half = CONFIG.physics.playerSize / 2
    const cell = CONFIG.collision.cellSize
    for (const blue of this.blues) {
      if (this.consumedBlueIds.has(blue.contact.id)) continue
      // Include both cell boundaries: standing still puts the feet *on* the top edge.
      const left = Math.ceil((x - blue.x - half) / cell) - 1
      const right = Math.floor((x - blue.x + half) / cell)
      const top = Math.ceil((y - blue.y - half) / cell) - 1
      const bottom = Math.floor((y - blue.y + half) / cell)
      if (blue.mask.overlapsSolid(left * cell, top * cell, (right + 1) * cell, (bottom + 1) * cell)) return blue.contact
    }
  }

  nearestLetter(x: number, y: number): LetterContact | undefined {
    let nearest: LetterContact | undefined
    for (const [id, { object, glyph }] of this.letters) {
      if (this.collectedIds.has(id)) continue
      const radius = CONFIG.ink[object.definition.size] / 2
      const range = SPELL_CONFIG.collectionRadius + radius
      const transform = object.getTransform?.()
      if (transform && !transform.available) continue
      const dx = transform?.x ?? 0
      const dy = transform?.y ?? 0
      const localX = x - dx
      const localY = y - dy
      const bounds = glyph.bounds
      if (localX < bounds.minX - range || localX > bounds.maxX + range || localY < bounds.minY - range || localY > bounds.maxY + range) continue
      const distance = Math.max(0, distanceToStroke(localX, localY, glyph) - radius)
      if (distance <= SPELL_CONFIG.collectionRadius && (!nearest || distance < nearest.distance)) {
        const point = center(bounds)
        nearest = { id, objectId: object.definition.id, index: glyph.index, char: glyph.char, point: { x: point.x + dx, y: point.y + dy }, top: bounds.minY + dy, distance }
      }
    }
    return nearest
  }

  collect(id: string): boolean {
    const letter = this.letters.get(id)
    if (!letter || this.collectedIds.has(id)) return false
    this.collectedIds.add(id)
    this.repaint(letter.object)
    return true
  }

  returnLetter(id: string): boolean {
    const letter = this.letters.get(id)
    if (!letter || !this.collectedIds.delete(id)) return false
    this.repaint(letter.object)
    return true
  }

  consumeBlue(objectId: string): boolean {
    const object = this.byId.get(objectId)
    if (!object?.definition.rearrange || this.consumedBlueIds.has(objectId)) return false
    this.consumedBlueIds.add(objectId)
    this.repaint(object)
    return true
  }

  setHighlightUnapproved(enabled: boolean) {
    if (enabled === this.highlight) return
    this.highlight = enabled
    for (const object of this.objects) {
      if (object.definition.lineId) this.repaint(object)
    }
  }

  reset() {
    this.collectedIds.clear()
    this.consumedBlueIds.clear()
    for (const object of this.objects) {
      if (object.definition.collectible || object.definition.rearrange) this.repaint(object)
    }
  }

  private repaint(object: WorldText) {
    const { id, collectible = [] } = object.definition
    const collected = new Set(collectible.filter(index => this.collectedIds.has(id + ':' + index)))
    object.setAppearance({ highlightUnapproved: this.highlight, consumedBlue: this.consumedBlueIds.has(id), collected })
  }
}
