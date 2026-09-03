import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app is served from https://snaketrail.github.io/AnimainlyDraw/ ,
// which is a subfolder, not a domain root. Without this base every asset
// URL resolves to the wrong path and the live site 404s.
export default defineConfig({
  plugins: [react()],
  base: '/AnimainlyDraw/',
  build: {
    rollupOptions: {
      // jsPDF lazily references these for features we never use: .html()
      // rendering (html2canvas, dompurify) and canvas work in Node. Bundling
      // them would ship 200 kB of the very screenshot library this rewrite
      // removed. Marking them external leaves the imports unresolved, which is
      // correct — nothing reaches them at runtime.
      external: ['html2canvas', 'dompurify', 'canvas'],
      output: {
        globals: { html2canvas: 'html2canvas', dompurify: 'DOMPurify', canvas: 'canvas' },
      },
    },
  },
})
