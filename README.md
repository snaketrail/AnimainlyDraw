# Animainly

A web app for assembling multi-page manga out of AI-generated art you bring in yourself.

**Live:** https://snaketrail.github.io/AnimainlyDraw/

You generate the art wherever you like, drag the images in, and lay them out across pages.
Nothing is uploaded anywhere — the app runs entirely in your browser, and your art and
projects are stored locally.

## What works now

- **Asset library** — drag in PNG/JPG/WebP with free-form tags, search and filtering. New art is auto-tagged by shape, and generator filenames are shortened for display. Saved in IndexedDB, so it survives a reload.
- **Panel layouts** — 22 presets based on real manga composition, plus full manual editing: draw, drag, resize, split (side-by-side or stacked) and delete panels. Geometry is editable by number.
- **Page canvas** — place art into panels where it clips to the frame, drag, scale, rotate, flip, and reorder layers. Pages are real B4 manga trim with correct bleed and safe area.
- **Speech bubbles** — speech, shout, whisper, caption and trail dots. They sit above the panels, so one can cross a border or sit in a gutter, and are constrained to the printable page.
- **Inspector** — every value is both a slider and a number box, so you can drag roughly or type exactly.
- **Multiple pages** — add, delete and switch between pages.
- **Undo/redo** — across every edit, including moves. `Ctrl+Z` / `Ctrl+Shift+Z`.
- **Export** — one page or all pages as full-resolution PNG, or the whole book as a PDF at true 182 × 257 mm.
- **Story AI** — one prompt and a rough page count plans the whole manga: the writer decides how many chapters it needs, invents the cast, picks an art style, then breaks every chapter into per-page beats and panels. Runs on a local model (LM Studio, Ollama — nothing leaves your machine) or Google Gemini with your own key. A style bible and cast sheet are prepended to every image prompt so the book keeps one look.
- **Panel art** — generate a picture for any panel from its written prompt, with the style bible and cast folded in automatically. Renders through a local [ComfyUI](https://github.com/comfyanonymous/ComfyUI): no key, no quota, and nothing leaves the machine. Pollinations is available as a hosted fallback. Draw one panel, a whole page, or the entire book — batch runs are stoppable and resume where they left off. See [comfyui/](comfyui/) for setup.
- **Project files** — save the project *and* its art as one `.animainly` file, and open it on any machine.

## Planned

Screentones and halftone fills, speed lines, panel border styles, and a reader
mode. For character consistency across a long book, reference images
(IPAdapter) rather than written description alone.

## Running it

```bash
npm install
npm run dev      # dev server
npm run build    # production build into dist/
npm run preview  # serve the built site
```

## How it's built

Vite, React, TypeScript, [Konva](https://konvajs.org/) for the canvas, Zustand for state,
jsPDF for PDF output, and a small hand-written IndexedDB wrapper for storage.

The one rule the codebase is organised around: **an object's position lives in the store and
nowhere else.** Konva draws from it, the inspector edits it, undo snapshots it, export renders
it. Nothing reads a position back off the DOM, so nothing can disagree about where things are.

Deploys automatically to GitHub Pages on every push to `main` via GitHub Actions. Vite is
configured with `base: '/AnimainlyDraw/'` because the site is served from a subfolder.

## History

This is version two. The first version was a static page that positioned images with
interact.js and exported by screenshotting a div with html2canvas — it's still in the git
history before the rebuild commit.

## License

MIT — see [LICENSE](LICENSE).
