import type Phaser from 'phaser'
import { expect, it } from 'vitest'
import { CONFIG, SWORD_BRIDGE } from '../src/config'
import { layoutCourseText } from '../src/level/course'
import { CHAPTER1 as course } from '../src/level/level1'
import { Player } from '../src/player/Player'
import { CollisionMask } from '../src/world/CollisionMask'
import { SpellTerrain } from '../src/world/SpellTerrain'
import { SwordBridge } from '../src/world/SwordBridge'

const layout = course.sword!
const dt = CONFIG.simulation.step
const idle = { left: false, right: false, jumpPressed: false, jumpHeld: false }
const leftBank = course.stations.find(s => s.id === 'save-sword')!
const rightBank = course.stations.find(s => s.id === 'save-exit')!
const objects = course.texts.filter(t => t.role === 'terrain' && t.x >= leftBank.spawn.x - 300 && t.x <= rightBank.spawn.x + 300)
  .map(definition => ({...layoutCourseText(definition), definition, setAppearance() {}}))

function fixture() {
  const mask = new CollisionMask(course.width, course.height)
  for (const object of objects) for (const glyph of object.glyphs) for (const stroke of glyph.strokes) {
    mask.addStroke(stroke, CONFIG.ink[object.definition.size], object.definition.oneWay)
  }
  const g = { clear() {return this}, lineStyle() {return this}, fillStyle() {return this},
    strokePoints() {}, fillCircle() {}, destroy() {} }
  const scene = {add: {graphics: () => g}, events: {emit() {}}} as unknown as Phaser.Scene
  const bridge = new SwordBridge(scene, layout, mask)
  const terrain = new SpellTerrain(objects)
  function playerAt(spawn: {x:number; y:number}) {
    const p = new Player(mask, spawn.x, spawn.y)
    for (let i = 0; i < 120; i++) p.step(dt, idle)
    return p
  }
  return { mask, bridge, terrain, playerAt }
}

it('requires the cut: even jumping from the highest ROPE stroke cannot reach the opposite bank', () => {
  const { mask } = fixture()
  const shore = objects.find(o => o.definition.id === 'sword-landing')!.bounds
  const upperRope = layout.rope.y - CONFIG.collision.minStrokeWidth
  const drop = shore.maxY - upperRope
  const { gravity, jumpSpeed, maxRunSpeed, coyoteTime, playerSize } = CONFIG.physics
  const longestFlight = (jumpSpeed + Math.sqrt(jumpSpeed ** 2 + 2 * gravity * drop)) / gravity
  const furthest = layout.pivot.x + playerSize + CONFIG.collision.minStrokeWidth + (longestFlight + coyoteTime) * maxRunSpeed
  expect(furthest).toBeLessThan(shore.minX)
  expect(mask.landingTop(layout.pivot.x + 120, layout.pivot.x + 144, 0, course.killY!)).toBeNull()
})

it('cuts once at the rope, cancels a pending cast on restore, and preserves the separate comma mask', () => {
  const { mask, bridge } = fixture()
  const assist = new CollisionMask(course.width, course.height)
  assist.addStroke([{x: 40, y: 700}, {x: 72, y: 700}], 5, true)
  mask.setOverlay(assist)
  let count = 0
  const accept = () => { count++; return true }
  const lowerRope = () => mask.landingTop(layout.rope.x - 20, layout.rope.x + 20, bridge.cutPoint.y + 10, layout.rope.y + 94)
  expect(lowerRope()).not.toBeNull()
  expect(bridge.cast(accept)).toBe(true)
  expect(bridge.cast(accept)).toBe(false)
  bridge.update(SWORD_BRIDGE.cutSeconds / 2)
  expect(count).toBe(0)
  bridge.restore(false)
  bridge.update(1)
  expect(count).toBe(0)
  bridge.cast(() => false)
  bridge.update(1)
  expect(bridge.solved).toBe(false)
  expect(lowerRope()).not.toBeNull()
  bridge.cast(accept)
  bridge.update(SWORD_BRIDGE.cutSeconds)
  expect(bridge.solved).toBe(true)
  expect(lowerRope()).toBeNull()
  bridge.update(SWORD_BRIDGE.fallSeconds)
  expect(bridge.cast(accept)).toBe(false)
  expect(count).toBe(1)
  bridge.restore(false)
  expect(lowerRope()).not.toBeNull()
  bridge.restore(true)
  expect(lowerRope()).toBeNull()
  bridge.destroy()
  expect(mask.pointAt(55, 699).oneWay).toBe(true)
})

it('walks onto WORDS, lowers the bridge, and traverses its real strokes in both directions', () => {
  const { bridge, terrain, playerAt } = fixture()
  let player = playerAt(leftBank.spawn)
  for (let tick = 0; tick < 200 && !terrain.blueContact(player.x, player.y); tick++) {
    player.step(dt, {...idle, right: true})
  }
  expect(terrain.blueContact(player.x, player.y)?.word).toBe('WORDS')
  for (let i = 0; i < 120; i++) player.step(dt, idle)
  expect(bridge.inRange(player.x, player.y)).toBe(true)
  expect(bridge.inRange(rightBank.spawn.x, rightBank.spawn.y)).toBe(false)
  bridge.cast(() => true)
  for (let i = 0; i < 120; i++) bridge.update(dt)
  for (const forward of [true, false]) {
    if (!forward) player = playerAt(rightBank.spawn)
    const end = objects.find(o => o.definition.id === (forward ? 'save-exit' : 'save-sword'))!.bounds
    // Positions relative to the hinge, recorded using the fixed-step controller.
    const takeoffs = forward ? [244, 491, 673] : [-24, -297, -453]
    let index = 0, stoodOnBridge = false, crossed = false
    for (let tick = 0; tick < 1200 && player.y < course.killY!; tick++) {
      const distance = player.x - layout.pivot.x
      const jump = forward ? distance >= takeoffs[index] : distance <= takeoffs[index]
      if (jump) index++
      player.step(dt, { left: !forward, right: forward, jumpHeld: true, jumpPressed: jump })
      if (player.grounded && distance > 20 && distance < SWORD_BRIDGE.course.deckSpan - 20) stoodOnBridge = true
      if (player.grounded && player.x >= end.minX && player.x <= end.maxX && player.y <= end.maxY) {
        crossed = true
        break
      }
    }
    expect(stoodOnBridge).toBe(true)
    expect(crossed).toBe(true)
  }
})
