import { SPELL_CONFIG } from '../config'

/** UI runs in real time. All world simulation consumes the returned elapsed time. */
export class WorldClock {
  private enabled = true
  private dragging = false
  private currentScale = 1

  get scale(): number {
    return this.currentScale
  }

  setDragging(dragging: boolean): void {
    this.dragging = dragging
    if (dragging && this.enabled) this.currentScale = SPELL_CONFIG.dragScale
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.currentScale = 1
    else if (this.dragging) this.currentScale = SPELL_CONFIG.dragScale
  }

  advance(realSeconds: number): number {
    if (!Number.isFinite(realSeconds) || realSeconds <= 0) return 0
    if (this.dragging || this.currentScale === 1) return realSeconds * this.currentScale
    const rate = (1 - SPELL_CONFIG.dragScale) / SPELL_CONFIG.releaseSeconds
    const start = this.currentScale
    const remaining = (1 - start) / rate
    const recovering = Math.min(realSeconds, remaining)
    this.currentScale = realSeconds >= remaining ? 1 : start + rate * recovering
    // Integrate the linear ramp, including frames that straddle its end.
    return recovering * (start + this.currentScale) / 2 + (realSeconds - recovering)
  }
}
