/**
 * The single source of truth.
 *
 * Undo works by snapshotting the whole project before each mutation. Projects
 * are small (a page is a list of numbers; the pixels live in IndexedDB), so
 * this is cheap and — unlike the old app's stack of DOM removals — it can undo
 * a *move*, not just a deletion.
 */

import { create } from 'zustand'
import type {
  Asset,
  BubbleKind,
  BubbleObject,
  Beat,
  Character,
  Series,
  StyleBible,
  ImageObject,
  Page,
  PageObject,
  Panel,
  Project,
} from '../lib/types'
import type { GeneratedPage, LlmSettings } from '../lib/llm'
import { DEFAULT_LLM, generateChapterBeats, generateSeries } from '../lib/llm'
import {
  PRINT,
  clampToPage,
  createId,
  emptyPage,
  emptyProject,
  composePrompt,
  emptySeries,
  emptyStyle,
  randomSeed,
  isBubble,
  isImage,
  normalizeTag,
  pageSizeOf,
  panelRect,
} from '../lib/types'
import { LAYOUTS, panelsFromLayout } from '../lib/layouts'
import { PANEL_SIZES, generateImage, sizeForShot } from '../lib/images'
import type { ComfySettings } from '../lib/comfy'
import { DEFAULT_COMFY, generate as comfyGenerate } from '../lib/comfy'
import * as storage from '../lib/storage'

/**
 * A partial update to any object on the page.
 *
 * Deliberately a union of partials, not `Partial<Image & Bubble>`: those two
 * carry different `type` literals, so intersecting them yields `never` and
 * every patch becomes uncallable.
 */
type ObjectPatch = Partial<Omit<ImageObject, 'type'>> | Partial<Omit<BubbleObject, 'type'>>

const HISTORY_LIMIT = 50

/** Set by stopBatch, read by the drawAll loop between panels. */
let batchCancelled = false

/** Long enough for a slow disk, short enough that nobody stares at a splash screen. */
const STORAGE_TIMEOUT_MS = 3000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Storage timed out')), ms),
    ),
  ])
}

interface State {
  project: Project
  assets: Asset[]
  currentPageIndex: number
  selectedId: string | null
  loading: boolean
  /** True when this browser refuses IndexedDB; the editor works but won't remember. */
  storageBlocked: boolean
  /** Set when an import fails, so the failure is visible instead of silent. */
  importError: string | null

  past: Project[]
  future: Project[]

  init: () => Promise<void>

  addAssets: (files: File[]) => Promise<void>
  clearImportError: () => void
  renameAsset: (id: string, name: string) => void
  addTag: (id: string, tag: string) => void
  removeTag: (id: string, tag: string) => void
  deleteAsset: (id: string) => void

  placeAsset: (assetId: string, panelId?: string | null) => void
  addBubble: (kind: BubbleKind) => void
  updateBubbleText: (id: string, text: string) => void
  applyLayout: (layoutId: string) => void
  clearPanels: () => void
  selectedPanelId: string | null
  selectPanel: (id: string | null) => void
  /** Panel editing: all coordinates are 0-1 fractions of the inner frame. */
  updatePanel: (id: string, patch: Partial<Omit<Panel, 'id'>>) => void
  addPanel: () => void
  deletePanel: (id: string) => void
  splitPanel: (id: string, axis: 'horizontal' | 'vertical') => void
  fitToPanel: (objectId: string) => void
  updateObject: (id: string, patch: ObjectPatch) => void
  /** Commit a drag/transform as one undo step, after the gesture ends. */
  commitObject: (id: string, patch: ObjectPatch) => void
  deleteObject: (id: string) => void
  bringForward: (id: string) => void
  sendBackward: (id: string) => void

  select: (id: string | null) => void

  addPage: () => void
  deletePage: (index: number) => void
  goToPage: (index: number) => void

  setTitle: (title: string) => void

  /** Style bible and cast — the memory that keeps a book visually consistent. */
  setStyle: (patch: Partial<StyleBible>) => void
  addCharacter: (role: Character['role']) => void
  updateCharacter: (id: string, patch: Partial<Omit<Character, 'id'>>) => void
  deleteCharacter: (id: string) => void

  /** LLM connection settings, remembered between sessions. */
  llm: LlmSettings
  setLlm: (patch: Partial<LlmSettings>) => void

  /** Local ComfyUI settings, remembered between sessions. */
  comfy: ComfySettings
  setComfy: (patch: Partial<ComfySettings>) => void

  /** Story plan: series, chapters, and the beats that become pages. */
  setSeries: (patch: Partial<Series>) => void
  setChapterBeats: (chapterIndex: number, beats: string[]) => void
  updateBeat: (chapterIndex: number, beatId: string, patch: Partial<Omit<Beat, 'id'>>) => void

  /** Turn a written page into real panels, captions and speech bubbles. */
  applyGeneratedPage: (generated: GeneratedPage, onNewPage: boolean, beatId?: string) => void

  /**
   * Plan a whole manga from one sentence: series, cast, style, and every
   * chapter broken into pages. One call instead of a dozen clicks.
   */
  autoPlan: (idea: string, minPages: number, maxPages: number) => Promise<void>
  /** What the planner is doing right now, for the progress line. */
  planProgress: string | null

  /**
   * Generate art for one panel from its stored prompt, and place it.
   * `pageIndex` defaults to the page on screen; batch runs pass it explicitly.
   */
  generatePanelArt: (panelId: string, pageIndex?: number) => Promise<void>
  /** Panels currently being drawn, so the UI can show progress per panel. */
  generatingPanels: string[]
  /** Live progress from the renderer, e.g. "rendering… 12s". */
  generatingMessage: string | null

  /**
   * Draw every empty panel across a range of pages, one at a time.
   *
   * Sequential on purpose: a local GPU renders one image at a time anyway, and
   * queueing dozens at once would only make the wait opaque and the cancel
   * useless.
   */
  drawAll: (scope: 'page' | 'book') => Promise<void>
  /** Cancel a running batch after the current panel finishes. */
  stopBatch: () => void
  batch: { done: number; total: number; label: string } | null
  /** Replace everything with a project loaded from a .animainly file. */
  loadFromFile: (loaded: { project: Project; assets: Asset[] }) => void

  undo: () => void
  redo: () => void
}

/**
 * Data written by an earlier build lacks fields the app now expects. Filling
 * them in on load beats crashing on someone's saved work.
 */
function migrateProject(project: Project): Project {
  return {
    ...project,
    style: project.style ?? emptyStyle(),
    // Characters written before seeds existed get one now, so their panels
    // start sharing a noise pattern from here on.
    characters: (project.characters ?? []).map((c) =>
      c.seed === undefined ? { ...c, seed: randomSeed() } : c,
    ),
    series: project.series ?? emptySeries(),
    pages: (project.pages ?? []).map((page) => ({
      ...page,
      panels: page.panels ?? [],
      objects: (page.objects ?? []).map((o) => {
        if (o.type !== 'bubble') {
          return { ...o, type: 'image' as const, panelId: o.panelId ?? null }
        }
        // The thought bubble was removed; older saves fall back to speech.
        const kind = (o.kind as string) === 'thought' ? 'speech' : o.kind
        return { ...o, kind }
      }),
    })),
  }
}

function migrateAssets(assets: Asset[]): Asset[] {
  return (assets ?? []).map((a) => {
    if (Array.isArray(a.tags)) return a
    // Older records carried a single `kind` string instead of a tag list.
    const legacy = (a as unknown as { kind?: string }).kind
    return { ...a, tags: legacy ? [legacy] : [] }
  })
}

/**
 * Objects that visually stack with this one, in paint order.
 *
 * The canvas draws in three passes — art inside each panel, then floating art,
 * then bubbles. Only objects in the same pass can overlap, so only they can be
 * meaningfully reordered against each other. Two images in different panels
 * never overlap, so swapping their draw order would change nothing on screen.
 */
export function stackPeers(page: Page, target: PageObject): PageObject[] {
  return page.objects.filter((o) => {
    if (isBubble(target)) return isBubble(o)
    if (isBubble(o)) return false
    return o.panelId === target.panelId
  })
}

/** Move an object one step through the objects it actually stacks with. */
function restack(page: Page, id: string, direction: 1 | -1): Page {
  const target = page.objects.find((o) => o.id === id)
  if (!target) return page

  const peers = stackPeers(page, target)
  const here = peers.findIndex((o) => o.id === id)
  const neighbour = peers[here + direction]
  if (here < 0 || !neighbour) return page

  const objects = [...page.objects]
  const a = objects.findIndex((o) => o.id === id)
  const b = objects.findIndex((o) => o.id === neighbour.id)
  objects[a] = neighbour
  objects[b] = target
  return { ...page, objects }
}

function persist(project: Project) {
  void storage.saveProject(project)
}

/**
 * Guess a starting tag from the shape of the image. A wide image is almost
 * always a background; a tall one is almost always a character. It's only a
 * suggestion — the user can add or remove any tag afterwards.
 */
function defaultTagsFor(width: number, height: number): string[] {
  const ratio = width / height
  if (ratio > 1.35) return ['background']
  if (ratio < 0.8) return ['character']
  return ['prop']
}

/**
 * Turn a generator's filename into something readable.
 *
 * AI tools emit names like "2026-08-08_14-23-48-prefectPonyXL_v50-1001027508":
 * a timestamp, a model name, and a seed. Only the model name means anything at
 * a glance, so strip the rest. The full original is kept in `fileName` for
 * search, and renaming is always available.
 */
function friendlyName(fileName: string): string {
  let name = fileName.replace(/\.[^.]+$/, '')

  // Leading date and/or time stamps, in the usual separator styles.
  name = name.replace(/^\d{4}[-_]\d{2}[-_]\d{2}[-_ T]*/, '')
  name = name.replace(/^\d{2}[-_]\d{2}[-_]\d{2}[-_ ]*/, '')
  // Trailing seed / id runs of 6+ digits.
  name = name.replace(/[-_ ]\d{6,}$/, '')
  // Collapse separators into spaces.
  name = name.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()

  if (!name) name = fileName.replace(/\.[^.]+$/, '')

  // CSS ellipsis clips the tail, which is often the informative part
  // ("_upscaled", "_v2"). Trimming the middle ourselves keeps both ends, but
  // only helps if the result is short enough to escape that clipping.
  if (name.length > 24) name = `${name.slice(0, 13)}…${name.slice(-9)}`
  return name
}

/** Read the natural size of an image file without adding it to the document. */
function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not read ${file.name}`))
    }
    img.src = url
  })
}

export const useStore = create<State>((set, get) => {
  /** Snapshot, mutate, persist. Every undoable edit goes through here. */
  function edit(fn: (project: Project) => Project) {
    const { project, past } = get()
    const next = { ...fn(project), updatedAt: Date.now() }
    set({
      project: next,
      past: [...past, project].slice(-HISTORY_LIMIT),
      future: [],
    })
    persist(next)
  }

  function editPage(fn: (page: Page) => Page) {
    edit((project) => {
      const index = get().currentPageIndex
      return {
        ...project,
        pages: project.pages.map((p, i) => (i === index ? fn(p) : p)),
      }
    })
  }

  return {
    project: emptyProject(),
    assets: [],
    currentPageIndex: 0,
    selectedId: null,
    selectedPanelId: null,
    generatingPanels: [],
    generatingMessage: null,
    batch: null,
    planProgress: null,
    llm: DEFAULT_LLM,
    comfy: DEFAULT_COMFY,
    loading: true,
    storageBlocked: false,
    importError: null,
    past: [],
    future: [],

    async init() {
      // IndexedDB is unavailable in private windows and when a browser is set
      // to block site data. In those cases the open request often never
      // settles at all rather than rejecting, so a plain try/catch would leave
      // the app on its splash screen forever. Race it and move on.
      try {
        const [project, assets, llm, comfy] = await withTimeout(
          Promise.all([
            storage.loadProject(),
            storage.loadAssetIndex(),
            storage.loadLlmSettings<LlmSettings>(),
            storage.loadComfySettings<ComfySettings>(),
          ]),
          STORAGE_TIMEOUT_MS,
        )
        set({
          project: project ? migrateProject(project) : emptyProject(),
          assets: (() => {
            const migrated = migrateAssets(assets)
            storage.rememberRemoteAssets(migrated)
            return migrated
          })(),
          llm: { ...DEFAULT_LLM, ...(llm ?? {}) },
          comfy: { ...DEFAULT_COMFY, ...(comfy ?? {}) },
          loading: false,
          currentPageIndex: 0,
          storageBlocked: false,
        })
      } catch {
        set({
          project: emptyProject(),
          assets: [],
          loading: false,
          currentPageIndex: 0,
          storageBlocked: true,
        })
      }
    },

    async addAssets(files) {
      const imported: Asset[] = []
      const failed: string[] = []

      const images = files.filter((f) => f.type.startsWith('image/'))
      const skipped = files.length - images.length

      for (const file of images) {
        try {
          const { width, height } = await measure(file)
          const asset: Asset = {
            id: createId(),
            name: friendlyName(file.name),
            fileName: file.name,
            tags: defaultTagsFor(width, height),
            width,
            height,
            size: file.size,
            addedAt: Date.now(),
          }
          await storage.saveAssetBlob(asset.id, file)
          imported.push(asset)
        } catch {
          // One unreadable file shouldn't take down the whole drop, but the
          // user still needs to be told it didn't land.
          failed.push(file.name)
        }
      }

      if (imported.length > 0) {
        const assets = [...get().assets, ...imported]
        set({ assets })
        try {
          await storage.saveAssetIndex(assets)
        } catch {
          set({ storageBlocked: true })
        }
      }

      const problems: string[] = []
      if (failed.length) problems.push(`Couldn't import ${failed.join(', ')}`)
      if (skipped) problems.push(`${skipped} non-image file${skipped > 1 ? 's' : ''} skipped`)
      set({ importError: problems.length ? problems.join('. ') : null })
    },

    clearImportError() {
      set({ importError: null })
    },

    renameAsset(id, name) {
      const assets = get().assets.map((a) => (a.id === id ? { ...a, name } : a))
      set({ assets })
      void storage.saveAssetIndex(assets)
    },

    addTag(id, tag) {
      const clean = normalizeTag(tag)
      if (!clean) return
      const assets = get().assets.map((a) =>
        a.id === id && !a.tags.includes(clean) ? { ...a, tags: [...a.tags, clean] } : a,
      )
      set({ assets })
      void storage.saveAssetIndex(assets)
    },

    removeTag(id, tag) {
      const assets = get().assets.map((a) =>
        a.id === id ? { ...a, tags: a.tags.filter((t) => t !== tag) } : a,
      )
      set({ assets })
      void storage.saveAssetIndex(assets)
    },

    deleteAsset(id) {
      const assets = get().assets.filter((a) => a.id !== id)
      set({ assets })
      void storage.saveAssetIndex(assets)
      void storage.deleteAssetBlob(id)
      storage.releaseAssetUrl(id)

      // Objects pointing at a deleted asset would render as holes, so they go too.
      edit((project) => ({
        ...project,
        pages: project.pages.map((page) => ({
          ...page,
          objects: page.objects.filter((o) => !(isImage(o) && o.assetId === id)),
        })),
      }))
    },

    placeAsset(assetId, panelId) {
      const { assets, project, currentPageIndex, selectedPanelId } = get()
      const asset = assets.find((a) => a.id === assetId)
      if (!asset) return

      const size = pageSizeOf(project)
      const page = project.pages[currentPageIndex]

      // Drop into the named panel, else the selected one, else the first empty
      // panel so clicking through a library fills a layout in order. If every
      // panel is taken, stack into the last one rather than dumping the art
      // loose on the page — a page with panels should keep its art in them.
      const firstEmpty = page?.panels.find(
        (p) => !page.objects.some((o) => isImage(o) && o.panelId === p.id),
      )?.id
      const lastPanel = page?.panels[page.panels.length - 1]?.id

      const target =
        panelId !== undefined
          ? panelId
          : (selectedPanelId ?? firstEmpty ?? lastPanel ?? null)

      const panel = target ? page?.panels.find((p) => p.id === target) : undefined
      const box = panel
        ? panelRect(panel, size)
        : { x: size.width * 0.25, y: size.height * 0.25, width: size.width * 0.5, height: size.height * 0.5 }

      // Cover the box, preserving aspect ratio: art fills the panel with no gaps.
      const scale = Math.max(box.width / asset.width, box.height / asset.height)
      const width = asset.width * scale
      const height = asset.height * scale

      const object: ImageObject = {
        type: 'image',
        id: createId(),
        assetId,
        panelId: panel ? panel.id : null,
        x: box.x + (box.width - width) / 2,
        y: box.y + (box.height - height) / 2,
        width,
        height,
        rotation: 0,
        flipX: false,
        opacity: 1,
      }

      editPage((pg) => ({ ...pg, objects: [...pg.objects, object] }))
      set({ selectedId: object.id })
    },

    addBubble(kind) {
      const { project, currentPageIndex } = get()
      const size = pageSizeOf(project)
      const page = project.pages[currentPageIndex]

      // Each new bubble is placed clear of the last, stepping down the page
      // and wrapping back to the top, so a run of them never lands in a pile.
      // A trail dot is a small circle, not a text container.
      const isDot = kind === 'trail'
      const width = isDot ? size.width * 0.05 : size.width * 0.3
      const height = isDot ? size.width * 0.05 : size.height * 0.09

      // Count only bubbles of the same family, and step by this bubble's own
      // size — otherwise a small dot lands on top of a full-size bubble.
      const siblings =
        page?.objects.filter((o) => isBubble(o) && (o.kind === 'trail') === isDot).length ?? 0
      const perColumn = isDot ? 10 : 6
      const column = Math.floor(siblings / perColumn)
      const rowInColumn = siblings % perColumn

      const bubble: BubbleObject = {
        type: 'bubble',
        id: createId(),
        kind,
        text: isDot ? '' : kind === 'caption' ? 'Narration…' : 'New line…',
        // Dots start to the right of the bubble column so the two never collide.
        x: (isDot ? size.width * 0.42 : size.width * 0.06) + column * (width * 1.15),
        y: size.height * 0.05 + rowInColumn * (height * 1.3),
        width,
        height,
        tailAngle: 90,
        tailLength: kind === 'shout' || kind === 'whisper' ? 1 : 0,
        fontSize: Math.round(size.width * 0.022),
        rotation: 0,
      }

      editPage((pg) => ({ ...pg, objects: [...pg.objects, bubble] }))
      set({ selectedId: bubble.id })
    },

    updateBubbleText(id, text) {
      editPage((page) => ({
        ...page,
        objects: page.objects.map((o) => (o.id === id && isBubble(o) ? { ...o, text } : o)),
      }))
    },

    applyLayout(layoutId) {
      const layout = LAYOUTS.find((l) => l.id === layoutId)
      if (!layout) return
      const panels = panelsFromLayout(layout)

      // Replacing a layout re-homes existing art: each object moves to the
      // panel occupying the same slot, so a relayout doesn't orphan artwork.
      editPage((page) => {
        const oldIds = page.panels.map((p) => p.id)
        return {
          ...page,
          panels,
          objects: page.objects.map((o) => {
            // Bubbles are page-level and never belong to a panel.
            if (!isImage(o) || !o.panelId) return o
            const slot = oldIds.indexOf(o.panelId)
            const replacement = slot >= 0 ? panels[slot] : undefined
            return { ...o, panelId: replacement ? replacement.id : null }
          }),
        }
      })
      set({ selectedPanelId: null })
    },

    clearPanels() {
      editPage((page) => ({
        ...page,
        panels: [],
        objects: page.objects.map((o) => (isImage(o) ? { ...o, panelId: null } : o)),
      }))
      set({ selectedPanelId: null })
    },

    selectPanel(id) {
      set({ selectedPanelId: id, selectedId: null })
    },

    updatePanel(id, patch) {
      editPage((page) => ({
        ...page,
        panels: page.panels.map((p) => {
          if (p.id !== id) return p
          const next = { ...p, ...patch }
          // Panels live inside the inner frame, in 0-1 space. Clamping here
          // means a drag, a typed number and a split all obey the same rule.
          const w = Math.min(1, Math.max(0.03, next.w))
          const h = Math.min(1, Math.max(0.03, next.h))
          return {
            ...next,
            w,
            h,
            x: Math.min(Math.max(0, next.x), 1 - w),
            y: Math.min(Math.max(0, next.y), 1 - h),
          }
        }),
      }))
    },

    addPanel() {
      const panel: Panel = { id: createId(), x: 0.2, y: 0.2, w: 0.5, h: 0.3 }
      editPage((page) => ({ ...page, panels: [...page.panels, panel] }))
      set({ selectedPanelId: panel.id, selectedId: null })
    },

    deletePanel(id) {
      editPage((page) => ({
        ...page,
        panels: page.panels.filter((p) => p.id !== id),
        // Art in a deleted panel floats free rather than vanishing with it.
        objects: page.objects.map((o) =>
          isImage(o) && o.panelId === id ? { ...o, panelId: null } : o,
        ),
      }))
      set({ selectedPanelId: null })
    },

    splitPanel(id, axis) {
      const gap = axis === 'vertical' ? PRINT.gutterX : PRINT.gutterY
      let created: string | null = null

      editPage((page) => {
        const panel = page.panels.find((p) => p.id === id)
        if (!panel) return page

        const panels = page.panels.flatMap((p) => {
          if (p.id !== id) return [p]
          created = createId()

          if (axis === 'vertical') {
            const half = (p.w - gap) / 2
            if (half <= 0.02) return [p]
            // Right half first: manga reads right to left.
            return [
              { ...p, x: p.x + half + gap, w: half },
              { id: created, x: p.x, y: p.y, w: half, h: p.h },
            ]
          }

          const half = (p.h - gap) / 2
          if (half <= 0.02) return [p]
          return [
            { ...p, h: half },
            { id: created, x: p.x, y: p.y + half + gap, w: p.w, h: half },
          ]
        })

        return { ...page, panels }
      })

      if (created) set({ selectedPanelId: created })
    },

    /** Re-cover the object's panel — the fix after a drag has gone astray. */
    fitToPanel(objectId) {
      const { project, currentPageIndex, assets } = get()
      const page = project.pages[currentPageIndex]
      const object = page?.objects.find((o) => o.id === objectId)
      if (!page || !object || !isImage(object)) return

      const panel = page.panels.find((p) => p.id === object.panelId)
      if (!panel) return

      const asset = assets.find((a) => a.id === object.assetId)
      if (!asset) return

      const box = panelRect(panel, pageSizeOf(project))
      const scale = Math.max(box.width / asset.width, box.height / asset.height)
      const width = asset.width * scale
      const height = asset.height * scale

      get().commitObject(objectId, {
        x: box.x + (box.width - width) / 2,
        y: box.y + (box.height - height) / 2,
        width,
        height,
        rotation: 0,
      })
    },

    /** Live update during a drag: no history entry, or one drag would fill it. */
    updateObject(id, patch) {
      const { project, currentPageIndex } = get()
      const next = {
        ...project,
        pages: project.pages.map((page, i) =>
          i !== currentPageIndex
            ? page
            : {
                ...page,
                objects: page.objects.map((o) =>
                  o.id === id ? { ...o, ...patch } : o,
                ),
              },
        ),
      }
      set({ project: next })
    },

    commitObject(id, patch) {
      const size = pageSizeOf(get().project)
      editPage((page) => ({
        ...page,
        objects: page.objects.map((o) => {
          if (o.id !== id) return o
          const next = { ...o, ...patch } as PageObject
          // A bubble must stay on the printable page whatever changed it —
          // a drag, a typed number, or a resize that pushed it off the edge.
          return isBubble(next) ? { ...next, ...clampToPage(next, size) } : next
        }),
      }))
    },

    deleteObject(id) {
      editPage((page) => ({
        ...page,
        objects: page.objects.filter((o) => o.id !== id),
      }))
      if (get().selectedId === id) set({ selectedId: null })
    },

    bringForward(id) {
      editPage((page) => restack(page, id, +1))
    },

    sendBackward(id) {
      editPage((page) => restack(page, id, -1))
    },

    select(id) {
      set({ selectedId: id, selectedPanelId: null })
    },

    addPage() {
      edit((project) => ({ ...project, pages: [...project.pages, emptyPage()] }))
      set({ currentPageIndex: get().project.pages.length - 1, selectedId: null })
    },

    deletePage(index) {
      const { project } = get()
      if (project.pages.length <= 1) return
      edit((p) => ({ ...p, pages: p.pages.filter((_, i) => i !== index) }))
      set({
        currentPageIndex: Math.max(0, Math.min(index, get().project.pages.length - 1)),
        selectedId: null,
      })
    },

    goToPage(index) {
      set({ currentPageIndex: index, selectedId: null })
    },

    setTitle(title) {
      edit((project) => ({ ...project, title }))
    },

    setStyle(patch) {
      edit((project) => ({ ...project, style: { ...project.style, ...patch } }))
    },

    addCharacter(role) {
      const character: Character = {
        id: createId(),
        name: role === 'main' ? 'New lead' : 'New character',
        role,
        prompt: '',
        notes: '',
        // Every character gets one from the start, so their panels share a
        // starting point rather than each rolling fresh noise.
        seed: randomSeed(),
      }
      edit((project) => ({ ...project, characters: [...project.characters, character] }))
    },

    updateCharacter(id, patch) {
      edit((project) => ({
        ...project,
        characters: project.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }))
    },

    deleteCharacter(id) {
      edit((project) => ({
        ...project,
        characters: project.characters.filter((c) => c.id !== id),
      }))
    },

    setLlm(patch) {
      const llm = { ...get().llm, ...patch }
      set({ llm })
      void storage.saveLlmSettings(llm)
    },

    setComfy(patch) {
      const comfy = { ...get().comfy, ...patch }
      set({ comfy })
      void storage.saveComfySettings(comfy)
    },

    setSeries(patch) {
      edit((project) => ({ ...project, series: { ...project.series, ...patch } }))
    },

    setChapterBeats(chapterIndex, beats) {
      edit((project) => ({
        ...project,
        series: {
          ...project.series,
          chapters: project.series.chapters.map((c, i) =>
            i !== chapterIndex
              ? c
              : {
                  ...c,
                  planned: true,
                  beats: beats.map((summary) => ({
                    id: createId(),
                    summary,
                    written: false,
                  })),
                },
          ),
        },
      }))
    },

    updateBeat(chapterIndex, beatId, patch) {
      edit((project) => ({
        ...project,
        series: {
          ...project.series,
          chapters: project.series.chapters.map((c, i) =>
            i !== chapterIndex
              ? c
              : {
                  ...c,
                  beats: c.beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b)),
                },
          ),
        },
      }))
    },

    applyGeneratedPage(generated, onNewPage, beatId) {
      const { project } = get()
      const size = pageSizeOf(project)

      // The written panels are the source of truth, not the layout name.
      //
      // A model that picks "Classic manga" (six frames) and then writes four
      // panels leaves two frames with no prompt — they can never be drawn, and
      // the page has holes in it. So the named layout is only honoured when it
      // is the right size; otherwise the closest-fitting layout wins.
      const wanted = generated.panels.length
      const named = LAYOUTS.find(
        (l) => l.name.toLowerCase() === generated.layout.toLowerCase(),
      )

      const layout =
        named && named.cells.length === wanted
          ? named
          : (LAYOUTS.find((l) => l.cells.length === wanted) ??
            // No exact match: take the nearest size, so at worst one frame is
            // spare rather than several.
            [...LAYOUTS].sort(
              (a, b) =>
                Math.abs(a.cells.length - wanted) - Math.abs(b.cells.length - wanted),
            )[0]!)

      const panels = panelsFromLayout(layout)
      const objects: PageObject[] = []

      generated.panels.forEach((written, i) => {
        const panel = panels[i]
        if (!panel) return

        // Keep the writer's prompt on the panel so art can be generated now
        // or much later, without re-running the model.
        panel.prompt = written.prompt
        panel.shot = written.shot

        // Map the writer's character names onto real cast entries, so drawing
        // this panel can apply their appearance tags and their seed. Matched
        // case-insensitively: models capitalise inconsistently.
        const named = (written.characters ?? []).map((n) => n.trim().toLowerCase())
        panel.characterIds = project.characters
          .filter((c) => named.includes(c.name.trim().toLowerCase()))
          .map((c) => c.id)

        const box = panelRect(panel, size)

        // Dialogue becomes a speech bubble near the top of its panel; narration
        // becomes a caption box at the foot. Both are page-level, so they can
        // still be dragged across a border afterwards.
        if (written.dialogue) {
          objects.push({
            type: 'bubble',
            id: createId(),
            kind: 'speech',
            text: written.dialogue,
            // Sit clear of the panel border rather than straddling it: a
            // bubble pinned to the very edge reads as a mistake, not a choice.
            x: box.x + box.width * 0.06,
            y: box.y + box.height * 0.08,
            width: Math.min(box.width * 0.5, size.width * 0.3),
            height: Math.min(box.height * 0.3, size.height * 0.07),
            tailAngle: 90,
            tailLength: 0,
            fontSize: Math.round(size.width * 0.019),
            rotation: 0,
          })
        }

        if (written.caption) {
          const height = Math.min(box.height * 0.26, size.height * 0.06)
          objects.push({
            type: 'bubble',
            id: createId(),
            kind: 'caption',
            text: written.caption,
            x: box.x + box.width * 0.06,
            y: box.y + box.height - height - box.height * 0.06,
            width: box.width * 0.55,
            height,
            tailAngle: 90,
            tailLength: 0,
            fontSize: Math.round(size.width * 0.017),
            rotation: 0,
          })
        }
      })

      // Never leave a frame that no panel was written for: an empty box the
      // user cannot fill reads as a bug, not a design choice.
      const usedPanels = panels.slice(0, Math.max(1, generated.panels.length))
      const page: Page = { id: createId(), panels: usedPanels, objects }

      edit((current) => ({
        ...current,
        pages: onNewPage
          ? [...current.pages, page]
          : current.pages.map((p, i) => (i === get().currentPageIndex ? page : p)),
        // Tick the beat off the plan, so the outline shows what still needs drawing.
        series: beatId
          ? {
              ...current.series,
              chapters: current.series.chapters.map((c) => ({
                ...c,
                beats: c.beats.map((b) =>
                  b.id === beatId ? { ...b, written: true, pageId: page.id } : b,
                ),
              })),
            }
          : current.series,
      }))

      set({
        currentPageIndex: onNewPage ? get().project.pages.length - 1 : get().currentPageIndex,
        selectedId: null,
        selectedPanelId: null,
      })
    },

    stopBatch() {
      // Read by the loop between panels; the in-flight render still finishes,
      // which is kinder than throwing away work already paid for in GPU time.
      set({ batch: get().batch ? { ...get().batch!, label: 'stopping…' } : null })
      batchCancelled = true
    },

    async drawAll(scope) {
      const { project, currentPageIndex } = get()

      const pages =
        scope === 'page'
          ? [{ page: project.pages[currentPageIndex]!, index: currentPageIndex }]
          : project.pages.map((page, index) => ({ page, index }))

      // Only panels that have a prompt and no art yet, so a stopped run can be
      // resumed by pressing the same button again.
      const jobs = pages.flatMap(({ page, index }) =>
        page.panels
          .filter(
            (panel) =>
              panel.prompt &&
              !page.objects.some((o) => isImage(o) && o.panelId === panel.id),
          )
          .map((panel) => ({ panelId: panel.id, pageIndex: index })),
      )

      if (jobs.length === 0) {
        set({ importError: 'Every panel with a prompt already has art' })
        return
      }

      batchCancelled = false
      const startedOn = currentPageIndex
      // Clear any earlier message: the loop below uses importError to notice a
      // failed panel, and a stale one would stop the batch before it started.
      set({ importError: null, batch: { done: 0, total: jobs.length, label: 'starting…' } })

      try {
        for (const [i, job] of jobs.entries()) {
          if (batchCancelled) break
          set({
            batch: {
              done: i,
              total: jobs.length,
              label: `page ${job.pageIndex + 1}`,
            },
          })
          await get().generatePanelArt(job.panelId, job.pageIndex)

          // One failure shouldn't abandon the rest of the book, but a run of
          // them means something is wrong — stop rather than grind through.
          if (get().importError) break
        }
      } finally {
        const done = get().batch?.done ?? 0
        set({ batch: null })
        // Put the user back where they started, not on whatever page the
        // batch happened to end on.
        if (get().currentPageIndex !== startedOn) set({ currentPageIndex: startedOn })
        if (batchCancelled) set({ importError: `Stopped after ${done} panels` })
      }
    },

    async autoPlan(idea, minPages, maxPages) {
      const llm = get().llm
      if (!llm.model) throw new Error('Choose a model first')

      set({ planProgress: 'Planning the story…' })

      try {
        const plan = await generateSeries(llm, get().project, idea, minPages, maxPages)

        // Adopt the cast and style the model invented, unless the author has
        // already written their own — theirs wins.
        const existing = get().project.characters
        const characters =
          existing.length > 0
            ? existing
            : plan.characters.map((c) => ({ id: createId(), ...c, seed: randomSeed() }))

        edit((project) => ({
          ...project,
          style: {
            ...project.style,
            synopsis: plan.premise,
            positive: project.style.positive.trim() && existing.length > 0
              ? project.style.positive
              : [plan.style, 'manga style, clean line art, screentone shading']
                  .filter(Boolean)
                  .join(', '),
          },
          characters,
          series: {
            premise: plan.premise,
            ending: plan.ending,
            chapters: plan.chapters.map((c) => ({
              id: createId(),
              title: c.title,
              summary: c.summary,
              beats: [],
              planned: false,
            })),
          },
        }))

        // Then break every chapter into pages, in order, so each one is
        // written knowing what the chapters before it established.
        const total = plan.chapters.length
        for (let i = 0; i < total; i++) {
          const chapter = plan.chapters[i]!
          set({
            planProgress: `Chapter ${i + 1} of ${total}: ${chapter.title}`,
          })
          const beats = await generateChapterBeats(
            get().llm,
            get().project,
            i,
            chapter.pages,
            undefined,
            (done, count) =>
              set({
                planProgress: `Chapter ${i + 1} of ${total}: ${chapter.title} — ${done}/${count} pages`,
              }),
          )
          get().setChapterBeats(i, beats)
        }

        const pages = get().project.series.chapters.reduce(
          (sum, c) => sum + c.beats.length,
          0,
        )
        set({ planProgress: `Planned ${total} chapters, ${pages} pages` })
      } catch (error) {
        set({ planProgress: null })
        throw error
      }
    },

    async generatePanelArt(panelId, pageIndex) {
      const { project, currentPageIndex } = get()
      const index = pageIndex ?? currentPageIndex
      const page = project.pages[index]
      const panel = page?.panels.find((p) => p.id === panelId)
      if (!page || !panel?.prompt) return

      set({ generatingPanels: [...get().generatingPanels, panelId] })

      try {
        const size = PANEL_SIZES[sizeForShot(panel.shot ?? '')]
        // The style bible and cast are folded in here, not stored per panel,
        // so editing the style restyles every future generation.
        const { positive, negative } = composePrompt(
          project,
          panel.prompt,
          panel.characterIds ?? [],
        )

        // Seed order: the one this panel already used (so a redraw reproduces
        // it), else the lead character's (so their panels share a starting
        // point), else fresh noise.
        const lead = project.characters.find((c) =>
          (panel.characterIds ?? []).includes(c.id),
        )
        const seed = panel.seed ?? lead?.seed ?? randomSeed()

        const { imageProvider, imageKey, imageModel } = get().llm

        let blob: Blob | undefined
        let remoteUrl: string | undefined
        let width: number = size.width
        let height: number = size.height

        if (imageProvider === 'comfy') {
          // A local render always gives us the bytes, so the art is genuinely
          // the user's: offline-capable and stored in project files.
          blob = await comfyGenerate(
            get().comfy,
            {
              prompt: positive,
              negative,
              width: size.width,
              height: size.height,
              seed,
            },
            undefined,
            (message) => set({ generatingMessage: message }),
          )
        } else {
          const image = await generateImage({
            prompt: positive,
            negative,
            width: size.width,
            height: size.height,
            apiKey: imageKey,
            model: imageModel,
          })
          blob = image.blob
          remoteUrl = image.blob ? undefined : image.url
          width = image.width
          height = image.height
        }

        const asset: Asset = {
          id: createId(),
          name: (panel.shot || 'panel').slice(0, 24),
          fileName: `${panel.prompt.slice(0, 40)}.png`,
          tags: ['generated'],
          width,
          height,
          size: blob?.size ?? 0,
          addedAt: Date.now(),
          remoteUrl,
        }

        if (blob) await storage.saveAssetBlob(asset.id, blob)

        // Remember the seed so this exact panel can be reproduced, or
        // deliberately re-rolled from the inspector.
        if (panel.seed !== seed) {
          editPage((pg) => ({
            ...pg,
            panels: pg.panels.map((x) => (x.id === panelId ? { ...x, seed } : x)),
          }))
        }

        const assets = [...get().assets, asset]
        set({ assets })
        storage.rememberRemoteAssets(assets)
        void storage.saveAssetIndex(assets)

        // placeAsset works on the page in view, so make sure that is the page
        // this panel belongs to before dropping the art in.
        if (get().currentPageIndex !== index) set({ currentPageIndex: index })
        get().placeAsset(asset.id, panelId)
      } catch (error) {
        set({
          importError:
            error instanceof Error ? error.message : 'Could not generate that image',
        })
      } finally {
        set({
          generatingPanels: get().generatingPanels.filter((id) => id !== panelId),
          generatingMessage: null,
        })
      }
    },

    loadFromFile({ project, assets: incoming }) {
      // Merge rather than replace the library: art already imported here stays,
      // and the file's own art is added, so opening a project never silently
      // discards work sitting in this browser.
      const existing = get().assets
      const byId = new Map(existing.map((a) => [a.id, a]))
      for (const asset of incoming) byId.set(asset.id, asset)
      const assets = [...byId.values()]

      const migrated = migrateProject(project)
      set({
        project: migrated,
        assets: migrateAssets(assets),
        currentPageIndex: 0,
        selectedId: null,
        selectedPanelId: null,
        past: [],
        future: [],
      })
      persist(migrated)
      void storage.saveAssetIndex(assets)
    },

    undo() {
      const { past, future, project } = get()
      const previous = past[past.length - 1]
      if (!previous) return
      set({
        project: previous,
        past: past.slice(0, -1),
        future: [project, ...future],
        selectedId: null,
        currentPageIndex: Math.min(get().currentPageIndex, previous.pages.length - 1),
      })
      persist(previous)
    },

    redo() {
      const { past, future, project } = get()
      const next = future[0]
      if (!next) return
      set({
        project: next,
        past: [...past, project],
        future: future.slice(1),
        selectedId: null,
        currentPageIndex: Math.min(get().currentPageIndex, next.pages.length - 1),
      })
      persist(next)
    },
  }
})
