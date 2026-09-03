/**
 * Local LLM client (LM Studio, Ollama, or anything OpenAI-compatible).
 *
 * Everything runs on the user's own machine over plain HTTP, so there are no
 * API keys and nothing leaves the computer. That is the whole reason this is
 * worth doing at all for a tool people use on personal work.
 */

import type { Character, Project, StyleBible } from './types'

export interface LlmSettings {
  baseUrl: string
  model: string
  temperature: number
}

export const DEFAULT_LLM: LlmSettings = {
  // LM Studio's default local server.
  baseUrl: 'http://localhost:1234/v1',
  model: '',
  temperature: 0.85,
}

/** Layout names the writer is allowed to pick, so its answer maps to a preset. */
const ALLOWED_LAYOUTS = [
  'Classic manga',
  'Establishing',
  'Four tier',
  'Six grid',
  'Hero shot',
  'Confrontation',
  'Three tier',
  'Action / reaction',
  'Splash',
] as const

export interface GeneratedPanel {
  n: number
  shot: string
  /** Image prompt for this panel — stored for later, not rendered as art yet. */
  prompt: string
  caption: string | null
  dialogue: string | null
  /** Names of characters appearing, matched against the project's cast. */
  characters?: string[]
}

export interface GeneratedPage {
  title: string
  layout: string
  panels: GeneratedPanel[]
}

export async function listModels(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${trim(baseUrl)}/models`)
  if (!response.ok) {
    throw new Error(`Server answered ${response.status}. Is the local server running?`)
  }
  const data = (await response.json()) as { data?: { id: string }[] }
  return (data.data ?? [])
    .map((m) => m.id)
    // Embedding models cannot chat; offering them would only cause confusion.
    .filter((id) => !/embed/i.test(id))
}

function trim(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Models wrap JSON in markdown fences despite being told not to, and some
 * prepend a sentence. Recover the object rather than failing the whole run.
 *
 * Instruction-tuned models also sometimes mistake a request for a tool call and
 * answer `{"name": ..., "parameters": {...}}`. Unwrapping that is cheaper than
 * losing the whole generation.
 */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced?.[1] ?? text

  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('The model did not return JSON')
    parsed = JSON.parse(candidate.slice(start, end + 1))
  }

  const asRecord = parsed as Record<string, unknown>
  if (asRecord && typeof asRecord === 'object' && 'parameters' in asRecord && 'name' in asRecord) {
    return asRecord.parameters
  }
  return parsed
}

function castSummary(characters: Character[]): string {
  if (characters.length === 0) return 'No cast defined yet; invent characters as needed.'
  return characters
    .map((c) => `- ${c.name} (${c.role}): ${c.prompt}${c.notes ? ` — ${c.notes}` : ''}`)
    .join('\n')
}

function buildPrompt(
  style: StyleBible,
  characters: Character[],
  beat: string,
  pageNumber: number,
  storySoFar: string[],
  comingNext: string[],
): { system: string; user: string } {
  return {
    system:
      'You are a manga writer and art director. Output ONLY valid JSON. ' +
      'No prose, no markdown fences, no commentary before or after.',
    user: `Write page ${pageNumber} of a manga.

${style.synopsis ? `Premise: ${style.synopsis}\n` : ''}
Cast:
${castSummary(characters)}
${
  storySoFar.length > 0
    ? `\nAlready happened (do not repeat any of it):\n${storySoFar
        .map((b, i) => `${i + 1}. ${b}`)
        .join('\n')}\n`
    : ''
}${
      comingNext.length > 0
        ? `\nStill to come (set it up, do not resolve it here):\n${comingNext
            .map((b) => `- ${b}`)
            .join('\n')}\n`
        : ''
    }
This page: ${beat}

Return JSON exactly in this shape:
{"title":string,"layout":string,"panels":[{"n":number,"shot":string,"prompt":string,"caption":string|null,"dialogue":string|null,"characters":string[]}]}

Rules:
- between 3 and 6 panels
- "layout" MUST be exactly one of: ${ALLOWED_LAYOUTS.map((l) => `"${l}"`).join(', ')}
- "shot" is a camera term: wide, medium, close-up, over the shoulder, etc
- "caption" is narration, or null
- "dialogue" is what a character says aloud, or null
- "characters" lists names from the cast appearing in that panel
- MOST panels must carry dialogue or a caption — a page where only one panel
  has words reads as empty. Silent panels are for deliberate beats only.
- vary the shots: do not use the same shot type twice in a row

"prompt" is fed straight to an image generator, so it must be DETAILED —
at least 12 comma-separated tags, covering in this order:
  1. subject and how many: "one girl", "two men facing each other"
  2. pose and action: "kneeling in soil", "hand raised to shield eyes"
  3. expression and eyeline: "worried, looking off to the left"
  4. clothing detail: "patched green apron, rolled sleeves, muddy boots"
  5. setting and props: "vegetable garden, wooden watering can, log cabin behind"
  6. time, weather, light: "late afternoon, low sun, long shadows, warm light"
  7. camera framing: "low angle, shallow depth of field"
Never write sentences, never repeat the art style (it is added automatically),
and never name a character in the prompt — describe what is visible instead.`,
  }
}

/**
 * Level 1 — plan the series.
 *
 * Deciding the ending up front is the point: chapters written without one
 * wander, because nothing is pulling them anywhere.
 */
export async function generateSeries(
  settings: LlmSettings,
  project: Project,
  idea: string,
  chapterCount: number,
  signal?: AbortSignal,
): Promise<{ premise: string; ending: string; chapters: { title: string; summary: string }[] }> {
  const system =
    'You are a manga story editor. Output ONLY valid JSON. ' +
    'No prose, no markdown fences, no commentary.'

  const user = `Plan a manga of ${chapterCount} chapters.

The idea: ${idea}

Cast:
${castSummary(project.characters)}

Return JSON exactly in this shape:
{"premise":string,"ending":string,"chapters":[{"title":string,"summary":string}]}

Rules:
- exactly ${chapterCount} chapters, in order
- "premise" is what the whole manga is about, one or two sentences
- "ending" is where the story finishes — decide it now so the chapters aim at it
- each chapter "summary" is ONE sentence: what changes for the characters
- chapters must escalate; a later chapter must depend on an earlier one
- do not resolve the story before the final chapter`

  const text = await chat(settings, system, user, 1400, signal)
  const parsed = extractJson(text) as {
    premise?: unknown
    ending?: unknown
    chapters?: unknown
  }

  const chapters = Array.isArray(parsed.chapters)
    ? parsed.chapters
        .map((c) => {
          const entry = c as { title?: unknown; summary?: unknown }
          return {
            title: String(entry.title ?? 'Untitled chapter'),
            summary: String(entry.summary ?? ''),
          }
        })
        .filter((c) => c.summary.trim().length > 0)
    : []

  if (chapters.length === 0) throw new Error('The model returned no chapters')

  return {
    premise: typeof parsed.premise === 'string' ? parsed.premise : idea,
    ending: typeof parsed.ending === 'string' ? parsed.ending : '',
    chapters,
  }
}

/**
 * Level 2 — break one chapter into pages.
 *
 * The surrounding chapters are supplied so this one starts where the last left
 * off and hands over cleanly to the next.
 */
export async function generateChapterBeats(
  settings: LlmSettings,
  project: Project,
  chapterIndex: number,
  pageCount: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const { series } = project
  const chapter = series.chapters[chapterIndex]
  if (!chapter) throw new Error('No such chapter')

  const before = series.chapters.slice(0, chapterIndex)
  const after = series.chapters.slice(chapterIndex + 1)

  const system =
    'You are a manga story editor. Output ONLY valid JSON. ' +
    'No prose, no markdown fences, no commentary.'

  const user = `You are writing the page-by-page outline for one chapter of a manga.
The chapter runs for ${pageCount} pages.

Series premise: ${series.premise}
How it ends: ${series.ending}

Cast:
${castSummary(project.characters)}
${
  before.length > 0
    ? `\nChapters already told:\n${before.map((c, i) => `${i + 1}. ${c.title} — ${c.summary}`).join('\n')}\n`
    : ''
}${
    after.length > 0
      ? `\nChapters still to come (do not get there yet):\n${after.map((c) => `- ${c.title} — ${c.summary}`).join('\n')}\n`
      : ''
  }
This chapter (${chapterIndex + 1}): ${chapter.title} — ${chapter.summary}

Return JSON exactly in this shape:
{"beats":[string]}

Rules:
- exactly ${pageCount} beats, one per page, in order
- each beat is ONE sentence describing what happens on that page
- the chapter needs a shape: open with a hook, build, turn at the end
- later beats must build on earlier ones in this chapter
- end on a note that leads into the next chapter`

  const text = await chat(settings, system, user, 1200, signal)
  const parsed = extractJson(text) as Record<string, unknown>

  // Models rename the array despite the schema; accept the usual aliases, or
  // the first array of strings we find, before giving up.
  const candidates = ['beats', 'pages', 'outline', 'panels']
  let raw: unknown[] = []
  for (const key of candidates) {
    if (Array.isArray(parsed?.[key])) {
      raw = parsed[key] as unknown[]
      break
    }
  }
  if (raw.length === 0) {
    const firstArray = Object.values(parsed ?? {}).find(
      (v) => Array.isArray(v) && v.length > 0,
    )
    if (Array.isArray(firstArray)) raw = firstArray
  }

  const beats = raw
    .map((b) => {
      if (typeof b === 'string') return b
      // Sometimes each beat arrives as an object with a summary field.
      const entry = b as Record<string, unknown>
      const text = entry?.summary ?? entry?.beat ?? entry?.description ?? entry?.text
      return typeof text === 'string' ? text : ''
    })
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  if (beats.length === 0) throw new Error('The model returned no beats')
  return beats
}

/** Shared request path, so both calls handle errors and reasoning models alike. */
async function chat(
  settings: LlmSettings,
  system: string,
  user: string,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  // Deliberately no system message. Llama 3.1 served by LM Studio reads a
  // system prompt as a sign that tools are available and answers with a
  // {"name": ..., "parameters": ...} tool call instead of the content we asked
  // for — measured, not guessed. Folding the instruction into the user turn
  // produces clean JSON from the same model.
  const merged = system ? `${system}\n\n${user}` : user

  const response = await fetch(`${trim(settings.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: 'user', content: merged }],
      temperature: settings.temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    let message = `Server answered ${response.status}`
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } }
      if (parsed.error?.message) message = parsed.error.message
    } catch {
      /* keep the status message */
    }
    throw new Error(message)
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string; reasoning_content?: string } }[]
  }
  const message = data.choices?.[0]?.message
  // Reasoning models put their answer in reasoning_content and leave content
  // empty; reading only `content` makes them look silently broken.
  const text = message?.content?.trim() || message?.reasoning_content?.trim() || ''
  if (!text) throw new Error('The model returned nothing')
  return text
}

export async function generatePage(
  settings: LlmSettings,
  project: Project,
  beat: string,
  pageNumber: number,
  /** Beats already written, so the page never repeats them. */
  storySoFar: string[] = [],
  /** Beats still ahead, so this page sets them up instead of pre-empting them. */
  comingNext: string[] = [],
  signal?: AbortSignal,
): Promise<GeneratedPage> {
  const { system, user } = buildPrompt(
    project.style,
    project.characters,
    beat,
    pageNumber,
    storySoFar,
    comingNext,
  )

  const text = await chat(settings, system, user, 1600, signal)

  const parsed = extractJson(text) as Partial<GeneratedPage>
  if (!Array.isArray(parsed.panels) || parsed.panels.length === 0) {
    throw new Error('The model returned no panels')
  }

  return {
    title: typeof parsed.title === 'string' ? parsed.title : 'Untitled page',
    layout: typeof parsed.layout === 'string' ? parsed.layout : 'Classic manga',
    panels: parsed.panels.slice(0, 8).map((panel, i) => ({
      n: typeof panel.n === 'number' ? panel.n : i + 1,
      shot: String(panel.shot ?? ''),
      prompt: String(panel.prompt ?? ''),
      caption: panel.caption ? String(panel.caption) : null,
      dialogue: panel.dialogue ? String(panel.dialogue) : null,
      characters: Array.isArray(panel.characters) ? panel.characters.map(String) : [],
    })),
  }
}
