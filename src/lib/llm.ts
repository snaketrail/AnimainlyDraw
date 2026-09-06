/**
 * The writing model: a local server, or Google Gemini.
 *
 * "local" talks to LM Studio, Ollama, or anything else speaking the OpenAI
 * chat API on this machine — no key, and nothing leaves the computer.
 *
 * "gemini" calls Google directly from the browser. Google allows that (the API
 * sends CORS headers permitting x-goog-api-key from any origin), so no proxy
 * is needed. The key is typed in by the user and kept in this browser only; it
 * is never written to the project file or committed anywhere.
 */

import type { Character, Project, StyleBible } from './types'

export type LlmProvider = 'local' | 'gemini'

export interface LlmSettings {
  provider: LlmProvider
  /** Local server address; ignored by Gemini. */
  baseUrl: string
  model: string
  /** Google AI Studio key; ignored by the local provider. Never leaves this browser. */
  apiKey: string
  temperature: number
  /** Pollinations key for image generation. Optional; blank uses the free tier. */
  imageKey: string
  /** Which image model to draw panels with. */
  imageModel: string
  /** Where panel art comes from: a local ComfyUI, or the hosted service. */
  imageProvider: 'comfy' | 'pollinations'
}

export const DEFAULT_LLM: LlmSettings = {
  provider: 'local',
  // LM Studio's default local server.
  baseUrl: 'http://localhost:1234/v1',
  model: '',
  apiKey: '',
  temperature: 0.85,
  imageKey: '',
  imageModel: '',
  // Local first: no key, no quota, and better models for manga.
  imageProvider: 'comfy',
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Used only when the model list cannot be fetched. "-latest" aliases keep
 * working as Google retires specific generations, which pinned ids do not.
 */
const GEMINI_FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']

/**
 * Layouts the writer may pick, with the number of panels each one holds.
 *
 * The count is the important half. Given only names, the model would choose a
 * six-panel layout and then write four panels of content, leaving two frames
 * permanently empty — it has no way to know how big "Classic manga" is unless
 * it is told.
 */
const ALLOWED_LAYOUTS = [
  { name: 'Splash', panels: 1 },
  { name: 'Two tier', panels: 2 },
  { name: 'Three tier', panels: 3 },
  { name: 'Hero shot', panels: 3 },
  { name: 'Vertical thirds', panels: 3 },
  { name: 'Four tier', panels: 4 },
  { name: 'Action / reaction', panels: 5 },
  { name: 'Confrontation', panels: 5 },
  { name: 'Classic manga', panels: 6 },
  { name: 'Six grid', panels: 6 },
  { name: 'Establishing', panels: 6 },
] as const

/** How many panels a named layout has, if we know it. */
export function panelsInLayout(name: string): number | undefined {
  return ALLOWED_LAYOUTS.find((l) => l.name.toLowerCase() === name.trim().toLowerCase())
    ?.panels
}

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

export async function listModels(settings: LlmSettings): Promise<string[]> {
  if (settings.provider === 'gemini') return listGeminiModels(settings.apiKey)

  // A refused connection surfaces as the browser's bare "Failed to fetch",
  // which says nothing about the cause. Name the likely one instead.
  let response: Response
  try {
    response = await fetch(`${trim(settings.baseUrl)}/models`)
  } catch {
    throw new Error(
      `Could not reach ${settings.baseUrl} — start LM Studio's server, or switch to Google Gemini`,
    )
  }

  if (!response.ok) {
    throw new Error(`Server answered ${response.status}. Is the local server running?`)
  }
  const data = (await response.json()) as { data?: { id: string }[] }
  return (data.data ?? [])
    .map((m) => m.id)
    // Embedding models cannot chat; offering them would only cause confusion.
    .filter((id) => !/embed/i.test(id))
}

async function listGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) throw new Error('Paste your Google AI Studio API key first')

  const response = await fetch(`${GEMINI_BASE}/models`, {
    headers: { 'x-goog-api-key': apiKey.trim() },
  })

  if (!response.ok) {
    throw new Error(await geminiError(response))
  }

  const data = (await response.json()) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[]
  }

  const usable = (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    // Image, embedding and TTS models cannot write a story.
    .filter((id) => id && !/embed|imagen|image|tts|vision|aqa/i.test(id))
    // Google keeps listing older generations that new keys can no longer call
    // ("no longer available to new users"), so offering them only produces a
    // confusing failure on first use.
    .filter((id) => !/^(gemini-1\.|gemini-2\.|gemini-pro|gemini-exp)/i.test(id))

  // Prefer flash models: fast, and the ones with a usable free tier. Within
  // that, newer generations first, so the default pick is a current model.
  usable.sort((a, b) => {
    const flash = (id: string) => (/flash/i.test(id) ? 0 : 1)
    const generation = (id: string) => {
      const match = id.match(/gemini-(\d+)(?:\.(\d+))?/i)
      if (!match) return 0
      return -(Number(match[1]) * 100 + Number(match[2] ?? 0))
    }
    return flash(a) - flash(b) || generation(a) - generation(b) || a.localeCompare(b)
  })

  return usable.length > 0 ? usable : GEMINI_FALLBACK_MODELS
}

/** Google returns a structured error; surfacing its message beats a bare status. */
async function geminiError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '')
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } }
    if (parsed.error?.message) {
      if (response.status === 400 && /API key not valid/i.test(parsed.error.message)) {
        return 'That API key was not accepted by Google'
      }
      if (response.status === 429) {
        return 'Google rate limit reached — wait a moment, or use the local model'
      }
      if (response.status === 400 && /invalid argument/i.test(parsed.error.message)) {
        // Usually a model that does not accept something in the request body.
        return `${parsed.error.message} — try a different Gemini model`
      }
      return parsed.error.message
    }
  } catch {
    /* fall through to the status */
  }
  return `Google answered ${response.status}`
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

/**
 * Remove a "Name:" prefix from dialogue.
 *
 * Models label who is speaking however firmly they are told not to, and a
 * manga bubble that reads "Evan: Look at this!" is wrong — the bubble's
 * position is what identifies the speaker.
 */
function stripSpeaker(line: string): string {
  // Only strip a short leading name, so "Wait: I know that voice" survives.
  return line.replace(/^\s*[A-Z][\w'-]{0,20}\s*:\s*/, '').trim() || line.trim()
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
- "layout" MUST be exactly one of these, and you MUST write exactly as many
  panels as the layout holds — an unfilled frame is a hole in the page:
${ALLOWED_LAYOUTS.map((l) => `    "${l.name}" — write exactly ${l.panels} panel${l.panels > 1 ? 's' : ''}`).join('\n')}
- choose the layout to fit the beat: a quiet moment may want 2 or 3 panels, a
  busy exchange 6. Do not always pick the same one.
- "shot" is a camera term: wide, medium, close-up, over the shoulder, etc
- "caption" is narration, or null
- "dialogue" is ONLY the spoken words — never prefix it with a speaker name,
  because a manga bubble shows who is talking by where it sits, not by a label.
  Write "Look at this one!" and not "Evan: Look at this one!"
- "characters" lists the exact cast names appearing in that panel, so their
  look can be applied. Use the names given above verbatim, or [] if nobody
  from the cast is visible.
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
and never name a character in the prompt — describe what is visible instead.
Keep every panel suitable for general audiences: characters stay fully clothed,
and no suggestive or revealing descriptions.`,
  }
}

/**
 * Level 1 — plan the series.
 *
 * Deciding the ending up front is the point: chapters written without one
 * wander, because nothing is pulling them anywhere.
 */
export interface SeriesPlan {
  premise: string
  ending: string
  /** Cast the model invented, so the user does not have to write one first. */
  characters: { name: string; role: 'main' | 'side'; prompt: string; notes: string }[]
  /** Art direction the model chose for this story. */
  style: string
  chapters: { title: string; summary: string; pages: number }[]
}

/**
 * Level 1 — plan the whole work from a single idea.
 *
 * The caller gives a rough page range, not a chapter count: how many chapters
 * a story needs is a storytelling decision, and asking the writer to make it
 * produces better structure than imposing a number. The model also invents the
 * cast and picks an art style, so one prompt is genuinely enough to start.
 */
export async function generateSeries(
  settings: LlmSettings,
  project: Project,
  idea: string,
  minPages: number,
  maxPages: number,
  signal?: AbortSignal,
): Promise<SeriesPlan> {
  const system =
    'You are a manga story editor. Output ONLY valid JSON. ' +
    'No prose, no markdown fences, no commentary.'

  const user = `Plan a one-shot manga of roughly ${minPages}-${maxPages} pages.

The idea: ${idea}
${
    project.characters.length > 0
      ? `\nCharacters the author has already written — keep them:\n${castSummary(project.characters)}\n`
      : ''
  }
Return JSON exactly in this shape:
{"premise":string,"ending":string,"style":string,
 "characters":[{"name":string,"role":"main"|"side","prompt":string,"notes":string}],
 "chapters":[{"title":string,"summary":string,"pages":number}]}

Rules:
- YOU decide how many chapters the story needs — pick whatever serves it
- the "pages" of all chapters must add up to between ${minPages} and ${maxPages}
- "premise" is what the manga is about, one or two sentences
- "ending" is where it finishes — decide it now so the chapters aim at it
- "style" is the art direction as comma-separated tags, no sentences:
  era, linework, shading, palette, mood. No character details here.
- "characters" is the full cast, 2 to 6 of them. For each:
    "prompt" is appearance ONLY, as comma-separated visual tags — age, hair,
      eyes, build, clothing, distinguishing marks. No personality, no names.
    "notes" is personality, voice and what they want, in one sentence.
- each chapter "summary" is ONE sentence: what changes for the characters
- chapters must escalate; a later one must depend on an earlier one
- do not resolve the story before the final chapter`

  const text = await chat(settings, system, user, 2400, signal)
  const parsed = extractJson(text) as Record<string, unknown>

  const chapters = Array.isArray(parsed.chapters)
    ? (parsed.chapters as unknown[])
        .map((c) => {
          const entry = c as { title?: unknown; summary?: unknown; pages?: unknown }
          const pages = Number(entry.pages)
          return {
            title: String(entry.title ?? 'Untitled chapter'),
            summary: String(entry.summary ?? ''),
            // A missing or silly page count would break the page budget, so
            // fall back to something workable rather than trusting it.
            pages: Number.isFinite(pages) && pages > 0 ? Math.round(pages) : 8,
          }
        })
        .filter((c) => c.summary.trim().length > 0)
    : []

  if (chapters.length === 0) throw new Error('The model returned no chapters')

  const characters = Array.isArray(parsed.characters)
    ? (parsed.characters as unknown[])
        .map((c) => {
          const entry = c as Record<string, unknown>
          return {
            name: String(entry.name ?? '').trim(),
            role: entry.role === 'side' ? ('side' as const) : ('main' as const),
            prompt: String(entry.prompt ?? '').trim(),
            notes: String(entry.notes ?? '').trim(),
          }
        })
        .filter((c) => c.name.length > 0)
    : []

  return {
    premise: typeof parsed.premise === 'string' ? parsed.premise : idea,
    ending: typeof parsed.ending === 'string' ? parsed.ending : '',
    style: typeof parsed.style === 'string' ? parsed.style : '',
    characters,
    chapters,
  }
}

/**
 * Level 2 — break one chapter into pages.
 *
 * The surrounding chapters are supplied so this one starts where the last left
 * off and hands over cleanly to the next.
 */
/**
 * How many page-beats to request in one call.
 *
 * A one-shot chapter can run to 90 pages, and asking for all of them at once
 * reliably truncates: the reply is long, and reasoning models spend budget
 * before writing a word. Requesting them in runs — each one told what came
 * before — keeps every response comfortably inside a single generation while
 * the story still reads continuously.
 */
const BEATS_PER_REQUEST = 12

export async function generateChapterBeats(
  settings: LlmSettings,
  project: Project,
  chapterIndex: number,
  pageCount: number,
  signal?: AbortSignal,
  /** Called after each run, so a long chapter shows progress instead of hanging. */
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  if (pageCount > BEATS_PER_REQUEST) {
    const all: string[] = []
    while (all.length < pageCount) {
      const remaining = pageCount - all.length
      const batch = await requestBeats(
        settings,
        project,
        chapterIndex,
        Math.min(BEATS_PER_REQUEST, remaining),
        all,
        pageCount,
        signal,
      )
      if (batch.length === 0) break
      all.push(...batch)
      onProgress?.(Math.min(all.length, pageCount), pageCount)
    }
    if (all.length === 0) throw new Error('The model returned no beats')
    return all.slice(0, pageCount)
  }

  const beats = await requestBeats(settings, project, chapterIndex, pageCount, [], pageCount, signal)
  onProgress?.(beats.length, pageCount)
  return beats
}

async function requestBeats(
  settings: LlmSettings,
  project: Project,
  chapterIndex: number,
  pageCount: number,
  /** Beats already produced for this chapter, so a later run continues them. */
  soFar: string[],
  totalPages: number,
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
The chapter runs for ${totalPages} pages; write ${pageCount} of them in this reply.

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
${
  soFar.length > 0
    ? `\nPages ${1}-${soFar.length} of this chapter are already written:\n${soFar
        .slice(-8)
        .map((b, i) => `${soFar.length - Math.min(8, soFar.length) + i + 1}. ${b}`)
        .join('\n')}\n\nContinue from page ${soFar.length + 1}. Do not repeat any of the above.\n`
    : ''
}
Return JSON exactly in this shape:
{"beats":[string]}

Rules:
- exactly ${pageCount} beats, one per page, in order
- each beat is ONE sentence describing what happens on that page
- each beat covers ONE page: a single moment or exchange, not a whole scene
- later beats must build on earlier ones${
      soFar.length + pageCount >= totalPages
        ? '\n- this is the END of the chapter: resolve it'
        : '\n- the chapter continues after these pages, so do not resolve it yet'
    }`

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
  if (settings.provider === 'gemini') {
    return geminiChat(settings, system, user, maxTokens, signal)
  }

  // Deliberately no system message. Llama 3.1 served by LM Studio reads a
  // system prompt as a sign that tools are available and answers with a
  // {"name": ..., "parameters": ...} tool call instead of the content we asked
  // for — measured, not guessed. Folding the instruction into the user turn
  // produces clean JSON from the same model.
  const merged = system ? `${system}\n\n${user}` : user

  let response: Response
  try {
    response = await fetch(`${trim(settings.baseUrl)}/chat/completions`, {
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
  } catch {
    throw new Error(
      `Could not reach ${settings.baseUrl} — start LM Studio's server, or switch to Google Gemini`,
    )
  }

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

/**
 * Google's API differs from the OpenAI shape in three ways that matter here:
 * the instruction goes in `systemInstruction`, generation options live under
 * `generationConfig`, and the reply arrives as parts of a candidate rather
 * than a message. `responseMimeType` asks for JSON directly, which removes the
 * markdown-fence guessing the local path has to do.
 */
async function geminiChat(
  settings: LlmSettings,
  system: string,
  user: string,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const key = settings.apiKey.trim()
  if (!key) throw new Error('Paste your Google AI Studio API key first')

  const model = settings.model || GEMINI_FALLBACK_MODELS[0]!

  const response = await fetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: user }] }],
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          temperature: settings.temperature,
          // Gemini's thinking models spend tokens reasoning before they write,
          // and that comes out of the SAME budget as the reply — ask for 1200
          // and the model can burn the lot thinking, returning an empty
          // candidate with finishReason MAX_TOKENS.
          //
          // The obvious fix is to turn thinking off, but the knob for that
          // differs by generation (2.x takes thinkingConfig.thinkingBudget,
          // 3.x replaced it with thinkingLevel) and some models reject
          // particular values outright with "Request contains an invalid
          // argument". Sending no thinking config at all works on every
          // generation; generous headroom then leaves room for both the
          // thinking and the answer.
          maxOutputTokens: Math.max(maxTokens * 8, 8192),
          // Ask for JSON at the protocol level rather than by pleading in the
          // prompt: Gemini then cannot wrap it in prose or a code fence.
          responseMimeType: 'application/json',
        },
      }),
    },
  )

  if (!response.ok) throw new Error(await geminiError(response))

  const data = (await response.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] }
      finishReason?: string
    }[]
    promptFeedback?: { blockReason?: string }
  }

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Google blocked the request (${data.promptFeedback.blockReason})`)
  }

  const candidate = data.candidates?.[0]
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim()

  if (!text) {
    // Naming the cause matters: each of these needs a different fix.
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error(
        'Gemini used its whole budget thinking and wrote nothing — try fewer pages per chapter',
      )
    }
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error('Gemini declined to answer that on safety grounds')
    }
    if (candidate?.finishReason === 'RECITATION') {
      throw new Error('Gemini stopped because the reply looked like copied text')
    }
    throw new Error('The model returned nothing')
  }

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
      dialogue: panel.dialogue ? stripSpeaker(String(panel.dialogue)) : null,
      characters: Array.isArray(panel.characters) ? panel.characters.map(String) : [],
    })),
  }
}
