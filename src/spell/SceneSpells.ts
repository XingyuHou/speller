import Phaser from 'phaser'
import { BOIL, COLLECT_PROMPT, CONFIG, EGG_FX, SPELL_CONFIG, SPELL_GUIDE } from '../config'
import { UI } from '../content/lines'
import { layoutHandwriting, type Point } from '../font/handwriting'
import type { CourseData } from '../level/course'
import { SpellTerrain } from '../world/SpellTerrain'
import type { WorldText } from '../world/TextObject'
import { SpellBar, type SpellLetter } from './SpellBar'
import type { SwordBridge } from '../world/SwordBridge'
import { SPELL_CATALOG, SpellBook, type SpellResult, type EggName } from './spells'
import { EggEffects } from './effects/EggEffects'
import { SpellBarView } from './SpellBarView'
import { WorldClock } from './WorldClock'

export class SceneSpells {
  readonly bar = new SpellBar()
  readonly book = new SpellBook()
  readonly clock = new WorldClock()
  readonly terrain: SpellTerrain
  readonly view: SpellBarView
  private readonly eggs: EggEffects
  private readonly prompt: Phaser.GameObjects.Graphics
  private readonly guide: Phaser.GameObjects.Graphics
  private readonly guideNote?: WorldText
  private age = 0
  private boilFrame = -1
  private dragging = false
  private slowEnabled = true
  private paintedCollection?: readonly SpellLetter[]
  private showedCollectNote = false
  private playing = true

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly course: CourseData,
    stage: HTMLElement,
    private readonly objects: readonly WorldText[],
    private readonly position: () => Point,
    private readonly hooks?: { changed(): void; collect(): void; cast(result: SpellResult): void },
    private readonly sword?: SwordBridge,
  ) {
    this.terrain = new SpellTerrain(objects)
    this.eggs = new EggEffects(scene, stage, objects)
    this.guideNote = objects.find(object => object.definition.glow && object.definition.lineId === 'N07')
    this.guide = scene.add.graphics().setScrollFactor(0).setDepth(SPELL_GUIDE.depth)
    this.view = new SpellBarView(stage, {
      insert: (a, b) => { if (this.bar.insert(a, b)) this.sync() },
      swap: (a, b) => { if (this.bar.swap(a, b)) this.sync() },
      undo: () => this.undo(), deleteLetter: () => this.deleteLetter(), submit: () => this.cast(),
      drag: active => {
        this.dragging = active
        this.clock.setDragging(active)
        this.view.setVignette(active && this.slowEnabled)
      },
    })
    const cfg = COLLECT_PROMPT
    const letter = layoutHandwriting({ text: UI.sKey, size: cfg.size, seed: cfg.seed })
    this.prompt = scene.add.graphics().setDepth(cfg.depth).lineStyle(cfg.pen, CONFIG.colors.collectible)
    const { minX, minY, maxX, maxY } = letter.bounds
    for (const glyph of letter.glyphs) for (const stroke of glyph.strokes) {
      this.prompt.strokePoints(stroke.map(p => ({ x: p.x - (minX + maxX) / 2, y: p.y - (minY + maxY) / 2 })))
    }
    this.prompt.setVisible(false)
    this.sync()
  }

  private clientPoint(point: Point): Point {
    const rect = this.scene.game.canvas.getBoundingClientRect()
    const cam = this.scene.cameras.main
    return {
      x: rect.left + (point.x - cam.scrollX) * rect.width / cam.width,
      y: rect.top + (point.y - cam.scrollY) * rect.height / cam.height,
    }
  }

  private sync() {
    const collection = this.bar.collectedLetters
    if (collection !== this.paintedCollection) {
      for (const id of this.terrain.collectedIds) if (!this.bar.collected(id)) this.terrain.returnLetter(id)
      for (const letter of collection) this.terrain.collect(letter.id)
      this.eggs.setLetters(collection.map(letter => letter.char))
      this.paintedCollection = collection
    }
    this.view.sync(this.bar.letters, this.bar.canUndo)
    this.hooks?.changed()
  }

  restore(bar: ReturnType<SpellBar['snapshot']>, book: ReturnType<SpellBook['snapshot']>) {
    this.showedCollectNote = bar.collection.length > 0
    this.bar.restore(bar)
    this.book.restore(book)
    this.clearTransient()
    this.terrain.reset()
    for (const id of bar.spentWords) this.terrain.consumeBlue(id)
    this.sync()
  }

  grantLetters() {
    if (this.book.pendingSwordSource) this.clearTransient()
    this.bar.releaseWord()
    for (const text of this.course.texts) for (const index of text.collectible ?? []) {
      const id = text.id + ':' + index
      this.bar.collect(id, text.text[index])
    }
    this.sync()
  }

  grantSpells() {
    this.bar.releaseWord()
    for (const source of this.course.texts.filter(text => text.rearrange)) {
      if (this.bar.loadWord(source.id, source.text)) this.bar.consumeWord()
      this.terrain.consumeBlue(source.id)
    }
    this.book.restore({ spells: [...SPELL_CATALOG], eggs: [...this.book.foundEggs] })
    this.clearTransient()
    this.book.silentRemaining = SPELL_CONFIG.silentSeconds
    this.sync()
  }
  undo() {
    if (this.book.pendingSwordSource) return
    this.view.finishEdit()
    if (this.bar.undo()) this.sync()
  }

  deleteLetter() {
    if (this.book.pendingSwordSource || this.bar.sourceId !== null) return
    const selected = this.view.selectedIndex
    this.view.finishEdit()
    if (this.bar.deleteLetter(selected)) this.sync()
  }

  collect() {
    if (this.book.pendingSwordSource) return
    const { x, y } = this.position()
    const letter = this.terrain.nearestLetter(x, y)
    if (!letter || !this.bar.collect(letter.id, letter.char)) return
    // A player who crossed the dark section without casting still needs their collection.
    if (this.bar.sourceWord === 'PALM' && this.course.darkZone && x > this.course.darkZone.x1) this.bar.releaseWord()
    this.hooks?.collect()
    if (this.course.checkpoints && !this.showedCollectNote) {
      this.view.note('N11')
      this.showedCollectNote = true
    }
    this.sync()
    const index = this.bar.letters.findIndex(slot => slot.id === letter.id)
    if (index >= 0) this.view.fly(index, this.clientPoint(letter.point))
    this.prompt.setVisible(false)
  }

  cast() {
    if (this.book.pendingSwordSource) return
    const { x, y } = this.position()
    const zone = this.course.darkZone
    const result = this.book.submit(this.bar, {
      inDarkZone: !!zone && x >= zone.x0 && x <= zone.x1,
      inSwordZone: this.sword?.inRange(x, y) ?? false,
      swordSourceId: this.course.sword?.sourceId,
    })
    if (result.kind === 'pending') {
      const { sourceId, castId } = result
      if (!this.sword) { this.book.cancelSword(); return }
      this.view.setEnabled(false)
      const started = this.sword.cast(() => {
        const cut = this.book.commitSword(this.bar, sourceId, castId)
        if (cut) {
          this.terrain.consumeBlue(sourceId)
          this.view.feedback('spell')
          this.hooks?.cast({ kind: 'spell', word: result.word, sourceId })
          this.sync()
        }
        this.view.setEnabled(this.playing && !this.book.pendingSwordSource)
        return cut
      })
      if (!started) {
        this.book.cancelSword()
        this.view.setEnabled(this.playing)
      }
      return
    }
    if (result.kind === 'empty') return
    if (result.kind === 'egg') this.eggs.trigger(result.word as EggName, this.position(), this.bar.letters.map(l => l.char))
    this.hooks?.cast(result)
    if (result.kind === 'spell' && result.sourceId) this.terrain.consumeBlue(result.sourceId)
    const feedback = result.kind === 'spell' || result.kind === 'egg' ? result.kind : 'error'
    const lift = result.kind === 'egg' ? EGG_FX.commentLift : CONFIG.physics.playerSize
    this.view.feedback(feedback, result.lineId, this.clientPoint({ x, y: y - lift }))
    this.sync()
  }

  tick(seconds: number) {
    this.age += seconds
    this.eggs.advance(seconds)
    this.book.update(seconds)
    this.sword?.update(seconds)
    if (this.book.pendingSwordSource) return
    const { x, y } = this.position()
    const blue = this.terrain.blueContact(x, y)
    if (blue && this.bar.loadWord(blue.id, blue.word)) {
      this.sync()
      blue.points.forEach((point, i) => this.view.fly(i, this.clientPoint(point)))
    }
  }

  render() {
    this.boilVisibleInk()
    this.eggs.render(this.position())
    const { x, y } = this.position()
    const near = this.terrain.nearestLetter(x, y)
    this.prompt.setVisible(!!near)
    if (near) {
      const lift = COLLECT_PROMPT.lift + Math.sin(this.age * COLLECT_PROMPT.frequency) * COLLECT_PROMPT.bob
      this.prompt.setPosition(near.point.x, near.top - lift)
    }
    if (this.guideNote) this.drawGuide()
    this.view.setCooldown(this.bar.word === 'SILENT' ? this.book.cooldownRemaining / SPELL_CONFIG.cooldownSeconds : 0)
    this.view.setTimer(this.book.silentRemaining / SPELL_CONFIG.silentSeconds, this.book.silentRemaining <= SPELL_CONFIG.urgentSeconds)
  }

  private boilVisibleInk() {
    const frame = Math.floor(this.age / BOIL.period)
    if (frame === this.boilFrame) return
    this.boilFrame = frame
    const camera = this.scene.cameras.main
    for (const object of this.objects) {
      const { bounds } = object
      const motion = object.getTransform?.()
      const dx = motion?.x ?? 0, dy = motion?.y ?? 0
      if (bounds.maxX + dx >= camera.scrollX && bounds.minX + dx <= camera.scrollX + camera.width &&
        bounds.maxY + dy >= camera.scrollY && bounds.minY + dy <= camera.scrollY + camera.height) object.boil?.(frame)
    }
  }

  private drawGuide() {
    const ink = this.guide.clear()
    const note = this.guideNote!
    if (this.book.lamp || this.bar.canUndo) return
    const camera = this.scene.cameras.main
    const player = this.position()
    const startX = Math.min(note.bounds.maxX, Math.max(note.bounds.minX, player.x))
    if (Math.abs(startX - player.x) > SPELL_GUIDE.nearDistance) return
    const sx = startX - camera.scrollX
    const sy = note.bounds.minY - camera.scrollY - SPELL_GUIDE.tipGap
    const tx = camera.width / 2
    const ty = camera.height * SPELL_GUIDE.height + SPELL_GUIDE.noteInset
    if (sy < ty + SPELL_GUIDE.minLength || sy > camera.height || sx < 0 || sx > camera.width) return
    const cx = sx + (tx - sx) * SPELL_GUIDE.bend
    const cy = ty + SPELL_GUIDE.minLength
    ink.lineStyle(SPELL_GUIDE.pen, CONFIG.colors.note)
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(sx, sy), new Phaser.Math.Vector2(cx, cy), new Phaser.Math.Vector2(tx, ty),
    )
    curve.draw(ink)
    const length = Math.hypot(tx - cx, ty - cy)
    const dx = (tx - cx) / length
    const dy = (ty - cy) / length
    const hx = tx - SPELL_GUIDE.headLength * dx
    const hy = ty - SPELL_GUIDE.headLength * dy
    ink.lineBetween(hx + dy * SPELL_GUIDE.headWidth, hy - dx * SPELL_GUIDE.headWidth, tx, ty)
    ink.lineBetween(tx, ty, hx - dy * SPELL_GUIDE.headWidth, hy + dx * SPELL_GUIDE.headWidth)
  }

  setBulletTime(enabled: boolean) {
    this.slowEnabled = enabled
    this.clock.setEnabled(enabled)
    this.view.setVignette(this.dragging && enabled)
  }

  setHighlight(enabled: boolean) {
    this.eggs.setHighlight(enabled)
    this.terrain.setHighlightUnapproved(enabled)
    this.view.setHighlight(enabled)
  }

  setPlaying(enabled: boolean) {
    this.playing = enabled
    this.eggs.setPlaying(enabled)
    this.view.setEnabled(enabled && !this.book.pendingSwordSource)
    if (!enabled) {
      this.clock.setDragging(false)
      this.view.setVignette(false)
    }
  }

  reset() {
    this.showedCollectNote = false
    this.bar.reset()
    this.book.reset()
    this.clearTransient()
    this.terrain.reset()
    this.age = 0
    this.setPlaying(false)
    this.sync()
  }

  clearTransient() {
    this.book.cancelSword()
    this.sword?.restore(!!this.course.sword && this.bar.spentWord(this.course.sword.sourceId))
    this.eggs.reset()
    this.view.clearTransient()
    this.view.setEnabled(this.playing)
  }

  destroy() { this.sword?.destroy(); this.eggs.destroy(); this.view.destroy() }
}
