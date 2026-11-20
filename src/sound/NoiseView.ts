import type Phaser from 'phaser'
import { CONFIG, NOISE_VIEW as ink, SOUND_CONFIG, SPELL_VIEW_CONFIG } from '../config'
import { LINES, textForLine, type LineId } from '../content/lines'
import { layoutHandwriting, type Bounds, type Point } from '../font/handwriting'
import type { NoiseSystem } from './NoiseSystem'

type Graphics = Phaser.GameObjects.Graphics
type Rect = { x: number; y: number; width: number; height: number }
interface InkObject { definition: { id: string }; bounds: Bounds }

const turn = Math.PI * 2
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
let serial = 0

function grayExceptSignalColors() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.position = 'absolute'
  const id = 'speller-silent-ink-' + ++serial
  // Saturate the world to grayscale, then composite the red and green ink back
  // on top. Relative channel tests retain translucent signal rings and anti-aliased edges.
  svg.innerHTML = '<defs><filter id="' + id + '" color-interpolation-filters="sRGB">' +
    '<feColorMatrix type="saturate" values="0" result="gray"/>' +
    '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  24 -36 0 0 0" result="red"/>' +
    '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -18 24 -14 0 0" result="green"/>' +
    '<feComposite in="red" in2="green" operator="arithmetic" k2="1" k3="1" result="signals"/>' +
    '<feComposite in="SourceGraphic" in2="signals" operator="in" result="color"/>' +
    '<feMerge><feMergeNode in="gray"/><feMergeNode in="color"/></feMerge></filter></defs>'
  document.body.append(svg)
  return { svg, filter: 'url(#' + id + ')' }
}

function intersects(a: Rect, b: Rect) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

function distanceTo(zone: Rect, point: Point) {
  return Math.hypot(Math.max(zone.x - point.x, 0, point.x - zone.x - zone.width),
    Math.max(zone.y - point.y, 0, point.y - zone.y - zone.height))
}

function dashEdge(g: Graphics, x: number, y: number, length: number, vertical: boolean) {
  for (let pos = 0; pos < length; pos += ink.scopeDash + ink.scopeGap) {
    const end = Math.min(pos + ink.scopeDash, length)
    if (vertical) g.lineBetween(x, y + pos, x, y + end)
    else g.lineBetween(x + pos, y, x + end, y)
  }
}

/** Consumes the simulation's sound events and mechanism states; all motion follows world time. */
export class NoiseView {
  private readonly g: Graphics
  readonly outline: Graphics
  private readonly calm = grayExceptSignalColors()
  private readonly words = new Map<string, Bounds>()
  private readonly sleeping: Graphics
  private readonly awake: Graphics
  private listening = false
  private silent = false
  private revealAge = Infinity
  private origin: Point = { x: 0, y: 0 }

  constructor(private readonly scene: Phaser.Scene, private readonly system: NoiseSystem, objects: readonly InkObject[]) {
    this.g = scene.add.graphics().setDepth(ink.effectsDepth)
    for (const o of objects) this.words.set(o.definition.id, o.bounds)
    const size = CONFIG.physics.playerSize
    this.outline = scene.add.graphics().lineStyle(ink.outlineWidth, CONFIG.colors.player)
      .strokeRect(-size / 2, -size / 2, size, size).setDepth(ink.outlineDepth).setVisible(false)
    this.sleeping = scene.add.graphics().setDepth(ink.effectsDepth).setVisible(false)
    this.awake = scene.add.graphics().setDepth(ink.effectsDepth).setVisible(false)
    this.setHighlight(false)
  }

  setHighlight(enabled: boolean) {
    const paint = (g: Graphics, id: LineId, color: number) => {
      g.clear()
      const grandpa = this.system.grandpa
      const bounds = grandpa && this.words.get(grandpa.id)
      const text = textForLine(id)
      if (!bounds || !text) return
      const label = layoutHandwriting({ text, size: 'Note', seed: ink.grandpaSeed })
      const c = enabled && LINES[id].status !== '已批准' ? SPELL_VIEW_CONFIG.highlightColor : color
      g.lineStyle(ink.grandpaPen, c).fillStyle(c)
      for (const glyph of label.glyphs) for (const stroke of glyph.strokes) {
        g.strokePoints(stroke)
        for (const p of stroke) g.fillCircle(p.x, p.y, ink.grandpaPen / 2)
      }
      g.setPosition((bounds.minX + bounds.maxX - label.bounds.minX - label.bounds.maxX) / 2, bounds.minY - ink.grandpaLift)
    }
    paint(this.sleeping, 'C02', CONFIG.colors.note)
    paint(this.awake, 'C01', CONFIG.colors.hazard)
  }

  private alert(x: number, y: number, age: number) {
    if (age < 0 || age > ink.exclaimSeconds) return
    const t = age / ink.exclaimSeconds
    const top = y - ink.exclaimLift * t - ink.exclaimHeight
    this.g.lineStyle(ink.wavePen, CONFIG.colors.hazard, 1 - t).lineBetween(x, top, x, top + ink.exclaimHeight * 0.6)
    this.g.fillStyle(CONFIG.colors.hazard, 1 - t).fillCircle(x, top + ink.exclaimHeight, ink.spikeDot)
  }

  private scope(zone: Rect | undefined, screen: Rect, radius: number, debug: boolean) {
    if (!zone || !intersects(zone, screen) || (!debug && (!this.listening || distanceTo(zone, this.origin) > radius))) return
    const { x, y, width, height } = zone
    this.g.lineStyle(ink.scopePen, CONFIG.colors.hazard, ink.scopeAlpha)
    dashEdge(this.g, x, y, width, false)
    dashEdge(this.g, x, y + height, width, false)
    dashEdge(this.g, x, y, height, true)
    dashEdge(this.g, x + width, y, height, true)
  }

  render(dt: number, player: Point, listen: boolean, silent: boolean, dying = false, debug = false) {
    if (listen && !this.listening) {
      this.origin = { x: player.x, y: player.y }
      this.revealAge = 0
    }
    this.listening = listen
    if (!listen) this.revealAge = Infinity
    this.revealAge += Math.max(0, dt)
    if (silent !== this.silent) {
      this.scene.game.canvas.style.filter = silent ? this.calm.filter : ''
      this.silent = silent
    }
    this.outline.setVisible(silent && !dying).setPosition(player.x, player.y)
    const cam = this.scene.cameras.main
    const screen: Rect = { x: cam.scrollX, y: cam.scrollY, width: cam.width, height: cam.height }
    const t = this.revealAge / ink.revealSeconds
    const radius = t >= 1 ? Infinity : Math.hypot(screen.width, screen.height) * t
    this.g.clear()
    if (listen && t < 1) this.g.lineStyle(ink.wavePen, CONFIG.colors.terrain, 1 - t)
      .strokeCircle(this.origin.x, this.origin.y, radius)

    const system = this.system
    const red = CONFIG.colors.hazard
    for (const spike of system.spikes) {
      this.scope(spike.hearZone, screen, radius, debug)
      if (spike.x + spike.width < screen.x || spike.x > screen.x + screen.width) continue
      const teeth = Math.max(1, Math.ceil(spike.width / SOUND_CONFIG.spikeToothWidth))
      const pitch = spike.width / teeth
      const direction = spike.upsideDown ? 1 : -1
      const tip = spike.y + direction * spike.height * spike.extension
      this.g.lineStyle(ink.spikePen, red).fillStyle(red)
      for (let i = 0; i < teeth; i++) {
        const a = spike.x + i * pitch
        const mid = a + pitch / 2
        if (spike.extension <= 0) this.g.fillCircle(mid, spike.y, ink.spikeDot)
        else this.g.strokePoints([{x:a, y:spike.y}, {x:mid, y:tip}, {x:a+pitch, y:spike.y}])
      }
      const center = spike.x + spike.width / 2
      if (spike.age !== null) this.alert(center, spike.y - ink.exclaimLift, spike.age)
      if (listen) {
        const linked = system.metronomes.find(clock => clock.links.includes(spike.id))
        if (linked) {
          const warning = 1 - clamp01(linked.remaining / ink.spikeIndicatorRange)
          this.g.fillStyle(red, 0.25 + 0.75 * warning)
            .fillCircle(center, spike.y - ink.spikeFlashLift, ink.spikeDot * (1 + warning))
        }
      }
    }

    for (const clock of system.metronomes) {
      if (clock.x + ink.pendulumLength < screen.x || clock.x - ink.pendulumLength > screen.x + screen.width) continue
      const fraction = clamp01(clock.remaining / clock.period)
      const angle = Math.sin(fraction * turn) * ink.pendulumSwing
      const endX = clock.x + Math.sin(angle) * ink.pendulumLength
      const endY = clock.y + Math.cos(angle) * ink.pendulumLength
      this.g.lineStyle(ink.clockStroke, CONFIG.colors.terrain).lineBetween(clock.x, clock.y, endX, endY)
      this.g.fillStyle(CONFIG.colors.terrain).fillCircle(endX, endY, ink.pendulumWeight)
      this.g.fillCircle(clock.x, clock.y, ink.spikeDot)
      if (listen) {
        this.g.lineStyle(ink.clockStroke, red, 0.25).strokeCircle(clock.x + ink.clockArcOffset, clock.y, ink.clockArc)
        this.g.lineStyle(ink.clockStroke, red).beginPath()
          .arc(clock.x + ink.clockArcOffset, clock.y, ink.clockArc, -Math.PI / 2, -Math.PI / 2 + turn * fraction)
          .strokePath()
      }
    }

    for (const n of system.nervous) {
      this.scope(n.hearZone, screen, radius, debug)
      if (n.age !== null) {
        const bounds = this.words.get(n.id)
        this.alert(bounds ? (bounds.minX + bounds.maxX) / 2 : n.hearZone.x + n.hearZone.width / 2,
          bounds ? bounds.minY - ink.exclaimLift : n.hearZone.y, n.age)
      }
    }
    const grandpa = system.grandpa
    this.sleeping.setVisible(!!grandpa && !grandpa.awake)
    this.awake.setVisible(!!grandpa?.awake)
    if (grandpa) this.scope(grandpa.hearZone, screen, radius, debug)

    for (const event of system.events) {
      if (event.source === 'player' && silent) continue
      if (event.x + event.radius < screen.x || event.x - event.radius > screen.x + screen.width) continue
      const age = clamp01(event.age / SOUND_CONFIG.pulseLife)
      if (event.kind === 'step' && event.age < ink.footLife) {
        const p = event.age / ink.footLife
        this.g.fillStyle(CONFIG.colors.terrain, (1 - p) * 0.5)
        for (const side of [-1, 1]) this.g.fillRect(event.x + side * ink.footSpread * p, event.y - ink.footSpread * p, ink.footSize, ink.footSize)
      }
      if (listen) {
        const color = event.source === 'metronome' ? red : CONFIG.colors.terrain
        this.g.lineStyle(ink.wavePen, color, ink.waveAlpha * (1 - age))
          .strokeCircle(event.x, event.y, event.radius * Math.min(1, age * 1.5))
      }
    }
  }

  reset() {
    this.revealAge = Infinity
    this.g.clear()
    this.scene.game.canvas.style.filter = ''
    this.silent = false
    this.outline.setVisible(false)
  }

  destroy() {
    this.reset()
    this.calm.svg.remove()
    for (const object of [this.g, this.outline, this.awake, this.sleeping]) object.destroy()
  }
}
