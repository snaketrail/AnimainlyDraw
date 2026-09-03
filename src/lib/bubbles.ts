/**
 * Speech bubble outlines.
 *
 * Each shape is drawn into a plain 2D context, so the editor (via Konva's
 * sceneFunc) and the exporter share exactly one implementation. Anything that
 * drew them twice would eventually let the two drift apart — the same class of
 * bug that made the old app's screenshot export unreliable.
 *
 * All shapes are drawn in the bubble's own coordinate space: origin at the
 * top-left, `w` by `h` in size.
 */

import type { BubbleKind } from './types'

export interface BubbleStyle {
  w: number
  h: number
  tailAngle: number
  tailLength: number
  lineWidth: number
}

/** Where the tail meets the bubble edge, and where its tip lands. */
function tailPoints({ w, h, tailAngle, tailLength }: BubbleStyle) {
  const cx = w / 2
  const cy = h / 2
  const rad = (tailAngle * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)

  // Point on the ellipse in the tail's direction.
  const baseX = cx + (w / 2) * dx
  const baseY = cy + (h / 2) * dy

  const reach = (h / 2) * tailLength
  const tipX = baseX + dx * reach
  const tipY = baseY + dy * reach

  // A base width perpendicular to the tail direction. Narrow, so the tail
  // reads as a pointer rather than a wedge.
  const spread = Math.min(w, h) * 0.11
  const px = -dy * spread
  const py = dx * spread

  const left = { x: baseX + px, y: baseY + py }
  const right = { x: baseX - px, y: baseY - py }

  // Control points sit partway along each edge, pulled toward the bubble's
  // axis, which curves the sides inward and tapers the tip.
  const bend = 0.55
  const ctrlLeft = {
    x: left.x + (tipX - left.x) * bend - px * 0.35,
    y: left.y + (tipY - left.y) * bend - py * 0.35,
  }
  const ctrlRight = {
    x: right.x + (tipX - right.x) * bend + px * 0.35,
    y: right.y + (tipY - right.y) * bend + py * 0.35,
  }

  return { left, right, tip: { x: tipX, y: tipY }, ctrlLeft, ctrlRight }
}

function ellipse(ctx: CanvasRenderingContext2D | Path2D, w: number, h: number) {
  const c = ctx as CanvasRenderingContext2D
  c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
}

function roundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.moveTo(radius, 0)
  ctx.lineTo(w - radius, 0)
  ctx.quadraticCurveTo(w, 0, w, radius)
  ctx.lineTo(w, h - radius)
  ctx.quadraticCurveTo(w, h, w - radius, h)
  ctx.lineTo(radius, h)
  ctx.quadraticCurveTo(0, h, 0, h - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
}

/** A jagged starburst, for shouting. */
function burst(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2
  const cy = h / 2
  const spikes = 18
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    // Alternate between the full radius and a shorter one to cut the points.
    const k = i % 2 === 0 ? 1 : 0.78
    const x = cx + Math.cos(angle) * (w / 2) * k
    const y = cy + Math.sin(angle) * (h / 2) * k
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/**
 * Draw a bubble. `ctx` may be a real canvas context or Konva's scene context;
 * both expose the same 2D drawing API.
 */
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  kind: BubbleKind,
  style: BubbleStyle,
  colors: { fill: string; stroke: string },
): void {
  const { w, h, tailLength, lineWidth } = style
  ctx.save()
  ctx.fillStyle = colors.fill
  ctx.strokeStyle = colors.stroke
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'

  // Speech is a plain ellipse — no tail. Point a line of trail dots at the
  // speaker instead, or just let the layout say who is talking.
  const hasTail = tailLength > 0 && (kind === 'shout' || kind === 'whisper')

  // A trail dot is just a circle: chain several to lead back to a speaker.
  if (kind === 'trail') {
    ctx.beginPath()
    ellipse(ctx, w, h)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    return
  }

  ctx.beginPath()

  if (kind === 'caption') {
    roundedRect(ctx, w, h, Math.min(w, h) * 0.06)
  } else if (kind === 'shout') {
    burst(ctx, w, h)
  } else {
    ellipse(ctx, w, h)
  }

  // The tail is part of the same path, so fill and stroke treat it as one
  // shape and no seam shows where it meets the body. It is drawn as two
  // curves tapering to the tip rather than a flat triangle, which reads as
  // modern lettering rather than a 1960s comic.
  if (hasTail) {
    const t = tailPoints(style)
    ctx.moveTo(t.left.x, t.left.y)
    ctx.quadraticCurveTo(t.ctrlLeft.x, t.ctrlLeft.y, t.tip.x, t.tip.y)
    ctx.quadraticCurveTo(t.ctrlRight.x, t.ctrlRight.y, t.right.x, t.right.y)
    ctx.closePath()
  }

  ctx.fill()

  if (kind === 'whisper') {
    ctx.setLineDash([lineWidth * 4, lineWidth * 3])
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/**
 * Lay text out into lines that fit the bubble.
 * Returns the lines; the caller positions them.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }

    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth || !line) {
        line = candidate
      } else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
  }

  return lines
}

/** The usable text area inside a bubble, as a fraction of its box. */
export function textInset(kind: BubbleKind): number {
  // A burst wastes more of its box on spikes than an ellipse does.
  if (kind === 'shout') return 0.62
  if (kind === 'caption') return 0.86
  return 0.7
}

/** Trail dots are small and round; everything else gets a normal text box. */
export function isTrailDot(kind: BubbleKind): boolean {
  return kind === 'trail'
}
