/**
 * ComfyUI client.
 *
 * ComfyUI runs on the user's own machine, so there is no key, no quota, and
 * nothing leaves the computer. Unlike the hosted image services it also serves
 * proper CORS headers when launched with `--enable-cors-header`, which means
 * the pixels can be fetched and stored rather than merely linked.
 *
 * The workflow is sent in "API format": a flat map of node id → node, which is
 * what ComfyUI's `/prompt` endpoint accepts. Building it here rather than
 * loading a saved file keeps the prompt, seed and size under the app's control
 * instead of baked into a JSON blob the user has to edit.
 */

export interface ComfySettings {
  baseUrl: string
  checkpoint: string
  /** Sampling steps. 25 is a reasonable default for SDXL-class models. */
  steps: number
  cfg: number
  samplerName: string
  scheduler: string
  /** Block nudity and suggestive content. On by default. */
  safeMode: boolean
}

export const DEFAULT_COMFY: ComfySettings = {
  baseUrl: 'http://127.0.0.1:8188',
  checkpoint: '',
  steps: 25,
  cfg: 7,
  samplerName: 'dpmpp_2m',
  scheduler: 'karras',
  safeMode: true,
}

/**
 * Quality tags Pony-family checkpoints expect.
 *
 * Pony was trained with these score tags and produces noticeably worse output
 * without them; they are prepended automatically when the checkpoint name
 * looks like a Pony derivative, so the user never has to remember.
 */
const PONY_PREFIX = 'score_9, score_8_up, score_7_up, source_anime'
const PONY_NEGATIVE = 'score_6, score_5, score_4, source_pony, source_furry, worst quality, low quality'

/**
 * Keep generated panels clothed.
 *
 * Pony-family checkpoints are trained on a heavily adult dataset and drift
 * that way on their own — a prompt that never mentions a body still produces
 * nudity often enough to matter. Blocking it has to be explicit, and it has to
 * be in the negative prompt: the positive `rating_safe` tag alone does not
 * hold.
 *
 * Both halves are needed. The positive tag steers the model, the negatives
 * fence off what it must not draw.
 */
const SFW_POSITIVE = 'rating_safe, sfw, fully clothed'
const SFW_NEGATIVE = [
  'nsfw', 'nude', 'nudity', 'naked', 'topless', 'bottomless',
  'nipples', 'areola', 'breasts out', 'cleavage', 'underwear', 'lingerie',
  'bikini', 'swimsuit', 'panties', 'bare chest', 'exposed skin',
  'suggestive', 'sexual', 'erotic', 'seductive pose', 'revealing clothing',
  'upskirt', 'wardrobe malfunction',
].join(', ')

export function isPonyCheckpoint(name: string): boolean {
  return /pony|autism|cyberrealistic.?pony/i.test(name)
}

export function decorate(
  prompt: string,
  negative: string,
  checkpoint: string,
  safeMode = true,
): { positive: string; negative: string } {
  const pony = isPonyCheckpoint(checkpoint)

  return {
    positive: [
      pony ? PONY_PREFIX : '',
      // The safe tag goes early: tags near the front carry more weight.
      safeMode ? SFW_POSITIVE : '',
      prompt,
    ]
      .filter(Boolean)
      .join(', '),
    negative: [pony ? PONY_NEGATIVE : '', safeMode ? SFW_NEGATIVE : '', negative]
      .filter(Boolean)
      .join(', '),
  }
}

interface ComfyNode {
  class_type: string
  inputs: Record<string, unknown>
}

export interface ComfyRequest {
  prompt: string
  negative: string
  width: number
  height: number
  seed: number
}

/**
 * A plain SDXL text-to-image graph.
 *
 * Deliberately minimal — checkpoint, two text encodes, an empty latent, one
 * sampler, decode, save. Anything more (refiners, upscalers, LoRAs) would add
 * nodes the user must install, and this has to work on a stock ComfyUI.
 */
export function buildWorkflow(
  settings: ComfySettings,
  request: ComfyRequest,
): Record<string, ComfyNode> {
  const { positive, negative } = decorate(
    request.prompt,
    request.negative,
    settings.checkpoint,
    settings.safeMode,
  )

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: settings.checkpoint },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: positive, clip: ['1', 1] },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip: ['1', 1] },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: request.width, height: request.height, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: request.seed,
        steps: settings.steps,
        cfg: settings.cfg,
        sampler_name: settings.samplerName,
        scheduler: settings.scheduler,
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'animainly', images: ['6', 0] },
    },
  }
}

function trim(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Friendly wrapper: a refused connection says nothing useful on its own. */
async function comfyFetch(base: string, path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${trim(base)}${path}`, init)
  } catch {
    throw new Error(
      `Could not reach ComfyUI at ${base} — start it with --enable-cors-header`,
    )
  }
}

/** Checkpoints ComfyUI can see. Empty means none are installed yet. */
export async function listCheckpoints(baseUrl: string): Promise<string[]> {
  const response = await comfyFetch(baseUrl, '/object_info/CheckpointLoaderSimple')
  if (!response.ok) throw new Error(`ComfyUI answered ${response.status}`)

  const data = (await response.json()) as Record<
    string,
    { input?: { required?: { ckpt_name?: [string[]] } } }
  >
  return data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? []
}

/** Queue a workflow and wait for the finished picture. */
export async function generate(
  settings: ComfySettings,
  request: ComfyRequest,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<Blob> {
  if (!settings.checkpoint) {
    throw new Error('Choose a checkpoint first')
  }

  const clientId = crypto.randomUUID()
  const workflow = buildWorkflow(settings, request)

  const queued = await comfyFetch(settings.baseUrl, '/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal,
  })

  if (!queued.ok) {
    // ComfyUI reports a bad graph in detail; relaying it beats a bare status.
    const detail = await queued.text().catch(() => '')
    try {
      const parsed = JSON.parse(detail) as {
        error?: { message?: string }
        node_errors?: Record<string, { errors?: { message?: string }[] }>
      }
      const nodeError = Object.values(parsed.node_errors ?? {})[0]?.errors?.[0]?.message
      throw new Error(nodeError ?? parsed.error?.message ?? `ComfyUI answered ${queued.status}`)
    } catch (error) {
      if (error instanceof Error && error.message !== 'Unexpected end of JSON input') throw error
      throw new Error(`ComfyUI answered ${queued.status}`)
    }
  }

  const { prompt_id: promptId } = (await queued.json()) as { prompt_id: string }
  onProgress?.('queued')

  // Poll the history rather than opening a websocket: one fewer connection to
  // manage, and generation takes seconds, not milliseconds.
  const started = Date.now()
  const timeoutMs = 10 * 60_000

  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) throw new Error('Cancelled')

    const history = await comfyFetch(settings.baseUrl, `/history/${promptId}`, { signal })
    if (history.ok) {
      const data = (await history.json()) as Record<
        string,
        {
          status?: { completed?: boolean; status_str?: string; messages?: unknown[] }
          outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>
        }
      >
      const entry = data[promptId]

      if (entry?.status?.status_str === 'error') {
        throw new Error('ComfyUI could not run that workflow — check its console')
      }

      const image = Object.values(entry?.outputs ?? {})
        .flatMap((output) => output.images ?? [])
        .at(0)

      if (image) {
        const params = new URLSearchParams({
          filename: image.filename,
          subfolder: image.subfolder,
          type: image.type,
        })
        const file = await comfyFetch(settings.baseUrl, `/view?${params}`, { signal })
        if (!file.ok) throw new Error('Could not download the finished image')
        return file.blob()
      }
    }

    onProgress?.(`rendering… ${Math.round((Date.now() - started) / 1000)}s`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error('ComfyUI took too long — check its console')
}
