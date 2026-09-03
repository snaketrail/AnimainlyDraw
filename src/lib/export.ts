/**
 * Export.
 *
 * The old app screenshotted a div with html2canvas, so output was whatever
 * resolution the screen happened to be. Here the page is redrawn from the
 * project data onto an offscreen canvas at full page size — the export is a
 * function of the data, not a photo of the editor.
 */

import type { BubbleObject, ImageObject, Page, PageSize, Project } from './types'
import { PRINT, isBubble, isImage, pageSizeOf, panelRect } from './types'
import { drawBubble, textInset, wrapText } from './bubbles'
import { assetUrl } from './storage'

const imageCache = new Map<string, HTMLImageElement>()

async function bitmapFor(assetId: string): Promise<HTMLImageElement | undefined> {
  const cached = imageCache.get(assetId)
  if (cached) return cached

  const url = await assetUrl(assetId)
  if (!url) return undefined

  const img = await new Promise<HTMLImageElement | undefined>((resolve) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => resolve(undefined)
    el.src = url
  })

  if (img) imageCache.set(assetId, img)
  return img
}

export async function renderPage(page: Page, size: PageSize): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D drawing context')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size.width, size.height)

  async function drawObject(object: ImageObject) {
    const img = await bitmapFor(object.assetId)
    if (!img) return

    ctx!.save()
    ctx!.globalAlpha = object.opacity

    // Rotate about the object's centre, matching how Konva's transformer
    // presents rotation in the editor.
    const cx = object.x + object.width / 2
    const cy = object.y + object.height / 2
    ctx!.translate(cx, cy)
    ctx!.rotate((object.rotation * Math.PI) / 180)
    if (object.flipX) ctx!.scale(-1, 1)

    ctx!.drawImage(img, -object.width / 2, -object.height / 2, object.width, object.height)
    ctx!.restore()
  }

  // Panelled art first, each clipped to its own frame, then the frames on top.
  for (const panel of page.panels) {
    const box = panelRect(panel, size)

    ctx.save()
    ctx.beginPath()
    ctx.rect(box.x, box.y, box.width, box.height)
    ctx.clip()
    for (const object of page.objects) {
      if (isImage(object) && object.panelId === panel.id) await drawObject(object)
    }
    ctx.restore()
  }

  // Art with no panel floats over the page.
  for (const object of page.objects) {
    if (isImage(object) && !object.panelId) await drawObject(object)
  }

  // Panel borders, scaled so they read the same as they do in the editor.
  const border = Math.max(2, size.width * 0.0019)
  ctx.strokeStyle = '#161412'
  ctx.lineWidth = border
  for (const panel of page.panels) {
    const box = panelRect(panel, size)
    ctx.strokeRect(box.x, box.y, box.width, box.height)
  }

  // Bubbles last: above every panel, so one can cross a border or sit in a
  // gutter, exactly as the editor shows it.
  for (const object of page.objects) {
    if (isBubble(object)) drawBubbleObject(ctx, object)
  }

  return canvas
}

/** Uses the same drawing code as the editor, so the two cannot drift apart. */
function drawBubbleObject(ctx: CanvasRenderingContext2D, bubble: BubbleObject): void {
  ctx.save()
  ctx.translate(bubble.x, bubble.y)
  if (bubble.rotation) {
    ctx.translate(bubble.width / 2, bubble.height / 2)
    ctx.rotate((bubble.rotation * Math.PI) / 180)
    ctx.translate(-bubble.width / 2, -bubble.height / 2)
  }

  drawBubble(
    ctx,
    bubble.kind,
    {
      w: bubble.width,
      h: bubble.height,
      tailAngle: bubble.tailAngle,
      tailLength: bubble.tailLength,
      lineWidth: Math.max(2, bubble.fontSize * 0.09),
    },
    { fill: '#ffffff', stroke: '#161412' },
  )

  ctx.fillStyle = '#161412'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const italic = bubble.kind === 'whisper' ? 'italic ' : ''
  const weight = bubble.kind === 'shout' ? '700 ' : '400 '
  ctx.font = `${italic}${weight}${bubble.fontSize}px "Comic Sans MS", "Segoe UI", sans-serif`

  const lines = wrapText(ctx, bubble.text, bubble.width * textInset(bubble.kind))
  const lineHeight = bubble.fontSize * 1.25
  const startY = bubble.height / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, i) => ctx.fillText(line, bubble.width / 2, startY + i * lineHeight))

  ctx.restore()
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      blob ? resolve(blob) : reject(new Error('Could not encode the page'))
    }, 'image/png')
  })
}

function safeName(title: string): string {
  return title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'manga'
}

export async function exportCurrentPage(project: Project, index: number): Promise<void> {
  const page = project.pages[index]
  if (!page) return
  const canvas = await renderPage(page, pageSizeOf(project))
  download(await toBlob(canvas), `${safeName(project.title)}-page-${index + 1}.png`)
}

/**
 * The whole book as one PDF.
 *
 * Page size is set in millimetres from the real trim, so the PDF prints at the
 * right physical size rather than at whatever the pixel dimensions imply. JPEG
 * keeps a long manga to a sane file size; PNG of 30 pages at 300 DPI would run
 * to hundreds of megabytes.
 */
/** A page with no panels and no objects contributes a blank sheet. */
export function emptyPageNumbers(project: Project): number[] {
  return project.pages
    .map((page, i) => (page.objects.length === 0 && page.panels.length === 0 ? i + 1 : 0))
    .filter((n) => n > 0)
}

export async function exportPdf(project: Project): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const size = pageSizeOf(project)

  const doc = new jsPDF({
    orientation: size.width > size.height ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [PRINT.trimWidthMm, PRINT.trimHeightMm],
    compress: true,
  })

  for (const [i, page] of project.pages.entries()) {
    if (i > 0) doc.addPage([PRINT.trimWidthMm, PRINT.trimHeightMm])
    const canvas = await renderPage(page, size)
    doc.addImage(
      canvas.toDataURL('image/jpeg', 0.92),
      'JPEG',
      0,
      0,
      PRINT.trimWidthMm,
      PRINT.trimHeightMm,
    )
  }

  doc.save(`${safeName(project.title)}.pdf`)
}

export async function exportAllPages(project: Project): Promise<void> {
  const size = pageSizeOf(project)
  for (const [i, page] of project.pages.entries()) {
    const canvas = await renderPage(page, size)
    download(await toBlob(canvas), `${safeName(project.title)}-page-${i + 1}.png`)
    // Browsers throttle rapid successive downloads; a short gap keeps them all.
    await new Promise((r) => setTimeout(r, 350))
  }
}
