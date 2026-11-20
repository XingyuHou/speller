import { describe, expect, it } from 'vitest'
import { BEHAVIOR_CONFIG as rules, CONFIG, UNIT } from '../src/config'
import { layoutCourseText } from '../src/level/course'
import { Player, type PlayerInput } from '../src/player/Player'
import { BehaviorTerrain, type BehaviorName } from '../src/world/behaviors/BehaviorTerrain'
import { CollisionMask } from '../src/world/CollisionMask'

const dt = CONFIG.simulation.step
const half = CONFIG.physics.playerSize / 2
const idle: PlayerInput = { left: false, right: false, jumpHeld: false, jumpPressed: false }

function setup(behavior: BehaviorName) {
  const terrain = new BehaviorTerrain()
  const mask = new CollisionMask(1000, 800)
  const definition = {
    id: behavior, role: 'terrain' as const, text: behavior.toUpperCase(), behavior, x: 120, y: 510,
    size: 'L' as const, seed: 23, inkWidth: behavior === 'crumbly' ? 12 * UNIT : undefined,
  }
  const word = terrain.add(definition)
  mask.attachBehaviors(terrain)
  const first = word.bodies[0]
  const x = first.anchorX
  const top = first.box.minY
  const player = new Player(mask, x, top - half - 12)
  function step(input = idle) {
    terrain.tick(dt)
    player.step(dt, input)
  }
  return { terrain, mask, definition, word, first, player, x, top, step }
}

describe('dynamic word terrain', () => {
  it('builds independent top bodies from seeded glyphs and leaves the static mask empty', () => {
    const { mask, terrain, word, definition } = setup('crumbly')
    expect(word.glyphs).toEqual(layoutCourseText(definition).glyphs)
    expect(word.bodies).toHaveLength(definition.text.length)
    for (const body of word.bodies) {
      expect(body.box.minY).toBe(Math.round((body.glyph.bounds.minY - CONFIG.ink.L / 2) / mask.cellSize) * mask.cellSize)
      expect(mask.pointAt(body.anchorX, body.box.minY + 1)).toEqual({ solid: false, oneWay: false })
      expect(terrain.overlapsSolid(body.anchorX - 1, body.box.minY, body.anchorX + 1, body.box.maxY)).toBe(true)
    }
    let count = 0
    mask.forEachSolidCell({ x: 0, y: 0, width: 1000, height: 800 }, () => count++)
    expect(count).toBe(0)
  })

  it('launches the player automatically, compresses touched ink, and clears a six-unit wall', () => {
    const { player, first, word, step, top } = setup('bouncy')
    for (let i = 0; i < 70 && player.vy >= 0; i++) step({ ...idle, jumpHeld: true })
    expect(player.vy).toBe(-rules.bounceSpeed)
    expect(player.grounded).toBe(false)
    expect(first.scaleY).toBeCloseTo(1 - rules.squashFraction)
    expect(word.bodies[1].scaleY).toBe(1)
    let apex = player.y
    for (let i = 0; i < 90; i++) {
      step()
      apex = Math.min(apex, player.y)
    }
    const lift = top - half - apex
    expect(lift).toBeGreaterThan(6 * UNIT)
    expect(lift).toBeCloseTo(rules.bounceSpeed ** 2 / (2 * CONFIG.physics.gravity), 0)
    expect(first.scaleY).toBe(1)
  })

  it('only arms the stepped-on letter and removes support after 0.35 world seconds', () => {
    const { terrain, mask, first, word, player, x, top, step } = setup('crumbly')
    for (let i = 0; i < 100 && !player.grounded; i++) step()
    expect(first.cracking).toBe(true)
    expect(word.bodies[1].cracking).toBe(false)
    const holdTicks = Math.floor((rules.crumbleDelay - dt) / dt)
    for (let i = 0; i < holdTicks; i++) step()
    expect(player.grounded).toBe(true)
    expect(first.fallAge).toBeNull()
    for (let i = 0; i < 3; i++) step()
    expect(first.fallAge).not.toBeNull()
    expect(mask.landingTop(x - half, x + half, top, top)).toBeNull()
    expect(player.grounded).toBe(false)
    expect(player.vy).toBeGreaterThan(0)
    const neighbor = word.bodies[1]
    expect(terrain.landingTop(neighbor.anchorX - 1, neighbor.anchorX + 1, neighbor.box.minY, neighbor.box.minY)).toBe(neighbor.box.minY)
  })

  it('restores a letter three seconds after its fall and resets immediately at checkpoints', () => {
    const { terrain, first, word, x, top } = setup('crumbly')
    const neighbor = word.bodies[1]
    terrain.onLanding(x - 1, x + 1, top)
    terrain.tick(rules.crumbleDelay)
    expect(first.fallAge).toBe(0)
    terrain.tick(rules.crumbleRespawn - dt)
    expect(first.fallAge).not.toBeNull()
    terrain.onLanding(neighbor.anchorX - 1, neighbor.anchorX + 1, neighbor.box.minY)
    terrain.tick(dt + Number.EPSILON)
    expect(terrain.landingTop(x - 1, x + 1, top, top)).toBe(top)
    expect(first.scaleX).toBeLessThan(1)
    expect(neighbor.cracking).toBe(true)
    terrain.tick(rules.regrowSeconds + dt)
    expect(first.scaleX).toBe(1)
    terrain.reset()
    expect(neighbor.cracking).toBe(false)
    expect(word.bodies.every(body => body.fallAge === null && body.scaleX === 1)).toBe(true)
  })

  it('uses the first surface a fall crosses and leaves lower letters untouched', () => {
    const { mask, first, top, x, player, step } = setup('bouncy')
    mask.addStroke([{ x: x - 50, y: top - 48 }, { x: x + 50, y: top - 48 }], 4)
    player.reset(x, top - 130)
    const staticTop = mask.landingTop(x - 1, x + 1, top - 120, top + 1)
    expect(staticTop).toBeLessThan(top)
    for (let tick = 0; tick < 100; tick++) step()
    expect(player.grounded).toBe(true)
    expect(player.y + half).toBe(staticTop)
    expect(first.scaleY).toBe(1)
  })

  it('lets a player hit the underside of an intact body without triggering its action', () => {
    const { player, first, step, x } = setup('bouncy')
    player.reset(x, first.box.maxY + half + 25)
    player.vy = -CONFIG.physics.jumpSpeed
    let minimum = player.y
    for (let tick = 0; tick < 35; tick++) {
      step()
      minimum = Math.min(minimum, player.y)
    }
    expect(minimum).toBe(first.box.maxY + half)
    expect(first.scaleY).toBe(1)
    expect(player.vy).toBeGreaterThan(0)
  })
})
