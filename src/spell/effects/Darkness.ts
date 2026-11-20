import type Phaser from 'phaser'
import { CONFIG, CHAPTER_FX as fx } from '../../config'
import type { Point } from '../../font/handwriting'

interface Zone { x0: number; x1: number }
const saturate = (value: number) => Math.max(0, Math.min(1, value))
const ease = (t: number) => t * t * (3 - 2 * t)

/** World-time state shared by the Canvas renderer and the lighting regression tests. */
export class DarknessState {
  alpha = 0
  radius: number = fx.baseRadius
  lampVisible = false
  lampAlpha = 1
  lampAngle = 0
  lampPosition: Point = { x: 0, y: 0 }
  private age = 0
  private growth = 0
  private inside?: boolean
  private departure: { age: number; x: number; y: number } | null = null

  constructor(private readonly zone: Zone) {}

  advance(seconds: number, player: Point, owned: boolean, snap = false) {
    const dt = Math.max(0, seconds)
    this.age += dt
    const inside = player.x >= this.zone.x0 && player.x <= this.zone.x1
    const lit = inside && owned
    const target = inside ? 1 : 0
    const bob = Math.sin(this.age * fx.lampFrequency) * fx.lampBobbing
    const position = { x: player.x, y: player.y - CONFIG.physics.playerSize / 2 - fx.lampLift + bob }
    if (snap || this.inside === undefined) {
      this.alpha = target
      this.growth = lit ? 1 : 0
      this.departure = null
    } else {
      const delta = dt / fx.fadeSeconds
      this.alpha = target ? Math.min(1, this.alpha + delta) : Math.max(0, this.alpha - delta)
      if (this.inside && player.x > this.zone.x1 && owned) this.departure = { ...position, age: 0 }
      this.growth = lit ? Math.min(1, this.growth + dt / fx.lampGrowSeconds) :
        (this.alpha > 0 && owned ? this.growth : 0)
    }
    if (inside || !owned) this.departure = null
    this.inside = inside
    this.radius = fx.baseRadius + (fx.lampRadius - fx.baseRadius) * ease(this.growth)
    this.lampVisible = lit
    this.lampAlpha = 1
    this.lampAngle = Math.sin(this.age * fx.lampFrequency) * fx.lampSway
    this.lampPosition = position
    if (this.departure) {
      const flight = this.departure
      flight.age += dt
      const { flickerSeconds, flashCount, dim, flySeconds, driftX, driftY } = fx.lampDepart
      const progress = saturate((flight.age - flickerSeconds) / flySeconds)
      const swing = Math.floor(flight.age / flickerSeconds * flashCount * 2)
      this.lampAlpha = flight.age < flickerSeconds && swing % 2 === 1 ? dim : 1 - progress
      this.lampVisible = progress < 1
      const travel = progress * progress
      this.lampPosition = { x: flight.x + driftX * travel, y: flight.y - driftY * travel }
      if (!this.lampVisible) this.departure = null
    }
  }
}

let serial = 0

/** The mask is screen-space. The lamp uses world coordinates so camera smoothing never detaches it. */
export class Darkness {
  readonly state: DarknessState
  private readonly texture: Phaser.Textures.CanvasTexture
  private readonly mask: Phaser.GameObjects.Image
  private readonly lamp: Phaser.GameObjects.Graphics
  private readonly textureKey = 'chapter-darkness-' + ++serial
  private lastX = NaN
  private lastY = NaN
  private lastRadius = NaN

  constructor(private readonly scene: Phaser.Scene, zone: Zone) {
    this.state = new DarknessState(zone)
    this.texture = scene.textures.createCanvas(this.textureKey, CONFIG.view.width, CONFIG.view.height)!
    this.mask = scene.add.image(0, 0, this.textureKey).setOrigin(0).setScrollFactor(0).setDepth(fx.depth.mask).setVisible(false)
    const g = this.lamp = scene.add.graphics().setDepth(fx.depth.lamp).setVisible(false)
    const warm = CONFIG.colors.lamp
    const line = (path: readonly (readonly [number, number])[]) => {
      g.strokePoints(path.map(([x, y]) => ({ x, y })))
    }
    // Desk lamp drawn from its base up through the hinge to the shade.
    g.lineStyle(fx.lampPen, warm).fillStyle(warm)
    line([[-12, 15], [9, 15], [12, 18], [-15, 18], [-12, 15]])
    line([[-2, 14], [7, 0], [1, -9], [-4, -10]])
    g.fillCircle(7, 0, fx.lampPen)
    line([[-8, -12], [-2, -11], [1, -4], [-13, -4], [-8, -12]])
    g.fillCircle(-6, -3, fx.lampPen)
    line([[-13, 0], [-16, 3]])
    line([[-7, 2], [-8, 6]])
    line([[-1, 1], [1, 4]])
  }

  render(dt: number, player: Point, owned: boolean, snap = false) {
    const state = this.state
    state.advance(dt, player, owned, snap)
    this.lamp.setVisible(state.lampVisible)
    if (state.lampVisible) {
      this.lamp.setPosition(state.lampPosition.x, state.lampPosition.y).setRotation(state.lampAngle).setAlpha(state.lampAlpha)
    }
    this.mask.setVisible(state.alpha > 0).setAlpha(state.alpha)
    if (!this.mask.visible) return
    const camera = this.scene.cameras.main
    const x = player.x - camera.scrollX
    const y = player.y - camera.scrollY
    if (x === this.lastX && y === this.lastY && state.radius === this.lastRadius) return
    this.lastX = x
    this.lastY = y
    this.lastRadius = state.radius
    const ctx = this.texture.context
    const width = this.texture.width
    const height = this.texture.height
    const radius = state.radius
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'destination-out'
    const reveal = ctx.createRadialGradient(x, y, 0, x, y, radius)
    reveal.addColorStop(0, '#000')
    reveal.addColorStop(fx.innerClear, '#000')
    reveal.addColorStop(fx.softEdge, 'rgba(0,0,0,' + (1 - fx.softEdgeOpacity) + ')')
    reveal.addColorStop(1, 'transparent')
    ctx.fillStyle = reveal
    ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius)
    ctx.globalCompositeOperation = 'source-over'
    const glow = (radius - fx.baseRadius) / (fx.lampRadius - fx.baseRadius)
    if (glow > 0) {
      const tint = ctx.createRadialGradient(x, y, 0, x, y, radius)
      const warm = CONFIG.colors.lamp
      tint.addColorStop(0, 'rgba(' + (warm >> 16) + ',' + ((warm >> 8) & 255) + ',' + (warm & 255) + ',' + glow * fx.warmOpacity + ')')
      tint.addColorStop(1, 'transparent')
      ctx.fillStyle = tint
      ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius)
    }
    this.texture.refresh()
  }

  destroy() {
    this.mask.destroy()
    this.lamp.destroy()
    this.scene.textures.remove(this.textureKey)
  }
}
