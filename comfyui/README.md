# ComfyUI setup for Animainly

Panel art is rendered by ComfyUI on your own machine: no API key, no quota, no
per-image cost, and nothing leaves the computer.

`animainly-ponyxl.json` is the workflow the app sends. Drag it onto the ComfyUI
canvas to see or tweak it — but you don't have to. The app builds the same graph
itself, so the file is there for inspection and manual runs.

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

## 2. Download a checkpoint

Put the file in `ComfyUI/models/checkpoints/`. In Stability Matrix, the model
browser does this for you — search the name and download.

| Model | Size | Why |
|---|---|---|
| **Pony Diffusion V6 XL** | ~6.5 GB | The standard for anime and manga. Excellent character consistency and pose control. Start here. |
| **AutismMix SDXL** | ~6.5 GB | A Pony derivative, cleaner line art and less prone to over-rendering. Very good for manga. |
| **Anything XL** | ~6.5 GB | Softer, more classic anime look. Not Pony-based, so no score tags needed. |

Search these on [Civitai](https://civitai.com). Pick the **safetensors** file,
not a pruned `.ckpt`.

**The app detects Pony checkpoints by filename** and automatically prepends the
score tags they were trained on (`score_9, score_8_up, score_7_up,
source_anime`) plus the matching negatives. Pony models are noticeably worse
without them, and forgetting is the most common reason output looks wrong.

---

## 3. Point the app at it

In Animainly: **Story AI → Art tab**

1. Leave the provider on **ComfyUI on this machine**
2. Address stays `http://127.0.0.1:8188` unless you changed it
3. Click **Connect** — the checkpoint list fills in
4. Pick your checkpoint (a Pony one is chosen automatically if present)

Then select any planned panel and press **Draw this panel**.

---

## Settings, and what they cost you

| Setting | Default | Notes |
|---|---|---|
| Steps | 25 | 20–30 is the useful range. More is slower, not obviously better. |
| CFG | 7 | 5–8 for Pony. Higher burns contrast and stiffens poses. |
| Sampler | `dpmpp_2m` + `karras` | Reliable and quick. |

Panel size is chosen from the shot type the writer wrote — a close-up gets a
square, an establishing shot gets 16:9 — so you don't set it per panel.

### On a 6 GB card

Measured on an RTX 3050 6 GB with `--lowvram` and PonyXL: **about 60 seconds
for a 768×576 panel at 20 steps**. Larger panels and more steps scale roughly
in proportion.

That is the number to plan around. A 40–50 page manga runs to several hundred
panels, so a whole-book render is an overnight job, not a coffee break. Use
**Draw → This page** while you are still finding the look, and **Whole manga**
once you are happy.

If you run out of memory:

- keep `--lowvram` on
- drop steps to 20
- close other GPU-using applications

---

## Keeping panels clean

**Pony checkpoints drift adult on their own.** They are trained on a heavily
adult dataset, and a prompt that never mentions a body still produces nudity
often enough to matter — the score tags alone do nothing to stop it.

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

**"no checkpoints found"** — ComfyUI is running but
`ComfyUI/models/checkpoints/` is empty. Download a model, then restart ComfyUI
so it rescans.

**"ComfyUI could not run that workflow"** — look at the ComfyUI console window;
it prints the real reason. Out-of-memory is the usual one on 6 GB.
