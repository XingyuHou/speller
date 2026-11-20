import { SWORD_BRIDGE, UNIT } from '../config'
import { buildSoundCourse } from './soundCourse'
import { CHAPTER_WORDS as CW, SPELL_WORDS, SWORD_WORDS, WORDS, textForLine, type LineId } from '../content/lines'
import { layoutCourseText, type CourseData, type SwordLayout, type CourseStation, type CourseText } from './course'
import type { Point } from '../font/handwriting'

const texts: CourseText[] = []
const stations: CourseStation[] = []
const checkpoints: { id: string; spawn: Point }[] = []
let edge = 60
type Size = CourseText['size']
type Extras = Partial<Pick<CourseText, 'lineId' | 'rotation' | 'baseline' | 'oneWay' | 'behavior' | 'glow' | 'rearrange' | 'inkWidth' | 'inkHeight'>>

// A gap is measured from the preceding word's ink edge, not its string length.
function terrain(id: string, text: string, size: Size, y: number, seed: number, gap: number, extras: Extras = {}) {
  const object: CourseText = { id, text, size, x: edge + gap, y, seed, role: 'terrain', ...extras }
  const ink = layoutCourseText(object)
  edge = ink.bounds.maxX
  texts.push(object)
  return { ...object, bounds: ink.bounds, glyphs: ink.glyphs }
}

function note(lineId: LineId, x: number, y: number, seed: number, glow = false) {
  texts.push({ id: 'note-' + lineId, text: textForLine(lineId), lineId, x, y, seed, size: 'Note', role: 'note', glow })
}

// A close row of punctuation catches missed practice jumps and allows a return jump.
function catchDots(id: string, x: number, end: number, y: number, slope = 0) {
  texts.push({ id, text: CW.dot.repeat(Math.ceil((end - x) / 15)), x, y, role: 'terrain', seed: 121, size: 'S',
    inkWidth: end - x, rotation: slope, oneWay: true })
}

function station(id: string, label: string, spawn: Point) {
  stations.push({ id, label, spawn })
}

function save(id: string, label: string, y: number, seed: number, gap: number, glow = false) {
  const word = terrain(id, CW.save, 'M', y, seed, gap, { glow })
  const e = word.glyphs.at(-1)!.bounds
  const spawn = { x: (e.minX + e.maxX) / 2, y: e.minY - UNIT }
  checkpoints.push({ id, spawn })
  station(id, label, spawn)
  return word
}

// 0.1 HERE — safe starting runway.
const here = terrain('here', textForLine('T01'), 'L', 588, 11, 0, { lineId: 'T01' })
const spawn = { x: here.x + 98, y: here.y - 124 }
station('here', here.text, spawn)
note('N01', here.x, 352, 100)
texts[texts.length - 1].pointer = { x: spawn.x - 22, y: spawn.y - 8 }

// 0.2 PLATFORM.
const platform = terrain('platform', WORDS.platform, 'XL', 636, 12, 28)
note('N02', platform.x + 110, 418, 104)
catchDots('start-catch', 0, edge + 72, 668)

// 0.3 STEP — three ascending steps, a safe standard-distance rehearsal, and recovery below.
const firstStep = terrain('step-1', WORDS.step, 'M', 542, 17, 64)
terrain('step-2', WORDS.step, 'M', 494, 23, 64)
terrain('step-3', WORDS.step, 'M', 446, 25, 64)
terrain('step-practice', WORDS.step, 'M', 446, 21, 134)
catchDots('steps-catch', firstStep.x - 60, edge, 640, -0.15)

// 0.4 MIND THE / GAP: the first lethal void, 3.5U.
const [mindText, gapText] = textForLine('T02').split(' / ')
terrain('mind', mindText, 'M', 446, 70, 72, { lineId: 'T02' })
catchDots('practice-catch', edge - 450, edge, 492)
const gap = terrain('gap', gapText, 'M', 446, 71, 3.5 * UNIT, { lineId: 'T02' })
note('N03', gap.x - 112, 693, 89)

// 0.5 Three punctuation pads: 3U / 4U / 4.5U.
for (const [i, distance] of [3, 4, 4.5].entries()) {
  terrain('dot-' + i, CW.dot, 'M', 399, 110 + i, distance * UNIT, { oneWay: true, inkWidth: UNIT })
}
note('N04', gap.x + 120, 287, 98)

// 0.6 BOUNCY and a six-unit wall with a standable cap.
const bouncy = terrain('bouncy', CW.bouncy, 'M', 452, 86, 48, { behavior: 'bouncy' })
station('bouncy', CW.bouncy, {x: bouncy.x + 12, y: bouncy.bounds.minY - UNIT})
const wall = terrain('wall', CW.post, 'XL', bouncy.bounds.minY, 130, 42, { inkHeight: 6 * UNIT, inkWidth: UNIT })
note('N05', wall.x - 55, wall.bounds.minY - 55, 95)

// 0.7 CRUMBLY — a twelve-unit bridge, each letter collapses separately.
const crumbly = terrain('crumbly', CW.crumbly, 'M', wall.bounds.minY + 50, 105, 8, { behavior: 'crumbly', inkWidth: 12 * UNIT })
note('N06', crumbly.x + 20, crumbly.bounds.minY - 63, 106)

// 0.8 DON'T FALL. — the period projects out over the final gap.
const [dont, originalDot] = [textForLine('T03').slice(0, -1), textForLine('T03').slice(-1)]
terrain('dont-fall', dont, 'M', 326, 65, 48, { lineId: 'T03' })
terrain('last-dot', originalDot, 'M', 326, 66, 6, { lineId: 'T03', inkWidth: UNIT, oneWay: true })

// 1 Dark entrance. The entire dark teaching stretch has a lower recovery route.
const darkStart = save('save-dark', textForLine('T04').split(' / ')[0], 379, 100, 4 * UNIT)
const phrases = textForLine('T04').split(' / ')
for (const [i, floor] of phrases.entries()) {
  terrain('dark-floor-' + i, floor, 'M', 389, 93 + i, 26, { lineId: 'T04', oneWay: true })
}

// 1 H01 bridge: only the PALM in the author's sentence turns blue.
const hint = textForLine('H01')
const palmIndex = hint.indexOf(SPELL_WORDS.palm)
const lead = terrain('hint-lead', hint.slice(0, palmIndex), 'S', 386, 144, 18,
  { lineId: 'H01', rotation: -0.065, oneWay: true, glow: true })
const hintEndY = lead.y + (edge - lead.x) * Math.tan(-0.065)
const palmSave = save('save-palm', SPELL_WORDS.palm, hintEndY + 62, 129, 8, true)
const palm = terrain('palm', SPELL_WORDS.palm, 'L', hintEndY + 39, 30, 20, { lineId: 'H01', rearrange: true, glow: true, inkWidth: 6 * UNIT })
note('N07', palm.x - 130, palm.bounds.minY - 110, 138, true)
// Wrap the rest of H01 onto the lower return route. Lighting the lamp now
// immediately reveals the first suspended STEP above and to the right.
edge = palm.bounds.maxX - 410
const suffix = terrain('hint-tail', hint.slice(palmIndex + SPELL_WORDS.palm.length), 'S', hintEndY + 152, 148, 0,
  { lineId: 'H01', oneWay: true, glow: true })
catchDots('dark-floor-catch', darkStart.x, lead.x + 30, 444)
catchDots('hint-catch', lead.x - 20, palmSave.x, lead.y + 55, -0.065)
catchDots('palm-catch', suffix.x - 25, palm.bounds.maxX, hintEndY + 189)
edge = palm.bounds.maxX

// 2.1 Illuminated STEP staircase, comfortable three-unit jumps.
let stepY = hintEndY + 6
for (let i = 0; i < 3; i++) {
  stepY -= 48
  terrain('lamp-step-' + i, WORDS.step, 'M', stepY, 160 + i, (i === 0 ? 1.5 : 3) * UNIT)
}

// 2.2–2.3 Five I pillars and the midpoint SAVE.
const pillarOffsets = [0, 38, 0, -36, 8]
let firstPillarX = 0
for (const [i, offset] of pillarOffsets.entries()) {
  const column = terrain('pillar-' + i, CW.pillar, 'M', stepY + offset, 170 + i, 4 * UNIT, { inkWidth: UNIT })
  if (!i) firstPillarX = column.x
}
note('N08', firstPillarX, stepY - 125, 177)
save('save-pillars', CW.pillar, stepY + 20, 183, 65)

// 2.4 The full author sentence follows two halves of a shallow bowl;
// the missing three units of bridge sit at the bottom, between whole words.
const bridge = textForLine('T05')
const split = bridge.indexOf(' BECAUSE')
terrain('bridge-left', bridge.slice(0, split), 'S', stepY + 24, 1216, 54,
  { lineId: 'T05', oneWay: true, baseline: { type: 'quad', p0: {x: 0, y: 0}, c: {x: 600, y: 168}, p1: {x: 1200, y: 168} } })
terrain('bridge-right', bridge.slice(split).trimStart(), 'S', stepY + 192, 405, 3 * UNIT,
  { lineId: 'T05', oneWay: true, inkWidth: 1164, baseline: { type: 'quad', p0: {x: 0, y: 0}, c: {x: 650, y: 0}, p1: {x: 1300, y: -120} } })

// 2.5 WHERE AM I GOING? — the final hook leads into the last standard jump.
const question = textForLine('T06')
const questionY = stepY + 119
terrain('where', question.slice(0, -1), 'S', questionY, 1894, 34, { lineId: 'T06', oneWay: true, rotation: -0.09, inkWidth: 468 })
terrain('question-hook', question.slice(-1), 'XL', questionY + 45, 193, 5, { lineId: 'T06' })

// 2.6 FINALLY, then the safe entrance to section 3.
const finallyWord = terrain('finally', textForLine('T07'), 'L', questionY + 15, 44, 4.5 * UNIT, { lineId: 'T07' })
note('N09', finallyWord.x + 25, finallyWord.bounds.minY - 70, 199)
const swordSave = save('save-sword', SWORD_WORDS.words, questionY + 5, 200, 44)

// 2.7 WORDS → SWORD. The two independent banks remain out of jumping range
// while BRIDGE hangs upright. A lowered BRIDGE carries the player either way.
const puzzle = SWORD_BRIDGE.course
edge = swordSave.x
terrain('sword-descent', WORDS.step, 'M', puzzle.descentY, 403, puzzle.descentX, { inkWidth: puzzle.descentWidth, oneWay: true })
const source = terrain('words', SWORD_WORDS.words, 'L', puzzle.wordsY, 404, puzzle.wordsGap,
  { inkWidth: puzzle.wordsWidth, oneWay: true, rearrange: true })
const pivot = { x: swordSave.x + puzzle.hingeX, y: puzzle.hingeY }
const sword: SwordLayout = {
  sourceId: source.id, pivot,
  zone: {
    x0: source.x - puzzle.zonePadding, x1: pivot.x + puzzle.zonePadding,
    y0: source.bounds.minY - puzzle.zoneHeadroom, y1: source.y + puzzle.zonePadding,
  },
  // Local straight-baseline seed; rotate these same pen paths around the hinge.
  bridge: {id: 'sword-bridge', role: 'terrain', text: SWORD_WORDS.bridge, x: 0, y: 0,
    size: 'M', seed: 418, inkWidth: puzzle.deckSpan, inkHeight: puzzle.deckHeight, oneWay: true},
  rope: {id: 'sword-rope', role: 'terrain', text: SWORD_WORDS.rope, x: pivot.x - puzzle.ropeFromHinge,
    y: puzzle.ropeTop, size: 'S', seed: 412},
}
edge = swordSave.x
terrain('sword-landing', textForLine('T08'), 'M', puzzle.shoreY, 407, puzzle.shoreX, { lineId: 'T08', inkWidth: puzzle.shoreWidth, oneWay: true })
terrain('sword-rise', WORDS.step, 'M', puzzle.riseY, 408, puzzle.riseGap, { inkWidth: puzzle.riseWidth, oneWay: true })
edge = swordSave.x
const letterStart = save('save-exit', SPELL_WORDS.hello, questionY + 5, 200, puzzle.farCheckpointX)

const later = buildSoundCourse(edge)

export const CHAPTER1: CourseData = {
  sectionStarts: [0, darkStart.x, palm.bounds.maxX, letterStart.x,
    later.texts.find(t => t.id === 'save-quiet')!.x, later.texts.find(t => t.id === 'silent-bridge')!.x],
  width: later.width, height: 980, killY: 890, spawn,
  texts: [...texts, ...later.texts], stations: [...stations, ...later.stations],
  checkpoints: [...checkpoints, ...later.checkpoints], finishId: later.finishId, sound: later.sound, sword,
  darkZone: { x0: darkStart.x, x1: finallyWord.x },
  assists: {
    start: { lines: ['D01', 'D02'], leftId: 'dot-1', rightId: 'dot-2' },
    'save-dark': { lines: ['D03'], leftId: 'dark-floor-0', rightId: 'dark-floor-1' },
    'save-palm': { lines: ['D04'], leftId: 'pillar-2', rightId: 'pillar-3' },
    'save-pillars': { lines: ['D04'], leftId: 'bridge-left', rightId: 'bridge-right' },
    'save-sword': { lines: ['D04'], leftId: 'sword-rise', rightId: 'save-exit' },
    'save-exit': { lines: ['D05'], leftId: 'letter-ledge', rightId: 'hi' },
    'save-quiet': { lines: ['D06'], leftId: 'nervous-3', rightId: 'leap' },
    'save-listen': { lines: ['D07'], leftId: 'tiptoe-step', rightId: 'tiptoe' },
    'save-corridor-exit': { lines: ['D07'], leftId: 'save-corridor-exit', rightId: 'silent-bridge' },
    'save-sprint': { lines: ['D08'], leftId: 'sprint-dot-1', rightId: 'sprint-dot-2' },
  },
}
