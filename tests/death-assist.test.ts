import type Phaser from 'phaser'
import { expect, it } from 'vitest'
import { CONFIG, SPELL_VIEW_CONFIG } from '../src/config'
import { layoutCourseText } from '../src/level/course'
import { CHAPTER1 } from '../src/level/level1'
import { Player } from '../src/player/Player'
import { CollisionMask } from '../src/world/CollisionMask'
import { DeathAssist } from '../src/world/DeathAssist'

class TestInk {
  color = 0
  destroyed = false
  clear() { return this }
  lineStyle(_width: number, color: number) { this.color = color; return this }
  fillStyle() { return this }
  beginPath() { return this }
  moveTo() { return this }
  lineTo() { return this }
  strokePath() { return this }
  fillCircle() { return this }
  setDepth() { return this }
  destroy() { this.destroyed = true }
}

it('unlocks the note and physical comma once per interval, restores it, and clears it on replay', () => {
  const ink: TestInk[] = []
  const scene = {
    add: { graphics() { const g = new TestInk(); ink.push(g); return g } },
    events: { emit() {} },
  } as unknown as Phaser.Scene
  const course = CHAPTER1
  const mask = new CollisionMask(course.width, course.height)
  const objects = course.texts.filter(t => t.id === 'dot-1' || t.id === 'dot-2')
    .map(definition => ({ ...layoutCourseText(definition), definition, setAppearance() {} }))
  const assist = new DeathAssist(scene, course, objects, mask)
  const mid = (objects[0].bounds.maxX + objects[1].bounds.minX) / 2
  const y = objects[0].bounds.minY
  const support = () => mask.landingTop(mid - 8, mid + 8, y - 30, y + 50)
  for (let i = 0; i < 2; i++) assist.record('start', { x: mid, y })
  expect(ink).toHaveLength(0)
  assist.record('start', { x: mid, y })
  expect(ink).toHaveLength(1)
  assist.setHighlight(true)
  expect(ink[0].color).toBe(SPELL_VIEW_CONFIG.highlightColor)
  expect(support()).toBeNull()
  for (let i = 0; i < 4; i++) assist.record('start', { x: mid, y })
  expect(assist.assistIds).toEqual(['start'])
  expect(ink).toHaveLength(3)
  expect(ink[1].color).toBe(CONFIG.colors.terrain)
  expect(ink[2].color).toBe(SPELL_VIEW_CONFIG.highlightColor)
  expect(support()).not.toBeNull()

  const square = new Player(mask, mid, y - 60)
  for (let i = 0; i < 120; i++) {
    square.step(CONFIG.simulation.step, { left: false, right: false, jumpPressed: false, jumpHeld: false })
  }
  expect(square.grounded).toBe(true)

  assist.restore({ start: 7 })
  expect(assist.counts.start).toBe(7)
  expect(assist.assistIds).toEqual(['start'])
  expect(support()).not.toBeNull()
  assist.clear()
  expect(assist.counts).toEqual({})
  expect(ink.every(g => g.destroyed)).toBe(true)
  expect(support()).toBeNull()
})
