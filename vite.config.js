import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { connectStore } from './server/storage/store.js'
import { createApi } from './server/api.js'

// Offline OCR assets
function tesseractAssets() {
  const copy = () => {
    const out = path.resolve('client/public/tesseract')
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

// API inside the dev and preview servers
function selaeApi() {
  let handle
  const mount = async (server) => {
    handle = handle || createApi(await connectStore())
    server.middlewares.use((req, res, next) => { handle(req, res, next).catch(next) })
  }
  return { name: 'selae-api', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true },
  plugins: [tesseractAssets(), react(), tailwindcss(), selaeApi()],
  // LAN access
  server: { host: true },
  preview: { host: true },
})
