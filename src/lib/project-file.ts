/**
 * Project files.
 *
 * A `.animainly` file is JSON holding the project *and* every image it uses,
 * base64-encoded. Bundling the art is the whole point: a file that merely
 * referenced IndexedDB entries would open to a page of blank panels on any
 * other machine, which is the failure people actually hit when moving work
 * between computers.
 *
 * The cost is size — base64 adds about a third — but a project you cannot move
 * is worth nothing, and this is the only format that survives the trip.
 */

import type { Asset, Project } from './types'
import { loadAssetBlob, saveAssetBlob } from './storage'

const FORMAT = 'animainly-project'
const FORMAT_VERSION = 1

interface ProjectFile {
  format: typeof FORMAT
  version: number
  savedAt: string
  project: Project
  assets: (Asset & { data: string })[]
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'))
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return response.blob()
}

function safeName(title: string): string {
  return (
    title
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'manga'
  )
}

/** Which assets this project actually uses — no point bundling unused art. */
function usedAssets(project: Project, assets: Asset[]): Asset[] {
  const needed = new Set<string>()
  for (const page of project.pages) {
    for (const object of page.objects) {
      if (object.type === 'image') needed.add(object.assetId)
    }
  }
  return assets.filter((a) => needed.has(a.id))
}

export async function saveProjectFile(project: Project, assets: Asset[]): Promise<void> {
  const bundled: ProjectFile['assets'] = []

  for (const asset of usedAssets(project, assets)) {
    const blob = await loadAssetBlob(asset.id)
    if (!blob) continue
    bundled.push({ ...asset, data: await blobToDataUrl(blob) })
  }

  const file: ProjectFile = {
    format: FORMAT,
    version: FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    project,
    assets: bundled,
  }

  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeName(project.title)}.animainly`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export interface LoadedProject {
  project: Project
  assets: Asset[]
}

export async function loadProjectFile(file: File): Promise<LoadedProject> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error('That file is not a valid Animainly project')
  }

  const data = parsed as Partial<ProjectFile>
  if (data.format !== FORMAT || !data.project) {
    throw new Error('That file is not an Animainly project')
  }
  if ((data.version ?? 0) > FORMAT_VERSION) {
    throw new Error('This project was saved by a newer version of Animainly')
  }

  // Restore the art into IndexedDB, keeping ids so the pages still resolve.
  const assets: Asset[] = []
  for (const bundled of data.assets ?? []) {
    const { data: dataUrl, ...asset } = bundled
    try {
      await saveAssetBlob(asset.id, await dataUrlToBlob(dataUrl))
      assets.push(asset)
    } catch {
      // A single unreadable image shouldn't stop the whole project opening.
    }
  }

  return { project: data.project, assets }
}
