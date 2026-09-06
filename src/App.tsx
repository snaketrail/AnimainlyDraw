import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore'
import { Canvas } from './components/Canvas'
import { Library } from './components/Library'
import { Inspector } from './components/Inspector'
import { emptyPageNumbers, exportAllPages, exportCurrentPage, exportPdf } from './lib/export'
import { loadProjectFile, saveProjectFile } from './lib/project-file'
import { StoryPanel } from './components/StoryPanel'

export default function App() {
  const init = useStore((s) => s.init)
  const loading = useStore((s) => s.loading)
  const storageBlocked = useStore((s) => s.storageBlocked)
  const project = useStore((s) => s.project)
  const pageIndex = useStore((s) => s.currentPageIndex)
  const selectedId = useStore((s) => s.selectedId)
  const setTitle = useStore((s) => s.setTitle)
  const addPage = useStore((s) => s.addPage)
  const deletePage = useStore((s) => s.deletePage)
  const goToPage = useStore((s) => s.goToPage)
  const deleteObject = useStore((s) => s.deleteObject)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [storyOpen, setStoryOpen] = useState(false)
  const [drawMenu, setDrawMenu] = useState(false)
  const drawAll = useStore((s) => s.drawAll)
  const stopBatch = useStore((s) => s.stopBatch)
  const batch = useStore((s) => s.batch)

  // How many panels are still waiting for art, so the menu can say so rather
  // than leaving the user to guess what a batch would do.
  const pending = (() => {
    const count = (page: (typeof project.pages)[number]) =>
      page.panels.filter(
        (panel) =>
          panel.prompt && !page.objects.some((o) => o.type === 'image' && o.panelId === panel.id),
      ).length
    const here = project.pages[pageIndex]
    return {
      page: here ? count(here) : 0,
      book: project.pages.reduce((sum, page) => sum + count(page), 0),
    }
  })()
  const assets = useStore((s) => s.assets)
  const loadFromFile = useStore((s) => s.loadFromFile)
  const projectFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void init()
  }, [init])

  // A dropdown that only closes by re-clicking its own button feels broken.
  useEffect(() => {
    if (!drawMenu) return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.menu-wrap')) setDrawMenu(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setDrawMenu(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [drawMenu])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (typing) return

      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        deleteObject(selectedId)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, deleteObject, selectedId])

  async function run(fn: () => Promise<void>, done?: string) {
    setBusy(true)
    setStatus(null)
    try {
      await fn()
      if (done) setStatus(done)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="boot">
        <p>Opening your manga…</p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Animainly</span>

        <input
          className="title-input"
          value={project.title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Manga title"
        />

        <div className="topbar-actions">
          <button className="btn" onClick={undo} title="Ctrl+Z">
            Undo
          </button>
          <button className="btn" onClick={redo} title="Ctrl+Shift+Z">
            Redo
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => projectFileRef.current?.click()}
            title="Open a .animainly project file"
          >
            Open
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void run(() => saveProjectFile(project, assets), 'Project saved')
            }
            title="Save the project and its art as one file"
          >
            Save
          </button>
          <input
            ref={projectFileRef}
            type="file"
            accept=".animainly,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              void run(async () => {
                loadFromFile(await loadProjectFile(file))
              }, 'Project opened')
            }}
          />

          <span className="topbar-sep" />

          <button
            className={`btn${storyOpen ? ' is-on' : ''}`}
            onClick={() => setStoryOpen((open) => !open)}
            title="Write pages with a local AI model"
          >
            Story AI
          </button>

          {batch ? (
            <button className="btn btn-accent" onClick={stopBatch} title="Stop after this panel">
              {batch.label === 'stopping…'
                ? 'Stopping…'
                : `Drawing ${batch.done + 1}/${batch.total} — stop`}
            </button>
          ) : (
            <span className="menu-wrap">
              <button
                className={`btn${drawMenu ? ' is-on' : ''}`}
                onClick={() => setDrawMenu((open) => !open)}
                disabled={pending.book === 0}
                title={
                  pending.book === 0
                    ? 'No panels are waiting for art'
                    : 'Generate art for panels'
                }
              >
                Draw ▾
              </button>
              {drawMenu && (
                <div className="menu">
                  <button
                    className="menu-item"
                    disabled={pending.page === 0}
                    onClick={() => {
                      setDrawMenu(false)
                      void drawAll('page')
                    }}
                  >
                    This page
                    <span className="menu-count">{pending.page}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setDrawMenu(false)
                      void drawAll('book')
                    }}
                  >
                    Whole manga
                    <span className="menu-count">{pending.book}</span>
                  </button>
                  <p className="menu-note">
                    One panel at a time. Stop whenever — finished panels are kept, and
                    pressing Draw again resumes where it left off.
                  </p>
                </div>
              )}
            </span>
          )}

          <span className="topbar-sep" />

          <button
            className="btn"
            disabled={busy}
            onClick={() => void run(() => exportCurrentPage(project, pageIndex))}
          >
            Page PNG
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void run(() => exportAllPages(project))}
          >
            All PNG
          </button>
          <button
            className="btn btn-accent"
            disabled={busy}
            onClick={() => {
              // A blank page in the middle of a book is usually a leftover,
              // not a deliberate spread. Ask rather than silently including
              // or silently dropping it.
              const blanks = emptyPageNumbers(project)
              if (blanks.length > 0) {
                const list = blanks.join(', ')
                const ok = confirm(
                  `Page ${list} ${blanks.length > 1 ? 'are' : 'is'} empty and will export as ${
                    blanks.length > 1 ? 'blank sheets' : 'a blank sheet'
                  }.

Export anyway?`,
                )
                if (!ok) return
              }
              void run(() => exportPdf(project), 'PDF exported')
            }}
          >
            {busy ? 'Working…' : 'PDF'}
          </button>
        </div>
      </header>

      {storyOpen && <StoryPanel onClose={() => setStoryOpen(false)} />}

      <main className="workspace">
        <Library />
        <Canvas />
        <Inspector />
      </main>

      <footer className="pagebar">
        <span className="pagebar-label">Pages</span>
        <ul className="page-list">
          {project.pages.map((page, i) => {
            const empty = page.objects.length === 0 && page.panels.length === 0
            return (
              <li key={page.id}>
                <button
                  className={`page-chip${i === pageIndex ? ' is-on' : ''}${
                    empty ? ' is-empty' : ''
                  }`}
                  onClick={() => goToPage(i)}
                  title={empty ? `Page ${i + 1} is empty` : `Page ${i + 1}`}
                >
                  {i + 1}
                  {!empty && <span className="dot" />}
                </button>
              </li>
            )
          })}
        </ul>
        <button className="btn" onClick={addPage}>
          Add page
        </button>
        <button
          className="btn"
          disabled={project.pages.length <= 1}
          onClick={() => deletePage(pageIndex)}
        >
          Delete page
        </button>
        {status && (
          <button className="status" onClick={() => setStatus(null)} title="Dismiss">
            {status}
          </button>
        )}
        <span className={`saved${storageBlocked ? ' is-warn' : ''}`}>
          {storageBlocked
            ? 'Not saving — this browser is blocking site storage'
            : 'Saved in this browser'}
        </span>
      </footer>
    </div>
  )
}
