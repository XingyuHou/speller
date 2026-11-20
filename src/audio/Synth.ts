import { SOUND_CONFIG, SPELL_CONFIG, SYNTH } from '../config'
import type { Point } from '../font/handwriting'
import type { NoiseSystem } from '../sound/NoiseSystem'

type Cue = { [K in keyof typeof SYNTH]: typeof SYNTH[K] extends readonly number[] ? K : never }[keyof typeof SYNTH]

export class Synth {
  private context?: AudioContext
  private enabled = true
  private readonly last = new Map<Cue, number>()

  constructor() {
    window.addEventListener('keydown', this.unlock, true)
    window.addEventListener('pointerdown', this.unlock, true)
  }

  private readonly unlock = () => {
    if (!this.enabled || !window.AudioContext) return
    try {
      this.context ??= new AudioContext()
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch { /* Keep playing when the browser has no audio device. */ }
  }

  setEnabled(value: boolean) {
    this.enabled = value
    if (value) this.unlock()
    else if (this.context) void this.context.suspend().catch(() => {})
  }

  play(cue: Cue) {
    const ctx = this.context
    if (!this.enabled || ctx?.state !== 'running') return
    const now = ctx.currentTime
    if (now - (this.last.get(cue) ?? -Infinity) < SYNTH.minInterval) return
    this.last.set(cue, now)
    const [from, to, duration, volume] = SYNTH[cue]
    const voice = ctx.createOscillator()
    const envelope = ctx.createGain()
    voice.type = cue === 'step' || cue === 'pulse' || cue === 'spike' ? 'square' : 'triangle'
    if (cue === 'cut') voice.type = 'sawtooth'
    voice.frequency.setValueAtTime(from, now)
    voice.frequency.exponentialRampToValueAtTime(to, now + duration)
    envelope.gain.setValueAtTime(SYNTH.floor, now)
    envelope.gain.exponentialRampToValueAtTime(volume, now + SYNTH.attack)
    envelope.gain.exponentialRampToValueAtTime(SYNTH.floor, now + duration)
    voice.connect(envelope).connect(ctx.destination)
    voice.onended = () => { voice.disconnect(); envelope.disconnect() }
    voice.start(now)
    voice.stop(now + duration)
  }

  world(system: NoiseSystem, player: Point, quietBefore: number, quietAfter: number) {
    for (const event of system.events) {
      if (event.age === 0 && Math.hypot(event.x - player.x, event.y - player.y) <= SYNTH.hearDistance) this.play(event.kind)
    }
    for (const spike of system.spikes) {
      if (spike.age === 0 && Math.abs(spike.x + spike.width / 2 - player.x) <= SYNTH.hearDistance) this.play('spike')
    }
    if (system.nervous.some(n => n.age === 0) || system.grandpa?.remaining === SOUND_CONFIG.grandpaSleep) this.play('alert')
    if (quietAfter > 0 && quietAfter <= SPELL_CONFIG.urgentSeconds && Math.ceil(quietAfter) < Math.ceil(quietBefore)) this.play('urgent')
  }

  destroy() {
    window.removeEventListener('keydown', this.unlock, true)
    window.removeEventListener('pointerdown', this.unlock, true)
    if (this.context) void this.context.close().catch(() => {})
  }
}
