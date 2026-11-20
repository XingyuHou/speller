import type Phaser from 'phaser'
import { CONFIG, SWORD_BRIDGE as fx } from '../config'
import type { Point } from '../font/handwriting'
import { layoutCourseText, type SwordLayout } from '../level/course'
import { CollisionMask } from './CollisionMask'

type Graphics = Phaser.GameObjects.Graphics
type Phase = 'hanging' | 'striking' | 'falling' | 'down'

function rotate(point: Point, pivot: Point, angle: number): Point {
  const c = Math.cos(angle), s = Math.sin(angle)
  return { x: pivot.x + point.x * c - point.y * s, y: pivot.y + point.x * s + point.y * c }
}

function drawStroke(g: Graphics, points: Point[], pen: number) {
  if (!points.length) return
  g.strokePoints(points)
  for (const p of points) g.fillCircle(p.x, p.y, pen / 2)
}

// Each upright letter forms a link. The connecting strokes end on actual seed
// vertices, including the tie that holds the raised bridge. Sever the middle tie.
function hangingRope(layout: SwordLayout, deck: Point[][]) {
  const glyphs = layoutCourseText(layout.rope).glyphs
  const strokes: Point[][] = []
  const middle = Math.floor(glyphs.length / 2)
  const remnant: Point[][] = []
  let cutPoint = {x: layout.rope.x, y: layout.rope.y}
  let previousBottom: Point | undefined
  for (const [i, glyph] of glyphs.entries()) {
    const scale = fx.course.ropeGlyphHeight / (glyph.bounds.maxY - glyph.bounds.minY)
    const cx = (glyph.bounds.minX + glyph.bounds.maxX) / 2
    const y = layout.rope.y + i * (fx.course.ropeGlyphHeight + fx.course.ropeGap)
    const paths = glyph.strokes.map(path => path.map(p => ({
      x: layout.rope.x + (p.x - cx) * scale,
      y: y + (p.y - glyph.bounds.minY) * scale,
    })))
    const vertices = paths.flat()
    const top = vertices.reduce((a, b) => a.y < b.y ? a : b)
    if (previousBottom) {
      const link = [previousBottom, top]
      strokes.push(link)
      if (i < middle) remnant.push(link)
      if (i === middle) {
        cutPoint = { x: (previousBottom.x + top.x) / 2, y: (previousBottom.y + top.y) / 2 }
        remnant.push([previousBottom, cutPoint])
      }
    }
    strokes.push(...paths)
    if (i < middle) remnant.push(...paths)
    previousBottom = vertices.reduce((a, b) => a.y > b.y ? a : b)
  }
  if (previousBottom) {
    const bottom = previousBottom
    const raised = deck.flat().map(point => rotate(point, layout.pivot, fx.raisedAngle))
    const closest = raised.reduce((a, b) =>
      Math.hypot(a.x - bottom.x, a.y - bottom.y) < Math.hypot(b.x - bottom.x, b.y - bottom.y) ? a : b)
    strokes.push([bottom, closest])
  }
  return { strokes, remnant, cutPoint }
}

export class SwordBridge {
  private phase: Phase = 'hanging'
  private age = 0
  private onCut?: () => boolean
  private readonly terrain: Graphics
  private readonly sword: Graphics
  private readonly local: CollisionMask
  private readonly origin: Point
  private readonly deck: Point[][]
  private readonly rope: Point[][]
  private readonly remnant: Point[][]
  readonly cutPoint: Point
  private destroyed = false

  constructor(private readonly scene: Phaser.Scene, readonly layout: SwordLayout, private readonly world: CollisionMask) {
    const deck = layoutCourseText(layout.bridge)
    this.deck = deck.glyphs.flatMap(g => g.strokes)
    const rope = hangingRope(layout, this.deck)
    this.rope = rope.strokes
    this.cutPoint = rope.cutPoint
    this.remnant = rope.remnant
    const radius = Math.hypot(deck.bounds.maxX, deck.bounds.minY) + fx.localMargin
    const cell = CONFIG.collision.cellSize
    this.origin = {
      x: Math.floor((layout.pivot.x - radius) / cell) * cell,
      y: Math.floor((Math.min(layout.pivot.y - radius, layout.rope.y) - fx.localMargin) / cell) * cell,
    }
    this.local = new CollisionMask(layout.pivot.x + radius - this.origin.x, layout.pivot.y + radius - this.origin.y)
    this.terrain = scene.add.graphics()
    this.sword = scene.add.graphics()
    world.setMechanismLayer(this.local, this.origin.x, this.origin.y)
    this.restore(false)
  }

  get solved(): boolean { return this.phase === 'falling' || this.phase === 'down' }

  inRange(x: number, y: number): boolean {
    const zone = this.layout.zone
    return x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1
  }

  cast(onCut: () => boolean): boolean {
    if (this.destroyed || this.phase !== 'hanging') return false
    this.phase = 'striking'
    this.onCut = onCut
    this.age = 0
    this.blade(fx.arcStart, 1)
    return true
  }

  update(dt: number) {
    if (this.destroyed || dt <= 0 || (this.phase !== 'striking' && this.phase !== 'falling')) return
    this.age += dt
    if (this.phase === 'striking') {
      if (this.age < fx.cutSeconds) {
        this.blade(fx.arcStart * (1 - this.age / fx.cutSeconds), 1)
        return
      }
      const commit = this.onCut
      this.onCut = undefined
      if (!commit?.()) { this.restore(false); return }
      this.phase = 'falling'
      this.age -= fx.cutSeconds
    }
    const fall = Math.min(1, this.age / fx.fallSeconds)
    this.redraw(fx.raisedAngle * (1 - fall * fall), true)
    const afterCut = Math.min(1, this.age / (fx.flourishSeconds - fx.cutSeconds))
    if (afterCut === 1) this.sword.clear()
    else this.blade(afterCut * fx.arcEnd, 1 - afterCut)
    if (fall === 1) this.phase = 'down'
  }

  restore(solved: boolean) {
    if (this.destroyed) return
    this.onCut = undefined
    this.age = 0
    this.phase = solved ? 'down' : 'hanging'
    this.redraw(solved ? 0 : fx.raisedAngle, solved)
    this.sword.clear()
    if (!solved) this.blade(fx.arcStart, fx.hintAlpha, fx.hintSize)
  }

  private redraw(angle: number, cut: boolean) {
    const g = this.terrain.clear()
    this.local.clearStrokes()
    const add = (points: Point[], width: number) => {
      drawStroke(g, points, width)
      const local = points.map(p => ({ x: p.x - this.origin.x, y: p.y - this.origin.y }))
      this.local.addStroke(local, width, true)
    }
    const drawPaths = (paths: Point[][], width: number) => {
      g.lineStyle(width, CONFIG.colors.terrain).fillStyle(CONFIG.colors.terrain)
      for (const path of paths) add(path, width)
    }
    drawPaths(this.deck.map(stroke => stroke.map(p => rotate(p, this.layout.pivot, angle))), CONFIG.ink[this.layout.bridge.size])
    drawPaths(cut ? this.remnant : this.rope, CONFIG.ink[this.layout.rope.size])
    this.scene.events.emit('sword-geometry')
  }

  private blade(angle: number, opacity: number, size = 1) {
    const g = this.sword.clear()
    const hint = size < 1
    // At angle zero the blade runs directly through the authored rope vertex.
    const origin = { x: this.cutPoint.x - fx.bladeLength / 2, y: this.cutPoint.y - (hint ? fx.hintLift : 0) }
    g.lineStyle(fx.pen, hint ? CONFIG.colors.note : CONFIG.colors.rearrange, opacity)
    const pen = (points: number[][]) => g.strokePoints(points.map(([x, y]) => rotate({x: x * size, y: y * size}, origin, angle)))
    pen([[0, 0], [fx.bladeLength - fx.bladeWidth, -fx.bladeWidth], [fx.bladeLength, 0],
      [fx.bladeLength - fx.bladeWidth, fx.bladeWidth], [0, 0]])
    pen([[0, -fx.guardWidth], [0, fx.guardWidth]])
    pen([[0, 0], [-fx.gripLength, 0]])
  }

  destroy() {
    this.destroyed = true
    this.onCut = undefined
    this.world.setMechanismLayer()
    this.terrain.destroy()
    this.sword.destroy()
  }
}
