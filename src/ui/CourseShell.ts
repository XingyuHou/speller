import { CONFIG, SPELL_VIEW_CONFIG, TRANSITIONS } from '../config'
import { DEMO_UI, LINES, textForLine, UI, type LineId } from '../content/lines'
import { COURSE } from '../level/course'
import { SPELL_CATALOG, EGG_CATALOG } from '../spell/spells'
import { inkLabel } from './inkLabel'
import '../spell/spellbar.css'

export interface CourseControls {
  pause(): void
  debug(): void
  restart(): void
  replay(): void
  warp(index: number): void
  input(key: string, down: boolean): void
  canReturnToLetters?(): boolean
  returnToLetters?(): void
  canRevisitWords?(): boolean
  revisitWords?(): void
  setSound?(enabled: boolean): void
  giveLetters?(): void
  giveSpells?(): void
  setInvincible?(enabled: boolean): void
  setFly?(enabled: boolean): void
  collect?(): void
  setBulletTime?(enabled: boolean): void
  setHighlight?(enabled: boolean): void
}

export interface CourseShellOptions {
  stations?: readonly { label: string }[]
  title?: string
  name?: string
  complete?: string
  sectionCount?: number
  collectInitially?: boolean
}

export interface EndStats {
  elapsed: number
  deaths: number
  spells: number
  eggs: number
}

type Mode = 'playing' | 'paused' | 'finished'
const ui = CONFIG.ui

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const el = document.createElement(tag)
  el.className = className
  return el
}

function action(className: string, label: string, callback?: () => void) {
  const button = element('button', className)
  button.type = 'button'
  button.setAttribute('aria-label', label)
  if (callback) button.addEventListener('click', callback)
  return button
}

function badge(key: string) {
  const cap = element('span', 'keycap')
  cap.append(inkLabel(key, ui.keyHeight, true))
  return cap
}

function noteColor(id: LineId, highlight: boolean) {
  const color = highlight && LINES[id].status !== '已批准' ? SPELL_VIEW_CONFIG.highlightColor : CONFIG.colors.note
  return '#' + color.toString(16).padStart(6, '0')
}

function toggle(label: string, checked: boolean, change: (value: boolean) => void) {
  const wrapper = element('label', 'game-toggle')
  const box = element('input', 'game-checkbox')
  box.type = 'checkbox'
  box.checked = checked
  box.addEventListener('change', () => change(box.checked))
  wrapper.append(box, inkLabel(label, ui.smallHeight))
  return wrapper
}

export class CourseShell {
  readonly mount = element('div', 'game-mount')
  readonly stage = element('section', 'course-stage')
  private readonly headButton = action('pause-button', UI.pause)
  private readonly toolbar = element('div', 'course-controls')
  private readonly progress = element('div', 'course-progress')
  private readonly progressLabel = element('span', 'progress-label')
  private readonly stations: readonly { label: string }[]
  private readonly steps: HTMLSpanElement[]
  private readonly hasSections: boolean
  private section = -1
  private readonly complete: string
  private readonly debugControls = element('div', 'debug-cheats')
  private readonly debugRun = element('div', 'debug-run')
  private sound = true
  private bulletTime = true
  private highlight = false
  private endStats?: EndStats
  private collectButton?: HTMLButtonElement
  private readonly debugPanel = element('aside', 'debug-panel')
  private readonly stats = element('div', 'debug-stats')
  private readonly stationPicker = element('div', 'debug-stations')
  private readonly overlay = element('div', 'mode-overlay')
  private readonly debugButton: HTMLButtonElement
  private mode: Mode = 'playing'
  private debugActive = false
  private lastStats = ''

  constructor(root: HTMLElement, controls: CourseControls, options: CourseShellOptions = {}) {
    this.stations = options.stations ?? COURSE.stations
    this.hasSections = !!options.sectionCount
    this.steps = Array.from({ length: options.sectionCount ?? this.stations.length }, () => element('span', 'step-marker'))
    this.complete = options.complete ?? UI.complete
    root.className = 'course-shell'
    root.style.setProperty('--menu-fade', TRANSITIONS.menuMs + 'ms')
    root.style.setProperty('--result-fade', TRANSITIONS.resultsMs + 'ms')
    const header = element('header', 'course-header')
    const identity = element('div', 'identity')
    const wordmark = element('h1', 'wordmark')
    wordmark.append(inkLabel(options.title ?? UI.title, ui.brandHeight, true))
    const course = element('span', 'course-name')
    course.append(inkLabel(options.name ?? UI.course))
    identity.append(wordmark, course)
    this.headButton.addEventListener('click', () => controls.pause())
    this.headButton.setAttribute('aria-keyshortcuts', 'Escape')
    this.showPauseButton(false)
    header.append(identity, this.headButton)

    const stage = this.stage
    const gameLabel = options.name ? (options.title ?? UI.title) + ' ' + options.name : UI.game
    stage.setAttribute('aria-label', gameLabel)
    this.mount.tabIndex = -1
    this.mount.setAttribute('aria-label', gameLabel)
    this.overlay.hidden = true
    this.overlay.setAttribute('role', 'dialog')
    this.overlay.setAttribute('aria-modal', 'true')
    this.overlay.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return
      const choices = this.overlay.querySelectorAll<HTMLElement>('button,input')
      const first = choices[0]
      const last = choices[choices.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    })
    stage.append(this.mount, this.debugPanel, this.overlay)

    this.toolbar.setAttribute('role', 'group')
    this.toolbar.setAttribute('aria-label', UI.keyboard)
    const move = element('div', 'key-group')
    move.append(this.holdKey('A', 'KeyA', UI.move, controls), this.holdKey('D', 'KeyD', UI.move, controls), inkLabel(UI.move))
    const jump = element('div', 'key-group')
    jump.append(this.holdKey('W', 'KeyW', UI.jump, controls), inkLabel(UI.jump))
    const restart = action('key-action', UI.reset, () => controls.restart())
    restart.setAttribute('aria-keyshortcuts', 'R')
    restart.append(badge('R'), inkLabel(UI.reset))
    this.debugButton = action('key-action', UI.debug, () => controls.debug())
    this.debugButton.setAttribute('aria-keyshortcuts', 'F1')
    this.debugButton.setAttribute('aria-controls', 'collision-status')
    this.debugButton.append(badge('F1'), inkLabel(UI.debug))
    this.toolbar.append(move, jump)
    if (controls.collect) {
      const collect = action('key-action', UI.collect, controls.collect)
      this.collectButton = collect
      collect.hidden = !(options.collectInitially ?? options.name === UI.lab)
      collect.setAttribute('aria-keyshortcuts', UI.sKey)
      collect.append(badge(UI.sKey), inkLabel(UI.collect))
      this.toolbar.append(collect)
    }
    this.toolbar.append(restart, this.debugButton)

    const track = element('div', 'progress-track')
    track.setAttribute('aria-hidden', 'true')
    track.append(...this.steps)
    this.progress.append(this.progressLabel, track)
    this.progress.setAttribute('role', 'status')
    const footer = element('footer', 'course-footer')
    footer.append(this.toolbar, this.progress)

    this.debugPanel.id = 'collision-status'
    this.debugPanel.setAttribute('aria-label', UI.debug)
    const debugTitle = element('h2', 'debug-title')
    debugTitle.append(inkLabel(UI.debug, ui.labelHeight, true))
    const jumpTo = element('div', 'debug-jump-label')
    jumpTo.append(inkLabel(UI.jumpTo, ui.smallHeight))
    this.stations.forEach((station, index) => {
      const choose = action('station-button', station.label, () => {
        controls.warp(index)
        this.mount.focus({ preventScroll: true })
      })
      choose.append(inkLabel(station.label, ui.smallHeight))
      this.stationPicker.append(choose)
    })
    this.debugPanel.append(debugTitle, this.stats, jumpTo, this.stationPicker)
    if (controls.setHighlight) this.debugPanel.append(toggle(UI.highlightLines, false, enabled => {
      this.highlight = enabled
      controls.setHighlight?.(enabled)
    }))
    for (const [label, fn] of [[UI.grantLetters, controls.giveLetters], [UI.grantSpells, controls.giveSpells]] as const) {
      if (!fn) continue
      const button = action('station-button', label, () => { fn(); this.mount.focus({ preventScroll: true }) })
      button.append(inkLabel(label, ui.smallHeight))
      this.debugControls.append(button)
    }
    if (controls.setInvincible) this.debugControls.append(toggle(UI.invincible, false, controls.setInvincible))
    if (controls.setFly) this.debugControls.append(toggle(UI.fly, false, controls.setFly))
    this.debugRun.append(inkLabel(UI.debugRun, ui.smallHeight))
    this.debugRun.hidden = true
    this.debugPanel.append(this.debugControls, this.debugRun)
    this.setDebug(false)
    this.setStation(0)
    this.setSection(0)
    root.replaceChildren(header, stage, footer)
  }

  private showPauseButton(paused: boolean) {
    const label = paused ? UI.resume : UI.pause
    this.headButton.setAttribute('aria-label', label)
    const icon = element('span', paused ? 'play-icon' : 'pause-icon')
    icon.setAttribute('aria-hidden', 'true')
    this.headButton.replaceChildren(icon, inkLabel(label))
  }

  private holdKey(letter: string, code: string, label: string, controls: CourseControls) {
    const button = action('hold-key', label + ' ' + letter)
    button.setAttribute('aria-keyshortcuts', letter)
    button.append(badge(letter))
    let pointer: number | null = null
    const press = () => {
      if (this.mode !== 'playing') return
      button.classList.add('is-held')
      controls.input(code, true)
    }
    const release = () => {
      if (!button.classList.contains('is-held')) return
      pointer = null
      button.classList.remove('is-held')
      controls.input(code, false)
    }
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || pointer !== null) return
      event.preventDefault()
      pointer = event.pointerId
      button.setPointerCapture(event.pointerId)
      press()
    })
    button.addEventListener('lostpointercapture', release)
    button.addEventListener('pointerup', release)
    button.addEventListener('pointercancel', release)
    button.addEventListener('keydown', event => {
      if (event.code !== 'Space' && event.code !== 'Enter') return
      event.preventDefault()
      if (!event.repeat) press()
    })
    button.addEventListener('keyup', event => {
      if (event.code === 'Space' || event.code === 'Enter') release()
    })
    button.addEventListener('blur', release)
    window.addEventListener('blur', release)
    return button
  }

  fadeInWorld() {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.mount.animate([{ opacity: TRANSITIONS.respawnOpacity }, { opacity: 1 }], { duration: TRANSITIONS.respawnMs, easing: 'ease-out' })
    }
  }

  setStation(index: number) {
    const current = this.stations[index]
    if (!current) return
    Array.from(this.stationPicker.children).forEach((button, i) => button.setAttribute('aria-current', i === index ? 'step' : 'false'))
    if (!this.hasSections) this.setSection(index)
  }

  setSection(index: number) {
    if (this.section === index) return
    this.section = index
    this.progressLabel.replaceChildren(inkLabel(UI.stage + ' ' + (index + 1) + ' / ' + this.steps.length, ui.smallHeight))
    this.progress.setAttribute('aria-label', UI.stage + ' ' + (index + 1) + ' / ' + this.steps.length)
    this.steps.forEach((marker, i) => {
      marker.classList.toggle('is-past', i < index)
      marker.classList.toggle('is-current', i === index)
    })
  }

  setDebug(active: boolean) {
    this.debugActive = active
    this.debugPanel.hidden = !active || this.mode !== 'playing'
    this.debugButton.setAttribute('aria-expanded', String(active))
    this.debugButton.setAttribute('aria-pressed', String(active))
  }

  setDebugRun(active: boolean) {
    this.debugRun.hidden = !active
    if (!active) for (const box of this.debugControls.querySelectorAll('input')) box.checked = false
  }

  setCollectVisible(visible: boolean) {
    if (this.collectButton) this.collectButton.hidden = !visible
  }

  setStatsForEnd(stats?: EndStats) {
    this.endStats = stats
  }

  private results(stats: EndStats) {
    const rows = element('dl', 'end-results')
    const time = Math.max(0, Math.floor(stats.elapsed))
    const values = [
      [DEMO_UI.time, Math.floor(time / 60) + ':' + String(time % 60).padStart(2, '0')],
      [DEMO_UI.deaths, String(stats.deaths)],
      [DEMO_UI.spells, stats.spells + ' / ' + SPELL_CATALOG.length],
      [DEMO_UI.eggs, stats.eggs + ' / ' + EGG_CATALOG.length],
    ]
    for (const [name, value] of values) {
      const column = element('div', 'result-column')
      const term = element('dt', 'result-label')
      const data = element('dd', 'result-value')
      term.append(inkLabel(name, ui.smallHeight))
      data.append(inkLabel(value, ui.labelHeight, true))
      column.append(term, data)
      rows.append(column)
    }
    return rows
  }

  setStats(grounded: boolean, speed: number, fps: number) {
    if (!this.debugActive) return
    const text = [grounded ? UI.grounded : UI.airborne, UI.speed + ' ' + Math.round(speed), UI.fps + ' ' + Math.round(fps)]
    const signature = text.join('/')
    if (signature === this.lastStats) return
    this.lastStats = signature
    this.stats.replaceChildren(...text.map(value => inkLabel(value, ui.smallHeight)))
  }

  setMode(mode: Mode, controls: CourseControls) {
    const previous = this.mode
    this.mode = mode
    this.overlay.hidden = mode === 'playing'
    this.overlay.classList.toggle('demo-finished', mode === 'finished' && !!this.endStats)
    this.toolbar.inert = mode !== 'playing'
    this.headButton.disabled = mode === 'finished'
    this.mount.inert = mode !== 'playing'
    this.debugPanel.hidden = !this.debugActive || mode !== 'playing'
    this.showPauseButton(mode === 'paused')
    if (mode === 'playing') {
      this.overlay.replaceChildren()
      if (previous !== 'playing') this.mount.focus({ preventScroll: true })
      return
    }
    const paused = mode === 'paused'
    const heading = paused ? UI.paused : this.endStats ? DEMO_UI.complete : this.complete
    this.overlay.setAttribute('aria-label', heading)
    const card = element('div', 'mode-card')
    const title = element('h2', 'mode-title')
    title.append(inkLabel(heading, ui.headingHeight, true))
    const buttons = element('div', 'mode-actions')
    const label = paused ? UI.resume : UI.replay
    const primary = action('modal-button primary', label, () => paused ? controls.pause() : controls.replay())
    primary.append(inkLabel(label))
    buttons.append(primary)
    if (paused) {
      const restart = action('modal-button', UI.reset, () => { controls.pause(); controls.restart() })
      restart.append(inkLabel(UI.reset))
      buttons.append(restart)
      if (controls.setSound) {
        const replay = action('modal-button', UI.startOver, controls.replay)
        replay.append(inkLabel(UI.startOver))
        buttons.append(replay)
      }
      if (controls.canReturnToLetters?.() && controls.returnToLetters) {
        const back = action('modal-button', UI.returnToLetters, controls.returnToLetters)
        back.append(inkLabel(UI.returnToLetters))
        buttons.append(back)
      }
    }
    if (controls.canRevisitWords?.() && controls.revisitWords) {
      const bridge = action('modal-button', UI.revisitWords, controls.revisitWords)
      bridge.append(inkLabel(UI.revisitWords))
      buttons.append(bridge)
    }
    card.append(title)
    if (!paused && this.endStats) {
      card.append(this.results(this.endStats))
      const line = textForLine('N16')
      if (line) {
        const note = element('p', 'end-note')
        note.append(inkLabel(line, ui.labelHeight, false, noteColor('N16', this.highlight)))
        card.append(note)
      }
    }
    const settings = element('div', 'pause-settings')
    if (paused && controls.setBulletTime) {
      settings.append(toggle(UI.bulletTime, this.bulletTime, enabled => {
        this.bulletTime = enabled
        controls.setBulletTime?.(enabled)
      }))
    }
    if (paused && controls.setSound) settings.append(toggle(UI.sound, this.sound, value => {
      this.sound = value
      controls.setSound?.(value)
    }))
    if (settings.childElementCount) card.append(settings)
    card.append(buttons)
    this.overlay.replaceChildren(card)
    primary.focus({ preventScroll: true })
  }
}
