import { UNIT } from '../config'
import { CHAPTER_WORDS as CW, SOUND_WORDS as SW, SPELL_WORDS, textForLine, WORDS, type LineId } from '../content/lines'
import type { Point } from '../font/handwriting'
import type { SoundLayout } from '../sound/NoiseSystem'
import { layoutCourseText, type CourseStation, type CourseText } from './course'

/** Place the sound sections relative to the exit from the dark corridor. */
export function buildSoundCourse(startX: number) {
  const texts: CourseText[] = []
  const stations: CourseStation[] = []
  const checkpoints: {id: string; spawn: Point}[] = []
  const sound: SoundLayout = { spikes: [], metronomes: [], nervous: [] }
  const origin = Math.ceil(startX / UNIT) * UNIT
  const worldX = (x: number) => origin + x
  type Options = Partial<Omit<CourseText, 'id' | 'role' | 'text' | 'x' | 'y' | 'size' | 'seed'>>

  function word(id: string, text: string, x: number, y: number, size: CourseText['size'], seed: number, options: Options = {}) {
    const record: CourseText = { id, text, x: worldX(x), y, size, seed, role: 'terrain', ...options }
    texts.push(record)
    return record
  }
  function line(id: string, lineId: LineId, x: number, y: number, size: CourseText['size'], seed: number, options: Options = {}) {
    return word(id, textForLine(lineId), x, y, size, seed, { lineId, ...options })
  }
  function note(lineId: LineId, x: number, y: number, seed: number, whenMissingLetters = false) {
    texts.push({ id: 'note-' + lineId, text: textForLine(lineId), lineId, x: worldX(x), y, size: 'Note', role: 'note', seed, whenMissingLetters })
  }
  function dots(id: string, x: number, end: number, y: number) {
    return word(id, CW.dot.repeat(Math.ceil((end - x) / 15)), x, y, 'S', 72, { inkWidth: end - x, oneWay: true })
  }
  function save(id: string, label: string, x: number, y: number) {
    const record = word(id, CW.save, x, y, 'M', 200, { oneWay: true })
    const e = layoutCourseText(record).glyphs.at(-1)!.bounds
    const spawn = { x: (e.minX + e.maxX) / 2, y: e.minY - UNIT }
    checkpoints.push({ id, spawn })
    stations.push({ id, label, spawn })
  }
  function nervous(id: string, x: number, y: number, width: number, seed: number, hasLetter = false) {
    word(id, SW.nervous, x, y, 'M', seed, { behavior: 'nervous', inkWidth: width, collectible: hasLetter ? [0] : undefined })
    sound.nervous.push({ id, hearZone: {x: worldX(x + 24), y: y - 42, width: width - 48, height: 36} })
  }
  function clock(id: string, x: number, y: number, width: number, seed: number, sourceX: number, links: string[], withLetter = false) {
    const record = word(id, SW.clock, x, y, 'XL', seed, { inkWidth: width, collectible: withLetter ? [5] : undefined })
    sound.metronomes.push({ id, x: worldX(sourceX), y: withLetter ? layoutCourseText(record).bounds.minY - 18 : y + 6, links })
  }

  // 3. HELLO is underfoot; climb the LEDGE and the punctuation to reach HI.
  word('hello', SPELL_WORDS.hello, 52, 325, 'L', 41, { collectible: [2], oneWay: true })
  note('N10', 54, 139, 310)
  line('letter-ledge', 'T08', 425, 302, 'M', 311, { oneWay: true })
  word('letter-post', CW.post, 702, 322, 'XL', 312, { inkWidth: UNIT })
  word('hi', SPELL_WORDS.hi, 669, 193, 'M', 42, { collectible: [1], oneWay: true })
  dots('letter-floor', -30, 1220, 365)
  save('save-quiet', SPELL_WORDS.quiet, 928, 347)

  // 4a. SHHH and the three falling words above a shallow return route.
  word('quiet', SPELL_WORDS.quiet, 1216, 343, 'L', 43, { collectible: [0], oneWay: true })
  note('N12', 1232, 166, 320)
  nervous('nervous-1', 1532, 341, 234, 321)
  nervous('nervous-2', 1826, 333, 240, 322, true)
  nervous('nervous-3', 2120, 344, 239, 323)
  note('N13', 1560, 115, 324)
  line('downstairs', 'T09', 1540, 487, 'L', 325, { inkWidth: 885, oneWay: true })
  word('return-step', WORDS.step, 1380, 419, 'M', 326, { oneWay: true })
  dots('shallow-floor', 1198, 3585, 508)

  // 4a.2 Jump 4.5U from the last nervous word to collect E.
  word('leap', SPELL_WORDS.leap, 2359 + 4.5 * UNIT, 364, 'L', 45, { collectible: [1], oneWay: true })

  // 4a.3 The second T sits beneath the pendulum, clear of the demonstration spikes.
  clock('clock-lesson', 2825, 370, 572, 329, 3215, ['demo-spikes'], true)
  note('N14', 2784, 105, 330)
  // Beyond the highest normal jump from the clock, inside the 6U sound circle.
  sound.spikes.push({ id: 'demo-spikes', x: worldX(3304), y: 55, width: 75, height: 30 })
  save('save-listen', SW.listen, 3445, 376)
  note('N15', 3435, 252, 331, true)

  // 4b.1 Walk the hint, then use a chain of small drops above the sound-sensitive pits.
  line('listen-bridge', 'H02', 3658, 355, 'S', 332, { inkWidth: 1096, oneWay: true })
  const drops = [
    { id: 'drop-high', x: 4788, y: 356, width: 191 },
    { id: 'drop-mid', x: 5028, y: 388, width: 182 },
    { id: 'drop-low', x: 5270, y: 414, width: 195 },
  ]
  for (const [i, drop] of drops.entries()) {
    word(drop.id, WORDS.step, drop.x, drop.y, 'M', 340 + i, { inkWidth: drop.width, oneWay: true })
    if (i < drops.length - 1) {
      const from = drop.x + drop.width
      sound.spikes.push({ id: 'drop-spikes-' + i, x: worldX(from), y: drop.y + 8,
        width: drops[i + 1].x - from, height: 64,
        hearZone: { x: worldX(from - 22), y: drop.y + 84, width: drops[i + 1].x - from + 44, height: 32 } })
    }
  }

  // 4b.2 The overhead clock and spikes form a six-unit timed passage.
  dots('timed-floor', 5492, 5972, 392)
  clock('clock-corridor', 5594, 228, 285, 347, 5705, ['corridor-spikes'])
  sound.spikes.push({ id: 'corridor-spikes', x: worldX(5640), y: 345, width: 6 * UNIT, height: 58, upsideDown: true })

  // 4b.3 The higher TIPTOE route stays outside the lower hearing zone.
  word('tiptoe-step', WORDS.step, 6012, 375, 'M', 350, { inkWidth: 165, oneWay: true })
  line('tiptoe', 'T10', 6228, 327, 'M', 351, { inkWidth: 304, oneWay: true })
  line('low-ledge', 'T08', 6192, 479, 'M', 352, { inkWidth: 144, oneWay: true })
  word('low-step', WORDS.step, 6398, 471, 'M', 353, { inkWidth: 182, oneWay: true })
  sound.spikes.push({ id: 'low-spikes', x: worldX(6338), y: 463, width: 58, height: 56,
    hearZone: { x: worldX(6302), y: 552, width: 135, height: 32 } })
  word('exit-step', WORDS.step, 6590, 390, 'M', 354, { inkWidth: 163, oneWay: true })
  save('save-corridor-exit', textForLine('T10'), 6804, 380)

  // 5. H03 remains visible before the quiet start. The listening rectangle begins
  // beyond the SAVE. The last sprint from there to the door is about 75 units.
  line('silent-bridge', 'H03', 7040, 395, 'S', 360, { inkWidth: 1550, oneWay: true })
  save('save-sprint', SW.silent, 8642, 397)
  const sprint = 8820
  nervous('sprint-nervous-1', sprint + 34, 401, 230, 362)
  nervous('sprint-nervous-2', sprint + 318, 405, 214, 363)
  word('sprint-crumbly', CW.crumbly, sprint + 588, 407, 'M', 364, { behavior: 'crumbly', inkWidth: 350 })
  for (const [i, offset] of [1010, 1166, 1166 + UNIT + 5.2 * UNIT].entries()) {
    word('sprint-dot-' + i, CW.dot, sprint + offset, 357, 'M', 365 + i, { inkWidth: UNIT, oneWay: true })
  }
  dots('sprint-clock-floor', sprint + 1460, sprint + 1895, 371)
  clock('clock-sprint', sprint + 1580, 206, 250, 369, sprint + 1695, ['sprint-clock-spikes'])
  sound.spikes.push({ id: 'sprint-clock-spikes', x: worldX(sprint + 1608), y: 326, width: 6 * UNIT, height: 58, upsideDown: true })

  // 5.5 The final spring reaches the door's elevated approach. The closed word
  // reaches below the landing and higher than a bounce from the sprint floor.
  word('sprint-bouncy', CW.bouncy, sprint + 1936, 421, 'M', 371, { behavior: 'bouncy', inkWidth: 232 })
  word('door-landing', WORDS.step, sprint + 2204, 286, 'M', 372, { inkWidth: 192, oneWay: true })
  dots('door-floor', sprint + 2300, sprint + 2550, 270)
  word('grandpa', SW.grandpa, sprint + 896, 112, 'XL', 373)
  word('door', SW.door, sprint + 2399, 545, 'L', 374, { rotation: -Math.PI / 2, inkWidth: 87, inkHeight: 546, behavior: 'door' })
  sound.grandpa = { id: 'grandpa', doorId: 'door',
    hearZone: { x: worldX(sprint + 32), y: -128, width: 2480, height: 1024 } }
  const finish = word('next', WORDS.next, sprint + 2518, 346, 'XL', 376)
  const width = Math.ceil(layoutCourseText(finish).bounds.maxX + 580)
  return { texts, stations, checkpoints, sound, finishId: finish.id, width }
}
