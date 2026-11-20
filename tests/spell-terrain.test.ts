import { expect, it } from 'vitest'
import { CONFIG, SPELL_VIEW_CONFIG } from '../src/config'
import { layoutHandwriting } from '../src/font/handwriting'
import { SPELL_PRACTICE } from '../src/level/spellPractice'
import { Player } from '../src/player/Player'
import { CollisionMask } from '../src/world/CollisionMask'
import { SpellTerrain } from '../src/world/SpellTerrain'
import { glyphColor } from '../src/world/TextObject'
import type { TextAppearance } from '../src/world/TextObject'

function laboratory() {
  const mask = new CollisionMask(SPELL_PRACTICE.width, SPELL_PRACTICE.height)
  const objects = SPELL_PRACTICE.texts.map(definition => {
    const ink = layoutHandwriting(definition)
    if (definition.role === 'terrain') {
      for (const glyph of ink.glyphs) for (const stroke of glyph.strokes) {
        mask.addStroke(stroke, CONFIG.ink[definition.size], definition.oneWay)
      }
    }
    let appearance: TextAppearance = {}
    return { definition, ...ink, setAppearance: (next: TextAppearance) => { appearance = next },
      color: (index: number) => glyphColor(definition, index, appearance) }
  })
  return { mask, objects, world: new SpellTerrain(objects) }
}

it('loads PALM on top-edge contact and keeps its strokes after use', () => {
  const { mask, objects, world } = laboratory()
  const palm = objects.find(o => o.definition.id === 'palm')!
  const spawn = SPELL_PRACTICE.stations[1].spawn
  const player = new Player(mask, spawn.x, spawn.y)
  for (let i = 0; i < 120; i++) player.step(1 / 120, { left: false, right: false, jumpPressed: false, jumpHeld: false })
  expect(player.grounded).toBe(true)
  expect(world.blueContact(player.x, player.y)?.points).toHaveLength(4)
  expect(world.blueContact(player.x, player.y - CONFIG.physics.playerSize)).toBeUndefined()
  expect(palm.color(0)).toBe(CONFIG.colors.rearrange)
  expect(world.consumeBlue('palm')).toBe(true)
  expect(world.blueContact(player.x, player.y)).toBeUndefined()
  expect(palm.color(0)).toBe(CONFIG.colors.terrain)
  world.reset()
  expect(world.blueContact(player.x, player.y)?.word).toBe('PALM')
})

it('lets the player collect six letters separately and revisit the physical strokes', () => {
  const { mask, objects, world } = laboratory()
  const player = new Player(mask, SPELL_PRACTICE.spawn.x, SPELL_PRACTICE.spawn.y)
  const collected: string[] = []
  for (let i = 0; i < 1500; i++) {
    player.step(1 / 120, { left: false, right: i >= 120, jumpPressed: false, jumpHeld: false })
    const letter = world.nearestLetter(player.x, player.y)
    if (letter) {
      expect(world.collect(letter.id)).toBe(true)
      expect(world.collect(letter.id)).toBe(false)
      collected.push(letter.char)
      expect(objects.find(o => o.definition.id === letter.objectId)!.color(letter.index)).toBe(CONFIG.colors.collected)
    }
  }
  expect(collected.join('')).toBe('LISNET')
  const here = objects.find(o => o.definition.id === 'here')!
  world.setHighlightUnapproved(true)
  expect(here.color(0)).toBe(SPELL_VIEW_CONFIG.highlightColor)
  world.setHighlightUnapproved(false)
  expect(here.color(0)).toBe(CONFIG.colors.terrain)
})

it('tracks the pen strokes on a moving pickup and ignores a fallen platform', () => {
  const { objects } = laboratory()
  const label = objects.find(o => o.definition.collectible?.length)!
  const transform = { x: 200, y: 80, available: true }
  const world = new SpellTerrain([{ ...label, getTransform: () => transform }])
  const stroke = label.glyphs[label.definition.collectible![0]].strokes[0][0]
  const hit = world.nearestLetter(stroke.x + transform.x, stroke.y + transform.y)
  expect(hit?.objectId).toBe(label.definition.id)
  expect(world.nearestLetter(stroke.x, stroke.y)).toBeUndefined()
  world.collect(hit!.id)
  expect(label.color(hit!.index)).toBe(CONFIG.colors.collected)
  transform.available = false
  expect(world.returnLetter(hit!.id)).toBe(true)
  expect(label.color(hit!.index)).toBe(CONFIG.colors.collectible)
  expect(world.nearestLetter(stroke.x + transform.x, stroke.y + transform.y)).toBeUndefined()
  transform.available = true
  expect(world.nearestLetter(stroke.x + transform.x, stroke.y + transform.y)?.id).toBe(hit!.id)
})

it('restores the same yellow ink, collision and collection target when a glyph leaves the bar', () => {
  const { objects, mask, world } = laboratory()
  const label = objects.find(o => o.definition.collectible?.length)!
  const index = label.definition.collectible![0]
  const id = label.definition.id + ':' + index
  const point = label.glyphs[index].strokes[0][0]
  const collisionCells = () => {
    const cells: number[][] = []
    const { minX, minY, maxX, maxY } = label.bounds
    mask.forEachSolidCell({ x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      (x, y, size, oneWay) => cells.push([x, y, size, Number(oneWay)]))
    return cells
  }
  const cellsBefore = collisionCells()
  expect(cellsBefore.length).toBeGreaterThan(0)
  world.collect(id)
  expect(world.nearestLetter(point.x, point.y)).toBeUndefined()
  expect(world.returnLetter(id)).toBe(true)
  expect(world.returnLetter(id)).toBe(false)
  expect(label.color(index)).toBe(CONFIG.colors.collectible)
  expect(world.nearestLetter(point.x, point.y)?.id).toBe(id)
  expect(world.collect(id)).toBe(true)
  expect(label.color(index)).toBe(CONFIG.colors.collected)
  expect(world.collectedIds.size).toBe(1)
  expect(collisionCells()).toEqual(cellsBefore)
})
