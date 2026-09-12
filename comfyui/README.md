# ComfyUI setup for Animainly

Panel art is rendered by ComfyUI on your own machine: no API key, no quota, no
per-image cost, and nothing leaves the computer.

`animainly-ponyxl.json` is the graph the app sends **for a single checkpoint**.
Drag it onto the ComfyUI canvas to see or tweak it — but you don't have to. The
app builds the same graph itself, so the file is there for inspection and
manual runs.

For a split model the app builds a different graph: `UNETLoader`, `CLIPLoader`
and `VAELoader` in place of `CheckpointLoaderSimple`, feeding the same sampler
and decode. There is no bundled file for it because the three filenames are
whatever you installed.

---

## 1. Launch ComfyUI so the browser can reach it

This is the one step people miss. A browser refuses to talk to ComfyUI unless
it sends CORS headers, and it doesn't by default.

**Stability Matrix** → select your ComfyUI package → the **⋮** menu →
**Edit Launch Options** → put this in *Extra Launch Arguments*:

```
--enable-cors-header
```

Then restart the package.

Running ComfyUI directly instead:

```
python main.py --enable-cors-header
```

You can check it worked from the Art tab in the app: click **Connect** and the
dot goes green.

> On a 6 GB card, adding `--lowvram` helps if you hit out-of-memory errors.

---

## 2. Download a model

Models come packaged two ways, and the difference decides where the files go
and which loader ComfyUI needs. The app supports both.

### Single checkpoint

One `.safetensors` holding the UNet, text encoder and VAE together — the SD and
SDXL norm. Put it in `ComfyUI/models/checkpoints/`. In Stability Matrix, the
model browser does this for you: search the name and download.

| Model | Size | Why |
|---|---|---|
| **Pony Diffusion V6 XL** | ~6.5 GB | The standard for anime and manga. Excellent character consistency and pose control. |
| **AutismMix SDXL** | ~6.5 GB | A Pony derivative, cleaner line art and less prone to over-rendering. Very good for manga. |
| **Anything XL** | ~6.5 GB | Softer, more classic anime look. Not Pony-based, so no score tags needed. |

Search these on [Civitai](https://civitai.com). Pick the **safetensors** file,
not a pruned `.ckpt`.

**The app detects Pony checkpoints by filename** and automatically prepends the
score tags they were trained on (`score_9, score_8_up, score_7_up,
source_anime`) plus the matching negatives. Pony models are noticeably worse
without them, and forgetting is the most common reason output looks wrong.

### Split model

Three files, three folders. Newer models ship this way, pairing a UNet with a
text encoder that was never part of Stable Diffusion — so they **cannot be
loaded as a checkpoint at all**, and dropping them in `models/checkpoints/`
leaves them invisible to the app.

[**Anima**](https://huggingface.co/circlestone-labs/Anima) is the one worth
having for manga: it draws ink linework and screentone natively, with no score
tags and far less adult drift than Pony.

| File | Goes in |
|---|---|
| `anima-base-v1.0.safetensors` (~5.8 GB) | `ComfyUI/models/diffusion_models/` |
| `qwen_3_06b_base.safetensors` (~1.2 GB) | `ComfyUI/models/text_encoders/` |
| `qwen_image_vae.safetensors` (~254 MB) | `ComfyUI/models/vae/` |

All three are required. A missing text encoder or VAE shows up as an empty
dropdown in the app rather than an error.

**The app applies a known model's published settings for you.** Anima's own
workflow renders at **30 steps, CFG 4, euler/simple** — driving it with the
SDXL defaults of CFG 7 and dpmpp_2m/karras gives visibly worse output, so
selecting it switches those over automatically.

---

## 3. Point the app at it

In Animainly: **Story AI → Art tab**

1. Leave the provider on **ComfyUI on this machine**
2. Address stays `http://127.0.0.1:8188` unless you changed it
3. Click **Connect** — the model lists fill in with whatever ComfyUI can see
4. Set **Model type**:
   - **Single checkpoint** — pick it from the list (a Pony one is chosen
     automatically if present)
   - **Split model** — pick the UNet, text encoder and VAE. Choosing a known
     UNet applies its published sampler settings and says so underneath.

Then select any planned panel and press **Draw this panel**.

---

## Settings, and what they cost you

These are the SDXL-class defaults. Selecting a known split model replaces them
with its own published settings — Anima switches to 30 steps, CFG 4 and
`euler` + `simple` — so the table below is the checkpoint path.

| Setting | Default | Notes |
|---|---|---|
| Steps | 25 | 20–30 is the useful range. More is slower, not obviously better. |
| CFG | 7 | 5–8 for Pony. Higher burns contrast and stiffens poses. Anima wants 4. |
| Sampler | `dpmpp_2m` + `karras` | Reliable and quick. Anima uses `euler` + `simple`. |

Panel size is chosen from the shot type the writer wrote — a close-up gets a
square, an establishing shot gets 16:9 — so you don't set it per panel.

### On a 6 GB card

Both measured on an RTX 3050 6 GB laptop card with `--lowvram`:

| Model | Per panel |
|---|---|
| PonyXL, 768×576 at 20 steps | **~60 s** |
| Anima 2.9B, 1024px at 30 steps | **~110 s** (ranged 72–147 s over 23 panels) |

Anima is slower for two reasons: more steps, and a 5.8 GB UNet plus a separate
1.2 GB text encoder swapping on a 6 GB card. The spread matters as much as the
average — times climb as memory fills, so a long batch is slower per panel at
the end than at the start.

Those are the numbers to plan around. A 40–50 page manga runs to several
hundred panels, so a whole-book render is an overnight job, not a coffee break.
Use **Draw → This page** while you are still finding the look, and **Whole
manga** once you are happy.

If you run out of memory:

- keep `--lowvram` on
- drop steps to 20
- close other GPU-using applications

---

## Keeping panels clean

**Pony checkpoints drift adult on their own.** They are trained on a heavily
adult dataset, and a prompt that never mentions a body still produces nudity
often enough to matter — the score tags alone do nothing to stop it.

This is mostly a Pony problem. Anima and other non-Pony models are far less
prone to it, and the guard below costs them little either way — but nothing in
the app enforces the difference, so it stays on by default for both.

The **Keep panels clothed** checkbox in the Art tab is on by default. It adds
`rating_safe, sfw, fully clothed` near the front of the positive prompt and a
long list of blocked terms to the negative one. Both halves are needed: the
positive tag alone does not hold.

The story writer is also told to keep every panel suitable for general
audiences, so the descriptions it produces do not ask for trouble in the first
place.

Unchecking it removes both, which is the honest behaviour for a local tool —
but with Pony, expect what that implies.

---

## Seeds and character consistency

Each character has a seed, and each drawn panel remembers the seed it used.
It is worth being clear about what that does, because it is easy to expect
more of it than it delivers.

**What a seed does:** fixes the noise the sampler starts from. The same prompt
and the same seed reproduce an image exactly — verified byte-identical on this
setup. That makes it genuinely useful for redrawing a panel after tweaking the
wording, and for re-rolling until you like a composition.

**What a seed does not do:** carry a face between different prompts. Change the
pose or the setting and the same seed gives a different rendering of the same
description — measured, not assumed.

**What actually holds a character together** is the appearance tags in their
Cast entry. Those are prepended to every panel they appear in. Be specific and
be consistent: `long brown braid, freckles, green apron, brown eyes` will hold
far better than `a girl`.

If you need exact facial consistency across a whole book, the real tool is a
character LoRA trained on your character, or IPAdapter reference images — both
are ComfyUI additions beyond this app's stock workflow.

---

## If something fails

**"Could not reach ComfyUI"** — it isn't running, or it was started without
`--enable-cors-header`. That flag is required; the address being correct is not
enough.

**"no models installed yet"** — ComfyUI is running but has nothing to load.
Download a model, then restart ComfyUI so it rescans.

**A model you downloaded isn't in the list** — it is almost always in the wrong
folder for its packaging. A split model's three files belong in
`diffusion_models/`, `text_encoders/` and `vae/`; only a single-file checkpoint
goes in `checkpoints/`. Check the **Model type** toggle matches what you
installed, then restart ComfyUI.

**"ComfyUI could not run that workflow"** — look at the ComfyUI console window;
it prints the real reason. Out-of-memory is the usual one on 6 GB.
