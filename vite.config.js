import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { selaeApi } from './server/plugin.js'

// Offline OCR assets
function tesseractAssets() {
  const copy = () => {
    const out = path.resolve('public/tesseract')
    const files = [
      ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
      ...fs.readdirSync('node_modules/tesseract.js-core')
        .filter((f) => /^tesseract-core.*lstm\.wasm\.js$/.test(f))
        .map((f) => [`node_modules/tesseract.js-core/${f}`, `core/${f}`]),
      ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
    ]
    for (const [from, to] of files) {
      const dest = path.join(out, to)
      if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(from).size) continue
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(from, dest)
    }
  }
  return { name: 'tesseract-assets', config: copy }
}

export default defineConfig({
  plugins: [tesseractAssets(), react(), tailwindcss(), selaeApi()],
  // LAN access
  server: { host: true },
  preview: { host: true },
})
