// Author copy mirrors the ID, current text and approval state in docs/AUTHOR_LINES.md.
type LineStatus = '已批准' | '已修改' | '待审' | '待写' | '已删除'

export const LINES = {
  H01: { text: "TOO DARK TO SEE ANYTHING? THE LIGHT LIES WITHIN THE PALM OF YOUR HAND.", status: "已批准" },
  H02: { text: "SOMETIMES YOU NEED TO LISTEN BEFORE YOU MOVE.", status: "已批准" },
  H03: { text: "KNOWING WHEN TO LISTEN IS USEFUL. KNOWING WHEN TO BE SILENT IS BETTER.", status: "已批准" },
  T01: { text: "HERE", status: "待审" },
  T02: { text: "MIND THE / GAP", status: "待审" },
  T03: { text: "DON'T FALL.", status: "待审" },
  T04: { text: "SOME FLOOR / MORE FLOOR / STILL FLOOR", status: "待审" },
  T05: { text: "THIS SENTENCE IS UNNECESSARILY LONG BECAUSE THE GAP IS UNNECESSARILY WIDE.", status: "待审" },
  T06: { text: "WHERE AM I GOING?", status: "待审" },
  T07: { text: "FINALLY", status: "待审" },
  T08: { text: "LEDGE", status: "待审" },
  T09: { text: "DOWNSTAIRS", status: "待审" },
  T10: { text: "TIPTOE", status: "待审" },
  N01: { text: "You are here. Obviously.", status: "待审" },
  N02: { text: "Yes, you can stand on words. Don't make it weird.", status: "待审" },
  N03: { text: "told you.", status: "待审" },
  N04: { text: "Pause for dramatic effect.", status: "待审" },
  N05: { text: "Too high? Read the floor.", status: "待审" },
  N06: { text: "Keep moving. Seriously.", status: "待审" },
  N07: { text: "Light blue words can be rearranged. Drag the letters up there. SPACE to cast.", status: "待审" },
  N08: { text: "I, I, I. It's all about me.", status: "待审" },
  N09: { text: "Thanks, LAMP. You're free now.", status: "待审" },
  N10: { text: "Yellow letters can be taken. Press S. (They stay. We're not thieves.)", status: "待审" },
  N11: { text: "Collected letters stay up here. Shuffle them anytime.", status: "待审" },
  N12: { text: "Quiet area. Mostly.", status: "待审" },
  N13: { text: "They get nervous when you land loudly.", status: "待审" },
  N14: { text: "It's not you. It's the clock. (Sometimes it's you.)", status: "待审" },
  N15: { text: "Missing something? Six letters. Count them.", status: "待审" },
  N16: { text: "More words coming. Probably.", status: "待审" },
  C01: { text: "WHO'S THERE?!", status: "待审" },
  C02: { text: "Z z z", status: "待审" },
  S01: { text: "Not here. Not now.", status: "待审" },
  S02: { text: "Shh. Still recharging.", status: "待审" },
  E01: { text: "That's just your hand.", status: "待审" },
  E02: { text: "Wrong season.", status: "待审" },
  E03: { text: "He'll be back. (He won't.)", status: "待审" },
  E04: { text: "Technically correct. Useless, but correct.", status: "待审" },
  E05: { text: "Organized. I like that.", status: "待审" },
  E06: { text: "Generous.", status: "待审" },
  E07: { text: "Caught you.", status: "待审" },
  E08: { text: "—", status: "待写" },
  L01: { text: "L: someone's saying hello", status: "待审" },
  L02: { text: "I: up high, saying hi", status: "待审" },
  L03: { text: "S: where it's quiet", status: "待审" },
  L04: { text: "N: somewhere nervous", status: "待审" },
  L05: { text: "E: take a leap", status: "待审" },
  L06: { text: "T: ask the clock", status: "待审" },
  F01: { text: "That's not a word. I checked.", status: "待审" },
  F02: { text: "Bless you.", status: "待审" },
  F03: { text: "Even I can't read that.", status: "待审" },
  F04: { text: "Close. Not really.", status: "待审" },
  F05: { text: "Is that a password?", status: "待审" },
  D01: { text: "You again?", status: "待审" },
  D02: { text: "The floor is right there.", status: "待审" },
  D03: { text: "—", status: "待写" },
  D04: { text: "—", status: "待写" },
  D05: { text: "（本段无危险，可不需要）", status: "待写" },
  D06: { text: "—", status: "待写" },
  D07: { text: "—", status: "待写" },
  D08: { text: "—", status: "待写" },
  D09: { text: "Fine. Here's a comma.", status: "待审" },
} as const satisfies Record<string, { text: string; status: LineStatus }>

export type LineId = keyof typeof LINES

export function textForLine(id: LineId): string {
  const line: { text: string; status: LineStatus } = LINES[id]
  if (line.status === '已删除') return ''
  if (line.status === '待写') return `[TODO: ${id}]`
  return line.text
}

// Functional terrain, section names, and interface labels are gameplay strings.
export const WORDS = {
  platform: 'PLATFORM',
  step: 'STEP',
  o: 'O',
  l: 'L',
  t: 'T',
  next: 'NEXT',
} as const

export const UI = {
  title: 'SPELLER',
  course: 'Practice course',
  move: 'Move',
  jump: 'Jump',
  reset: 'Restart',
  debug: 'Collision view',
  pause: 'Pause',
  resume: 'Resume',
  paused: 'Paused',
  complete: 'Course complete',
  replay: 'Play again',
  stage: 'Section',
  jumpTo: 'Jump to section',
  grounded: 'Grounded',
  airborne: 'Airborne',
  speed: 'Speed',
  fps: 'FPS',
  spellBar: 'Spell bar',
  game: 'Speller practice course',
  keyboard: 'Controls',
  skip: 'Skip to game',
  slope: 'Slope',
  curve: 'Curve',
  lab: 'Spell lab',
  chapter: 'Tutorial',
  chapterComplete: 'DEMO COMPLETE',
  collect: 'Collect',
  returnToLetters: 'Return to letters',
  revisitWords: 'Play the WORDS bridge',
  startOver: 'Start from HERE',
  sound: 'Sound effects',
  grantLetters: 'Give letters',
  grantSpells: 'Give spells',
  invincible: 'Invincible',
  fly: 'Fly through ink (W / S)',
  debugRun: 'Debug run / saving paused',
  space: 'SPACE',
  sKey: 'S',
  undo: 'Undo',
  undoShortcut: 'Undo (Ctrl/Cmd + Z)',
  deleteKey: 'DEL',
  deleteLetter: 'Delete collected letter (Backspace)',
  cast: 'Cast',
  bulletTime: 'Bullet time',
  highlightLines: 'Highlight unapproved lines',
} as const

// Functional words and punctuation used in the isolated spelling practice room.
export const SPELL_WORDS = {
  palm: 'PALM',
  hello: 'HELLO',
  hi: 'HI',
  quiet: 'SHHH',
  leap: 'LEAP',
  ellipsis: '...',
} as const

export const SWORD_WORDS = { words: 'WORDS', sword: 'SWORD', rope: 'ROPE', bridge: 'BRIDGE' } as const

export const CHAPTER_WORDS = {
  save: 'SAVE',
  bouncy: 'BOUNCY',
  crumbly: 'CRUMBLY',
  post: '!',
  comma: ',',
  dot: '.',
  pillar: 'I',
} as const

export const DEMO_UI = {
  complete: 'DEMO COMPLETE',
  time: 'Time',
  deaths: 'Deaths',
  spells: 'Spells',
  eggs: 'Eggs',
} as const

export const SOUND_WORDS = {
  nervous: 'NERVOUS',
  clock: 'TICK TOCK',
  listen: 'LISTEN',
  silent: 'SILENT',
  grandpa: 'GRANDPA',
  door: 'DOOR',
} as const

export const EGG_UI = { list: 'LIST', rating: '10/10', close: 'Close' } as const
