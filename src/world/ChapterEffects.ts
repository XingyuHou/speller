import type Phaser from 'phaser'
import { CHAPTER_FX as fx, CONFIG } from '../config'
import type { Point } from '../font/handwriting'
import type { createTextObject } from './TextObject'

type Save = ReturnType<typeof createTextObject>

function channel(start: number, end: number, shift: number, amount: number) {
  const a = (start >> shift) & 255
  const b = (end >> shift) & 255
  return Math.round(a + (b - a) * amount) << shift
}

export function saveInk(index: number, time: number, pen: number) {
  const local = time - index * fx.saveStepSeconds
  if (local < 0) return { color: CONFIG.colors.terrain, width: pen }
  const flash = Math.max(0, 1 - local / fx.saveFlashSeconds)
  const green = CONFIG.colors.collected
  const white = CONFIG.colors.player
  const color = channel(green, white, 16, flash) | channel(green, white, 8, flash) | channel(green, white, 0, flash)
  return { color, width: pen + fx.saveFlashWidth * flash }
}

/** The four pieces originate in the matching quadrants of the player's square. */
export function debrisAt(origin: Point, index: number, time: number) {
  const side = index % 2 === 0 ? -1 : 1
  const top = index < 2
  const offset = CONFIG.physics.playerSize / 4
  return {
    x: origin.x + side * (offset + fx.debris.speedX * time),
    y: origin.y + (top ? -offset : offset) - (top ? fx.debris.up : fx.debris.lowerUp) * time + fx.debris.gravity * time * time / 2,
    angle: side * fx.debris.spin * time,
    alpha: Math.max(0, 1 - (time / fx.deathSeconds) ** 2),
  }
}

export class ChapterEffects {
  private readonly saves = new Map<Save, number>()
  private readonly pieces: Phaser.GameObjects.Rectangle[]
  private origin: Point | null = null
  private deathAge = 0

  constructor(scene: Phaser.Scene) {
    const size = CONFIG.physics.playerSize / 2 * fx.debris.scale
    this.pieces = Array.from({ length: 4 }, () =>
      scene.add.rectangle(0, 0, size, size, CONFIG.colors.player).setDepth(fx.depth.debris).setVisible(false))
  }

  activateSave(save: Save, instant = false) {
    if (this.saves.has(save) && !instant) return
    const age = instant ? Infinity : 0
    this.saves.set(save, age)
    this.drawSave(save, age)
  }

  private drawSave(save: Save, time: number) {
    save.setInkStyle((index, width) => saveInk(index, time, width))
  }

  shatter(at: Point) {
    this.origin = { x: at.x, y: at.y }
    this.deathAge = 0
    this.drawPieces()
  }

  private drawPieces() {
    const origin = this.origin
    if (!origin) return
    this.pieces.forEach((piece, i) => {
      const pose = debrisAt(origin, i, this.deathAge)
      piece.setVisible(true).setPosition(pose.x, pose.y).setRotation(pose.angle).setAlpha(pose.alpha)
    })
  }

  clearDeath() {
    this.origin = null
    this.pieces.forEach(piece => piece.setVisible(false))
  }

  update(worldSeconds: number) {
    if (worldSeconds <= 0) return
    for (const [save, age] of this.saves) {
      if (age === Infinity) continue
      const end = (save.glyphs.length - 1) * fx.saveStepSeconds + fx.saveFlashSeconds
      const next = age + worldSeconds
      this.saves.set(save, next >= end ? Infinity : next)
      this.drawSave(save, next)
    }
    if (!this.origin) return
    this.deathAge += worldSeconds
    if (this.deathAge >= fx.deathSeconds) this.clearDeath()
    else this.drawPieces()
  }

  reset() {
    for (const save of this.saves.keys()) save.setInkStyle()
    this.saves.clear()
    this.clearDeath()
  }

  destroy() {
    this.saves.clear()
    this.pieces.forEach(piece => piece.destroy())
  }
}
