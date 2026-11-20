import { CONFIG, SPELL_CONFIG, SPELL_VIEW_CONFIG as cfg } from '../config'
import { LINES, textForLine, type LineId, UI } from '../content/lines'
import { inkLabel } from '../ui/inkLabel'
import './spellbar.css'

interface Letter {
  id: string
  char: string
  origin: 'word' | 'collected'
}
interface Position { x: number; y: number }
export interface SpellBarActions {
  insert(from: number, to: number): void
  swap(a: number, b: number): void
  undo(): void
  deleteLetter(): void
  submit(): void
  drag(active: boolean): void
}

interface Gesture {
  pointer: number
  index: number
  target: number
  start: Position
  dragging: boolean
  tile: HTMLButtonElement
}

function el<K extends keyof HTMLElementTagNameMap>(name: K, className: string) {
  const node = document.createElement(name)
  node.className = className
  return node
}

function action(label: string, shortcut: string, fn: () => void) {
  const button = el('button', 'spell-action')
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.setAttribute('aria-keyshortcuts', shortcut)
  button.title = label
  button.addEventListener('click', fn)
  return button
}

function hex(color: number) { return '#' + color.toString(16).padStart(6, '0') }

function tint(canvas: HTMLCanvasElement, color: number) {
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.resetTransform()
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = hex(color)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

function letterInk(letter: Letter) {
  const ink = inkLabel(letter.char, cfg.letterHeight, true)
  tint(ink.querySelector('canvas')!, letter.origin === 'word' ? CONFIG.colors.rearrange : CONFIG.colors.collected)
  return ink
}

export class SpellBarView {
  private readonly layer = el('div', 'spell-layer')
  private readonly bar = el('div', 'spellbar')
  private readonly tiles = el('div', 'spell-tiles')
  private readonly undo: HTMLButtonElement
  private readonly remove: HTMLButtonElement
  private readonly submit: HTMLButtonElement
  private readonly vignette = el('div', 'spell-vignette')
  private readonly message = el('div', 'spell-response')
  private readonly timer = el('div', 'spell-timer')
  private letters: readonly Letter[] = []
  private selected: number | null = null
  private gesture: Gesture | null = null
  private enabled = true
  private highlight = false
  private line?: LineId
  private messageTimeout?: number
  private readonly onBlur = () => this.cancelGesture()
  private readonly cancelPointer = (event: PointerEvent) => {
    if (this.gesture?.pointer === event.pointerId) this.cancelGesture()
  }
  private readonly onVisibility = () => { if (document.hidden) this.cancelGesture() }

  constructor(private readonly stage: HTMLElement, private readonly actions: SpellBarActions) {
    this.bar.setAttribute('role', 'group')
    this.bar.setAttribute('aria-label', UI.spellBar)
    this.tiles.classList.add('is-empty')
    this.remove = action(UI.deleteLetter, 'Backspace', actions.deleteLetter)
    this.remove.classList.add('spell-delete')
    this.remove.append(inkLabel(UI.deleteKey, cfg.buttonHeight, true))
    this.undo = action(UI.undo, 'Control+Z Meta+Z', actions.undo)
    this.undo.title = UI.undoShortcut
    this.undo.classList.add('spell-undo')
    const undoIcon = el('span', 'undo-icon')
    undoIcon.setAttribute('aria-hidden', 'true')
    this.undo.append(undoIcon)
    this.submit = action(UI.cast, 'Space', actions.submit)
    this.submit.classList.add('spell-cast')
    this.submit.append(inkLabel(UI.space, cfg.buttonHeight, true))
    this.remove.disabled = this.undo.disabled = this.submit.disabled = true
    this.remove.hidden = true
    this.timer.hidden = true
    this.message.setAttribute('role', 'status')
    this.message.setAttribute('aria-live', 'polite')
    this.message.hidden = true
    this.bar.append(this.tiles, this.remove, this.undo, this.submit, this.timer)
    this.layer.style.setProperty('--slot', cfg.slotSize + 'px')
    this.layer.style.setProperty('--slot-gap', cfg.slotGap + 'px')
    this.layer.style.setProperty('--blue', hex(CONFIG.colors.rearrange))
    this.layer.style.setProperty('--green', hex(CONFIG.colors.collected))
    this.layer.append(this.vignette, this.bar, this.message)
    this.stage.append(this.layer)
    this.tiles.addEventListener('pointerdown', this.down)
    this.tiles.addEventListener('pointermove', this.move)
    this.tiles.addEventListener('pointerup', this.up)
    this.tiles.addEventListener('pointercancel', this.cancelPointer)
    this.tiles.addEventListener('lostpointercapture', this.cancelPointer)
    this.bar.addEventListener('keydown', event => {
      if (event.code !== 'Space') return
      event.preventDefault()
      event.stopPropagation()
      if (this.enabled && !event.repeat && !this.submit.disabled) this.actions.submit()
    })
    this.bar.addEventListener('keyup', event => {
      if (event.code === 'Space') { event.preventDefault(); event.stopPropagation() }
    })
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  sync(letters: readonly Letter[], canUndo: boolean) {
    const focusedAction = [this.remove, this.undo].find(button => document.activeElement === button)
    this.remove.disabled = !letters.some(letter => letter.origin === 'collected')
    this.remove.hidden = this.remove.disabled
    this.undo.disabled = !canUndo
    this.submit.disabled = !letters.length
    const restoreActionFocus = () => {
      if (focusedAction?.disabled) (canUndo ? this.undo : this.buttons().at(-1))?.focus({ preventScroll: true })
    }
    if (letters.length === this.letters.length && letters.every((letter, i) => letter.id === this.letters[i].id && letter.char === this.letters[i].char && letter.origin === this.letters[i].origin)) {
      restoreActionFocus()
      return
    }
    const previous = new Map(this.buttons().map((button, i) => [this.letters[i].id, button.getBoundingClientRect().left]))
    const focused = this.buttons().findIndex(button => button === document.activeElement)
    const focusedId = this.letters[focused]?.id
    for (const flight of this.layer.querySelectorAll<HTMLElement>('.spell-flight[data-letter-id]')) {
      const id = flight.dataset.letterId
      const destination = letters.findIndex(letter => letter.id === id)
      if (destination < 0 || this.letters[destination]?.id !== id) {
        for (const animation of flight.getAnimations()) animation.cancel()
        flight.remove()
      }
    }
    this.cancelGesture()
    this.selected = null
    this.letters = [...letters]
    this.tiles.classList.toggle('is-empty', !letters.length)
    this.tiles.replaceChildren(...letters.map((letter, index) => {
      const button = el('button', 'spell-tile')
      button.type = 'button'
      button.dataset.index = String(index)
      button.dataset.origin = letter.origin
      button.setAttribute('aria-label', letter.char)
      button.setAttribute('aria-pressed', 'false')
      button.append(letterInk(letter))
      button.addEventListener('click', event => {
        if (event.detail === 0 && this.enabled) this.tap(index)
      })
      return button
    }))
    const buttons = this.buttons()
    if (focusedId) {
      const nextFocus = buttons[letters.findIndex(letter => letter.id === focusedId)] ??
        buttons[Math.min(focused, buttons.length - 1)] ?? this.undo
      nextFocus.focus({ preventScroll: true })
    } else restoreActionFocus()
    buttons.forEach((button, i) => {
      const oldX = previous.get(letters[i].id)
      if (oldX === undefined) return
      const offset = oldX - button.getBoundingClientRect().left
      if (offset) button.animate([{ translate: offset + 'px 0' }, { translate: '0 0' }], { duration: cfg.snapMs, easing: 'ease-out' })
    })
  }

  private buttons() { return Array.from(this.tiles.querySelectorAll<HTMLButtonElement>('.spell-tile')) }

  get selectedIndex() { return this.selected }

  finishEdit() {
    this.cancelGesture()
    this.select(null)
  }

  private select(index: number | null) {
    this.selected = index
    this.buttons().forEach((button, i) => button.setAttribute('aria-pressed', String(index === i)))
  }

  private tap(index: number) {
    const previous = this.selected
    this.select(previous === null ? index : null)
    if (previous !== null && previous !== index) this.actions.swap(previous, index)
  }

  private readonly down = (event: PointerEvent) => {
    if (event.button !== 0 || this.gesture || !this.enabled) return
    const tile = (event.target as Element).closest<HTMLButtonElement>('.spell-tile')
    if (!tile) return
    event.preventDefault()
    const index = Number(tile.dataset.index)
    this.gesture = { pointer: event.pointerId, index, target: index, start: { x: event.clientX, y: event.clientY }, dragging: false, tile }
    tile.setPointerCapture(event.pointerId)
  }

  private readonly move = (event: PointerEvent) => {
    const g = this.gesture
    if (!g || g.pointer !== event.pointerId) return
    const dx = event.clientX - g.start.x
    const dy = event.clientY - g.start.y
    if (!g.dragging && Math.hypot(dx, dy) < cfg.dragThreshold) return
    if (!g.dragging) {
      g.dragging = true
      this.select(null)
      g.tile.classList.add('is-dragging')
      this.actions.drag(true)
    }
    const buttons = this.buttons()
    // offsetLeft is unaffected by the visual translations used for drag preview.
    const startX = this.tiles.getBoundingClientRect().left
    const centers = buttons.map(button => startX + button.offsetLeft + button.offsetWidth / 2)
    const closest = centers.reduce((best, x, i) => Math.abs(x - event.clientX) < Math.abs(centers[best] - event.clientX) ? i : best, g.index)
    g.target = closest
    const step = centers.length > 1 ? centers[1] - centers[0] : 0
    buttons.forEach((button, i) => {
      if (i === g.index) button.style.translate = dx + 'px ' + dy + 'px'
      else if (i > g.index && i <= closest) button.style.translate = -step + 'px 0'
      else if (i < g.index && i >= closest) button.style.translate = step + 'px 0'
      else button.style.removeProperty('translate')
    })
  }

  private readonly up = (event: PointerEvent) => {
    const g = this.gesture
    if (!g || g.pointer !== event.pointerId) return
    const rect = this.tiles.getBoundingClientRect()
    const onBar = event.clientY >= rect.top - cfg.dropMargin && event.clientY <= rect.bottom + cfg.dropMargin &&
      event.clientX >= rect.left - cfg.dropMargin && event.clientX <= rect.right + cfg.dropMargin
    this.cancelGesture()
    if (!onBar) return
    if (!g.dragging) this.tap(g.index)
    else if (g.index !== g.target) this.actions.insert(g.index, g.target)
  }

  private cancelGesture() {
    const g = this.gesture
    if (!g) return
    this.gesture = null
    if (g.tile.hasPointerCapture(g.pointer)) g.tile.releasePointerCapture(g.pointer)
    this.buttons().forEach(button => { button.style.removeProperty('translate'); button.classList.remove('is-dragging') })
    if (g.dragging) this.actions.drag(false)
  }

  fly(index: number, from: Position) {
    const letter = this.letters[index]
    const tile = this.buttons()[index]
    if (!tile || !letter) return
    const target = tile.getBoundingClientRect()
    const stage = this.stage.getBoundingClientRect()
    const x = target.left + target.width / 2
    const y = target.top + target.height / 2
    const ghost = el('span', 'spell-flight')
    ghost.dataset.letterId = letter.id
    ghost.setAttribute('aria-hidden', 'true')
    ghost.append(letterInk(letter))
    ghost.style.left = x - stage.left + 'px'
    ghost.style.top = y - stage.top + 'px'
    this.layer.append(ghost)
    const flight = ghost.animate([
      { translate: (from.x - x) + 'px ' + (from.y - y) + 'px', opacity: 1, scale: '1.25' },
      { translate: '0 0', opacity: .7, scale: '1' },
    ], { duration: SPELL_CONFIG.loadSeconds * 1000, easing: 'cubic-bezier(.25,.7,.35,1)' })
    flight.onfinish = flight.oncancel = () => ghost.remove()
  }

  note(lineId?: LineId, at?: Position) {
    window.clearTimeout(this.messageTimeout)
    this.line = lineId
    const text = lineId && textForLine(lineId)
    this.message.hidden = !text
    if (text) {
      this.message.replaceChildren(inkLabel(text, CONFIG.ui.labelHeight))
      this.setHighlight(this.highlight)
      const stage = this.stage.getBoundingClientRect()
      const margin = cfg.dropMargin
      const minX = Math.min(stage.width / 2, this.message.offsetWidth / 2 + margin / 2)
      const requestedX = at ? at.x - stage.left : stage.width / 2
      this.message.style.left = Math.min(stage.width - minX, Math.max(minX, requestedX)) + 'px'
      const requestedY = at ? at.y - stage.top - margin : this.bar.offsetTop + this.bar.offsetHeight + margin
      this.message.style.top = Math.min(stage.height - this.message.offsetHeight, Math.max(0, requestedY)) + 'px'
      this.messageTimeout = window.setTimeout(() => { this.message.hidden = true }, cfg.messageMs)
    }
  }

  feedback(kind: 'spell' | 'egg' | 'error', lineId?: LineId, at?: Position) {
    this.note(lineId, at)
    if (kind === 'error') {
      this.tiles.animate([0, -1, 1, -1, 1, 0].map(n => ({ translate: n * cfg.dragThreshold + 'px 0' })), { duration: SPELL_CONFIG.feedbackSeconds * 1000 })
    } else {
      const flash = el('span', 'spell-burst')
      flash.setAttribute('aria-hidden', 'true')
      const rect = this.tiles.getBoundingClientRect()
      const stage = this.stage.getBoundingClientRect()
      flash.style.left = rect.left - stage.left + 'px'
      flash.style.top = rect.top - stage.top + 'px'
      flash.style.width = rect.width + 'px'
      flash.style.height = rect.height + 'px'
      this.layer.append(flash)
      if (kind === 'spell') {
        this.buttons().forEach((tile, i) => {
          const letter = this.letters[i]
          const rect = tile.getBoundingClientRect()
          const afterimage = el('span', 'spell-flight')
          afterimage.setAttribute('aria-hidden', 'true')
          afterimage.style.left = rect.left + rect.width / 2 - stage.left + 'px'
          afterimage.style.top = rect.top + rect.height / 2 - stage.top + 'px'
          afterimage.append(letterInk(letter))
          this.layer.append(afterimage)
          const fade = afterimage.animate([{ opacity: 1 }, { opacity: 0, translate: '0 -50%', scale: '1.15' }], { duration: cfg.burstMs })
          fade.onfinish = fade.oncancel = () => afterimage.remove()
        })
      }
      const animation = flash.animate([{ opacity: .95, scale: '.7', translate: '0 0' }, { opacity: 0, scale: '1.25', translate: '0 -12px' }], { duration: cfg.burstMs, easing: 'ease-out' })
      animation.onfinish = animation.oncancel = () => flash.remove()
      this.tiles.animate([{ filter: 'brightness(2) drop-shadow(0 0 5px #fff)' }, { filter: 'none' }], { duration: cfg.burstMs })
    }
  }

  setCooldown(fraction: number) {
    const ratio = Math.max(0, Math.min(1, fraction))
    this.tiles.classList.toggle('is-cooling', ratio > 0)
    this.tiles.style.setProperty('--cooldown', ratio * 360 + 'deg')
  }

  setTimer(fraction: number, urgent = false) {
    this.timer.hidden = fraction <= 0
    this.timer.classList.toggle('is-urgent', urgent)
    this.timer.style.setProperty('--remaining', Math.max(0, Math.min(1, fraction)).toString())
  }

  setVignette(active: boolean) { this.vignette.classList.toggle('is-active', active) }
  setHighlight(active: boolean) {
    this.highlight = active
    const canvas = this.message.querySelector('canvas')
    if (canvas) tint(canvas, active && this.line && LINES[this.line].status !== '已批准' ? cfg.highlightColor : CONFIG.colors.note)
  }
  setEnabled(active: boolean) {
    this.enabled = active
    this.layer.inert = !active
    if (!active) { this.cancelGesture(); this.setVignette(false); this.select(null) }
  }
  clearTransient() {
    this.finishEdit()
    this.note()
    for (const piece of this.layer.querySelectorAll('.spell-burst,.spell-flight')) {
      for (const animation of piece.getAnimations()) animation.cancel()
      piece.remove()
    }
    for (const animation of this.tiles.getAnimations({ subtree: true })) animation.cancel()
  }
  destroy() {
    this.cancelGesture()
    window.clearTimeout(this.messageTimeout)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.layer.remove()
  }
}
