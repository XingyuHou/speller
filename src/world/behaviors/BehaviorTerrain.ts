import { BEHAVIOR_CONFIG as rules, CONFIG } from '../../config'
import type { Bounds, GlyphShape } from '../../font/handwriting'
import { layoutCourseText, type CourseText } from '../../level/course'
import { glyphColor, type TextAppearance, type WorldText } from '../TextObject'

export type BehaviorName = NonNullable<CourseText['behavior']>

interface WordMotion {
  x: number
  y: number
  available: boolean
  alpha: number
}

export interface BehaviorWord extends WorldText {
  bodies: BehaviorGlyph[]
  getTransform(): WordMotion
  setMotion(x: number, y: number, available: boolean, alpha: number): void
}

const grid = (value: number) => Math.round(value / CONFIG.collision.cellSize) * CONFIG.collision.cellSize

/** The cap of each real glyph is a separate dynamic body. Its snapped edges use
 * the same pixel grid as ordinary terrain, without occupying the static mask. */
export class BehaviorGlyph {
  readonly anchorX: number
  readonly anchorY: number
  private elapsed: number | null = null
  private regrowing = 0
  readonly box: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  constructor(readonly glyph: GlyphShape, readonly kind: BehaviorName, private readonly penWidth: number,
    readonly motion: WordMotion, readonly inkColor: () => number) {
    this.anchorX = (glyph.bounds.minX + glyph.bounds.maxX) / 2
    this.anchorY = glyph.bounds.maxY
    this.alignBox()
  }

  get cracking(): boolean {
    return this.kind === 'crumbly' && this.elapsed !== null && this.elapsed < rules.crumbleDelay
  }

  get fallAge(): number | null {
    if (this.kind !== 'crumbly' || this.elapsed === null || this.elapsed < rules.crumbleDelay) return null
    return this.elapsed - rules.crumbleDelay
  }

  get scaleX(): number {
    return 1 - (1 - rules.regrowInitialWidth) * this.regrowing / rules.regrowSeconds
  }

  get scaleY(): number {
    if (this.kind !== 'bouncy' || this.elapsed === null) return 1
    const recovery = 1 - this.elapsed / rules.squashSeconds
    return 1 - rules.squashFraction * recovery * recovery
  }

  get alpha(): number {
    if (!this.cracking || this.elapsed === null) return 1
    return 1 - rules.crackFlashDepth * Math.sin(this.elapsed * rules.crackFlashHz * Math.PI) ** 2
  }

  land(): void {
    if (this.kind !== 'bouncy' && this.kind !== 'crumbly') return
    if (this.elapsed !== null && this.kind === 'crumbly') return
    this.elapsed = 0
    this.alignBox()
  }

  tick(dt: number): void {
    if (this.elapsed === null && this.regrowing === 0) return
    this.regrowing = Math.max(0, this.regrowing - dt)
    if (this.elapsed !== null) {
      this.elapsed += dt
      if (this.kind === 'bouncy') {
        if (this.elapsed >= rules.squashSeconds) this.elapsed = null
      } else if (this.elapsed >= rules.crumbleDelay + rules.crumbleRespawn) {
        const overtime = this.elapsed - rules.crumbleDelay - rules.crumbleRespawn
        this.regrowing = Math.max(0, rules.regrowSeconds - overtime)
        this.elapsed = null
      }
    }
    this.alignBox()
  }

  reset(): void {
    this.elapsed = null
    this.regrowing = 0
    this.alignBox()
  }

  alignBox(): void {
    const original = this.glyph.bounds
    const halfInk = this.penWidth / 2
    const top = this.anchorY + (original.minY - halfInk - this.anchorY) * this.scaleY
    const depth = Math.max(CONFIG.collision.cellSize, (this.anchorY - top) * rules.bodyDepthFraction)
    this.box.minX = grid(this.motion.x + this.anchorX + (original.minX - halfInk - this.anchorX) * this.scaleX)
    this.box.maxX = Math.max(this.box.minX + CONFIG.collision.cellSize, grid(this.motion.x + this.anchorX + (original.maxX + halfInk - this.anchorX) * this.scaleX))
    this.box.minY = grid(top + this.motion.y)
    this.box.maxY = Math.max(this.box.minY + CONFIG.collision.cellSize, grid(top + depth + this.motion.y))
  }
}

export class BehaviorTerrain {
  readonly words: BehaviorWord[] = []
  private readonly bodies: BehaviorGlyph[] = []

  add(definition: CourseText): BehaviorWord {
    const kind = definition.behavior
    if (!kind) throw new Error('A behavior terrain word needs a behavior')
    const ink = layoutCourseText(definition)
    const motion = { x: 0, y: 0, available: true, alpha: 1 }
    let appearance: TextAppearance = {}
    const bodies = ink.glyphs.filter(glyph => glyph.strokes.length > 0)
      .map(glyph => new BehaviorGlyph(glyph, kind, CONFIG.ink[definition.size], motion,
        () => glyphColor(definition, glyph.index, appearance)))
    const word: BehaviorWord = { ...ink, definition, bodies,
      getTransform: () => motion,
      setAppearance(next) { appearance = next },
      setMotion(x, y, available, alpha) {
        if (motion.x === x && motion.y === y && motion.available === available && motion.alpha === alpha) return
        Object.assign(motion, {x, y, available, alpha})
        for (const body of bodies) body.alignBox()
      },
    }
    this.words.push(word)
    this.bodies.push(...bodies)
    return word
  }

  tick(worldSeconds: number): void {
    if (!Number.isFinite(worldSeconds) || worldSeconds <= 0) return
    for (const body of this.bodies) body.tick(worldSeconds)
  }

  reset(): void {
    for (const body of this.bodies) body.reset()
  }

  overlapsSolid(left: number, top: number, right: number, bottom: number): boolean {
    return this.bodies.some(body => {
      const box = body.box
      return body.motion.available && body.fallAge === null && left < box.maxX && right > box.minX && top < box.maxY && bottom > box.minY
    })
  }

  landingTop(left: number, right: number, fromFeet: number, toFeet: number): number | null {
    let highest: number | null = null
    for (const body of this.bodies) {
      const box = body.box
      if (!body.motion.available || body.fallAge !== null || left >= box.maxX || right <= box.minX || box.minY < fromFeet || box.minY > toFeet) continue
      if (highest === null || box.minY < highest) highest = box.minY
    }
    return highest
  }

  /** Start effects only for glyphs actually supporting the player's feet. */
  onLanding(left: number, right: number, feet: number): number | null {
    let impulse: number | null = null
    for (const body of this.bodies) {
      const box = body.box
      if (!body.motion.available || body.fallAge !== null || left >= box.maxX || right <= box.minX || feet !== box.minY) continue
      body.land()
      if (body.kind === 'bouncy') impulse = rules.bounceSpeed
    }
    return impulse
  }
}
