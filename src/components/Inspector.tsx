/**
 * Right-hand panel: page layout when nothing is selected, object properties
 * when something is.
 *
 * Every field reads and writes the same store the canvas draws from, so typing
 * a number and dragging the object are the same operation.
 */

import { useState } from 'react'
import { useStore } from '../store/useStore'
import { BUBBLE_KINDS, isBubble, isImage, pageSizeOf } from '../lib/types'
import { stackPeers } from '../store/useStore'
import { LAYOUTS, type Layout } from '../lib/layouts'

/**
 * A plain number box.
 *
 * Committing on every keystroke is wrong here: React re-renders with the
 * rounded store value mid-word, so typing "45" over a selection produces
 * concatenated garbage. Holding a draft string until blur/Enter keeps what the
 * user typed intact, and clamping happens once, at commit.
 */
function NumberBox({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string
  value: number
  min?: number
  max?: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  function commit(text: string) {
    const parsed = Number(text)
    if (text.trim() !== '' && Number.isFinite(parsed)) {
      let next = parsed
      if (min !== undefined) next = Math.max(min, next)
      if (max !== undefined) next = Math.min(max, next)
      onCommit(next)
    }
    setDraft(null)
  }


  return (
    <label>
      {label}
      <input
        type="number"
        value={draft ?? Math.round(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

/** First line of a bubble's text, trimmed to fit the layers list. */
function firstLine(text: string): string {
  const line = text.split(/\r?\n/)[0]?.trim() ?? ''
  return line ? line.slice(0, 24) : 'Empty bubble'
}

/** A miniature of the layout, drawn from the same cell data the page uses. */
function LayoutPreview({ layout }: { layout: Layout }) {
  return (
    <svg className="layout-preview" viewBox="0 0 100 141" aria-hidden="true">
      <rect x="0" y="0" width="100" height="141" className="lp-page" />
      {layout.cells.map(([x, y, w, h], i) => (
        <rect
          key={i}
          x={6 + x * 88}
          y={6 + y * 129}
          width={w * 88}
          height={h * 129}
          className="lp-cell"
        />
      ))}
    </svg>
  )
}

/**
 * A slider paired with a number box.
 *
 * Dragging is quick but imprecise; typing is precise but slow. Offering both
 * for the same value means neither has to compromise. The typed value is held
 * as text while editing so a half-typed "-" or "1" isn't clamped out from
 * under the cursor, and is committed on blur or Enter.
 */
function SliderField({
  label,
  min,
  max,
  suffix,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  suffix: string
  value: number
  onChange: (value: number) => void
}) {
  const rounded = Math.round(value)
  const [draft, setDraft] = useState<string | null>(null)

  function commit(text: string) {
    const parsed = Number(text)
    if (text.trim() !== '' && Number.isFinite(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)))
    }
    setDraft(null)
  }

  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        <span className="field-entry">
          <input
            className="num"
            type="number"
            min={min}
            max={max}
            value={draft ?? rounded}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setDraft(null)
                e.currentTarget.blur()
              }
            }}
          />
          <span className="field-suffix">{suffix}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={rounded}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function Inspector() {
  const project = useStore((s) => s.project)
  const pageIndex = useStore((s) => s.currentPageIndex)
  const selectedId = useStore((s) => s.selectedId)
  const assets = useStore((s) => s.assets)
  const commitObject = useStore((s) => s.commitObject)
  const deleteObject = useStore((s) => s.deleteObject)
  const bringForward = useStore((s) => s.bringForward)
  const sendBackward = useStore((s) => s.sendBackward)
  const select = useStore((s) => s.select)
  const applyLayout = useStore((s) => s.applyLayout)
  const clearPanels = useStore((s) => s.clearPanels)
  const fitToPanel = useStore((s) => s.fitToPanel)
  const addBubble = useStore((s) => s.addBubble)
  const updateBubbleText = useStore((s) => s.updateBubbleText)
  const selectedPanelId = useStore((s) => s.selectedPanelId)
  const updatePanel = useStore((s) => s.updatePanel)
  const addPanel = useStore((s) => s.addPanel)
  const deletePanel = useStore((s) => s.deletePanel)
  const splitPanel = useStore((s) => s.splitPanel)

  // The layout grid is tall; collapsing it brings bubbles and layers into view.
  const [layoutOpen, setLayoutOpen] = useState(true)

  const page = project.pages[pageIndex]
  const object = page?.objects.find((o) => o.id === selectedId)
  const panel = page?.panels.find((p) => p.id === selectedPanelId)
  const size = pageSizeOf(project)

  // Back/Front only mean something when another object overlaps this one.
  // A lone image in its own panel has nothing to stack against, so the
  // buttons are disabled rather than silently doing nothing.
  const peers = page && object ? stackPeers(page, object) : []
  const at = peers.findIndex((o) => o.id === object?.id)
  const canSendBack = at > 0
  const canBringFront = at >= 0 && at < peers.length - 1
  const stackNote =
    object && peers.length < 2
      ? isBubble(object)
        ? 'Add another bubble to change stacking order.'
        : 'Only art sharing a panel can be stacked.'
      : null

  return (
    <aside className="inspector">
      <header className="panel-head">
        <h2>Page {pageIndex + 1}</h2>
        <span className="muted">
          {size.width}×{size.height}
        </span>
      </header>

      {panel ? (
        <div className="fields">
          <p className="hint no-top">
            Drag the panel to move it, or its handles to resize. Values are
            percentages of the printable area.
          </p>

          <div className="field-row">
            <NumberBox
              label="Left %"
              value={panel.x * 100}
              min={0}
              max={100}
              onCommit={(v) => updatePanel(panel.id, { x: v / 100 })}
            />
            <NumberBox
              label="Top %"
              value={panel.y * 100}
              min={0}
              max={100}
              onCommit={(v) => updatePanel(panel.id, { y: v / 100 })}
            />
          </div>

          <div className="field-row">
            <NumberBox
              label="Width %"
              value={panel.w * 100}
              min={3}
              max={100}
              onCommit={(v) => updatePanel(panel.id, { w: v / 100 })}
            />
            <NumberBox
              label="Height %"
              value={panel.h * 100}
              min={3}
              max={100}
              onCommit={(v) => updatePanel(panel.id, { h: v / 100 })}
            />
          </div>

          <h3 className="sub">Split</h3>
          <div className="btn-row">
            <button className="btn" onClick={() => splitPanel(panel.id, 'vertical')}>
              Side by side
            </button>
            <button className="btn" onClick={() => splitPanel(panel.id, 'horizontal')}>
              Stacked
            </button>
          </div>

          <button className="btn btn-danger" onClick={() => deletePanel(panel.id)}>
            Delete panel
          </button>
        </div>
      ) : !object ? (
        <>
          <div className="section">
            <div className="section-head">
              <button
                className="disclosure"
                onClick={() => setLayoutOpen((open) => !open)}
                aria-expanded={layoutOpen}
              >
                <span className={`caret${layoutOpen ? ' is-open' : ''}`} aria-hidden="true">
                  ▸
                </span>
                <h3 className="sub">Panel layout</h3>
              </button>
              <button className="link-btn" onClick={addPanel}>
                Add panel
              </button>
              {page && page.panels.length > 0 && (
                <button className="link-btn" onClick={clearPanels}>
                  Clear
                </button>
              )}
            </div>

            {layoutOpen && (
              <>
                <div className="layout-grid">
                  {LAYOUTS.map((layout) => (
                    <button
                      key={layout.id}
                      className="layout-btn"
                      onClick={() => applyLayout(layout.id)}
                      title={layout.note}
                    >
                      <LayoutPreview layout={layout} />
                      <span className="layout-name">{layout.name}</span>
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Manga reads right to left, so panels fill in that order. Click any
                  panel on the page to move, resize or split it.
                </p>
              </>
            )}
          </div>

          <div className="section">
            <h3 className="sub">Add a bubble</h3>
            <div className="bubble-row">
              {BUBBLE_KINDS.map((k) => (
                <button
                  key={k.id}
                  className="btn bubble-btn"
                  onClick={() => addBubble(k.id)}
                  title={k.note}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="hint">
              Bubbles sit above the panels, so they can cross a border or sit in the
              gutter. They stay inside the printable page.
            </p>
          </div>

          {page && page.objects.length > 0 && (
            <div className="section">
              <h3 className="sub">Layers</h3>
              <ul className="layer-list">
                {[...page.objects].reverse().map((o) => {
                  const label = isBubble(o)
                    ? o.kind === 'trail'
                      ? 'Trail dot'
                      : firstLine(o.text)
                    : (assets.find((a) => a.id === o.assetId)?.name ?? 'Missing art')
                  return (
                    <li key={o.id}>
                      <button className="layer" onClick={() => select(o.id)}>
                        {label}
                        {isBubble(o) && <span className="layer-tag">{o.kind}</span>}
                        {isImage(o) && !o.panelId && <span className="layer-tag">floating</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      ) : isBubble(object) ? (
        <div className="fields">
          <label className="field">
            Text
            <textarea
              className="bubble-text"
              rows={3}
              value={object.text}
              onChange={(e) => updateBubbleText(object.id, e.target.value)}
            />
          </label>

          <label className="field">
            Style
            <select
              className="select"
              value={object.kind}
              onChange={(e) =>
                commitObject(object.id, {
                  kind: e.target.value as (typeof BUBBLE_KINDS)[number]['id'],
                })
              }
            >
              {BUBBLE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field-row">
            <NumberBox
              label="X"
              value={object.x}
              min={0}
              max={Math.max(0, size.width - object.width)}
              onCommit={(v) => commitObject(object.id, { x: v })}
            />
            <NumberBox
              label="Y"
              value={object.y}
              min={0}
              max={Math.max(0, size.height - object.height)}
              onCommit={(v) => commitObject(object.id, { y: v })}
            />
          </div>

          <div className="field-row">
            <NumberBox
              label="Width"
              value={object.width}
              min={40}
              max={size.width}
              onCommit={(v) => commitObject(object.id, { width: v })}
            />
            <NumberBox
              label="Height"
              value={object.height}
              min={30}
              max={size.height}
              onCommit={(v) => commitObject(object.id, { height: v })}
            />
          </div>

          <SliderField
            label="Text size"
            min={8}
            max={140}
            suffix="px"
            value={object.fontSize}
            onChange={(v) => commitObject(object.id, { fontSize: v })}
          />

          {(object.kind === 'shout' || object.kind === 'whisper') && (
            <>
              <SliderField
                label="Tail direction"
                min={-180}
                max={180}
                suffix="°"
                value={object.tailAngle}
                onChange={(v) => commitObject(object.id, { tailAngle: v })}
              />
              <SliderField
                label="Tail length"
                min={0}
                max={250}
                suffix="%"
                value={object.tailLength * 100}
                onChange={(v) => commitObject(object.id, { tailLength: v / 100 })}
              />
              </>
            )}

          <SliderField
            label="Rotation"
            min={-180}
            max={180}
            suffix="°"
            value={object.rotation}
            onChange={(v) => commitObject(object.id, { rotation: v })}
          />

          <div className="btn-row">
            <button
              className="btn"
              disabled={!canSendBack}
              onClick={() => sendBackward(object.id)}
              title="Move one step down the stack"
            >
              Back
            </button>
            <button
              className="btn"
              disabled={!canBringFront}
              onClick={() => bringForward(object.id)}
              title="Move one step up the stack"
            >
              Front
            </button>
          </div>
          {stackNote && <p className="hint no-top">{stackNote}</p>}

          <button className="btn btn-danger" onClick={() => deleteObject(object.id)}>
            Delete bubble
          </button>
        </div>
      ) : (
        <div className="fields">
          <div className="field-row">
            <NumberBox
              label="X"
              value={object.x}
              onCommit={(v) => commitObject(object.id, { x: v })}
            />
            <NumberBox
              label="Y"
              value={object.y}
              onCommit={(v) => commitObject(object.id, { y: v })}
            />
          </div>

          <div className="field-row">
            <NumberBox
              label="Width"
              value={object.width}
              min={20}
              onCommit={(v) => commitObject(object.id, { width: v })}
            />
            <NumberBox
              label="Height"
              value={object.height}
              min={20}
              onCommit={(v) => commitObject(object.id, { height: v })}
            />
          </div>

          <SliderField
            label="Rotation"
            min={-180}
            max={180}
            suffix="°"
            value={object.rotation}
            onChange={(v) => commitObject(object.id, { rotation: v })}
          />

          <SliderField
            label="Opacity"
            min={0}
            max={100}
            suffix="%"
            value={object.opacity * 100}
            onChange={(v) => commitObject(object.id, { opacity: v / 100 })}
          />

          <div className="btn-row">
            <button
              className="btn"
              onClick={() => commitObject(object.id, { flipX: !object.flipX })}
            >
              Flip
            </button>
            <button
              className="btn"
              disabled={!canSendBack}
              onClick={() => sendBackward(object.id)}
              title="Move one step down the stack"
            >
              Back
            </button>
            <button
              className="btn"
              disabled={!canBringFront}
              onClick={() => bringForward(object.id)}
              title="Move one step up the stack"
            >
              Front
            </button>
          </div>
          {stackNote && <p className="hint no-top">{stackNote}</p>}

          {isImage(object) && object.panelId && (
            <button className="btn" onClick={() => fitToPanel(object.id)}>
              Refit to panel
            </button>
          )}

          <button className="btn btn-danger" onClick={() => deleteObject(object.id)}>
            Remove from page
          </button>
        </div>
      )}
    </aside>
  )
}
