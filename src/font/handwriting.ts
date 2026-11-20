import { CONFIG } from '../config'
import { GLYPHS } from './glyphs'
import type { Point } from './glyphs'

export type { Point } from './glyphs'

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface GlyphShape {
  char: string
  index: number
  strokes: Point[][]
  bounds: Bounds
}

export interface Handwriting {
  glyphs: GlyphShape[]
  bounds: Bounds
}

export type Baseline =
  | { type: 'polyline'; points: readonly Point[] }
  | { type: 'quad'; p0: Point; c: Point; p1: Point }

export interface HandwritingOptions {
  text: string
  seed: number
  size: number | keyof typeof CONFIG.sizes
  x?: number
  y?: number
  rotation?: number
  baseline?: Baseline
}

// mulberry32 returns the same stream for a given 32-bit seed on every target.
function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let n = Math.imul(state ^ (state >>> 15), state | 1)
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61)
    return ((n ^ (n >>> 14)) >>> 0) / 0x100000000
  }
}

function baselinePoints(path: Baseline): readonly Point[] {
  if (path.type === 'polyline') return path.points
  const steps = CONFIG.handwriting.curveSteps
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps
    const s = 1 - t
    return {
      x: s * s * path.p0.x + 2 * s * t * path.c.x + t * t * path.p1.x,
      y: s * s * path.p0.y + 2 * s * t * path.c.y + t * t * path.p1.y,
    }
  })
}

// Distance is measured along the line, so spacing stays even around tight bends.
// Continue along the final tangent when a word extends past the specified curve.
function baselineSampler(path?: Baseline) {
  const points = path ? baselinePoints(path) : []
  const segments: { from: Point; start: number; end: number; dx: number; dy: number }[] = []
  let distance = 0
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]
    const dx = points[i].x - from.x
    const dy = points[i].y - from.y
    const length = Math.hypot(dx, dy)
    if (length === 0) continue
    segments.push({ from, start: distance, end: distance + length, dx: dx / length, dy: dy / length })
    distance += length
  }

  return (offset: number) => {
    if (segments.length === 0) {
      return { x: (points[0]?.x ?? 0) + offset, y: points[0]?.y ?? 0, angle: 0 }
    }
    const segment = segments.find(piece => offset <= piece.end) ?? segments[segments.length - 1]
    const u = offset - segment.start
    return {
      x: segment.from.x + u * segment.dx,
      y: segment.from.y + u * segment.dy,
      angle: Math.atan2(segment.dy, segment.dx),
    }
  }
}

function emptyBounds(): Bounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
}

function includePoint(box: Bounds, x: number, y: number) {
  box.minX = Math.min(box.minX, x)
  box.maxX = Math.max(box.maxX, x)
  box.minY = Math.min(box.minY, y)
  box.maxY = Math.max(box.maxY, y)
}

/** Generate the world-space ink once, and pass these exact strokes to graphics and collision. */
export function layoutHandwriting(options: HandwritingOptions): Handwriting {
  const { text, seed, size, x = 0, y = 0, rotation = 0 } = options
  const height = typeof size === 'number' ? size : CONFIG.sizes[size]
  const config = CONFIG.handwriting
  const random = seededRandom(seed)
  const symmetric = (extent: number) => (2 * random() - 1) * extent
  const sample = baselineSampler(options.baseline)
  const cosLine = Math.cos(rotation)
  const sinLine = Math.sin(rotation)
  const glyphs: GlyphShape[] = []
  const bounds = emptyBounds()
  let pen = 0
  let index = 0
  for (const char of text) {
    const glyph = GLYPHS[char] ?? GLYPHS['?']
    const scale = config.scaleMin + random() * (config.scaleMax - config.scaleMin)
    const scaledHeight = height * scale
    const advance = glyph.advance * scaledHeight
    const center = sample(pen + advance / 2)
    const originX = x + center.x * cosLine - center.y * sinLine
    const originY = y + center.x * sinLine + center.y * cosLine
    const angle = rotation + center.angle + symmetric(config.rotationDeg) * Math.PI / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const offsetY = symmetric(config.baselineJitter) * height
    const jitter = config.vertexJitter * height
    const glyphBounds = emptyBounds()
    const seen = new Map<string, Point>()
    const strokes = glyph.strokes.map(stroke => stroke.map(vertex => {
      // Reuse jitter at a shared vertex so a closed O always closes and a T stays joined.
      const key = vertex.x + ',' + vertex.y
      const existing = seen.get(key)
      if (existing) return existing
      const localX = vertex.x * scaledHeight - advance / 2 + symmetric(jitter)
      const localY = (vertex.y - 1) * scaledHeight + offsetY + symmetric(jitter)
      const worldX = originX + localX * cos - localY * sin
      const worldY = originY + localX * sin + localY * cos
      const point = { x: worldX, y: worldY }
      seen.set(key, point)
      includePoint(glyphBounds, worldX, worldY)
      includePoint(bounds, worldX, worldY)
      return point
    }))
    if (!strokes.length) includePoint(glyphBounds, originX, originY)
    glyphs.push({ char, index, strokes, bounds: glyphBounds })
    pen += advance + config.letterSpacing * height
    index += char.length
  }
  if (!Number.isFinite(bounds.minX)) includePoint(bounds, x, y)
  return { glyphs, bounds }
}
