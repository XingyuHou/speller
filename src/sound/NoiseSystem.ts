import { CONFIG, SOUND_CONFIG as rules } from '../config'
import type { Player } from '../player/Player'
import type { BehaviorTerrain, BehaviorWord } from '../world/behaviors/BehaviorTerrain'

export interface SoundRect { x: number; y: number; width: number; height: number }
export interface SpikeDefinition {
  id: string; x: number; y: number; width: number; height?: number; upsideDown?: boolean; hearZone?: SoundRect
}
export interface MetronomeDefinition { id: string; x: number; y: number; links: readonly string[] }
export interface NervousDefinition { id: string; hearZone: SoundRect }
export interface GrandpaDefinition { id: string; doorId: string; hearZone: SoundRect }
export interface SoundLayout {
  spikes: SpikeDefinition[]
  metronomes: MetronomeDefinition[]
  nervous: NervousDefinition[]
  grandpa?: GrandpaDefinition
}
export interface NoiseEvent {
  x: number; y: number; radius: number; age: number
  kind: 'step' | 'jump' | 'land' | 'pulse'
  source: 'player' | 'metronome'
}
export interface SpikeState extends SpikeDefinition { height: number; extension: number; age: number | null }
export interface MetronomeState extends MetronomeDefinition { remaining: number; period: number }
export interface NervousState extends NervousDefinition { age: number | null; fade: number; word?: BehaviorWord }
export interface GrandpaState extends GrandpaDefinition { awake: boolean; remaining: number }

export function circleHears(x: number, y: number, radius: number, zone: SoundRect): boolean {
  const dx = x - Math.max(zone.x, Math.min(zone.x + zone.width, x))
  const dy = y - Math.max(zone.y, Math.min(zone.y + zone.height, y))
  return dx * dx + dy * dy <= radius * radius
}

export function landingRadius(impactSpeed: number): number {
  const impulse = Math.min(1, Math.max(0, impactSpeed / CONFIG.physics.maxFallSpeed))
  return rules.landBaseRadius + impulse * rules.landExtraRadius
}

/** Intersect the actual triangular teeth drawn from this baseline, including partial extension. */
export function touchesSpikes(spike: SpikeState, x: number, y: number, half: number): boolean {
  const left = Math.max(x - half, spike.x)
  const right = Math.min(x + half, spike.x + spike.width)
  if (spike.extension <= 0 || left >= right) return false
  const depth = spike.upsideDown ? y - half - spike.y : spike.y - (y + half)
  if ((spike.upsideDown ? y + half <= spike.y : y - half >= spike.y) || depth >= spike.height * spike.extension) return false
  const count = Math.max(1, Math.ceil(spike.width / rules.spikeToothWidth))
  const width = spike.width / count
  const first = Math.max(0, Math.floor((left - spike.x) / width))
  const last = Math.min(count - 1, Math.floor((right - spike.x) / width))
  for (let i = first; i <= last; i++) {
    const middle = spike.x + (i + 0.5) * width
    const closest = Math.max(left, Math.min(right, middle))
    const toothHeight = spike.height * spike.extension * (1 - 2 * Math.abs(closest - middle) / width)
    if (depth < toothHeight) return true
  }
  return false
}

export class NoiseSystem {
  readonly events: NoiseEvent[] = []
  readonly spikes: SpikeState[]
  readonly metronomes: MetronomeState[]
  readonly nervous: NervousState[]
  readonly grandpa?: GrandpaState
  private readonly door?: BehaviorWord
  private readonly spikeById: Map<string, SpikeState>
  private dt = 0
  private previousX = 0
  private silent = false
  private walking = false
  private stepTime = 0
  private crossingDoor = false

  constructor(layout: SoundLayout | undefined, terrain: BehaviorTerrain) {
    const words = new Map(terrain.words.map(word => [word.definition.id, word]))
    this.spikes = (layout?.spikes ?? []).map(s => ({ ...s, height: s.height ?? rules.spikeHeight, extension: 0, age: null }))
    this.spikeById = new Map(this.spikes.map(s => [s.id, s]))
    this.metronomes = (layout?.metronomes ?? []).map(m => ({ ...m, period: rules.clockPeriod, remaining: rules.clockPeriod }))
    this.nervous = (layout?.nervous ?? []).map(n => ({ ...n, age: null, fade: 0, word: words.get(n.id) }))
    if (layout?.grandpa) {
      this.grandpa = { ...layout.grandpa, awake: false, remaining: 0 }
      this.door = words.get(layout.grandpa.doorId)
    }
    this.updateDoor()
  }

  preStep(worldSeconds: number, player: Player, silent: boolean): void {
    this.dt = Number.isFinite(worldSeconds) ? Math.max(0, worldSeconds) : 0
    this.previousX = player.x
    const expired = this.silent && !silent
    this.silent = silent
    for (let i = this.events.length - 1; i >= 0; i--) {
      this.events[i].age += this.dt
      if (this.events[i].age >= rules.pulseLife) this.events.splice(i, 1)
    }
    if (this.grandpa) {
      this.grandpa.remaining = Math.max(0, this.grandpa.remaining - this.dt)
      this.grandpa.awake = this.grandpa.remaining > 0
      if (expired && circleHears(player.x, player.y, 0, this.grandpa.hearZone)) this.wakeGrandpa()
      this.updateDoor()
    }
    for (const n of this.nervous) this.tickNervous(n)
    for (const spike of this.spikes) this.tickSpike(spike)
    for (const clock of this.metronomes) {
      clock.remaining -= this.dt
      while (clock.remaining <= 0) {
        clock.remaining += clock.period
        this.events.push({ x: clock.x, y: clock.y, radius: rules.clockRadius, age: 0, kind: 'pulse', source: 'metronome' })
        for (const id of clock.links) {
          const spike = this.spikeById.get(id)
          if (!spike) continue
          const rect = spike.hearZone ?? { x: spike.x, y: spike.upsideDown ? spike.y : spike.y - spike.height, width: spike.width, height: spike.height }
          if (circleHears(clock.x, clock.y, rules.clockRadius, rect)) this.triggerSpike(spike)
        }
      }
    }
  }

  postStep(player: Player): boolean {
    if (!this.silent) for (const event of player.motionEvents) {
      const radius = event.kind === 'jump' ? rules.jumpRadius : landingRadius(event.impactSpeed)
      this.emitPlayer(event.kind, event.x, event.y, radius)
    }
    const moved = player.x !== this.previousX
    const walking = !this.silent && moved && player.grounded
    if (walking) {
      this.stepTime += this.dt
      if (!this.walking || this.stepTime >= rules.stepPeriod) {
        this.emitPlayer('step', player.x, player.y + CONFIG.physics.playerSize / 2, rules.stepRadius)
        this.stepTime = this.walking ? this.stepTime % rules.stepPeriod : 0
      }
    } else this.stepTime = 0
    this.walking = walking
    this.checkDoorPassage(player)
    return this.spikes.some(spike => touchesSpikes(spike, player.x, player.y, CONFIG.physics.playerSize / 2))
  }

  private emitPlayer(kind: 'jump' | 'land' | 'step', x: number, y: number, radius: number): void {
    this.events.push({ kind, x, y, radius, age: 0, source: 'player' })
    for (const spike of this.spikes) {
      if (spike.hearZone && circleHears(x, y, radius, spike.hearZone)) this.triggerSpike(spike)
    }
    for (const n of this.nervous) {
      if (n.age === null && circleHears(x, y, radius, n.hearZone)) n.age = 0
    }
    if (this.grandpa && circleHears(x, y, radius, this.grandpa.hearZone)) this.wakeGrandpa()
  }

  private triggerSpike(spike: SpikeState): void {
    if (spike.age === null) spike.age = 0
  }

  private tickSpike(spike: SpikeState): void {
    if (spike.age === null) return
    spike.age += this.dt
    if (spike.age >= rules.spikeExtend + rules.spikeHold) {
      spike.age = null
      spike.extension = 0
    } else spike.extension = Math.min(1, spike.age / rules.spikeExtend)
  }

  private tickNervous(n: NervousState): void {
    if (n.age === null) {
      if (n.fade > 0) {
        n.fade = Math.max(0, n.fade - this.dt)
        n.word?.setMotion(0, 0, true, 1 - n.fade / rules.nervousFade)
      }
      return
    }
    n.age += this.dt
    if (n.age < rules.nervousShake) {
      const shake = rules.shakeWidth * Math.sin(n.age * rules.shakeHz * 2 * Math.PI)
      n.word?.setMotion(shake, 0, true, 1)
      return
    }
    const falling = n.age - rules.nervousShake
    if (falling < rules.nervousRespawn) {
      const alpha = Math.max(0, 1 - falling / rules.pulseLife)
      n.word?.setMotion(0, CONFIG.physics.gravity * falling * falling / 2, false, alpha)
    } else {
      n.age = null
      n.fade = Math.max(0, rules.nervousFade - (falling - rules.nervousRespawn))
      n.word?.setMotion(0, 0, true, 1 - n.fade / rules.nervousFade)
    }
  }

  private wakeGrandpa(): void {
    if (!this.grandpa) return
    this.grandpa.awake = true
    this.grandpa.remaining = rules.grandpaSleep
    this.updateDoor()
  }

  private updateDoor(): void {
    if (!this.door || !this.grandpa) return
    const open = !this.grandpa.awake || this.crossingDoor
    const rise = this.door.bounds.maxY - this.door.bounds.minY + rules.doorLiftMargin
    this.door.setMotion(0, open ? -rise : 0, true, 1)
  }

  private checkDoorPassage(player: Player): void {
    if (!this.door || !this.grandpa) return
    const half = CONFIG.physics.playerSize / 2
    const west = this.door.bounds.minX - half
    const east = this.door.bounds.maxX + half
    if (this.crossingDoor) {
      if (player.x <= west || player.x >= east) {
        this.crossingDoor = false
        this.updateDoor()
      }
      return
    }
    if (player.x <= west || this.previousX >= east || player.x <= this.previousX) return
    if (this.silent && !this.grandpa.awake) {
      // The gate stays open until the square clears it in either direction.
      this.crossingDoor = true
      return
    }
    // The exit is a vertical crossing plane even when approached over the
    // doorframe. Waiting immediately before it cannot bypass the quiet passage.
    this.wakeGrandpa()
    player.x = Math.max(west, this.previousX)
    player.vx = 0
  }

  reset(): void {
    this.events.length = 0
    this.walking = false
    this.stepTime = 0
    this.silent = false
    this.crossingDoor = false
    for (const s of this.spikes) { s.age = null; s.extension = 0 }
    for (const m of this.metronomes) m.remaining = m.period
    for (const n of this.nervous) { n.age = null; n.fade = 0; n.word?.setMotion(0, 0, true, 1) }
    if (this.grandpa) { this.grandpa.awake = false; this.grandpa.remaining = 0 }
    this.updateDoor()
  }
}
