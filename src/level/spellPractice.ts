import { SPELL_WORDS, textForLine, WORDS } from '../content/lines'
import type { CourseData, CourseStation, CourseText } from './course'

// Standalone spelling lab. The story introduces yellow letters in its third section.
const stations: CourseStation[] = [
  { id: 'here', label: textForLine('T01'), spawn: { x: 163, y: 368 } },
  { id: 'palm', label: SPELL_WORDS.palm, spawn: { x: 372, y: 358 } },
  { id: 'hello', label: SPELL_WORDS.hello, spawn: { x: 806, y: 364 } },
  { id: 'hi', label: SPELL_WORDS.hi, spawn: { x: 1128, y: 366 } },
  { id: 'quiet', label: SPELL_WORDS.quiet, spawn: { x: 1231, y: 362 } },
  { id: 'finally', label: textForLine('T07'), spawn: { x: 1654, y: 368 } },
  { id: 'leap', label: SPELL_WORDS.leap, spawn: { x: 2122, y: 362 } },
  { id: 'step', label: WORDS.step, spawn: { x: 2410, y: 360 } },
]

const texts: CourseText[] = [
  { id: 'here', role: 'terrain', text: textForLine('T01'), lineId: 'T01', size: 'L', x: 70, y: 480, seed: 11 },
  { id: 'palm', role: 'terrain', text: SPELL_WORDS.palm, rearrange: true, size: 'L', x: 348, y: 480, seed: 30 },
  { id: 'load-note', role: 'note', text: textForLine('N07'), lineId: 'N07', size: 'Note', x: 72, y: 264, seed: 80 },
  { id: 'hello', role: 'terrain', text: SPELL_WORDS.hello, collectible: [2], size: 'L', x: 660, y: 480, seed: 41 },
  { id: 'collect-note', role: 'note', text: textForLine('N10'), lineId: 'N10', size: 'Note', x: 716, y: 326, seed: 81 },
  { id: 'hi', role: 'terrain', text: SPELL_WORDS.hi, collectible: [1], size: 'L', x: 1036, y: 480, seed: 42 },
  { id: 'quiet', role: 'terrain', text: SPELL_WORDS.quiet, collectible: [0], size: 'L', x: 1200, y: 480, seed: 43 },
  { id: 'finally', role: 'terrain', text: textForLine('T07'), lineId: 'T07', collectible: [2], size: 'L', x: 1505, y: 480, seed: 44 },
  { id: 'leap', role: 'terrain', text: SPELL_WORDS.leap, collectible: [1], size: 'L', x: 2023, y: 480, seed: 45 },
  { id: 'step', role: 'terrain', text: WORDS.step, collectible: [1], size: 'L', x: 2314, y: 480, seed: 46 },
  { id: 'next', role: 'terrain', text: WORDS.next, size: 'L', x: 2630, y: 480, seed: 47 },

  // Close spacing turns the dots into a lower catch surface in both directions.
  { id: 'ellipsis-floor', role: 'terrain', text: SPELL_WORDS.ellipsis.repeat(68), size: 'S', x: 0, y: 510, seed: 70, oneWay: true },
]

export const SPELL_PRACTICE: CourseData = {
  width: 3130,
  height: 780,
  spawn: stations[0].spawn,
  stations,
  // In this practice room the player can drop onto the dots or jump back
  // through a word to collect a missed letter from either side.
  texts: texts.map(object => object.role === 'terrain' ? { ...object, oneWay: true } : object),
  finishId: 'next',
  darkZone: { x0: 0, x1: 650 },
}
