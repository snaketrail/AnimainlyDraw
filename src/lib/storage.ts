/**
 * Persistence.
 *
 * Asset blobs are megabytes each, so they live in IndexedDB. localStorage
 * would blow its ~5 MB cap on the third character you imported — which is
 * why the first version of this app lost everything on reload.
 *
 * Blobs are stored apart from metadata so the library sidebar can list
 * hundreds of assets without pulling their pixels into memory.
 */

import { BLOBS, META, idbDelete, idbGet, idbKeys, idbSet } from './idb'
import type { Asset, Project } from './types'

const ASSET_INDEX = 'asset-index'
const PROJECT = 'current-project'

/* ---------- assets ---------- */

export async function loadAssetIndex(): Promise<Asset[]> {
  return (await idbGet<Asset[]>(META, ASSET_INDEX)) ?? []
}

export async function saveAssetIndex(assets: Asset[]): Promise<void> {
  await idbSet(META, ASSET_INDEX, assets)
}

export async function saveAssetBlob(id: string, blob: Blob): Promise<void> {
  await idbSet(BLOBS, id, blob)
}

export async function loadAssetBlob(id: string): Promise<Blob | undefined> {
  return idbGet<Blob>(BLOBS, id)
}

export async function deleteAssetBlob(id: string): Promise<void> {
  await idbDelete(BLOBS, id)
}

export async function countStoredBlobs(): Promise<number> {
  return (await idbKeys(BLOBS)).length
}

/* ---------- llm settings ---------- */

const LLM = 'llm-settings'

export async function loadLlmSettings<T>(): Promise<T | undefined> {
  return idbGet<T>(META, LLM)
}

export async function saveLlmSettings(settings: unknown): Promise<void> {
  await idbSet(META, LLM, settings)
}

/* ---------- project ---------- */

export async function loadProject(): Promise<Project | undefined> {
  return idbGet<Project>(META, PROJECT)
}

export async function saveProject(project: Project): Promise<void> {
  await idbSet(META, PROJECT, project)
}

/* ---------- object URL cache ----------
 *
 * Konva needs an HTMLImageElement, which needs a URL. Creating an object URL
 * per render would leak one per frame, so they are created once per asset and
 * revoked only when the asset is deleted.
 */

const urlCache = new Map<string, string>()

export async function assetUrl(id: string): Promise<string | undefined> {
  const cached = urlCache.get(id)
  if (cached) return cached

  const blob = await loadAssetBlob(id)
  if (!blob) return undefined

  const url = URL.createObjectURL(blob)
  urlCache.set(id, url)
  return url
}

export function releaseAssetUrl(id: string): void {
  const url = urlCache.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    urlCache.delete(id)
  }
}
