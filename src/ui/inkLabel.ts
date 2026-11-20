import { CONFIG } from '../config'
import { layoutHandwriting } from '../font/handwriting'

/** The chrome uses the same local pen alphabet as the course, including its accessible text equivalent. */
export function inkLabel(text: string, height: number = CONFIG.ui.labelHeight, bold = false, color = '#ffffff') {
  const { glyphs, bounds } = layoutHandwriting({ text, seed: CONFIG.ui.labelSeed, size: height })
  const pen = height * (bold ? CONFIG.ui.boldPen : CONFIG.ui.labelPen)
  const margin = Math.ceil(pen) + 1
  const width = Math.ceil(bounds.maxX - bounds.minX + 2 * margin)
  const inkHeight = Math.ceil(bounds.maxY - bounds.minY + 2 * margin)
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  const density = Math.max(1, window.devicePixelRatio)
  canvas.width = Math.ceil(width * density)
  canvas.height = Math.ceil(inkHeight * density)
  canvas.style.width = width + 'px'
  canvas.style.height = inkHeight + 'px'
  const ctx = canvas.getContext('2d')!
  ctx.scale(density, density)
  ctx.translate(margin - bounds.minX, margin - bounds.minY)
  ctx.lineWidth = pen
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = ctx.fillStyle = color
  for (const glyph of glyphs) for (const stroke of glyph.strokes) {
    const first = stroke[0]
    if (!first) continue
    ctx.beginPath()
    if (stroke.length === 1) {
      ctx.arc(first.x, first.y, pen / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.moveTo(first.x, first.y)
      for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
  }
  const label = document.createElement('span')
  label.className = 'ink-label'
  const accessible = document.createElement('span')
  accessible.className = 'sr-only'
  accessible.textContent = text
  label.append(canvas, accessible)
  return label
}
