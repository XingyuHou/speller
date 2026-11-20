import Phaser from 'phaser'
import { CHAPTER_FX, CONFIG } from './config'
import { SWORD_WORDS, UI } from './content/lines'
import type { Bounds, Point } from './font/handwriting'
import type { CourseData } from './level/course'
import { SceneSpells } from './spell/SceneSpells'
import { Synth } from './audio/Synth'
import { SaveStore } from './progress/SaveStore'
import { NoiseSystem } from './sound/NoiseSystem'
import { NoiseView } from './sound/NoiseView'
import { Player } from './player/Player'
import { CourseShell, type CourseControls } from './ui/CourseShell'
import { CollisionMask } from './world/CollisionMask'
import { BehaviorTerrain } from './world/behaviors/BehaviorTerrain'
import { SwordBridge } from './world/SwordBridge'
import { ChapterRun } from './world/ChapterRun'
import { createTextObject } from './world/TextObject'

type Mode = 'playing' | 'paused' | 'finished'
const movementKeys = new Map([
  ['KeyA', 'A'], ['ArrowLeft', 'A'], ['KeyD', 'D'], ['ArrowRight', 'D'],
  ['KeyW', 'W'], ['ArrowUp', 'W'],
])

export class PracticeScene extends Phaser.Scene {
  readonly controls: CourseControls = {
    pause: () => this.togglePause(),
    debug: () => this.toggleDebug(),
    restart: () => this.restart(),
    replay: () => this.restart(true),
    warp: index => { this.enterDebugRun(); this.warp(index) },
    input: (key, down) => this.setInput('pointer-' + key, movementKeys.get(key) ?? key, down),
  }
  spells!: SceneSpells
  shell!: CourseShell
  player!: Player
  mask!: CollisionMask
  chapter?: ChapterRun
  noise?: NoiseSystem
  noiseView?: NoiseView
  private store?: SaveStore
  private synth!: Synth
  private bridgeVisit?: { completed: boolean; checkpointId?: string }
  private debugRun = false
  private invincible = false
  private fly = false
  private elapsed = 0
  private collectStart = 0
  private totalLetters = 0
  private avatar!: Phaser.GameObjects.Graphics
  private debugBox!: Phaser.GameObjects.Graphics
  private maskImage?: Phaser.GameObjects.Image
  private maskDirty = false
  private finish!: Bounds
  private readonly objects: ReturnType<typeof createTextObject>[] = []
  private readonly held = new Map<string, string>()
  private jumpQueued = false
  private mode: Mode = 'playing'
  private debug = false
  private station = 0
  private safeStation = 0
  private accumulated = 0
  private statsTimer = 0
  private facing = 1

  constructor(readonly course: CourseData) {
    super('practice')
    this.controls.setBulletTime = enabled => this.spells?.setBulletTime(enabled)
    this.controls.setHighlight = enabled => {
      this.spells?.setHighlight(enabled)
      this.noiseView?.setHighlight(enabled)
      this.chapter?.setHighlight(enabled)
    }
    if (course.sound) {
      this.controls.setSound = enabled => this.synth?.setEnabled(enabled)
      this.controls.giveLetters = () => { this.enterDebugRun(); this.spells.grantLetters() }
      this.controls.giveSpells = () => { this.enterDebugRun(); this.spells.grantSpells() }
      this.controls.setInvincible = enabled => { this.enterDebugRun(); this.invincible = enabled }
      this.controls.setFly = enabled => {
        this.enterDebugRun()
        this.fly = enabled
        this.clearInput()
        const p = this.player
        const half = CONFIG.physics.playerSize / 2
        if (!enabled && this.mask.overlapsSolid(p.x - half, p.y - half, p.x + half, p.y + half)) this.restart()
      }
      this.controls.canReturnToLetters = () => this.player.x >= this.collectStart && this.spells.terrain.collectedIds.size < this.totalLetters
      this.controls.returnToLetters = () => this.warp(course.stations.findIndex(station => station.id === 'save-exit'))
    }
    const puzzle = course.sword
    if (puzzle) {
      // Older runs may resume on the far bank, before this puzzle existed.
      this.controls.canRevisitWords = () => !this.bridgeVisit && (this.mode === 'finished' || this.player.x >= this.collectStart)
        && !this.spells.bar.spentWord(puzzle.sourceId)
      this.controls.revisitWords = () => {
        const run = this.chapter
        if (!run) return
        this.bridgeVisit = { completed: this.mode === 'finished', checkpointId: run.checkpoints[run.checkpoint]?.id }
        this.shell.setStatsForEnd()
        this.warp(course.stations.findIndex(station => station.id === 'save-sword'))
      }
    }
    if (course.texts.some(text => text.collectible?.length)) {
      this.controls.collect = () => { if (this.mode === 'playing' && !this.chapter?.dying) this.spells?.collect() }
    }
  }

  create() {
    this.game.canvas.setAttribute('aria-label', this.shell.mount.getAttribute('aria-label') ?? UI.game)
    this.synth = new Synth()
    this.mask = new CollisionMask(this.course.width, this.course.height)
    const behaviors = new BehaviorTerrain()
    for (const definition of this.course.texts) {
      if (definition.behavior) {
        behaviors.add({ ...definition, behavior: definition.behavior })
        continue
      }
      const object = createTextObject(this, definition, this.mask)
      if (definition.glow) object.graphics.setDepth(CHAPTER_FX.depth.glow)
      this.objects.push(object)
      if (definition.id === this.course.finishId) this.finish = object.bounds
    }
    if (this.course.checkpoints && this.course.darkZone) {
      this.mask.attachBehaviors(behaviors)
      this.chapter = new ChapterRun(this, this.course, this.objects, behaviors, this.mask)
    }
    this.player = new Player(this.mask, this.course.spawn.x, this.course.spawn.y)
    this.avatar = this.add.graphics()
    const size = CONFIG.physics.playerSize
    CONFIG.playerInk.glowInsets.forEach((outset, i) => {
      this.avatar.fillStyle(CONFIG.colors.player, CONFIG.playerInk.glowAlpha[i])
        .fillRect(-size / 2 - outset, -size / 2 - outset, size + 2 * outset, size + 2 * outset)
    })
    this.avatar.fillStyle(CONFIG.colors.player).fillRect(-size / 2, -size / 2, size, size)
    this.debugBox = this.add.graphics().lineStyle(CONFIG.debug.boxStroke, CONFIG.colors.debugSolid)
      .strokeRect(-size / 2, -size / 2, size, size).setVisible(false)
    const sword = this.course.sword ? new SwordBridge(this, this.course.sword, this.mask) : undefined
    const worldObjects = [...this.objects, ...behaviors.words]
    this.spells = new SceneSpells(this, this.course, this.shell.stage, worldObjects, () => this.player, {
      changed: () => this.saveProgress(),
      collect: () => this.synth.play('collect'),
      cast: result => {
        if (result.kind === 'spell') this.synth.play(result.word === SWORD_WORDS.sword ? 'cut' : 'spell')
        if (result.kind === 'egg') this.synth.play('egg')
      },
    }, sword)
    if (this.course.sound) {
      this.noise = new NoiseSystem(this.course.sound, behaviors)
      this.noiseView = new NoiseView(this, this.noise, worldObjects)
      this.collectStart = this.chapter?.checkpoints.find(cp => cp.id === 'save-exit')?.object.bounds.minX ?? 0
    }
    this.totalLetters = this.course.texts.reduce((sum, text) => sum + (text.collectible?.length ?? 0), 0)
    const markMaskDirty = () => { this.maskDirty = true }
    this.events.on('assist-change', markMaskDirty)
    this.events.on('sword-geometry', markMaskDirty)
    this.restoreProgress()
    this.syncWorld(0, true)
    window.addEventListener('pagehide', this.saveProgress)
    window.addEventListener('keydown', this.handleKey)
    window.addEventListener('keyup', this.handleKey)
    window.addEventListener('blur', this.handleBlur)
    document.addEventListener('visibilitychange', this.handleVisibility)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('pagehide', this.saveProgress)
      this.synth.destroy()
      this.spells.destroy()
      this.noiseView?.destroy()
      this.chapter?.destroy()
      window.removeEventListener('keydown', this.handleKey)
      window.removeEventListener('keyup', this.handleKey)
      window.removeEventListener('blur', this.handleBlur)
      document.removeEventListener('visibilitychange', this.handleVisibility)
    })
  }

  private readonly handleKey = (event: KeyboardEvent) => {
    const pressed = event.type === 'keydown'
    const target = event.target
    if (event.altKey || event.isComposing || (target instanceof HTMLElement &&
        (target.isContentEditable || target.matches('textarea, input:not([type="checkbox"])')))) return
    const editing = this.mode === 'playing' && !this.chapter?.dying
    if (event.code === 'Backspace' && !event.metaKey && !event.ctrlKey && !event.shiftKey && editing) {
      event.preventDefault()
      if (pressed && !event.repeat) this.spells.deleteLetter()
      return
    }
    if (this.fly && this.mode === 'playing' && (event.code === 'KeyS' || event.code === 'ArrowDown')) {
      event.preventDefault()
      this.setInput(event.code, 'S', pressed)
      return
    }
    if (event.metaKey || event.ctrlKey) {
      if (editing && event.code === 'KeyZ' && !event.shiftKey) {
        event.preventDefault()
        if (pressed && !event.repeat) this.spells.undo()
      }
      return
    }
    if (this.mode === 'playing' && !this.chapter?.dying && ['KeyS', 'ArrowDown', 'Space'].includes(event.code)) {
      if (event.code === 'Space' && event.target instanceof Element && event.target.closest('button, input')) return
      event.preventDefault()
      if (pressed && !event.repeat) {
        if (event.code === 'Space') this.spells.cast()
        else this.spells.collect()
      }
      return
    }
    const key = movementKeys.get(event.code)
    if (key && this.mode === 'playing') {
      event.preventDefault()
      if (!event.repeat) this.setInput(event.code, key, pressed)
      return
    }
    if (!['F1', 'Escape', 'KeyR'].includes(event.code)) return
    event.preventDefault()
    if (!pressed || event.repeat) return
    if (event.code === 'F1') this.toggleDebug()
    if (event.code === 'Escape') this.togglePause()
    if (event.code === 'KeyR') this.restart()
  }

  private readonly handleBlur = () => {
    this.clearInput()
    if (this.mode === 'playing') this.setMode('paused')
  }
  private readonly handleVisibility = () => { if (document.hidden) this.handleBlur() }

  private setInput(source: string, key: string, down: boolean) {
    if (!down) { this.held.delete(source); return }
    if (this.mode !== 'playing' || !this.player || this.chapter?.dying) return
    if (key === 'W' && ![...this.held.values()].includes('W')) this.jumpQueued = true
    this.held.set(source, key)
  }

  private clearInput() {
    this.held.clear()
    this.jumpQueued = false
    this.accumulated = 0
  }

  private setMode(mode: Mode) {
    this.mode = mode
    this.clearInput()
    this.spells.setPlaying(mode === 'playing' && !this.chapter?.dying)
    this.shell.setMode(mode, this.controls)
    if (mode !== 'playing') this.saveProgress()
  }

  private togglePause() {
    if (this.player && this.mode !== 'finished') this.setMode(this.mode === 'playing' ? 'paused' : 'playing')
  }
  private restart(fromStart = false) {
    if (!this.player) return
    const replay = fromStart || this.mode === 'finished'
    if (replay) {
      this.bridgeVisit = undefined
      this.store?.clear()
      this.debugRun = this.invincible = this.fly = false
      this.shell.setDebugRun(false)
      this.elapsed = 0
      this.shell.setStatsForEnd()
      this.chapter?.reset()
      this.spells.reset()
    } else {
      this.spells.book.onDeath()
      this.chapter?.retry()
    }
    const spawn = this.chapter?.spawn ?? this.course.stations[replay ? 0 : this.safeStation].spawn
    this.reposition(spawn)
    this.saveProgress()
  }

  private warp(index: number) {
    const station = this.course.stations[index]
    if (!this.player || !station) return
    this.chapter?.seek(station.spawn)
    this.spells.book.onDeath()
    this.reposition(station.spawn)
    this.saveProgress()
  }

  private reposition(point: Point) {
    this.spells.clearTransient()
    this.noise?.reset()
    this.noiseView?.reset()
    this.spells.setPlaying(false)
    this.facing = 1
    this.player.reset(point.x, point.y)
    this.station = this.safeStation = this.stationAt(point.x)
    this.shell.setStation(this.station)
    this.setMode('playing')
    this.shell.fadeInWorld()
    this.syncWorld(0, true)
  }

  private enterDebugRun() {
    if (this.debugRun) return
    this.saveProgress()
    this.debugRun = true
    this.shell.setDebugRun(true)
  }

  private readonly saveProgress = () => {
    const run = this.chapter
    if (!this.store || this.debugRun || !run) return
    this.store.save({
      checkpointId: run.checkpoints[run.checkpoint]?.id ?? null,
      elapsed: this.elapsed, deaths: run.deaths, intervalDeaths: run.deathCounts,
      assistIds: run.assistIds, bar: this.spells.bar.snapshot(), book: this.spells.book.snapshot(),
      completed: this.mode === 'finished' || this.bridgeVisit?.completed,
      bridgeReturnCheckpointId: this.bridgeVisit?.completed ? undefined : this.bridgeVisit?.checkpointId,
    })
  }

  private restoreProgress() {
    const run = this.chapter
    if (!run) return
    const store = new SaveStore(this.course)
    const saved = store.load()
    if (saved) {
      if (saved.bridgeReturnCheckpointId) this.bridgeVisit = { completed: false, checkpointId: saved.bridgeReturnCheckpointId }
      this.spells.restore(saved.bar, saved.book)
      const cp = run.checkpoints.find(point => point.id === saved.checkpointId)
      run.seek(cp?.spawn ?? this.course.spawn)
      run.restoreDeathCounts(saved.intervalDeaths, saved.assistIds)
      run.deaths = saved.deaths
      this.elapsed = saved.elapsed
      this.reposition(run.spawn)
      if (saved.completed) this.complete()
    }
    this.store = store
  }

  private complete() {
    this.bridgeVisit = undefined
    if (this.chapter) this.shell.setStatsForEnd({
      elapsed: this.elapsed, deaths: this.chapter.deaths,
      spells: this.spells.book.foundSpells.size, eggs: this.spells.book.foundEggs.size,
    })
    this.synth.play('finish')
    this.setMode('finished')
  }

  private stationAt(x: number) {
    return this.course.stations.reduce((last, station, index) => x >= station.spawn.x ? index : last, 0)
  }

  private toggleDebug() {
    if (!this.player) return
    this.debug = !this.debug
    this.shell.setDebug(this.debug)
    this.debugBox.setVisible(this.debug)
    if (this.debug && !this.maskImage) {
      const texture = this.textures.createCanvas('practice-mask', CONFIG.view.width + 2 * CONFIG.debug.margin, CONFIG.view.height + 2 * CONFIG.debug.margin)!
      this.maskImage = this.add.image(0, 0, texture).setOrigin(0).setDepth(CHAPTER_FX.depth.debugMask)
      this.debugBox.setDepth(CHAPTER_FX.depth.debugPlayer)
    }
    this.maskImage?.setVisible(this.debug)
    const camera = this.cameras.main
    this.updateMask(camera.scrollX, camera.scrollY, true)
  }

  private updateMask(scrollX: number, scrollY: number, force: boolean) {
    const image = this.maskImage
    if (!image || !this.debug) return
    const { width, height } = CONFIG.view
    if (!force && scrollX >= image.x && scrollY >= image.y &&
        scrollX + width <= image.x + image.width && scrollY + height <= image.y + image.height) return
    const x = Math.floor(scrollX - CONFIG.debug.margin)
    const y = Math.floor(scrollY - CONFIG.debug.margin)
    const texture = image.texture as Phaser.Textures.CanvasTexture
    const ctx = texture.context
    ctx.clearRect(0, 0, image.width, image.height)
    const solid = Phaser.Display.Color.IntegerToColor(CONFIG.colors.debugSolid).rgba
    const pass = Phaser.Display.Color.IntegerToColor(CONFIG.colors.debugOneWay).rgba
    this.mask.forEachSolidCell({ x, y, width: image.width, height: image.height }, (cx, cy, size, oneWay) => {
      ctx.fillStyle = oneWay ? pass : solid
      ctx.fillRect(cx - x, cy - y, size - CONFIG.debug.gridGap, size - CONFIG.debug.gridGap)
    })
    texture.refresh()
    image.setPosition(x, y).setAlpha(CONFIG.debug.solidAlpha)
  }

  update(_time: number, delta: number) {
    // Let the drag release finish in real time even when a long frame limits physics catch-up.
    const worldElapsed = this.mode === 'playing' ? this.spells.clock.advance(delta / 1000) : 0
    const dt = Math.min(worldElapsed, CONFIG.simulation.maxFrame)
    if (this.mode === 'playing') {
      this.elapsed += delta / 1000
      this.accumulated += dt
      const keys = [...this.held.values()]
      const input = { left: keys.includes('A'), right: keys.includes('D'), jumpPressed: this.jumpQueued, jumpHeld: keys.includes('W') }
      while (this.accumulated >= CONFIG.simulation.step) {
        const step = CONFIG.simulation.step
        this.accumulated -= step
        this.chapter?.effects.update(step)
        if (this.chapter?.dying) {
          if (this.chapter.advanceDeath(step)) {
            this.chapter.retry()
            this.reposition(this.chapter.spawn)
            break
          }
          continue
        }
        const quietBefore = this.spells.book.silentRemaining
        this.noise?.preStep(step, this.player, quietBefore > 0)
        this.chapter?.behaviors.tick(step)
        if (this.fly) {
          const speed = CONFIG.physics.maxRunSpeed
          const dx = Number(input.right) - Number(input.left)
          const dy = Number(keys.includes('S')) - Number(input.jumpHeld)
          const x = Phaser.Math.Clamp(this.player.x + dx * speed * step, 0, this.course.width)
          const y = Phaser.Math.Clamp(this.player.y + dy * speed * step, -CONFIG.camera.chapterHeadroom, this.course.height)
          this.player.reset(x, y)
        } else this.player.step(step, input)
        const hitSpikes = !this.fly && this.noise?.postStep(this.player)
        this.spells.tick(step)
        if (this.noise) this.synth.world(this.noise, this.player, quietBefore, this.spells.book.silentRemaining)
        this.jumpQueued = input.jumpPressed = false
        const previous = this.chapter?.checkpoint
        this.chapter?.visit(this.player)
        if (previous !== this.chapter?.checkpoint) {
          this.synth.play('save')
          if (this.bridgeVisit && this.chapter?.checkpoints[this.chapter.checkpoint]?.id === 'save-exit') {
            const visit = this.bridgeVisit
            this.bridgeVisit = undefined
            if (visit.completed) { this.complete(); break }
            const destination = this.course.stations.findIndex(station => station.id === visit.checkpointId)
            if (destination >= 0 && visit.checkpointId !== 'save-exit') { this.warp(destination); break }
          }
          this.saveProgress()
        }
        if (!this.fly && ((!this.invincible && hitSpikes) || this.player.y - CONFIG.physics.playerSize / 2 > (this.course.killY ?? this.course.height))) {
          if (this.chapter && !this.invincible) {
            this.chapter.die(this.player)
            this.synth.play('death')
            this.spells.book.onDeath()
            this.saveProgress()
            this.spells.setPlaying(false)
            this.clearInput()
          } else this.restart()
          break
        }
      }
      const { x, y, grounded, vx } = this.player
      if (vx !== 0) this.facing = Math.sign(vx)
      const stationIndex = this.stationAt(x)
      if (stationIndex !== this.station) {
        this.station = stationIndex
        this.shell.setStation(stationIndex)
      }
      if (grounded) this.safeStation = this.station
      const feet = y + CONFIG.physics.playerSize / 2
      if (grounded && x >= this.finish.minX && x <= this.finish.maxX &&
          feet >= this.finish.minY - CONFIG.collision.minStrokeWidth && feet <= this.finish.maxY + CONFIG.collision.minStrokeWidth) {
        this.complete()
      }
    }
    this.statsTimer -= dt
    if (this.debug && this.statsTimer <= 0) {
      this.shell.setStats(this.player.grounded, this.player.vx, this.game.loop.actualFps)
      this.statsTimer = CONFIG.debug.panelUpdateInterval
    }
    this.syncWorld(dt)
  }

  private syncWorld(dt: number, snap = false) {
    const { x, y } = this.player
    const starts = this.course.sectionStarts
    if (starts) this.shell.setSection(starts.reduce((last, start, i) => x >= start ? i : last, 0))
    const silent = this.spells.book.silentRemaining > 0
    this.avatar.setPosition(x, y).setVisible(!this.chapter?.dying && !(this.noiseView && silent))
    this.shell.setCollectVisible(x >= this.collectStart || this.spells.terrain.collectedIds.size > 0)
    this.debugBox.setPosition(x, y)
    const cam = this.cameras.main
    const settings = CONFIG.camera
    const blend = snap ? 1 : 1 - Math.exp(-settings.followRate * dt)
    const aimX = x + settings.lookAhead * this.facing - CONFIG.view.width * settings.playerAnchor
    const offset = y - cam.scrollY - CONFIG.view.height * settings.verticalAnchor
    const adjust = Math.sign(offset) * Math.max(0, Math.abs(offset) - settings.deadZone / 2)
    const nextX = Phaser.Math.Clamp(Phaser.Math.Linear(cam.scrollX, aimX, blend), 0, Math.max(0, this.course.width - cam.width))
    const top = this.chapter ? -settings.chapterHeadroom : 0
    const nextY = Phaser.Math.Clamp(cam.scrollY + (snap ? offset : adjust) * blend, top, Math.max(0, this.course.height - cam.height))
    cam.setScroll(nextX, nextY)
    for (const { bounds, graphics, definition } of this.objects) {
      const pad = CONFIG.ink.XL
      const show = !definition.whenMissingLetters || this.spells.terrain.collectedIds.size < this.totalLetters
      graphics.setVisible(show && bounds.maxX >= nextX - pad && bounds.minX <= nextX + cam.width + pad &&
                          bounds.maxY >= nextY - pad && bounds.minY <= nextY + cam.height + pad)
    }
    this.updateMask(nextX, nextY, snap || this.maskDirty)
    this.maskDirty = false
    this.chapter?.movingInk.render(this.debug)
    this.chapter?.darkness.render(dt, this.player, this.spells.book.lamp, snap)
    this.noiseView?.render(dt, this.player, this.spells.book.listen, silent, !!this.chapter?.dying, this.debug)
    this.spells.render()
  }
}
