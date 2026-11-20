import { expect, it } from 'vitest'
import { CONFIG, UNIT } from '../src/config'
import { textForLine } from '../src/content/lines'
import { CHAPTER1 } from '../src/level/level1'
import { layoutCourseText } from '../src/level/course'
import { Player } from '../src/player/Player'
import { BehaviorTerrain } from '../src/world/behaviors/BehaviorTerrain'
import { CollisionMask } from '../src/world/CollisionMask'
import { SpellTerrain } from '../src/world/SpellTerrain'

const objects = CHAPTER1.texts.map(definition => ({
  ...layoutCourseText(definition), definition, setAppearance() {},
}))
const byId = new Map(objects.map(object => [object.definition.id, object]))

it('keeps H01 intact with only PALM rearrangeable in the dark, and saves yellow letters for section 3', () => {
  const bridge = ['hint-lead', 'palm', 'hint-tail'].map(id => byId.get(id)!)
  expect(bridge.map(word => word.definition.text).join('')).toBe(textForLine('H01'))
  expect(CHAPTER1.texts.filter(word => word.rearrange && word.x < CHAPTER1.darkZone!.x1).map(word => word.id)).toEqual(['palm'])
  expect(bridge.every(word => word.definition.glow)).toBe(true)
  expect(CHAPTER1.texts.filter(word => word.x < byId.get('save-exit')!.bounds.minX).some(word => word.collectible?.length)).toBe(false)

  const a = bridge[1].glyphs[1].bounds
  const player = { x: (a.minX + a.maxX) / 2, y: a.minY - CONFIG.physics.playerSize / 2 }
  const nextStep = byId.get('lamp-step-0')!.glyphs[0].bounds
  const distance = Math.hypot(nextStep.minX - player.x, nextStep.minY - player.y)
  expect(distance).toBeGreaterThan(2 * UNIT)
  expect(distance).toBeLessThan(9 * UNIT)
})

it('plays from HERE through PALM, over the bridge and onto the next puzzle checkpoint', () => {
  const dynamic = new BehaviorTerrain()
  const mask = new CollisionMask(CHAPTER1.width, CHAPTER1.height)
  for (const { definition, glyphs } of objects) {
    if (definition.behavior) dynamic.add(definition)
    else if (definition.role === 'terrain') {
      for (const glyph of glyphs) {
        for (const stroke of glyph.strokes) mask.addStroke(stroke, CONFIG.ink[definition.size], definition.oneWay)
      }
    }
  }
  mask.attachBehaviors(dynamic)
  const terrain = new SpellTerrain(objects)
  const dt = CONFIG.simulation.step
  const player = new Player(mask, CHAPTER1.spawn.x, CHAPTER1.spawn.y)
  const idle = { left: false, right: false, jumpHeld: false, jumpPressed: false }
  for (let time = 0; time < 1; time += dt) player.step(dt, idle)

  // One recorded rightward run, with two early releases for the punctuation and pillars.
  const jumps = new Set([
    35, 126, 224, 343, 434, 1183, 1246, 1337, 1435, 1505, 1981, 2100,
    3654, 3738, 3822, 3969, 4095, 4172, 4263, 4368, 4424, 4515,
    5264, 5985, 6111, 6237, 6321,
  ])
  const releases = new Set([1456, 4382])
  const finish = byId.get('save-sword')!.bounds
  let holding = false
  let loaded = false
  let completed = false
  for (let tick = 0; tick < 6600; tick++) {
    const jump = jumps.has(tick)
    if (jump) holding = true
    if (releases.has(tick)) holding = false
    dynamic.tick(dt)
    player.step(dt, { left: false, right: true, jumpPressed: jump, jumpHeld: holding })
    if (!loaded && terrain.blueContact(player.x, player.y)) loaded = true
    if (player.y > CHAPTER1.killY!) break
    if (player.grounded && player.x >= finish.minX && player.x <= finish.maxX && player.y <= finish.maxY) {
      completed = true
      break
    }
  }
  expect(loaded).toBe(true)
  expect(completed).toBe(true)
})
