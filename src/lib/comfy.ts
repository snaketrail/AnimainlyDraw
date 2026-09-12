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

/**
 * How a model's weights are packaged.
 *
 * `checkpoint` - one .safetensors holding UNet, CLIP and VAE together. This is
 * the SD/SDXL norm, and `CheckpointLoaderSimple` unpacks all three.
 *
 * `split` - UNet, text encoder and VAE as three separate files, each with its
 * own loader. Newer models ship this way (Anima pairs its UNet with a Qwen
 * text encoder and a Qwen VAE), and they cannot be loaded as a checkpoint at
 * all: `CheckpointLoaderSimple` has no CLIP or VAE output to give.
 */
export type ComfyModelKind = 'checkpoint' | 'split'

export interface ComfySettings {
  baseUrl: string
  /** Single-file model, when `kind` is 'checkpoint'. */
  checkpoint: string
  /** Which packaging the selected model uses. */
  kind: ComfyModelKind
  /** The three files a split model needs. Ignored for a checkpoint. */
  unet: string
  clip: string
  vae: string
  /**
   * Text-encoder family for a split model's CLIPLoader.
   *
   * ComfyUI cannot infer this from the file, and a wrong value produces
   * nonsense rather than an error. Anima's Qwen encoder loads under
   * 'stable_diffusion', which is what its own reference workflow specifies.
   */
  clipType: string
  /** Sampling steps. 25 suits SDXL; Anima's reference workflow uses 30. */
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
  kind: 'checkpoint',
  unet: '',
  clip: '',
  vae: '',
  clipType: 'stable_diffusion',
  steps: 25,
  cfg: 7,
  samplerName: 'dpmpp_2m',
  scheduler: 'karras',
  safeMode: true,
}

/**
 * Sampler settings a split model expects, keyed by a pattern in its UNet name.
 *
 * These are not preferences. Anima's published workflow renders at 30 steps,
 * CFG 4, euler/simple; driving it with the SDXL defaults of CFG 7 and
 * dpmpp_2m/karras gives visibly worse output. Applying them on selection means
 * the user does not have to know that.
 */
export const SPLIT_MODEL_PRESETS: {
  match: RegExp
  label: string
  steps: number
  cfg: number
  samplerName: string
  scheduler: string
  clipType: string
}[] = [
  {
    match: /anima/i,
    label: 'Anima',
    steps: 30,
    cfg: 4,
    samplerName: 'euler',
    scheduler: 'simple',
    clipType: 'stable_diffusion',
  },
]

/** The preset for a UNet file, if one is known. */
export function presetForUnet(unet: string) {
  return SPLIT_MODEL_PRESETS.find((preset) => preset.match.test(unet))
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
  /** The active model's filename, whichever kind it is. */
  modelName: string,
  safeMode = true,
): { positive: string; negative: string } {
  const pony = isPonyCheckpoint(modelName)

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

/** The model file that identifies the active model, whichever kind it is. */
export function activeModelName(settings: ComfySettings): string {
  return settings.kind === 'split' ? settings.unet : settings.checkpoint
}

/**
 * A minimal text-to-image graph.
 *
 * Two shapes, because two packagings exist. Both end the same way — two text
 * encodes, an empty latent, one sampler, decode, save — and differ only in how
 * model, CLIP and VAE are loaded. Anything more (refiners, upscalers, LoRAs)
 * would add nodes the user must install, and this has to work on a stock
 * ComfyUI.
 *
 * Node ids are shared between both shapes so the rest of the client does not
 * care which was built.
 */
export function buildWorkflow(
  settings: ComfySettings,
  request: ComfyRequest,
): Record<string, ComfyNode> {
  const { positive, negative } = decorate(
    request.prompt,
    request.negative,
    activeModelName(settings),
    settings.safeMode,
  )

  // A split model loads its three parts separately; CLIP and VAE come from
  // their own nodes rather than from outputs 1 and 2 of a checkpoint.
  const loaders: Record<string, ComfyNode> =
    settings.kind === 'split'
      ? {
          '1': {
            class_type: 'UNETLoader',
            inputs: { unet_name: settings.unet, weight_dtype: 'default' },
          },
          '1c': {
            class_type: 'CLIPLoader',
            inputs: {
              clip_name: settings.clip,
              type: settings.clipType,
              device: 'default',
            },
          },
          '1v': {
            class_type: 'VAELoader',
            inputs: { vae_name: settings.vae },
          },
        }
      : {
          '1': {
            class_type: 'CheckpointLoaderSimple',
            inputs: { ckpt_name: settings.checkpoint },
          },
        }

  const clip: [string, number] = settings.kind === 'split' ? ['1c', 0] : ['1', 1]
  const vae: [string, number] = settings.kind === 'split' ? ['1v', 0] : ['1', 2]

  return {
    ...loaders,
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: positive, clip },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip },
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
      inputs: { samples: ['5', 0], vae },
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

/** Read one loader node's file list from /object_info. */
async function listForNode(
  baseUrl: string,
  node: string,
  field: string,
): Promise<string[]> {
  const response = await comfyFetch(baseUrl, `/object_info/${node}`)
  if (!response.ok) return []

  const data = (await response.json()) as Record<
    string,
    { input?: { required?: Record<string, unknown> } }
  >
  const entry = data[node]?.input?.required?.[field]
  // The shape is [[...options], {...opts}] - the first element is the list.
  const options = Array.isArray(entry) ? entry[0] : undefined
  return Array.isArray(options)
    ? options.filter((option): option is string => typeof option === 'string')
    : []
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

export interface ComfyModels {
  checkpoints: string[]
  unets: string[]
  clips: string[]
  vaes: string[]
  /** Text-encoder families this ComfyUI build offers. */
  clipTypes: string[]
}

/**
 * Everything ComfyUI can load, in one round trip.
 *
 * Asked together because a user with a split model has no checkpoint to show,
 * and a UI that only listed checkpoints would report "none installed" while
 * the model sat there perfectly loadable.
 */
export async function listModels(baseUrl: string): Promise<ComfyModels> {
  const [checkpoints, unets, clips, vaes, clipTypes] = await Promise.all([
    listForNode(baseUrl, 'CheckpointLoaderSimple', 'ckpt_name'),
    listForNode(baseUrl, 'UNETLoader', 'unet_name'),
    listForNode(baseUrl, 'CLIPLoader', 'clip_name'),
    listForNode(baseUrl, 'VAELoader', 'vae_name'),
    listForNode(baseUrl, 'CLIPLoader', 'type'),
  ])
  return { checkpoints, unets, clips, vaes, clipTypes }
}

/** Queue a workflow and wait for the finished picture. */
export async function generate(
  settings: ComfySettings,
  request: ComfyRequest,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<Blob> {
  if (settings.kind === 'split') {
    if (!settings.unet || !settings.clip || !settings.vae) {
      throw new Error('A split model needs a UNet, a text encoder and a VAE')
    }
  } else if (!settings.checkpoint) {
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
