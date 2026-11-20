import { BOIL } from '../config'
import type { Point } from './handwriting'

/** A closed loop's first and last vertex get the same offset. World-space input never changes. */
export function boiledStroke(stroke: Point[], seed: number, frame: number): Point[] {
  if (frame === 0) return stroke
  return stroke.map(p => {
    let n = Math.imul(Math.round(p.x * 16) ^ seed, 0x85ebca6b)
    n ^= Math.imul(Math.round(p.y * 16) ^ frame, 0xc2b2ae35)
    n = Math.imul(n ^ (n >>> 16), 0x27d4eb2d)
    const angle = (n >>> 0) / 0x100000000 * Math.PI * 2
    return { x: p.x + BOIL.amplitude * Math.cos(angle), y: p.y + BOIL.amplitude * Math.sin(angle) }
  })
}
