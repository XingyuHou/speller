import type Phaser from 'phaser'
import { BEHAVIOR_CONFIG as rules, CONFIG } from '../../config'
import type { GlyphShape, Point } from '../../font/handwriting'
import { boiledStroke } from '../../font/inkBoil'
import type { BehaviorGlyph, BehaviorTerrain } from './BehaviorTerrain'

type Graphics = Phaser.GameObjects.Graphics

function paint(graphics: Graphics, strokes: Point[][], anchor: Point, width: number, color: number): Graphics {
  graphics.clear().lineStyle(width, color).fillStyle(color)
  for (const stroke of strokes) {
    if (!stroke.length) continue
    graphics.beginPath().moveTo(stroke[0].x - anchor.x, stroke[0].y - anchor.y)
    for (const point of stroke.slice(1)) graphics.lineTo(point.x - anchor.x, point.y - anchor.y)
    graphics.strokePath()
    for (const point of stroke) graphics.fillCircle(point.x - anchor.x, point.y - anchor.y, width / 2)
  }
  return graphics.setPosition(anchor.x, anchor.y)
}

function pen(scene: Phaser.Scene, strokes: Point[][], anchor: Point, width: number): Graphics {
  return paint(scene.add.graphics(), strokes, anchor, width, CONFIG.colors.terrain)
}

interface Fragment {
  graphics: Graphics
  pivot: Point
  spread: number
}

function splinters(scene: Phaser.Scene, glyph: GlyphShape, width: number): Fragment[] {
  const { minX, minY, maxX, maxY } = glyph.bounds
  const across = (maxX - minX) / rules.debrisPieces
  const fragments: Fragment[] = []
  if (across === 0) return fragments
  // Cut the original pen paths at vertical slice boundaries. At t=0 the
  // fragments reassemble the exact glyph that just lost its collision.
  for (let i = 0; i < rules.debrisPieces; i++) {
    const left = minX + i * across
    const right = i === rules.debrisPieces - 1 ? maxX : left + across
    const paths: Point[][] = []
    for (const stroke of glyph.strokes) {
      for (let j = 1; j < stroke.length; j++) {
        const a = stroke[j - 1]
        const b = stroke[j]
        const dx = b.x - a.x
        if (dx === 0) {
          if (a.x >= left && (a.x < right || i === rules.debrisPieces - 1)) paths.push([a, b])
          continue
        }
        const tLeft = (left - a.x) / dx
        const tRight = (right - a.x) / dx
        const start = Math.max(0, Math.min(tLeft, tRight))
        const end = Math.min(1, Math.max(tLeft, tRight))
        if (end <= start) continue
        paths.push([start, end].map(t => ({ x: a.x + t * dx, y: a.y + t * (b.y - a.y) })))
      }
    }
    if (!paths.length) continue
    const pivot = { x: (left + right) / 2, y: (minY + maxY) / 2 }
    const spread = 2 * (i + 0.5) / rules.debrisPieces - 1
    fragments.push({ graphics: pen(scene, paths, pivot, width).setVisible(false), pivot, spread })
  }
  return fragments
}

export class BehaviorView {
  private readonly letters: { body: BehaviorGlyph; graphics: Graphics; fragments: Fragment[]; color: number; width: number; frame: number; seed: number }[] = []
  private readonly debug: Graphics

  constructor(scene: Phaser.Scene, terrain: BehaviorTerrain) {
    for (const word of terrain.words) {
      const width = CONFIG.ink[word.definition.size]
      const begin = this.letters.length
      for (const body of word.bodies) {
        const graphics = pen(scene, body.glyph.strokes, { x: body.anchorX, y: body.anchorY }, width)
        const fragments = body.kind === 'crumbly' ? splinters(scene, body.glyph, width) : []
        this.letters.push({ body, graphics, fragments, color: CONFIG.colors.terrain, width, frame: 0, seed: word.definition.seed })
      }
      const group = this.letters.slice(begin)
      word.boil = frame => {
        for (const entry of group) {
          if (entry.frame === frame || !entry.graphics.visible) continue
          entry.frame = frame
          const { body } = entry
          const strokes = body.glyph.strokes.map(s => boiledStroke(s, entry.seed, frame))
          const x = entry.graphics.x
          const y = entry.graphics.y
          paint(entry.graphics, strokes, { x: body.anchorX, y: body.anchorY }, width, entry.color).setPosition(x, y)
        }
      }
    }
    this.debug = scene.add.graphics().setDepth(rules.debugDepth)
  }

  render(showDebug: boolean): void {
    this.debug.clear().setVisible(showDebug)
    if (showDebug) this.debug.fillStyle(CONFIG.colors.debugSolid, CONFIG.debug.solidAlpha)
    for (const letter of this.letters) {
      const { body, graphics, fragments } = letter
      const color = body.inkColor()
      if (letter.color !== color) {
        const strokes = body.glyph.strokes.map(s => boiledStroke(s, letter.seed, letter.frame))
        paint(graphics, strokes, { x: body.anchorX, y: body.anchorY }, letter.width, color)
        letter.color = color
      }
      const t = body.fallAge
      graphics.setVisible(t === null && body.motion.alpha > 0)
      if (t === null) {
        graphics.setPosition(body.anchorX + body.motion.x, body.anchorY + body.motion.y)
          .setScale(body.scaleX, body.scaleY).setAlpha(body.alpha * body.motion.alpha)
        if (showDebug && body.motion.available) {
          const box = body.box
          this.debug.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY)
        }
      }
      for (const fragment of fragments) {
        const visible = t !== null && t < rules.debrisVisibleSeconds
        fragment.graphics.setVisible(visible)
        if (!visible || t === null) continue
        const { spread, pivot } = fragment
        fragment.graphics
          .setPosition(pivot.x + spread * rules.debrisSpeedX * t,
            pivot.y + CONFIG.physics.gravity * t * t / 2 - (1 - Math.abs(spread)) * rules.debrisSpeedY * t)
          .setRotation(spread * rules.debrisSpin * t)
          .setAlpha(1 - t / rules.debrisVisibleSeconds)
      }
    }
  }

  destroy(): void {
    this.debug.destroy()
    for (const { graphics, fragments } of this.letters) {
      graphics.destroy()
      for (const fragment of fragments) fragment.graphics.destroy()
    }
  }
}
