import type Phaser from 'phaser'
import { CHAPTER_FX, CONFIG } from '../config'
import type { Point } from '../font/handwriting'
import type { CourseData } from '../level/course'
import { Darkness } from '../spell/effects/Darkness'
import { BehaviorTerrain } from './behaviors/BehaviorTerrain'
import { BehaviorView } from './behaviors/BehaviorView'
import { ChapterEffects } from './ChapterEffects'
import { CollisionMask } from './CollisionMask'
import { DeathAssist } from './DeathAssist'
import type { createTextObject } from './TextObject'

export class ChapterRun {
  readonly darkness: Darkness
  readonly effects: ChapterEffects
  readonly movingInk: BehaviorView
  readonly checkpoints: { id: string; spawn: Point; object: ReturnType<typeof createTextObject> }[]
  checkpoint = -1
  deaths = 0
  private deathTimer = 0
  private readonly assistance: DeathAssist

  constructor(scene: Phaser.Scene, readonly course: CourseData, objects: ReturnType<typeof createTextObject>[], readonly behaviors: BehaviorTerrain, mask: CollisionMask) {
    this.assistance = new DeathAssist(scene, course, [...objects, ...behaviors.words], mask)
    this.darkness = new Darkness(scene, course.darkZone!)
    this.effects = new ChapterEffects(scene)
    this.movingInk = new BehaviorView(scene, behaviors)
    this.checkpoints = (course.checkpoints ?? []).map(checkpoint => {
      const object = objects.find(o => o.definition.id === checkpoint.id)
      if (!object) throw new Error('Missing checkpoint terrain: ' + checkpoint.id)
      return { ...checkpoint, object }
    })
  }

  get deathCounts() { return this.assistance.counts }
  get assistIds() { return this.assistance.assistIds }
  restoreDeathCounts(counts: Record<string, number>, assistIds?: readonly string[]) {
    this.assistance.restore(counts, assistIds)
    this.deaths = Object.values(this.deathCounts).reduce((total, n) => total + n, 0)
  }
  setHighlight(enabled: boolean) { this.assistance.setHighlight(enabled) }

  get spawn() { return this.checkpoints[this.checkpoint]?.spawn ?? this.course.spawn }
  get dying() { return this.deathTimer > 0 }

  visit({ x, y }: Point) {
    for (let i = this.checkpoint + 1; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i]
      const { bounds } = cp.object
      if (x < bounds.minX) break
      // Jumping over the sign also reaches it. Falling underneath does not.
      if (x <= bounds.maxX + CONFIG.physics.playerSize / 2 && y < bounds.maxY) {
        this.checkpoint = i
        this.effects.activateSave(cp.object)
      }
    }
  }

  die(point: Point) {
    if (this.dying) return
    // Backtracking can place a death earlier than the latest activated SAVE.
    let interval = 'start'
    for (const checkpoint of this.checkpoints) {
      if (point.x < checkpoint.object.bounds.minX) break
      interval = checkpoint.id
    }
    this.assistance.record(interval, point)
    this.deaths++
    this.deathTimer = CHAPTER_FX.deathSeconds
    this.effects.shatter(point)
  }

  advanceDeath(dt: number) {
    this.deathTimer = Math.max(0, this.deathTimer - dt)
    return this.deathTimer === 0
  }

  retry() {
    this.deathTimer = 0
    this.effects.clearDeath()
    this.behaviors.reset()
  }

  seek(point: Point) {
    this.checkpoint = -1
    this.retry()
    this.effects.reset()
    this.checkpoints.forEach((cp, i) => {
      if (cp.spawn.x <= point.x) {
        this.checkpoint = i
        this.effects.activateSave(cp.object, true)
      }
    })
  }

  reset() {
    this.assistance.clear()
    this.deaths = 0
    this.seek(this.course.spawn)
  }

  destroy() {
    this.assistance.clear()
    this.movingInk.destroy()
    this.darkness.destroy()
    this.effects.destroy()
  }
}
