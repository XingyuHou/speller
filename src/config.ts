export const UNIT = 32

export const CONFIG = {
  unit: UNIT,
  view: { width: 1280, height: 720 },
  sizes: { XL: 4 * UNIT, L: 2.5 * UNIT, M: 1.6 * UNIT, S: 1.25 * UNIT, Note: 20 },
  colors: {
    void: 0x000000, terrain: 0xf2f2f2, note: 0x7a7a7a, collectible: 0xffe27a,
    collected: 0x7cff8a, rearrange: 0x8fd8ff, hazard: 0xff5a5a, lamp: 0xfff4d0,
    player: 0xffffff, debugSolid: 0x69ddc6, debugOneWay: 0xd8a5ff,
  },
  handwriting: {
    rotationDeg: 5, scaleMin: 0.92, scaleMax: 1.08, baselineJitter: 0.04,
    vertexJitter: 0.03, letterSpacing: 0.16, curveSteps: 80,
  },
  ink: { XL: 5, L: 4.5, M: 4, S: 3.5, Note: 1.6 },
  notePointer: {
    shaft: [[-44, -56], [-43, -44], [-38, -32], [-28, -19], [-15, -8], [0, 0]],
    head: [[-13, -1], [0, 0], [-5, -12]],
  },
  physics: {
    playerSize: 24, maxRunSpeed: 260, groundAcceleration: 2200, groundDeceleration: 2600,
    airControl: 0.8, gravity: 1800, jumpSpeed: 640, jumpCutMultiplier: 0.45,
    maxFallSpeed: 900, coyoteTime: 0.10, jumpBuffer: 0.12, maxSlopeDegrees: 50,
    groundSnap: 8, slopeProbe: 8,
  },
  collision: { cellSize: 4, minStrokeWidth: 10, strokePadding: 6 },
  simulation: { step: 1 / 120, maxFrame: 0.08 },
  camera: { lookAhead: 3 * UNIT, deadZone: 2 * UNIT, chapterHeadroom: 8 * UNIT, followRate: 6, playerAnchor: 0.32, verticalAnchor: 0.56 },
  debug: { solidAlpha: 0.48, gridGap: 0.6, margin: 128, boxStroke: 1, panelUpdateInterval: 0.12 },
  ui: { labelHeight: 13, labelSeed: 17, labelPen: 0.105, boldPen: 0.15, brandHeight: 30, headingHeight: 32, smallHeight: 10, keyHeight: 12 },
  playerInk: { glowInsets: [7, 4, 2], glowAlpha: [0.025, 0.055, 0.11] },
} as const

export const SPELL_VIEW_CONFIG = {
  letterHeight: 23,
  buttonHeight: 10,
  slotSize: 39,
  slotGap: 6,
  dragThreshold: 4,
  dropMargin: 35,
  snapMs: 140,
  burstMs: 450,
  messageMs: 2700,
  highlightColor: 0xff00ff,
} as const

export const COLLECT_PROMPT = { size: 18, pen: 2, seed: 37, lift: 26, bob: 3, frequency: 6, depth: 12 } as const

export const SPELL_CONFIG = {
  capacity: 8,
  collectionRadius: 1.5 * UNIT,
  loadSeconds: 0.3,
  feedbackSeconds: 0.3,
  dragScale: 0.4,
  releaseSeconds: 0.15,
  silentSeconds: 12,
  urgentSeconds: 3,
  cooldownSeconds: 2,
} as const

export const BEHAVIOR_CONFIG = {
  bounceSpeed: 980,
  squashFraction: 0.32,
  squashSeconds: 0.24,
  crumbleDelay: 0.35,
  crumbleRespawn: 3,
  regrowSeconds: 0.16,
  regrowInitialWidth: 0.3,
  bodyDepthFraction: 0.24,
  crackFlashHz: 7,
  crackFlashDepth: 0.22,
  debrisPieces: 3,
  debrisSpeedX: 56,
  debrisSpeedY: 42,
  debrisSpin: 1.4,
  debrisVisibleSeconds: 0.8,
  debugDepth: 1.5,
} as const

export const CHAPTER_FX = {
  depth: { debris: 2, save: 2, mask: 5, lamp: 6, glow: 7, debugMask: 9, debugPlayer: 10 },
  baseRadius: 2 * UNIT,
  lampRadius: 9 * UNIT,
  lampGrowSeconds: 1.2,
  fadeSeconds: 0.35,
  innerClear: 0.70,
  softEdge: 0.87,
  softEdgeOpacity: 0.37,
  warmOpacity: 0.07,
  lampLift: 1.2 * UNIT,
  lampBobbing: 2.5,
  lampSway: 0.06,
  lampFrequency: 3.5,
  lampPen: 2.2,
  lampDepart: {
    flickerSeconds: 0.46, flashCount: 2, dim: 0.13,
    flySeconds: 1.4, driftX: 2.8 * UNIT, driftY: CONFIG.view.height + 2 * UNIT,
  },
  saveStepSeconds: 0.085,
  saveFlashSeconds: 0.19,
  saveFlashWidth: 1.6,
  deathSeconds: 0.4,
  debris: { speedX: 94, up: 145, lowerUp: 66, gravity: 510, spin: 4.2, scale: 0.83 },
} as const

export const SPELL_GUIDE = {
  pen: 1.7, noteInset: 18, tipGap: 11, nearDistance: 520, minLength: 52,
  height: 0.085, bend: 0.44, headLength: 12, headWidth: 5, depth: 8,
} as const

export const NOISE_VIEW = {
  revealSeconds: 0.8, wavePen: 2.25, waveAlpha: 0.7,
  scopeDash: 10, scopeGap: 7, scopePen: 1.6, scopeAlpha: 0.51,
  spikeDot: 1.65, spikePen: 2.25,
  spikeFlashLift: 12, spikeIndicatorRange: 0.45,
  exclaimHeight: 16, exclaimSeconds: 0.4, exclaimLift: 12,
  pendulumLength: 39, pendulumSwing: 0.53, pendulumWeight: 5,
  clockArc: 15, clockArcOffset: 25, clockStroke: 1.8,
  grandpaLift: 26, grandpaPen: 2.2, grandpaSeed: 144,
  outlineWidth: 2.25, effectsDepth: 3, outlineDepth: 4,
  footLife: 0.19, footSpread: 7, footSize: 2,
} as const

export const SOUND_CONFIG = {
  stepPeriod: 0.25,
  stepRadius: 1.5 * UNIT,
  jumpRadius: 3 * UNIT,
  landBaseRadius: 3 * UNIT,
  landExtraRadius: 4 * UNIT,
  pulseLife: 0.55,
  spikeExtend: 0.12,
  spikeHold: 1,
  spikeHeight: UNIT,
  spikeToothWidth: UNIT / 2,
  clockPeriod: 2.4,
  clockRadius: 6 * UNIT,
  nervousShake: 0.6,
  nervousRespawn: 4,
  shakeWidth: 3,
  shakeHz: 14,
  nervousFade: 0.25,
  grandpaSleep: 3,
  doorLiftMargin: UNIT,
} as const

// [initial Hz, final Hz, seconds, peak gain] for the short, synthesized pen sounds.
export const SYNTH = {
  attack: 0.004, floor: 0.0001, minInterval: 0.022, hearDistance: 13 * UNIT,
  step: [104, 56, 0.038, 0.018], jump: [180, 420, 0.09, 0.043],
  land: [125, 44, 0.086, 0.058], pulse: [910, 560, 0.055, 0.046],
  spike: [240, 70, 0.105, 0.045], alert: [190, 260, 0.14, 0.042],
  urgent: [980, 980, 0.045, 0.035], collect: [540, 860, 0.13, 0.056],
  cut: [820, 130, 0.085, 0.045], spell: [320, 960, 0.24, 0.065], egg: [750, 510, 0.15, 0.045],
  save: [375, 625, 0.15, 0.042], death: [215, 38, 0.22, 0.064],
  finish: [435, 870, 0.48, 0.070],
} as const

export const BOIL = { period: 0.12, amplitude: 1 } as const
export const EGG_FX = {
  depth: 8, pen: 2, lift: 42, commentLift: 4 * UNIT, effectFade: 0.32, playerHalf: CONFIG.physics.playerSize / 2,
  palmSeconds: 1.65, waveSpeed: 13, waveAngle: 0.32,
  tinselSeconds: 8, tinselFall: 0.8, tinselRange: 260, tinselGap: 22, tinselSag: 12,
  ribbon: [0xb89ac7, 0xc6a484, 0x8bbcb0], fallGravity: 520,
  saluteSeconds: 0.9, soldierRiseSeconds: 0.24, marchSpeed: 412, marchBeat: 13, soldierMax: 12,
  puddleSeconds: 2, splashSeconds: 0.72, puddleWidth: 68, dropCount: 9,
  listSeconds: 10, netSeconds: 1.6, netCast: 0.28, netBurst: 0.85, ratingSeconds: 1.65,
  water: 0x9eb3bb, neutral: 0xdeddd9, scriptSeed: 658, ratingHeight: 21, ratingRise: 8,
  words: {
    duration: 2.4, delay: 0.15, lifetime: 1.8, glyphHeight: 13, radius: 11,
    drift: 54, rise: 76, wobble: 3.5, sway: 4, reveal: 0.12, fade: 0.34,
  },
} as const

export const DEATH_ASSIST = {
  firstNoteAt: 3,
  commaAt: 6,
  commaWidth: UNIT,
  commaDrop: UNIT / 2,
  noteOffsetX: UNIT / 2,
  noteLift: UNIT,
  seed: 891,
} as const

export const TRANSITIONS = { respawnMs: 180, menuMs: 220, resultsMs: 550, respawnOpacity: 0.32 } as const

export const SWORD_BRIDGE = {
  course: {
    descentX: 228, descentY: 338, descentWidth: 165,
    wordsGap: 49, wordsY: 427, wordsWidth: 270,
    hingeX: 780, hingeY: 448, deckSpan: 336, deckHeight: 52,
    ropeFromHinge: 27, ropeTop: 6, ropeGlyphHeight: 22, ropeGap: 5,
    shoreX: 1200, shoreY: 383, shoreWidth: 175,
    riseGap: 30, riseY: 318, riseWidth: 145, farCheckpointX: 1600,
    zonePadding: UNIT, zoneHeadroom: 4 * UNIT,
  },
  raisedAngle: -Math.PI / 2,
  cutSeconds: 0.22,
  flourishSeconds: 0.42,
  fallSeconds: 0.72,
  localMargin: UNIT,
  bladeLength: 47,
  bladeWidth: 5,
  gripLength: 11,
  guardWidth: 9,
  arcStart: -1.2,
  arcEnd: 1.15,
  pen: 2,
  hintSize: 0.43,
  hintAlpha: 0.63,
  hintLift: 24,
} as const
