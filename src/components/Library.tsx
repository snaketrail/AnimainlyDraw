/**
 * The asset library.
 *
 * The app ships with no art at all — it knows nothing about characters or
 * backgrounds until you give it some. Tags are free text, so a project can
 * organise art by character name, location, mood, or whatever it needs.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { allTags, SUGGESTED_TAGS, type Asset } from '../lib/types'
import { assetUrl } from '../lib/storage'

function Thumb({ asset }: { asset: Asset }) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    let cancelled = false
    void assetUrl(asset.id, asset.remoteUrl).then((u) => {
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [asset.id, asset.remoteUrl])

  return url ? (
    <img src={url} alt="" className="thumb-img" loading="lazy" />
  ) : (
    <div className="thumb-img thumb-loading" />
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function TagEditor({ asset }: { asset: Asset }) {
  const addTag = useStore((s) => s.addTag)
  const removeTag = useStore((s) => s.removeTag)
  const assets = useStore((s) => s.assets)
  const [adding, setAdding] = useState(false)

  // Offer tags already used elsewhere, plus the starters, minus this asset's own.
  const existing = useMemo(() => {
    const pool = new Set<string>([...allTags(assets), ...SUGGESTED_TAGS])
    for (const t of asset.tags) pool.delete(t)
    return [...pool].sort()
  }, [assets, asset.tags])

  return (
    <div className="tag-editor">
      {asset.tags.map((tag) => (
        <button
          key={tag}
          className="tag"
          title={`Remove “${tag}”`}
          onClick={() => removeTag(asset.id, tag)}
        >
          {tag}
          <span className="tag-x">×</span>
        </button>
      ))}

      {adding ? (
        <input
          className="tag-input"
          list={`tags-${asset.id}`}
          placeholder="tag…"
          autoFocus
          onBlur={(e) => {
            addTag(asset.id, e.target.value)
            setAdding(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setAdding(false)
          }}
        />
      ) : (
        <button className="tag tag-add" onClick={() => setAdding(true)} title="Add a tag">
          +
        </button>
      )}

      <datalist id={`tags-${asset.id}`}>
        {existing.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  )
}

export function Library() {
  const assets = useStore((s) => s.assets)
  const addAssets = useStore((s) => s.addAssets)
  const placeAsset = useStore((s) => s.placeAsset)
  const renameAsset = useStore((s) => s.renameAsset)
  const deleteAsset = useStore((s) => s.deleteAsset)
  const importError = useStore((s) => s.importError)
  const clearImportError = useStore((s) => s.clearImportError)

  const fileRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const tags = useMemo(() => allTags(assets), [assets])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter((a) => {
      const byTag =
        filter === 'all' ||
        (filter === 'untagged' ? a.tags.length === 0 : a.tags.includes(filter))
      const bySearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        (a.fileName?.toLowerCase().includes(q) ?? false)
      return byTag && bySearch
    })
  }, [assets, filter, search])

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setImporting(true)
    await addAssets(Array.from(files))
    setImporting(false)
  }

  const hasUntagged = assets.some((a) => a.tags.length === 0)

  return (
    <aside className="library">
      <header className="panel-head">
        <h2>Library</h2>
        <button
          className="btn btn-accent"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import art'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </header>

      {importError && (
        <div className="notice" role="alert">
          <span>{importError}</span>
          <button className="btn-icon" onClick={clearImportError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {assets.length > 0 && (
        <>
          <div className="search-row">
            <input
              className="search"
              type="search"
              placeholder="Search art…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filters">
            <button
              className={`chip${filter === 'all' ? ' is-on' : ''}`}
              onClick={() => setFilter('all')}
            >
              all
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                className={`chip${filter === tag ? ' is-on' : ''}`}
                onClick={() => setFilter(tag)}
              >
                {tag}
              </button>
            ))}
            {hasUntagged && (
              <button
                className={`chip${filter === 'untagged' ? ' is-on' : ''}`}
                onClick={() => setFilter('untagged')}
              >
                untagged
              </button>
            )}
          </div>
        </>
      )}

      {assets.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No art yet</p>
          <p>
            Import the images you generated — characters, backgrounds, props.
            They're saved in this browser, so they'll still be here next time.
          </p>
          <p className="muted-block">You can also drag files straight onto the page.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p>Nothing matches.</p>
        </div>
      ) : (
        <ul className="thumbs">
          {shown.map((asset) => (
            <li key={asset.id} className="thumb">
              <button
                className="thumb-btn"
                onClick={() => placeAsset(asset.id)}
                title={`Place ${asset.name}`}
              >
                <Thumb asset={asset} />
              </button>

              <div className="thumb-meta">
                <div className="thumb-top">
                  {editingId === asset.id ? (
                    <input
                      className="rename"
                      defaultValue={asset.name}
                      autoFocus
                      onBlur={(e) => {
                        renameAsset(asset.id, e.target.value.trim() || asset.name)
                        setEditingId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                  ) : (
                    <button
                      className="thumb-name"
                      onDoubleClick={() => setEditingId(asset.id)}
                      title={`${asset.fileName ?? asset.name}

Double-click to rename`}
                    >
                      {asset.name}
                    </button>
                  )}
                  <button
                    className="btn-icon"
                    title="Delete from library"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete “${asset.name}”? It will be removed from every page that uses it.`,
                        )
                      ) {
                        deleteAsset(asset.id)
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>

                <span className="thumb-dims">
                  {asset.width}×{asset.height} · {formatSize(asset.size)}
                </span>

                <TagEditor asset={asset} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
