import type Phaser from 'phaser'
import { CONFIG, EGG_FX as fx, SPELL_VIEW_CONFIG } from '../../config'
import { EGG_UI, LINES, SWORD_WORDS, textForLine, type LineId } from '../../content/lines'
import { layoutHandwriting, type Point } from '../../font/handwriting'
import { inkLabel } from '../../ui/inkLabel'
import type { WorldText } from '../../world/TextObject'
import type { EggName } from '../spells'
import './eggs.css'

type Graphics = Phaser.GameObjects.Graphics
type Anchor = { object: WorldText; points: Point[] }
type Effect = { kind: EggName; age: number; origin: Point; anchors: Anchor[] }

const clues: readonly [string, LineId][] = [
  ['L', 'L01'], ['I', 'L02'], ['S', 'L03'], ['T', 'L06'], ['E', 'L05'], ['N', 'L04'],
]
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const wave = Math.sin
const durations: Record<EggName, number> = {
  PALM: fx.palmSeconds, TINSEL: fx.tinselSeconds + fx.tinselFall, ENLIST: fx.soldierMax,
  INLETS: fx.puddleSeconds, LIST: fx.listSeconds, TEN: fx.ratingSeconds, NET: fx.netSeconds,
  WORDS: fx.words.duration,
}

// Artwork is a set of original local pen paths. Effects read the world and never write to its hit masks.
function path(g: Graphics, x: number, y: number, vertices: number[][], rotation = 0) {
  const cos = Math.cos(rotation), sin = Math.sin(rotation)
  g.strokePoints(vertices.map(([a,b]) => ({ x:x + a * cos - b * sin, y:y + a * sin + b * cos })))
}

export function checklistRows(collected: ReadonlySet<string>) {
  return clues.map(([char, id]) => ({ char, id, found: collected.has(char), text: collected.has(char) ? char : textForLine(id) || char }))
}

export class EggEffects {
  private readonly g: Graphics
  private readonly active = new Map<EggName, Effect>()
  private readonly sheet = document.createElement('section')
  private readonly rows = document.createElement('ul')
  private readonly rating = layoutHandwriting({ text: EGG_UI.rating, size: fx.ratingHeight, seed: fx.scriptSeed })
  private readonly bubbleLetters = Array.from(SWORD_WORDS.words, (char, index) =>
    layoutHandwriting({ text: char, size: fx.words.glyphHeight, seed: fx.scriptSeed + index }).glyphs[0])
  private collected = new Set<string>()
  private highlight = false
  private playing = true

  constructor(private readonly scene: Phaser.Scene, stage: HTMLElement, private readonly objects: readonly WorldText[]) {
    this.g = scene.add.graphics().setDepth(fx.depth).setVisible(false)
    this.sheet.className = 'egg-checklist'
    this.sheet.setAttribute('aria-label', EGG_UI.list)
    this.sheet.setAttribute('aria-live', 'polite')
    this.sheet.hidden = true
    const head = document.createElement('header')
    const title = document.createElement('h3')
    title.append(inkLabel(EGG_UI.list, CONFIG.ui.labelHeight, true))
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'egg-checklist-close'
    close.setAttribute('aria-label', EGG_UI.close)
    close.addEventListener('click', () => this.closeList())
    head.append(title, close)
    this.sheet.append(head, this.rows)
    stage.append(this.sheet)
  }

  trigger(kind: EggName, player: Point, letters: readonly string[]) {
    const origin = { x: player.x, y: player.y + fx.playerHalf }
    const anchors: Anchor[] = []
    if (kind === 'TINSEL') {
      for (const object of this.objects) {
        if (object.definition.role !== 'terrain') continue
        const offset = object.getTransform?.() ?? { x: 0, y: 0, available: true }
        if (!offset.available) continue
        const points = object.glyphs.filter(g => g.strokes.length > 0)
          .map(g => ({ x: (g.bounds.minX + g.bounds.maxX) / 2, y: g.bounds.minY }))
          .filter(p => Math.hypot(p.x + offset.x - origin.x, p.y + offset.y - origin.y) <= fx.tinselRange)
        if (!points.length) continue
        if (points.length === 1) {
          const p = points[0]
          points.unshift({ x: p.x - fx.tinselGap, y: p.y })
          points.push({ x: p.x + fx.tinselGap, y: p.y })
        }
        anchors.push({ object, points })
      }
    }
    const words = anchors.filter(anchor => /[a-z]/i.test(anchor.object.definition.text))
    this.active.set(kind, { kind, age: 0, origin, anchors: words.length ? words : anchors })
    if (kind === 'LIST') this.setLetters(letters)
  }

  setLetters(letters: readonly string[]) {
    this.collected = new Set(letters)
    if (!this.active.has('LIST')) return
    this.rows.replaceChildren(...checklistRows(this.collected).map(({id, found, text}) => {
      const row = document.createElement('li')
      row.className = found ? 'is-found' : ''
      const box = document.createElement('span')
      box.className = 'egg-check'
      box.setAttribute('role', 'checkbox')
      box.setAttribute('aria-readonly', 'true')
      box.setAttribute('aria-label', text)
      box.setAttribute('aria-checked', String(found))
      const color = found ? CONFIG.colors.collected :
        (this.highlight && LINES[id].status !== '已批准' ? SPELL_VIEW_CONFIG.highlightColor : CONFIG.colors.note)
      row.append(box, inkLabel(text, CONFIG.ui.smallHeight, false, '#' + color.toString(16).padStart(6,'0')))
      return row
    }))
    this.sheet.hidden = !this.playing
  }

  setHighlight(value: boolean) {
    this.highlight = value
    if (this.active.has('LIST')) this.setLetters([...this.collected])
  }

  setPlaying(value: boolean) {
    this.playing = value
    this.sheet.hidden = !value || !this.active.has('LIST')
  }

  private closeList() { this.sheet.hidden = true; this.active.delete('LIST') }

  advance(dt: number) {
    for (const [kind, effect] of this.active) {
      effect.age += dt
      if (effect.age < durations[kind]) continue
      this.active.delete(kind)
      if (kind === 'LIST') this.sheet.hidden = true
    }
  }

  render(player: Point) {
    if (!this.active.size && !this.g.visible) return
    const g = this.g.clear().setVisible(this.active.size > 0)
    if (!this.active.size) return
    for (const effect of this.active.values()) {
      const a = effect.age
      const alpha = clamp((durations[effect.kind] - a) / fx.effectFade)
      g.lineStyle(fx.pen, fx.neutral, alpha).fillStyle(fx.neutral, alpha)
      switch (effect.kind) {
        case 'PALM': {
          const wrist = player.y - fx.lift
          const angle = fx.waveAngle * wave(a * fx.waveSpeed)
          path(g, player.x, wrist, [[-6,5],[-11,-2],[-16,-11],[-15,-15],[-12,-15],[-7,-9],
            [-9,-24],[-7,-27],[-5,-24],[-3,-13],[-3,-30],[-1,-32],[1,-29],[1,-13],
            [3,-28],[5,-30],[7,-27],[5,-12],[9,-23],[11,-23],[12,-20],[9,-4],[5,5],[-6,5]], angle)
          path(g, player.x, wrist, [[-5,-8],[-1,-5],[0,-1]], angle)
          break
        }
        case 'TINSEL': this.garlands(effect); break
        case 'ENLIST': this.soldier(effect); break
        case 'INLETS': this.puddle(effect); break
        case 'TEN': {
          const x = player.x - (this.rating.bounds.minX + this.rating.bounds.maxX) / 2
          const y = player.y - fx.lift - a * fx.ratingRise
          for (const glyph of this.rating.glyphs) for (const line of glyph.strokes) {
            g.strokePoints(line.map(p => ({ x: x + p.x, y: y + p.y })))
          }
          break
        }
        case 'NET': this.net(effect, player); break
        case 'WORDS': this.wordBubbles(effect); break
        case 'LIST': break
      }
    }
  }

  private wordBubbles({ age, origin }: Effect) {
    const settings = fx.words
    this.bubbleLetters.forEach((glyph, index) => {
      const t = age - index * settings.delay
      if (t <= 0 || t >= settings.lifetime) return
      const fraction = t / settings.lifetime
      const alpha = clamp(t / settings.reveal) * clamp((settings.lifetime - t) / settings.fade)
      const spread = 2 * index / (this.bubbleLetters.length - 1) - 1
      const x = origin.x + spread * settings.drift * fraction + Math.sin(index + t * settings.sway) * settings.wobble
      const y = origin.y - fx.lift - settings.rise * fraction
      const { minX, maxX, minY, maxY } = glyph.bounds
      const dx = x - (minX + maxX) / 2
      const dy = y - (minY + maxY) / 2
      this.g.lineStyle(fx.pen, fx.neutral, alpha).strokeCircle(x, y, settings.radius)
      for (const stroke of glyph.strokes) this.g.strokePoints(stroke.map(p => ({ x: p.x + dx, y: p.y + dy })))
    })
  }

  private garlands({age, anchors}: Effect) {
    const g = this.g
    const fall = Math.max(0, age - fx.tinselSeconds)
    const dip = fx.fallGravity * fall * fall / 2
    const alpha = 1 - clamp(fall / fx.tinselFall)
    for (const {object, points} of anchors) {
      const transform = object.getTransform?.()
      if (transform && !transform.available) continue
      const ox = transform?.x ?? 0, oy = (transform?.y ?? 0) + dip
      for (let i = 1; i < points.length; i++) {
        const left = points[i - 1], right = points[i]
        const steps = Math.max(2, Math.ceil(Math.hypot(right.x-left.x, right.y-left.y) / fx.tinselGap))
        let previous = { x: left.x + ox, y: left.y + oy }
        for (let j = 1; j <= steps; j++) {
          const t = j / steps
          const x = ox + left.x + (right.x - left.x) * t
          const y = oy + left.y + (right.y - left.y) * t + Math.sin(Math.PI * t) * fx.tinselSag
          g.lineStyle(1, fx.neutral, alpha * .7).lineBetween(previous.x, previous.y, x, y)
          const color = fx.ribbon[(i+j) % fx.ribbon.length]
          const twinkle = alpha * (.78 + .22 * wave(age * 6 + i + j))
          g.fillStyle(color, twinkle).fillTriangle(x, y + 1, x + 4, y + 5, x + 1, y + 9)
          g.lineStyle(fx.pen, color, twinkle)
          path(g,x,y,[[0,0],[3,5],[0,9],[-2,5]])
          previous = {x,y}
        }
      }
    }
  }

  private soldier(effect: Effect) {
    const {age, origin} = effect
    const march = Math.max(0, age - fx.saluteSeconds)
    const x = origin.x + 29 + march * fx.marchSpeed
    const cam = this.scene.cameras.main
    if (march > 0 && x > cam.scrollX + cam.width + 40) { this.active.delete('ENLIST'); return }
    const swing = march > 0 ? wave(march * fx.marchBeat) : 0
    const rise = 1 - clamp(age / fx.soldierRiseSeconds)
    const y = origin.y + rise * 22 - Math.abs(swing) * 2
    this.g.lineStyle(fx.pen, fx.neutral, 1 - rise).fillStyle(fx.neutral, 1 - rise)
    this.g.strokeCircle(x, y - 33, 5)
    path(this.g,x,y,[[-6,-35],[-5,-40],[4,-40],[6,-35],[9,-35],[-6,-35]])
    path(this.g,x,y,[[0,-28],[0,-13],[-4-swing*5,-7],[-5-swing*9,0]])
    path(this.g,x,y,[[0,-13],[3+swing*5,-7],[5+swing*9,0]])
    path(this.g,x,y,[[-1,-26],[-6-swing*4,-19],[-5-swing*8,-13]])
    if (march === 0) path(this.g,x,y,[[0,-26],[9,-25],[5,-34]])
    else path(this.g,x,y,[[0,-26],[6+swing*4,-20],[8+swing*8,-21]])
  }

  private puddle({age, origin}: Effect) {
    const g = this.g
    const t = clamp(age / fx.puddleSeconds)
    const width = fx.puddleWidth * (.35 + .65 * Math.min(1, t * 3))
    g.lineStyle(fx.pen, fx.water, 1 - t * t)
    g.strokeEllipse(origin.x, origin.y + 3, width, width * .18)
    g.lineStyle(1, fx.water, (1 - t) * .8).strokeEllipse(origin.x - 4, origin.y + 3, width * .57, width * .08)
    const splash = clamp(age / fx.splashSeconds)
    if (splash >= 1) return
    for (let i = 0; i < fx.dropCount; i++) {
      const dir = i % 2 === 0 ? -1 : 1
      const x = origin.x + dir * (8 + i * 5) * splash
      const y = origin.y - (22 + (i % 4) * 8) * Math.sin(Math.PI * splash)
      g.fillStyle(fx.water, 1 - splash).fillCircle(x, y, 1.6 + (i % 2))
    }
  }

  private net({age}: Effect, player: Point) {
    const swelling = clamp(age / fx.netCast)
    const burst = clamp((age - fx.netBurst) / (fx.netSeconds - fx.netBurst))
    const width = 18 + 9 * swelling + 25 * burst
    const height = 24 + 35 * burst
    const y = player.y + (1 - swelling) * 15 + 17 * burst * burst
    this.g.lineStyle(fx.pen, fx.neutral, 1 - burst)
    if (burst === 0) this.g.strokeEllipse(player.x, y - 9, width * 2, 11)
    for (const direction of [-1,1]) {
      for (let i = -2; i <= 2; i++) {
        const a = i / 3
        const kick = direction * burst * (i + 3)
        const top = [a * width, -9]
        const mid = [(a + direction * .28) * width * .8 + kick, 1 + burst * 8]
        const bottom = [(a + direction * .43) * width * .48 + kick * 2, height - Math.abs(i) * 3]
        path(this.g, player.x, y, burst > .1 ? [mid,bottom] : [top,mid,bottom])
      }
    }
    if (burst < .1) path(this.g,player.x,y,[[-width,-9],[-width*.70,15],[-width*.35,22],[0,25],[width*.35,22],[width*.70,15],[width,-9]])
  }

  reset() { this.active.clear(); this.g.clear().setVisible(false); this.closeList() }
  destroy() { this.reset(); this.g.destroy(); this.sheet.remove() }
}
