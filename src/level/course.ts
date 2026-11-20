import { type LineId, textForLine, UI, WORDS } from '../content/lines'
import type { CONFIG } from '../config'
import type { SoundLayout } from '../sound/NoiseSystem'
import { layoutHandwriting, type Baseline, type Bounds, type Point } from '../font/handwriting'

export interface CourseText {
  id: string
  text: string
  role: 'terrain' | 'note'
  x: number
  y: number
  size: keyof typeof CONFIG.sizes
  seed: number
  inkWidth?: number
  inkHeight?: number
  rotation?: number
  baseline?: Baseline
  oneWay?: boolean
  behavior?: 'bouncy' | 'crumbly' | 'nervous' | 'door'
  whenMissingLetters?: boolean
  glow?: boolean
  rearrange?: boolean
  collectible?: readonly number[]
  pointer?: Point
  lineId?: LineId
}

// Specified ink extents let a single punctuation mark span a full landing pad.
// Transform every glyph with the same affine map for rendering and all hit tests.
export function layoutCourseText(definition: CourseText) {
  const ink = layoutHandwriting(definition)
  if (!definition.inkWidth && !definition.inkHeight) return ink
  const { minX, maxX, minY, maxY } = ink.bounds
  const sx = definition.inkWidth && maxX !== minX ? definition.inkWidth / (maxX - minX) : 1
  const sy = definition.inkHeight && maxY !== minY ? definition.inkHeight / (maxY - minY) : 1
  const x = (value: number) => definition.inkWidth ? definition.x + (value - minX) * sx : value
  const y = (value: number) => definition.inkHeight ? definition.y + (value - maxY) * sy : value
  const box = (b: Bounds) => ({ minX: x(b.minX), maxX: x(b.maxX), minY: y(b.minY), maxY: y(b.maxY) })
  return {
    bounds: box(ink.bounds),
    glyphs: ink.glyphs.map(g => ({
      ...g, bounds: box(g.bounds), strokes: g.strokes.map(stroke => stroke.map(p => ({ x: x(p.x), y: y(p.y) }))),
    })),
  }
}

export interface CourseStation {
  id: string
  label: string
  spawn: Point
}

export interface SwordLayout {
  sourceId: string
  zone: {x0: number; x1: number; y0: number; y1: number}
  pivot: Point
  bridge: CourseText
  rope: CourseText
}

export interface CourseData {
  width: number
  height: number
  spawn: Point
  finishId: string
  sectionStarts?: readonly number[]
  stations: CourseStation[]
  texts: CourseText[]
  assists?: Readonly<Record<string, { lines: readonly LineId[]; leftId: string; rightId: string }>>
  sword?: SwordLayout
  sound?: SoundLayout
  killY?: number
  checkpoints?: readonly { id: string; spawn: Point }[]
  darkZone?: { x0: number; x1: number }
}

// M1 practice course. Coordinates mark pen baselines in world pixels, y down.
const texts: CourseText[] = [
  // 0.1–0.2 samples: the opening word and the large landmark.
  { id: 'here', role: 'terrain', lineId: 'T01', text: textForLine('T01'), x: 72, y: 490, size: 'L', seed: 11 },
  { id: 'here-note', role: 'note', lineId: 'N01', text: textForLine('N01'), x: 68, y: 302, rotation: -0.035, size: 'Note', seed: 100, pointer: { x: 147, y: 365 } },
  { id: 'platform', role: 'terrain', text: WORDS.platform, x: 350, y: 540, size: 'XL', seed: 12 },
  { id: 'platform-note', role: 'note', lineId: 'N02', text: textForLine('N02'), x: 485, y: 341, rotation: 0.015, size: 'Note', seed: 104 },
  { id: 'start-ledge', role: 'terrain', lineId: 'T08', text: textForLine('T08'), x: 162, y: 614, size: 'M', seed: 26, oneWay: true },

  // 0.3 sample: a lower word catches missed jumps between the steps.
  { id: 'step-low', role: 'terrain', text: WORDS.step, x: 1330, y: 460, size: 'M', seed: 17 },
  { id: 'step-high', role: 'terrain', text: WORDS.step, x: 1590, y: 418, size: 'M', seed: 23 },
  { id: 'recovery', role: 'terrain', lineId: 'T09', text: textForLine('T09'), x: 1240, y: 614, size: 'M', seed: 88, oneWay: true },

  // §11 M1: round cap, low horizontal stroke, and a flat top.
  { id: 'o', role: 'terrain', text: WORDS.o, x: 1860, y: 502, size: 'XL', seed: 28 },
  { id: 'l', role: 'terrain', text: WORDS.l, x: 2035, y: 427, size: 'L', seed: 31 },
  { id: 't', role: 'terrain', text: WORDS.t, x: 2200, y: 515, size: 'XL', seed: 32 },

  // 2.5 and 2.4 writing samples: a rising line and a shallow bowl.
  { id: 'slope', role: 'terrain', lineId: 'T06', text: textForLine('T06'), x: 2360, y: 464, size: 'S', seed: 300, rotation: -0.18, oneWay: true },
  {
    id: 'curve', role: 'terrain', lineId: 'T05', text: textForLine('T05'),
    x: 2964, y: 396, size: 'S', seed: 1216, oneWay: true,
    baseline: { type: 'quad', p0: { x: 0, y: 0 }, c: { x: 1224, y: 248 }, p1: { x: 2448, y: 0 } },
  },
  { id: 'next', role: 'terrain', text: WORDS.next, x: 5460, y: 486, size: 'XL', seed: 81 },
]

const stations: CourseStation[] = [
  { id: 'here', label: textForLine('T01'), spawn: { x: 169, y: 373 } },
  { id: 'step-low', label: WORDS.step, spawn: { x: 1400, y: 369 } },
  { id: 'o', label: WORDS.o, spawn: { x: 1910, y: 343 } },
  { id: 'l', label: WORDS.l, spawn: { x: 2078, y: 393 } },
  { id: 't', label: WORDS.t, spawn: { x: 2264, y: 353 } },
  { id: 'slope', label: UI.slope, spawn: { x: 2374, y: 385 } },
  { id: 'curve', label: UI.curve, spawn: { x: 2981, y: 319 } },
]

export const COURSE = {
  width: 6180,
  height: 850,
  spawn: stations[0].spawn,
  finishId: 'next',
  stations,
  texts,
} satisfies CourseData
