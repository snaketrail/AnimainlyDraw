/**
 * The story workbench: connection, style bible, cast, and page writing.
 *
 * The style bible and cast exist to stop a book drifting. An AI asked to draw
 * "the girl" forty times will produce forty different girls, so her appearance
 * is written down once and reused — the same reason a studio keeps model
 * sheets.
 *
 * The writing model is either a local server (nothing leaves the machine) or
 * Google Gemini (the prompt does, and a key is needed). The choice is the
 * user's and is made explicit in the connection row.
 */

import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  generateChapterBeats,
  generatePage,
  listModels,
  type GeneratedPage,
} from '../lib/llm'
import { composePrompt, randomSeed } from '../lib/types'
import { IMAGE_MODELS } from '../lib/images'
import type { ComfyModels } from '../lib/comfy'
import {
  isPonyCheckpoint,
  listModels as listComfyModels,
  presetForUnet,
} from '../lib/comfy'

type Tab = 'plan' | 'story' | 'style' | 'cast' | 'art'

export function StoryPanel({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const llm = useStore((s) => s.llm)
  const setLlm = useStore((s) => s.setLlm)
  const setStyle = useStore((s) => s.setStyle)
  const addCharacter = useStore((s) => s.addCharacter)
  const updateCharacter = useStore((s) => s.updateCharacter)
  const deleteCharacter = useStore((s) => s.deleteCharacter)
  const applyGeneratedPage = useStore((s) => s.applyGeneratedPage)
  const setSeries = useStore((s) => s.setSeries)
  const setChapterBeats = useStore((s) => s.setChapterBeats)
  const autoPlan = useStore((s) => s.autoPlan)
  const comfy = useStore((s) => s.comfy)
  const setComfy = useStore((s) => s.setComfy)
  const planProgress = useStore((s) => s.planProgress)

  const [tab, setTab] = useState<Tab>('plan')
  const [models, setModels] = useState<string[]>([])
  const [connection, setConnection] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const [beat, setBeat] = useState('')
  const [beatId, setBeatId] = useState<string | undefined>()
  const [onNewPage, setOnNewPage] = useState(true)
  const [writing, setWriting] = useState(false)
  const [result, setResult] = useState<GeneratedPage | null>(null)

  // Planning
  const [idea, setIdea] = useState('')
  const [minPages, setMinPages] = useState(40)
  const [maxPages, setMaxPages] = useState(50)
  const [planning, setPlanning] = useState<string | null>(null)
  const [openChapter, setOpenChapter] = useState<number | null>(0)

  // ComfyUI
  const [comfyModels, setComfyModels] = useState<ComfyModels>({
    checkpoints: [],
    unets: [],
    clips: [],
    vaes: [],
    clipTypes: [],
  })
  const [comfyState, setComfyState] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
  const [comfyError, setComfyError] = useState<string | null>(null)

  // Look for ComfyUI on open too, so the Art tab is usable straight away.
  useEffect(() => {
    if (useStore.getState().llm.imageProvider === 'comfy') void findCheckpoints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Apply a split model's published sampler settings.
   *
   * A split model is not SDXL, and the app's SDXL defaults give visibly worse
   * output on one. Anima's own workflow renders at 30 steps and CFG 4 on
   * euler/simple, so selecting it should carry those across rather than expect
   * the user to know them.
   */
  function selectUnet(unet: string) {
    const preset = presetForUnet(unet)
    setComfy({
      kind: 'split',
      unet,
      ...(preset
        ? {
            clipType: preset.clipType,
            steps: preset.steps,
            cfg: preset.cfg,
            samplerName: preset.samplerName,
            scheduler: preset.scheduler,
          }
        : {}),
    })
  }

  async function findCheckpoints() {
    setComfyState('checking')
    setComfyError(null)
    try {
      const found = await listComfyModels(useStore.getState().comfy.baseUrl)
      setComfyModels(found)
      setComfyState('ok')

      const comfyNow = useStore.getState().comfy
      const hasSplit = found.unets.length > 0 && found.clips.length > 0 && found.vaes.length > 0

      if (found.checkpoints.length === 0 && !hasSplit) {
        setComfyError('ComfyUI is running but has no models installed yet')
        return
      }

      // Fill in whichever kind the user is on, and fall back to the other when
      // the one they are on has nothing installed.
      if (comfyNow.kind === 'split' || found.checkpoints.length === 0) {
        if (!found.unets.includes(comfyNow.unet)) selectUnet(found.unets[0] ?? '')
        if (!found.clips.includes(comfyNow.clip)) setComfy({ clip: found.clips[0] ?? '' })
        if (!found.vaes.includes(comfyNow.vae)) setComfy({ vae: found.vaes[0] ?? '' })
      } else if (!found.checkpoints.includes(comfyNow.checkpoint)) {
        // Prefer a Pony checkpoint: it is what suits manga best.
        const pony = found.checkpoints.find((c) => isPonyCheckpoint(c))
        setComfy({ checkpoint: pony ?? found.checkpoints[0]! })
      }
    } catch (e) {
      setComfyState('error')
      setComfyError(e instanceof Error ? e.message : 'Could not reach ComfyUI')
    }
  }

  async function connect() {
    setConnection('checking')
    setError(null)
    // Read the store at call time, not from this render's closure: typing a new
    // address updates the store, but a handler captured before that would keep
    // using the old one, so the first Reconnect after an edit hit the previous
    // server.
    const current = useStore.getState().llm
    try {
      const found = await listModels(current)
      setModels(found)
      setConnection('ok')
      // Pick a chat model automatically so the first run needs no fiddling.
      if (!current.model || !found.includes(current.model)) {
        const preferred = found.find((m) => /instruct|chat/i.test(m)) ?? found[0]
        if (preferred) setLlm({ model: preferred })
      }
    } catch (e) {
      setConnection('error')
      setError(e instanceof Error ? e.message : 'Could not reach the server')
    }
  }

  // Try once on open: a local server is usually already running, so this saves
  // a click. Gemini is skipped until a key exists, so opening the panel never
  // fires a request the user has not asked for.
  //
  // The drawer unmounts when closed, so this runs again on every reopen. It
  // reads the stored settings rather than this render's copy, which is what
  // makes reopening pick up the address the user last saved.
  useEffect(() => {
    const saved = useStore.getState().llm
    if (saved.provider === 'local' || saved.apiKey.trim()) void connect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function write(text?: string, id?: string, chapterIndex?: number) {
    if (!llm.model) {
      setError('Choose a model first')
      return
    }
    const summary = (text ?? beat).trim() || 'continue the story'

    // Give the writer everything already told and everything still to come, so
    // the page neither repeats itself nor jumps ahead of its own plot.
    let before: string[] = []
    let after: string[] = []
    if (chapterIndex !== undefined && id) {
      const chapter = project.series.chapters[chapterIndex]
      if (chapter) {
        const at = chapter.beats.findIndex((b) => b.id === id)
        const earlier = project.series.chapters
          .slice(0, chapterIndex)
          .flatMap((c) => c.beats.map((b) => b.summary))
        before = [...earlier, ...chapter.beats.slice(0, at).map((b) => b.summary)]
        after = chapter.beats.slice(at + 1).map((b) => b.summary)
      }
    }

    setWriting(true)
    setError(null)
    setResult(null)
    try {
      const page = await generatePage(
        useStore.getState().llm,
        project,
        summary,
        project.pages.length + (onNewPage ? 1 : 0),
        before,
        after,
      )
      setResult(page)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setWriting(false)
    }
  }

  async function planSeries() {
    if (!llm.model) return setError('Choose a model first')
    setPlanning('series')
    setError(null)
    try {
      // One call plans the series, invents the cast, picks a style, and
      // breaks every chapter into pages.
      await autoPlan(idea.trim() || project.style.synopsis, minPages, maxPages)
      setOpenChapter(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Planning failed')
    } finally {
      setPlanning(null)
    }
  }

  async function planChapter(index: number) {
    if (!llm.model) return setError('Choose a model first')
    setPlanning(`chapter-${index}`)
    setError(null)
    try {
      const beats = await generateChapterBeats(
        useStore.getState().llm,
        project,
        index,
        project.series.chapters[index]?.beats.length || 8,
        undefined,
        // A 90-page chapter takes several requests; say so rather than
        // appearing to hang.
        (done, total) => setPlanning(`chapter-${index}|${done}/${total}`),
      )
      setChapterBeats(index, beats)
      setOpenChapter(index)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Planning failed')
    } finally {
      setPlanning(null)
    }
  }

  /** Send a planned beat to the page writer, with its surrounding context. */
  function writeBeat(chapterIndex: number, id: string, summary: string) {
    setBeat(summary)
    setBeatId(id)
    setTab('story')
    void write(summary, id, chapterIndex)
  }

  const leads = project.characters.filter((c) => c.role === 'main')
  const supporting = project.characters.filter((c) => c.role === 'side')

  return (
    <div className="drawer">
      <header className="drawer-head">
        <h2>Story</h2>
        <nav className="tabs">
          {(['plan', 'story', 'style', 'cast', 'art'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`tab${tab === t ? ' is-on' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'cast' ? `Cast (${project.characters.length})` : t}
            </button>
          ))}
        </nav>
        <button className="btn-icon" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="drawer-body">
        {/* ---------- connection ---------- */}
        <div className="conn">
          <span className={`dot-status is-${connection}`} aria-hidden="true" />

          <select
            className="select conn-provider"
            value={llm.provider}
            onChange={(e) => {
              // Switching provider invalidates the model list and any chosen
              // model, so clear both rather than showing a stale selection.
              setLlm({ provider: e.target.value as 'local' | 'gemini', model: '' })
              setModels([])
              setConnection('idle')
              setError(null)
            }}
          >
            <option value="local">Local (LM Studio)</option>
            <option value="gemini">Google Gemini</option>
          </select>

          {llm.provider === 'local' ? (
            <input
              className="conn-url"
              value={llm.baseUrl}
              onChange={(e) => setLlm({ baseUrl: e.target.value })}
              placeholder="http://localhost:1234/v1"
              spellCheck={false}
            />
          ) : (
            <input
              className="conn-url"
              type="password"
              value={llm.apiKey}
              onChange={(e) => setLlm({ apiKey: e.target.value })}
              placeholder="Google AI Studio API key"
              spellCheck={false}
              autoComplete="off"
            />
          )}
          <select
            className="select conn-model"
            value={llm.model}
            onChange={(e) => setLlm({ model: e.target.value })}
            disabled={models.length === 0}
          >
            {models.length === 0 ? (
              <option value="">no models</option>
            ) : (
              models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>
          <button className="btn" onClick={() => void connect()} disabled={connection === 'checking'}>
            {connection === 'checking' ? 'Checking…' : 'Reconnect'}
          </button>
        </div>

        {llm.provider === 'gemini' && (
          <p className="hint no-top">
            The key is kept in this browser only — it is not saved into project files
            and never reaches GitHub. Get one free at{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              aistudio.google.com/apikey
            </a>
            .
          </p>
        )}

        {error && <p className="notice" role="alert">{error}</p>}

        {/* ---------- plan ---------- */}
        {tab === 'plan' && (
          <div className="pane">
            {project.series.chapters.length === 0 ? (
              <>
                <label className="field">
                  What is the manga about?
                  <textarea
                    className="bubble-text"
                    rows={4}
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder="A mage killing demons to atone for his sins saves a boy from a slaughtered caravan and raises him. When the boy learns the mage is not his father, he must choose between finding his real family and following the mage's path."
                  />
                </label>

                <div className="row">
                  <label className="check">
                    Pages
                    <input
                      className="num"
                      type="number"
                      min={4}
                      max={200}
                      value={minPages}
                      onChange={(e) => setMinPages(Number(e.target.value))}
                    />
                    to
                    <input
                      className="num"
                      type="number"
                      min={4}
                      max={200}
                      value={maxPages}
                      onChange={(e) => setMaxPages(Number(e.target.value))}
                    />
                  </label>
                  <button
                    className="btn btn-accent"
                    onClick={() => void planSeries()}
                    disabled={planning !== null || connection !== 'ok'}
                  >
                    {planning === 'series' ? 'Planning…' : 'Plan the whole manga'}
                  </button>
                </div>

                {planProgress && <p className="progress">{planProgress}</p>}

                <p className="hint no-top">
                  One prompt is enough. The writer decides the chapters, invents
                  the cast, picks an art style, and breaks every chapter into
                  pages — all in one go.
                </p>
              </>
            ) : (
              <>
                <div className="series-head">
                  <div>
                    <strong>Premise</strong>
                    <p className="series-line">{project.series.premise}</p>
                  </div>
                  <div>
                    <strong>Ends with</strong>
                    <p className="series-line">{project.series.ending}</p>
                  </div>
                  <button
                    className="link-btn"
                    onClick={() => setSeries({ premise: '', ending: '', chapters: [] })}
                  >
                    Start over
                  </button>
                </div>


                <ol className="chapters">
                  {project.series.chapters.map((chapter, i) => {
                    const done = chapter.beats.filter((b) => b.written).length
                    const open = openChapter === i
                    return (
                      <li key={chapter.id} className="chapter">
                        <div className="chapter-head">
                          <button
                            className="disclosure"
                            onClick={() => setOpenChapter(open ? null : i)}
                          >
                            <span className={`caret${open ? ' is-open' : ''}`}>▸</span>
                            <span className="chapter-title">
                              {i + 1}. {chapter.title}
                            </span>
                          </button>
                          {chapter.beats.length > 0 && (
                            <span className="muted">
                              {done}/{chapter.beats.length} drawn
                            </span>
                          )}
                          <button
                            className="link-btn"
                            onClick={() => void planChapter(i)}
                            disabled={planning !== null || connection !== 'ok'}
                          >
                            {planning?.startsWith(`chapter-${i}`)
                              ? planning.includes('|')
                                ? `${planning.split('|')[1]}…`
                                : 'Planning…'
                              : chapter.planned
                                ? 'Re-plan'
                                : 'Plan pages'}
                          </button>
                        </div>

                        {open && (
                          <>
                            <p className="chapter-summary">{chapter.summary}</p>
                            {chapter.beats.length > 0 && (
                              <ol className="beat-list">
                                {chapter.beats.map((b, n) => (
                                  <li key={b.id} className={b.written ? 'is-done' : ''}>
                                    <span className="beat-n">p{n + 1}</span>
                                    <span className="beat-text">{b.summary}</span>
                                    <button
                                      className="link-btn"
                                      onClick={() => writeBeat(i, b.id, b.summary)}
                                      disabled={writing || connection !== 'ok'}
                                    >
                                      {b.written ? 'Redraw' : 'Write'}
                                    </button>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </>
            )}
          </div>
        )}

        {/* ---------- story ---------- */}
        {tab === 'story' && (
          <div className="pane">
            <label className="field">
              What happens on this page?
              <textarea
                className="bubble-text"
                rows={3}
                value={beat}
                onChange={(e) => setBeat(e.target.value)}
                placeholder="the woodcutter finally speaks to her"
              />
            </label>

            <div className="row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={onNewPage}
                  onChange={(e) => setOnNewPage(e.target.checked)}
                />
                Add as a new page
              </label>
              <button
                className="btn btn-accent"
                onClick={() => void write()}
                disabled={writing || connection !== 'ok'}
              >
                {writing ? 'Writing…' : 'Write page'}
              </button>
            </div>

            {!onNewPage && (
              <p className="hint no-top">This replaces the page you are looking at.</p>
            )}

            {result && (
              <div className="result">
                <div className="result-head">
                  <strong>{result.title}</strong>
                  <span className="muted">
                    {result.layout} · {result.panels.length} panels
                  </span>
                </div>

                <ol className="beats">
                  {result.panels.map((p) => (
                    <li key={p.n}>
                      <span className="shot">{p.shot}</span>
                      {p.dialogue && <span className="said">“{p.dialogue}”</span>}
                      {p.caption && <span className="narr">{p.caption}</span>}
                      <code className="imgprompt">
                        {composePrompt(
                          project,
                          p.prompt,
                          project.characters
                            .filter((c) => p.characters?.includes(c.name))
                            .map((c) => c.id),
                        ).positive}
                      </code>
                    </li>
                  ))}
                </ol>

                <div className="row">
                  <button
                    className="btn btn-accent"
                    onClick={() => {
                      applyGeneratedPage(result, onNewPage, beatId)
                      setResult(null)
                      onClose()
                    }}
                  >
                    Build this page
                  </button>
                  <button className="btn" onClick={() => void write()} disabled={writing}>
                    Rewrite
                  </button>
                </div>
                <p className="hint no-top">
                  Panels, captions and speech bubbles are laid out for you. Image prompts are
                  kept with the page for when art generation is connected.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---------- style ---------- */}
        {tab === 'style' && (
          <div className="pane">
            <label className="field">
              Premise
              <textarea
                className="bubble-text"
                rows={3}
                value={project.style.synopsis}
                onChange={(e) => setStyle({ synopsis: e.target.value })}
                placeholder="A girl lives alone in a cabin by a river, beneath a floating rock spire…"
              />
            </label>
            <p className="hint no-top">Given to the writer as standing context for every page.</p>

            <label className="field">
              Art style
              <textarea
                className="bubble-text"
                rows={3}
                value={project.style.positive}
                onChange={(e) => setStyle({ positive: e.target.value })}
              />
            </label>

            <label className="field">
              Never include
              <textarea
                className="bubble-text"
                rows={2}
                value={project.style.negative}
                onChange={(e) => setStyle({ negative: e.target.value })}
              />
            </label>
            <p className="hint no-top">
              These go in front of every image prompt, so the whole book shares one look.
            </p>
          </div>
        )}

        {/* ---------- art ---------- */}
        {tab === 'art' && (
          <div className="pane">
            <label className="field">
              Where art comes from
              <select
                className="select"
                value={llm.imageProvider}
                onChange={(e) =>
                  setLlm({ imageProvider: e.target.value as 'comfy' | 'pollinations' })
                }
              >
                <option value="comfy">ComfyUI on this machine</option>
                <option value="pollinations">Pollinations (hosted)</option>
              </select>
            </label>

            {llm.imageProvider === 'comfy' ? (
              <>
                <div className="row">
                  <input
                    className="conn-url"
                    value={comfy.baseUrl}
                    onChange={(e) => setComfy({ baseUrl: e.target.value })}
                    placeholder="http://127.0.0.1:8188"
                    spellCheck={false}
                  />
                  <button
                    className="btn"
                    onClick={() => void findCheckpoints()}
                    disabled={comfyState === 'checking'}
                  >
                    {comfyState === 'checking' ? 'Checking…' : 'Connect'}
                  </button>
                  <span className={`dot-status is-${comfyState}`} aria-hidden="true" />
                </div>

                {comfyError && (
                  <p className="notice" role="alert">
                    {comfyError}
                  </p>
                )}

                <label className="field">
                  Model type
                  <select
                    className="select"
                    value={comfy.kind}
                    onChange={(e) =>
                      setComfy({ kind: e.target.value as 'checkpoint' | 'split' })
                    }
                  >
                    <option value="checkpoint">
                      Single checkpoint (SD / SDXL / Pony)
                    </option>
                    <option value="split">
                      Split model (separate UNet, text encoder, VAE)
                    </option>
                  </select>
                </label>

                {comfy.kind === 'checkpoint' ? (
                  <label className="field">
                    Checkpoint
                    <select
                      className="select"
                      value={comfy.checkpoint}
                      onChange={(e) => setComfy({ checkpoint: e.target.value })}
                      disabled={comfyModels.checkpoints.length === 0}
                    >
                      {comfyModels.checkpoints.length === 0 ? (
                        <option value="">no checkpoints found</option>
                      ) : (
                        comfyModels.checkpoints.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="field">
                      UNet / diffusion model
                      <select
                        className="select"
                        value={comfy.unet}
                        onChange={(e) => selectUnet(e.target.value)}
                        disabled={comfyModels.unets.length === 0}
                      >
                        {comfyModels.unets.length === 0 ? (
                          <option value="">none in models/diffusion_models</option>
                        ) : (
                          comfyModels.unets.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))
                        )}
                      </select>
                    </label>

                    <label className="field">
                      Text encoder
                      <select
                        className="select"
                        value={comfy.clip}
                        onChange={(e) => setComfy({ clip: e.target.value })}
                        disabled={comfyModels.clips.length === 0}
                      >
                        {comfyModels.clips.length === 0 ? (
                          <option value="">none in models/text_encoders</option>
                        ) : (
                          comfyModels.clips.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))
                        )}
                      </select>
                    </label>

                    <div className="field-row">
                      <label>
                        VAE
                        <select
                          className="select"
                          value={comfy.vae}
                          onChange={(e) => setComfy({ vae: e.target.value })}
                          disabled={comfyModels.vaes.length === 0}
                        >
                          {comfyModels.vaes.length === 0 ? (
                            <option value="">none in models/vae</option>
                          ) : (
                            comfyModels.vaes.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                      <label>
                        Encoder type
                        <select
                          className="select"
                          value={comfy.clipType}
                          onChange={(e) => setComfy({ clipType: e.target.value })}
                        >
                          {(comfyModels.clipTypes.length > 0
                            ? comfyModels.clipTypes
                            : [comfy.clipType]
                          ).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {presetForUnet(comfy.unet) && (
                      <p className="hint no-top">
                        {presetForUnet(comfy.unet)!.label} detected - its published
                        sampler settings have been applied. This model draws ink
                        linework natively, so it needs no score tags.
                      </p>
                    )}
                  </>
                )}

                <div className="field-row">
                  <label>
                    Steps
                    <input
                      type="number"
                      min={4}
                      max={80}
                      value={comfy.steps}
                      onChange={(e) => setComfy({ steps: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    CFG
                    <input
                      type="number"
                      min={1}
                      max={20}
                      step={0.5}
                      value={comfy.cfg}
                      onChange={(e) => setComfy({ cfg: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={comfy.safeMode}
                    onChange={(e) => setComfy({ safeMode: e.target.checked })}
                  />
                  Keep panels clothed
                </label>

                {comfy.kind === 'checkpoint' && isPonyCheckpoint(comfy.checkpoint) && (
                  <p className="hint no-top">
                    Pony checkpoint detected — the score tags it was trained on are added
                    automatically.{' '}
                    {comfy.safeMode
                      ? 'Pony drifts adult on its own, so nudity is blocked in the negative prompt too.'
                      : 'With this unchecked nothing blocks nudity, and Pony produces it readily.'}
                  </p>
                )}

                <p className="hint no-top">
                  ComfyUI must be started with <code>--enable-cors-header</code>, or the
                  browser will refuse to talk to it. Nothing leaves your machine, there is
                  no key and no quota.
                </p>
              </>
            ) : (
              <>
                <label className="field">
                  Pollinations API key (optional)
                  <input
                    className="conn-url"
                    type="password"
                    value={llm.imageKey}
                    onChange={(e) => setLlm({ imageKey: e.target.value })}
                    placeholder="pk_… or sk_…  — leave blank for the free tier"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>

                <label className="field">
                  Image model
                  <select
                    className="select"
                    value={llm.imageModel}
                    onChange={(e) => setLlm({ imageModel: e.target.value })}
                  >
                    <option value="">Automatic</option>
                    {IMAGE_MODELS.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        disabled={m.needsKey && !llm.imageKey.trim()}
                      >
                        {m.label}
                        {m.needsKey && !llm.imageKey.trim() ? ' — needs a key' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="hint no-top">
                  {llm.imageKey.trim()
                    ? 'With a key, art is downloaded and stored in this browser. A publishable key used straight from a browser is rate limited to roughly one image an hour.'
                    : 'Without a key, art is free but stays a link to Pollinations: it needs the internet to display and is not saved into project files.'}
                </p>
              </>
            )}
          </div>
        )}

        {/* ---------- cast ---------- */}
        {tab === 'cast' && (
          <div className="pane">
            <p className="hint no-top">
              Write down what each character looks like once. Their description is added to
              every panel they appear in, so they stay recognisable from page 1 to page 100.
              The appearance tags do the real work here — a seed only fixes the noise the
              renderer starts from, so it reproduces a panel exactly but will not carry a
              face between different poses.
            </p>

            <CastSection
              title="Leads"
              characters={leads}
              onAdd={() => addCharacter('main')}
              onChange={updateCharacter}
              onDelete={deleteCharacter}
            />
            <CastSection
              title="Supporting"
              characters={supporting}
              onAdd={() => addCharacter('side')}
              onChange={updateCharacter}
              onDelete={deleteCharacter}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function CastSection({
  title,
  characters,
  onAdd,
  onChange,
  onDelete,
}: {
  title: string
  characters: { id: string; name: string; prompt: string; notes: string; seed?: number }[]
  onAdd: () => void
  onChange: (
    id: string,
    patch: { name?: string; prompt?: string; notes?: string; seed?: number },
  ) => void
  onDelete: (id: string) => void
}) {
  return (
    <section className="cast">
      <div className="section-head">
        <h3 className="sub">{title}</h3>
        <button className="link-btn" onClick={onAdd}>
          Add
        </button>
      </div>

      {characters.length === 0 ? (
        <p className="hint no-top">None yet.</p>
      ) : (
        characters.map((c) => (
          <div key={c.id} className="char">
            <div className="char-head">
              <input
                className="char-name"
                value={c.name}
                onChange={(e) => onChange(c.id, { name: e.target.value })}
              />
              <button className="btn-icon" onClick={() => onDelete(c.id)} title="Remove">
                ✕
              </button>
            </div>
            <textarea
              className="bubble-text"
              rows={2}
              value={c.prompt}
              onChange={(e) => onChange(c.id, { prompt: e.target.value })}
              placeholder="appearance tags: long brown braid, green apron, freckles…"
            />
            <textarea
              className="bubble-text"
              rows={2}
              value={c.notes}
              onChange={(e) => onChange(c.id, { notes: e.target.value })}
              placeholder="personality, voice, what they want (for the writer only)"
            />

            <div className="seed-row">
              <label>
                Seed
                <input
                  className="num seed-num"
                  type="number"
                  value={c.seed ?? 0}
                  onChange={(e) => onChange(c.id, { seed: Number(e.target.value) })}
                />
              </label>
              <button
                className="link-btn"
                onClick={() => onChange(c.id, { seed: randomSeed() })}
                title="Roll a new starting point for this character"
              >
                Re-roll
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
