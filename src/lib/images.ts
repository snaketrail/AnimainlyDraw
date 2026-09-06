/**
 * Image generation via Pollinations.
 *
 * Two endpoints, and the choice between them is forced by how browsers are
 * treated rather than by preference:
 *
 *   - `image.pollinations.ai/prompt/…` needs no key. A browser `fetch()` gets
 *     403 and `<img crossOrigin="anonymous">` fails on any uncached prompt
 *     (measured: five fresh prompts, five failures), so the canvas is always
 *     tainted and the pixels can never be read. Art from this path stays a
 *     remote URL.
 *
 *   - `gen.pollinations.ai/image/…` is the current API. It refuses browsers
 *     outright without a valid key — `fetch` and `<img>` alike return 401 —
 *     so it is only reachable once the user has authorised one.
 *
 * Auth goes in the `key` query parameter, not the Authorization header: an
 * `<img>` tag cannot set headers, and a query parameter avoids the CORS
 * preflight entirely.
 *
 * Note on key types, from Pollinations' own docs: a raw publishable `pk_` used
 * directly from a browser is legacy and rate-limited to 1 pollen per IP per
 * hour. The supported route for a web app is Connect User Wallets (OAuth with
 * PKCE), where the user authorises the app to spend their own pollen and the
 * app receives a scoped `sk_`. This module accepts whichever key it is given;
 * obtaining one properly is the caller's job.
 */

const FREE_BASE = 'https://image.pollinations.ai/prompt'
const KEYED_BASE = 'https://gen.pollinations.ai/image'

/**
 * Models worth offering. The full catalogue is long and mostly premium; these
 * are the ones that suit comic panels.
 */
export const IMAGE_MODELS = [
  // Reachable without a key, on the free endpoint.
  { id: 'flux', label: 'Flux — good all-rounder', needsKey: false },
  { id: 'turbo', label: 'Turbo — fastest', needsKey: false },
  // The rest need an authorised key and spend pollen.
  { id: 'zimage', label: 'Z-Image — crisp and cheap', needsKey: true },
  { id: 'nanobanana-2-lite', label: 'Nano Banana 2 Lite', needsKey: true },
  { id: 'nanobanana-2', label: 'Nano Banana 2', needsKey: true },
  { id: 'qwen-image-3', label: 'Qwen Image 3', needsKey: true },
  { id: 'seedream5', label: 'Seedream 5', needsKey: true },
  { id: 'seedream5-pro', label: 'Seedream 5 Pro', needsKey: true },
  { id: 'ideogram-v4-turbo', label: 'Ideogram v4 Turbo — good text', needsKey: true },
  { id: 'krea', label: 'Krea — style-rich', needsKey: true },
  { id: 'dreamshaper', label: 'Dreamshaper — near-instant', needsKey: true },
] as const

export interface ImageRequest {
  prompt: string
  negative?: string
  /** Pixels. Kept modest by default: a panel is rarely full-page. */
  width?: number
  height?: number
  /** Same seed and prompt returns the same picture, which makes retries honest. */
  seed?: number
  model?: string
  /** A pollinations.ai key (pk_/sk_). Without one the free endpoint is used. */
  apiKey?: string
  /**
   * Reference image URLs, for holding a character's look steady across
   * panels. Only the keyed endpoint supports this.
   */
  referenceImages?: string[]
}

/** Sizes that suit a manga panel, rather than arbitrary numbers. */
export const PANEL_SIZES = {
  wide: { width: 1024, height: 576, label: 'Wide (16:9)' },
  standard: { width: 1024, height: 768, label: 'Standard (4:3)' },
  square: { width: 1024, height: 1024, label: 'Square' },
  tall: { width: 768, height: 1024, label: 'Tall (3:4)' },
  portrait: { width: 576, height: 1024, label: 'Portrait (9:16)' },
} as const

export type PanelSize = keyof typeof PANEL_SIZES

export function buildImageUrl({
  prompt,
  negative,
  width = 1024,
  height = 768,
  seed,
  model,
  apiKey,
  referenceImages,
}: ImageRequest): string {
  // The prompt travels in the path, so it must be encoded — an unescaped "/"
  // or "?" in a description would otherwise break the URL.
  const encoded = encodeURIComponent(prompt.trim())
  const keyed = Boolean(apiKey?.trim())

  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: model || (keyed ? 'zimage' : 'flux'),
  })

  if (seed !== undefined) params.set('seed', String(seed))

  if (keyed) {
    // The key travels as a query parameter so an <img> tag can carry it and no
    // CORS preflight is needed. Documented as an equal alternative to the
    // Authorization header.
    params.set('key', apiKey!.trim())
    if (negative?.trim()) params.set('negative_prompt', negative.trim())
    // Keep generated panels out of the public feed.
    params.set('nofeed', 'true')
    if (referenceImages?.length) params.set('image', referenceImages.join('|'))
  } else {
    // The free endpoint uses different names for the same ideas.
    params.set('nologo', 'true')
    params.set('private', 'true')
  }

  return `${keyed ? KEYED_BASE : FREE_BASE}/${encoded}?${params.toString()}`
}

export interface GeneratedImage {
  /** Present when the bytes could be downloaded; store these. */
  blob?: Blob
  /** Present when only a reference is possible; needs the internet to display. */
  url?: string
  width: number
  height: number
}

/**
 * Generate one image.
 *
 * With a key the bytes are fetched, so the picture is stored in the browser
 * and survives offline. Without one it can only be referenced by URL, for the
 * CORS reasons described at the top of this file.
 *
 * Generation is slow — a cold request can take most of a minute — so the
 * caller gets an AbortSignal for a cancel button, and a timeout that explains
 * itself rather than hanging.
 */
export async function generateImage(
  request: ImageRequest,
  signal?: AbortSignal,
  timeoutMs = 120_000,
): Promise<GeneratedImage> {
  const url = buildImageUrl(request)
  const key = request.apiKey?.trim()
  return key
    ? fetchWithKey(url, signal, timeoutMs)
    : referenceOnly(url, signal, timeoutMs)
}

async function fetchWithKey(
  url: string,
  signal?: AbortSignal,
  timeoutMs = 120_000,
): Promise<GeneratedImage> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), timeoutMs)
  const onAbort = () => timeout.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    // No Authorization header: the key is already in the URL, and adding the
    // header would force a CORS preflight for no benefit.
    const response = await fetch(url, { signal: timeout.signal })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('That Pollinations key was not accepted — check it at enter.pollinations.ai/keys')
      }
      if (response.status === 402) {
        throw new Error('Not enough pollen for that model — try Flux, or top up your account')
      }
      if (response.status === 403) {
        throw new Error('That key lacks permission for this request')
      }
      if (response.status === 429) {
        // A raw pk_ key in a browser is capped at 1 pollen per IP per hour.
        throw new Error('Rate limited — publishable keys allow about one image per hour from a browser')
      }
      throw new Error(`Image service answered ${response.status}`)
    }

    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) {
      throw new Error('The image service returned something that is not an image')
    }

    const { width, height } = await measureBlob(blob)
    return { blob, width, height }
  } catch (error) {
    if (signal?.aborted) throw new Error('Cancelled')
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The image took too long — the service may be busy')
    }
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Load through an `<img>` and keep the URL: the keyless path's only option. */
function referenceOnly(
  url: string,
  signal?: AbortSignal,
  timeoutMs = 120_000,
): Promise<GeneratedImage> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    // No crossOrigin: setting it makes the free endpoint reject the request.
    el.referrerPolicy = 'no-referrer'

    const timer = setTimeout(() => {
      el.src = ''
      reject(new Error('The image took too long — the service may be busy'))
    }, timeoutMs)

    const onAbort = () => {
      clearTimeout(timer)
      el.src = ''
      reject(new Error('Cancelled'))
    }
    signal?.addEventListener('abort', onAbort)

    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    el.onload = () => {
      done()
      if (el.naturalWidth < 8) {
        reject(new Error('The image service returned an empty picture'))
        return
      }
      resolve({ url, width: el.naturalWidth, height: el.naturalHeight })
    }
    el.onerror = () => {
      done()
      reject(new Error('The image service refused the request — try again in a moment'))
    }

    el.src = url
  })
}

function measureBlob(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(objectUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read the generated image'))
    }
    img.src = objectUrl
  })
}

/** Pick a panel size from the shot description the writer produced. */
export function sizeForShot(shot: string): PanelSize {
  const s = shot.toLowerCase()
  if (/close|face|portrait/.test(s)) return 'square'
  if (/wide|establishing|panoramic|landscape/.test(s)) return 'wide'
  if (/full body|standing|tall/.test(s)) return 'tall'
  return 'standard'
}
