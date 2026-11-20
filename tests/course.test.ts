import { describe, expect, it } from 'vitest'
import authorTable from '../docs/AUTHOR_LINES.md?raw'
import { CONFIG } from '../src/config'
import { LINES } from '../src/content/lines'
import { layoutHandwriting } from '../src/font/handwriting'
import { COURSE } from '../src/level/course'
import { Player } from '../src/player/Player'
import { CollisionMask } from '../src/world/CollisionMask'

const terrain = new Map(COURSE.texts.filter(object => object.role === 'terrain')
  .map(object => [object.id, { object, ink: layoutHandwriting(object) }]))

const mask = new CollisionMask(COURSE.width, COURSE.height)
for (const { object, ink } of terrain.values()) {
  for (const glyph of ink.glyphs) {
    for (const stroke of glyph.strokes) mask.addStroke(stroke, CONFIG.ink[object.size], object.oneWay)
  }
}

const idleInput = { left: false, right: false, jumpPressed: false, jumpHeld: false }

function dropAt(stationId: string): Player {
  const { spawn } = COURSE.stations.find(station => station.id === stationId)!
  const player = new Player(mask, spawn.x, spawn.y)
  for (let t = 0; t < 1; t += CONFIG.simulation.step) player.step(CONFIG.simulation.step, idleInput)
  return player
}

it('mirrors the complete author table, including its current approval states', () => {
  const records = authorTable.split('\n')
    .filter(row => /^\| [A-Z]\d\d \|/.test(row))
    .map(row => {
      const cells = row.split('|').slice(1, -1).map(cell => cell.trim())
      return [cells[0], { text: cells.at(-2), status: cells.at(-1) }]
    })
  expect(LINES).toEqual(Object.fromEntries(records))
})

describe('M1 practice course with its real seeded ink', () => {
  it.each(['o', 'l', 't'])('lands on the specified stroke of %s', id => {
    const player = dropAt(id)
    const ink = terrain.get(id)!.ink
    const bounds = ink.bounds
    const foot = player.y + CONFIG.physics.playerSize / 2
    const strokeY = id === 'l' ? bounds.maxY : bounds.minY
    expect(player.grounded).toBe(true)
    expect(player.x).toBeGreaterThan(bounds.minX)
    expect(player.x).toBeLessThan(bounds.maxX)
    expect(Math.abs(foot - strokeY)).toBeLessThan(CONFIG.collision.minStrokeWidth + CONFIG.collision.cellSize)
  })

  it.each(['slope', 'curve'])('runs along the entire %s sentence from its entry', id => {
    const player = dropAt(id)
    const { bounds } = terrain.get(id)!.ink
    const exitX = bounds.maxX - CONFIG.physics.playerSize / 2
    const seconds = (exitX - player.x) / CONFIG.physics.maxRunSpeed + 1
    for (let t = 0; t < seconds && player.x < exitX; t += CONFIG.simulation.step) {
      player.step(CONFIG.simulation.step, { ...idleInput, right: true })
    }
    expect(player.x).toBeGreaterThanOrEqual(exitX)
    expect(player.grounded).toBe(true)
    expect(player.y).toBeLessThan(bounds.maxY)
  })

  it('can run and jump from the start to NEXT without warping or restarting', () => {
    const player = dropAt(COURSE.stations[0].id)
    const takeoffs = [414, 622, 986, 1194, 1506, 1688, 1896, 2104, 2390, 5172, 5354]
    const finish = terrain.get(COURSE.finishId)!.ink.bounds
    let jumpIndex = 0
    let held = false
    let landedOnFinish = false
    for (let t = 0; t < 30; t += CONFIG.simulation.step) {
      if (player.grounded) held = false
      const jump = player.grounded && player.x >= takeoffs[jumpIndex]
      if (jump) {
        held = true
        jumpIndex++
      }
      player.step(CONFIG.simulation.step, { ...idleInput, right: true, jumpHeld: held, jumpPressed: jump })
      const feet = player.y + CONFIG.physics.playerSize / 2
      if (player.grounded && player.x >= finish.minX && player.x <= finish.maxX && feet <= finish.maxY) {
        landedOnFinish = true
        break
      }
    }
    expect(landedOnFinish).toBe(true)
  })
})
