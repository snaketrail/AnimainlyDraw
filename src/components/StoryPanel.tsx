/**
 * The story workbench: connection, style bible, cast, and page writing.
 *
 * The style bible and cast exist to stop a book drifting. An AI asked to draw
 * "the girl" forty times will produce forty different girls, so her appearance
 * is written down once and reused — the same reason a studio keeps model
 * sheets. Nothing here leaves the machine: the model runs locally.
 */

import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  generateChapterBeats,
  generatePage,
  generateSeries,
  listModels,
  type GeneratedPage,
} from '../lib/llm'
import { composePrompt } from '../lib/types'

type Tab = 'plan' | 'story' | 'style' | 'cast'

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
  const [chapterCount, setChapterCount] = useState(6)
  const [pagesPerChapter, setPagesPerChapter] = useState(8)
  const [planning, setPlanning] = useState<string | null>(null)
  const [openChapter, setOpenChapter] = useState<number | null>(0)

  async function connect() {
    setConnection('checking')
    setError(null)
    try {
      const found = await listModels(llm.baseUrl)
      setModels(found)
      setConnection('ok')
      // Pick a chat model automatically so the first run needs no fiddling.
      if (!llm.model || !found.includes(llm.model)) {
        const preferred = found.find((m) => /instruct|chat/i.test(m)) ?? found[0]
        if (preferred) setLlm({ model: preferred })
      }
    } catch (e) {
      setConnection('error')
      setError(e instanceof Error ? e.message : 'Could not reach the server')
    }
  }

  // Try once on open: usually the server is already running and this saves a click.
  useEffect(() => {
    void connect()
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
        llm,
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
      const plan = await generateSeries(llm, project, idea.trim() || project.style.synopsis, chapterCount)
      setSeries({
        premise: plan.premise,
        ending: plan.ending,
        chapters: plan.chapters.map((c) => ({
          id: crypto.randomUUID(),
          title: c.title,
          summary: c.summary,
          beats: [],
          planned: false,
        })),
      })
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
      const beats = await generateChapterBeats(llm, project, index, pagesPerChapter)
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
          {(['plan', 'story', 'style', 'cast'] as Tab[]).map((t) => (
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
          <input
            className="conn-url"
            value={llm.baseUrl}
            onChange={(e) => setLlm({ baseUrl: e.target.value })}
            placeholder="http://localhost:1234/v1"
            spellCheck={false}
          />
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

        {error && <p className="notice" role="alert">{error}</p>}

        {/* ---------- plan ---------- */}
        {tab === 'plan' && (
          <div className="pane">
            {project.series.chapters.length === 0 ? (
              <>
                <label className="field">
                  What is the whole manga about?
                  <textarea
                    className="bubble-text"
                    rows={3}
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder="A girl living alone beneath a floating spire discovers the woodcutter who protects her is bound to it."
                  />
                </label>
                <div className="row">
                  <label className="check">
                    Chapters
                    <input
                      className="num"
                      type="number"
                      min={1}
                      max={30}
                      value={chapterCount}
                      onChange={(e) => setChapterCount(Number(e.target.value))}
                    />
                  </label>
                  <button
                    className="btn btn-accent"
                    onClick={() => void planSeries()}
                    disabled={planning !== null || connection !== 'ok'}
                  >
                    {planning === 'series' ? 'Planning…' : 'Plan the manga'}
                  </button>
                </div>
                <p className="hint no-top">
                  The whole story first, then each chapter into pages, then each page into
                  panels. Every level is written knowing the ones above it.
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

                <div className="row">
                  <label className="check">
                    Pages per chapter
                    <input
                      className="num"
                      type="number"
                      min={1}
                      max={40}
                      value={pagesPerChapter}
                      onChange={(e) => setPagesPerChapter(Number(e.target.value))}
                    />
                  </label>
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
                            {planning === `chapter-${i}`
                              ? 'Planning…'
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

        {/* ---------- cast ---------- */}
        {tab === 'cast' && (
          <div className="pane">
            <p className="hint no-top">
              Write down what each character looks like once. Their description is added to
              every panel they appear in, so they stay recognisable from page 1 to page 100.
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
  characters: { id: string; name: string; prompt: string; notes: string }[]
  onAdd: () => void
  onChange: (id: string, patch: { name?: string; prompt?: string; notes?: string }) => void
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
          </div>
        ))
      )}
    </section>
  )
}
