/**
 * The project model.
 *
 * The rule that governs this whole app: an object's position lives here and
 * nowhere else. Konva draws from this tree, the inspector edits it, undo
 * snapshots it, export renders it. Nothing reads a position back off the DOM
 * or off a Konva node, so nothing can disagree about where things are.
 */

/**
 * Tags are free text, not a fixed list. A manga needs whatever categories its
 * author needs — "kenji", "rooftop", "night", "sfx" — and no closed set of
 * four would survive contact with a real project. These are the tags offered
 * on a fresh library purely as a starting point.
 */
export const SUGGESTED_TAGS = ['character', 'background', 'prop', 'effect'] as const

/** An imported image. Stored once, referenced by many objects across many pages. */
export interface Asset {
  id: string
  /** Display name: shortened at import, and freely renameable. */
  name: string
  /** The original filename, kept so search can still find it. */
  fileName?: string
  /** Free-form, lowercase, deduplicated. May be empty. */
  tags: string[]
  /** Natural pixel dimensions, measured at import so we never re-decode to find them. */
  width: number
  height: number
  /** Bytes, for the storage readout. */
  size: number
  addedAt: number
}

/** Page dimensions in pixels at the project's working resolution. */
export interface PageSize {
  label: string
  width: number
  height: number
  dpi: number
}

/**
 * B5 is the standard Japanese manga tankobon trim (182 x 257 mm).
 * At 300 DPI that is 2149 x 3035 px, which is what a printer would want.
 */
export const PAGE_SIZES: Record<string, PageSize> = {
  b5: { label: 'B5 manga (182 × 257 mm)', width: 2149, height: 3035, dpi: 300 },
  a4: { label: 'A4 (210 × 297 mm)', width: 2480, height: 3508, dpi: 300 },
  square: { label: 'Square (webtoon panel)', width: 2048, height: 2048, dpi: 300 },
}

/**
 * A panel: a frame on the page that clips whatever art sits inside it.
 * Coordinates are fractions of the *inner frame* (0-1), not absolute pixels,
 * so a layout preset works at any page size and any DPI.
 */
export interface Panel {
  id: string
  /** All 0-1, relative to the inner frame. */
  x: number
  y: number
  w: number
  h: number
}

export interface ImageObject {
  type: 'image'
  id: string
  assetId: string
  /** The panel this art is clipped to, or null for art floating over the page. */
  panelId: string | null
  x: number
  y: number
  /** Rendered size. Kept explicit rather than as a scale factor so the
   *  inspector can show real numbers and export needs no maths. */
  width: number
  height: number
  rotation: number
  flipX: boolean
  opacity: number
}

/**
 * A speech bubble.
 *
 * Bubbles are page-level, never panel-level: in real manga they routinely
 * straddle panel borders and sit in the gutter, so clipping them to a panel
 * would forbid a standard convention. They are instead constrained to the
 * printable page, since anything past the trim is cut off by the printer.
 */
export type BubbleKind = 'speech' | 'shout' | 'whisper' | 'caption' | 'trail'

export const BUBBLE_KINDS: { id: BubbleKind; label: string; note: string }[] = [
  { id: 'speech', label: 'Speech', note: 'Ordinary dialogue' },
  { id: 'trail', label: 'Trail dot', note: 'A small circle — chain a few to point at a speaker' },
  { id: 'shout', label: 'Shout', note: 'Jagged burst for yelling' },
  { id: 'whisper', label: 'Whisper', note: 'Dashed outline for quiet lines' },
  { id: 'caption', label: 'Caption', note: 'Narration box' },
]

export interface BubbleObject {
  type: 'bubble'
  id: string
  kind: BubbleKind
  text: string
  x: number
  y: number
  width: number
  height: number
  /** Direction the tail points, in degrees; 90 is straight down. */
  tailAngle: number
  /** Tail length as a fraction of the bubble's half-height. 0 hides it. */
  tailLength: number
  fontSize: number
  rotation: number
}

export type PageObject = ImageObject | BubbleObject

export function isImage(o: PageObject): o is ImageObject {
  return o.type === 'image'
}

export function isBubble(o: PageObject): o is BubbleObject {
  return o.type === 'bubble'
}

/** Keep a rectangle within the printable page. */
export function clampToPage(
  rect: { x: number; y: number; width: number; height: number },
  size: PageSize,
) {
  return {
    x: Math.min(Math.max(0, rect.x), Math.max(0, size.width - rect.width)),
    y: Math.min(Math.max(0, rect.y), Math.max(0, size.height - rect.height)),
  }
}

export interface Page {
  id: string
  panels: Panel[]
  objects: PageObject[]
}

/**
 * Manga print geometry, from standard B4 manuscript paper.
 *
 *   - finished trim     182 x 257 mm
 *   - bleed (断ち切り)    5 mm beyond trim on every side
 *   - inner frame (安全枠) 150 x 220 mm, centred — nothing important goes outside it
 *
 * Panels are laid out inside the inner frame; art may bleed past it.
 */
export const PRINT = {
  trimWidthMm: 182,
  trimHeightMm: 257,
  bleedMm: 5,
  innerWidthMm: 150,
  innerHeightMm: 220,
  /** Gutter between panels, as a fraction of page width. Vertical gutters in
   *  manga are traditionally tighter than horizontal ones. */
  gutterX: 0.022,
  gutterY: 0.035,
} as const

/** The inner frame in page pixels: the rectangle panels are laid out within. */
export function innerFrame(size: PageSize) {
  const w = size.width * (PRINT.innerWidthMm / PRINT.trimWidthMm)
  const h = size.height * (PRINT.innerHeightMm / PRINT.trimHeightMm)
  return {
    x: (size.width - w) / 2,
    y: (size.height - h) / 2,
    width: w,
    height: h,
  }
}

/** Resolve a panel's 0-1 coordinates to absolute page pixels. */
export function panelRect(panel: Panel, size: PageSize) {
  const frame = innerFrame(size)
  return {
    x: frame.x + panel.x * frame.width,
    y: frame.y + panel.y * frame.height,
    width: panel.w * frame.width,
    height: panel.h * frame.height,
  }
}

/**
 * A recurring character.
 *
 * The point is consistency: the same appearance tags get prepended to every
 * image prompt for this character, so panel 40 looks like panel 1. Drift is
 * the characteristic failure of AI-generated comics, and a remembered
 * description is the cheapest defence against it.
 */
export interface Character {
  id: string
  name: string
  role: 'main' | 'side'
  /** Appearance tags, comma-separated: what makes them recognisable. */
  prompt: string
  /** Free notes for the writer — personality, voice, arc. Never sent to image models. */
  notes: string
}

/**
 * The style bible: the look every page shares.
 *
 * `positive` is prepended and `negative` appended to every image prompt, so a
 * whole book is rendered in one visual language rather than per-panel guesses.
 */
export interface StyleBible {
  positive: string
  negative: string
  /** Premise and tone, given to the writing model as standing context. */
  synopsis: string
}

export function emptyStyle(): StyleBible {
  return {
    positive: 'manga style, clean line art, screentone shading, detailed background',
    negative: 'photorealistic, 3d render, watermark, text, signature, blurry, extra fingers',
    synopsis: '',
  }
}

/**
 * The story plan: series → chapters → pages.
 *
 * Each level is decided before the one below it, because a page written with
 * no knowledge of the chapter (and a chapter with no knowledge of the series)
 * produces a sequence of disconnected scenes. This is the story-level
 * equivalent of the cast sheet: settle it once, then follow it.
 */

/** One page of a chapter: a single beat. */
export interface Beat {
  id: string
  summary: string
  /** True once this beat has been built into an actual page. */
  written: boolean
  /** Which page in the project it became, if any. */
  pageId?: string
}

export interface Chapter {
  id: string
  title: string
  /** What this chapter accomplishes for the series, in a sentence. */
  summary: string
  beats: Beat[]
  /** Chapters are planned into pages on demand, not all at once. */
  planned: boolean
}

export interface Series {
  /** The whole work in a sentence or two. */
  premise: string
  /** Where the story ends up — keeps chapters pointed somewhere. */
  ending: string
  chapters: Chapter[]
}

export function emptySeries(): Series {
  return { premise: '', ending: '', chapters: [] }
}

/** Every beat in reading order, with its chapter, for continuity context. */
export function allBeats(series: Series): { chapter: Chapter; beat: Beat }[] {
  return series.chapters.flatMap((chapter) =>
    chapter.beats.map((beat) => ({ chapter, beat })),
  )
}

export interface Project {
  id: string
  title: string
  pageSizeKey: keyof typeof PAGE_SIZES
  pages: Page[]
  /** The style bible and cast travel with the project, so they survive save/load. */
  style: StyleBible
  characters: Character[]
  series: Series
  updatedAt: number
}

export function pageSizeOf(project: Project): PageSize {
  return PAGE_SIZES[project.pageSizeKey] ?? PAGE_SIZES.b5!
}

/** Tags are compared case-insensitively and stored trimmed and lowercased. */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase()
}

/** Every distinct tag across the library, alphabetised, for the filter bar. */
export function allTags(assets: Asset[]): string[] {
  const seen = new Set<string>()
  for (const asset of assets) {
    for (const tag of asset.tags) seen.add(tag)
  }
  return [...seen].sort()
}

export function createId(): string {
  return crypto.randomUUID()
}

export function emptyPage(): Page {
  return { id: createId(), panels: [], objects: [] }
}

export function emptyProject(): Project {
  return {
    id: createId(),
    title: 'Untitled manga',
    pageSizeKey: 'b5',
    pages: [emptyPage()],
    style: emptyStyle(),
    characters: [],
    series: emptySeries(),
    updatedAt: Date.now(),
  }
}

/**
 * Build the full image prompt for a panel: style, then any characters the
 * panel mentions, then the panel's own description.
 */
export function composePrompt(
  project: Project,
  panelPrompt: string,
  characterIds: string[] = [],
): { positive: string; negative: string } {
  const cast = project.characters
    .filter((c) => characterIds.includes(c.id))
    .map((c) => c.prompt)
    .filter(Boolean)

  return {
    positive: [project.style.positive, ...cast, panelPrompt].filter(Boolean).join(', '),
    negative: project.style.negative,
  }
}
