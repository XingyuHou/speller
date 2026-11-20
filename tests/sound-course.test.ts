import { expect, it } from 'vitest'
import { CONFIG } from '../src/config'
import { CHAPTER1 as course } from '../src/level/level1'
import { layoutCourseText } from '../src/level/course'
import { Player } from '../src/player/Player'
import { NoiseSystem } from '../src/sound/NoiseSystem'
import { SpellBar } from '../src/spell/SpellBar'
import { SpellBook } from '../src/spell/spells'
import { BehaviorTerrain } from '../src/world/behaviors/BehaviorTerrain'
import { CollisionMask } from '../src/world/CollisionMask'
import { SpellTerrain } from '../src/world/SpellTerrain'

it.each([true, false])('collects all six letters and crosses DOOR, using LISTEN = %s', useListen => {
  const dynamic = new BehaviorTerrain()
  const mask = new CollisionMask(course.width, course.height)
  const objects = course.texts.map(definition => {
    if (definition.behavior) return dynamic.add(definition)
    const ink = layoutCourseText(definition)
    if (definition.role === 'terrain') for (const glyph of ink.glyphs) {
      for (const stroke of glyph.strokes) mask.addStroke(stroke, CONFIG.ink[definition.size], definition.oneWay)
    }
    return { definition, ...ink, setAppearance() {} }
  })
  mask.attachBehaviors(dynamic)
  const world = new SpellTerrain(objects)
  const noise = new NoiseSystem(course.sound, dynamic)
  const bar = new SpellBar()
  const book = new SpellBook()
  const start = course.stations.find(station => station.id === 'save-exit')!.spawn
  const finish = objects.find(o => o.definition.id === course.finishId)!.bounds
  const player = new Player(mask, start.x, start.y)
  const dt = CONFIG.simulation.step
  const jumps = new Set([272, 328, 824, 1080, 1160, 1264, 1424, 1528, 1744, 2264, 2792, 2888, 3216, 4048, 4352, 4544, 4640, 4728, 4840, 4992, 5192])
  const pickups = new Set([89, 331, 563, 857, 1187, 1503])
  let completed = false
  let hitSpikes = false
  const activeSpikes = new Set<string>()
  function cast(word: string) {
    for (let index = 0; index < word.length; index++) bar.swap(bar.word.indexOf(word[index]), index)
    expect(book.submit(bar, {inDarkZone: false}).word).toBe(word)
  }

  for (let tick = -120; tick < 5350; tick++) {
    if (tick === 1550 && useListen) cast('LISTEN')
    if (tick === 4031) cast('SILENT')
    book.update(dt)
    noise.preStep(dt, player, book.silentRemaining > 0)
    dynamic.tick(dt)
    player.step(dt, { left: false, right: tick >= 0 && (tick < 4816 || tick >= 4832),
      jumpPressed: jumps.has(tick), jumpHeld: tick >= 272 })
    hitSpikes ||= noise.postStep(player)
    for (const spike of noise.spikes) if (spike.extension > 0) activeSpikes.add(spike.id)
    if (pickups.has(tick)) {
      const letter = world.nearestLetter(player.x, player.y)!
      expect(world.collect(letter.id)).toBe(true)
      expect(bar.collect(letter.id, letter.char)).toBe(true)
    }
    if (player.grounded && player.x >= finish.minX && player.x <= finish.maxX && player.y <= finish.maxY) {
      completed = true
      break
    }
  }
  expect(completed).toBe(true)
  expect(hitSpikes).toBe(false)
  for (const id of ['demo-spikes', 'corridor-spikes', 'sprint-clock-spikes']) expect(activeSpikes.has(id)).toBe(true)
  expect(book.listen).toBe(useListen)
  expect(world.collectedIds.size).toBe(6)
  expect(book.silentRemaining).toBeGreaterThan(0)
})
