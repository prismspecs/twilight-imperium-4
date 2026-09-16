#!/usr/bin/env node
/**
 * Renders a whole sprite set headlessly: every unit x every colour, through render-b-batch.html in
 * headless Chrome (SwiftShader WebGL). Writes the sliced PNGs and the manifest.json for the set.
 *
 * Usage: node tools/render/render-all.mjs --style c --out ../../public/assets/sprites-studio --label "C studio isometric (orthographic, elev 35, az 30)"
 * Requires google-chrome on PATH and the render page's vendor/ three.js modules (see render-b-batch.html).
 */
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).slice().map(a => a.replace(/^--/, '').split('=')))
const style = args.style ?? 'c'
const outDir = args.out ?? join(here, '..', '..', 'public', 'assets', 'sprites-studio')
const label = args.label ?? 'C studio isometric (orthographic, elev 35, az 30)'
const port = Number(args.port ?? 8123)
const UNITS = ['dreadnought', 'flagship', 'carrier', 'cruiser', 'destroyer', 'fighter', 'warsun', 'infantry', 'spacedock', 'pds']
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'black', 'orange', 'pink', 'grey']

// serve the render directory over http (file:// blocks ES module imports)
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: here, stdio: 'ignore' })
await new Promise(res => setTimeout(res, 800))

try {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  const manifest = { style: label, colors: COLORS, units: {} }

  for (const unit of UNITS) {
    const dom = await render(`http://localhost:${String(port)}/render-b-batch.html?unit=${unit}&style=${style}`)
    const imgs = [...dom.matchAll(/src="data:image\/png;base64,([^"]+)"/g)].map(m => m[1])
    if (imgs.length !== COLORS.length) throw new Error(`${unit}: expected ${String(COLORS.length)} renders, got ${String(imgs.length)}`)
    const title = JSON.parse(dom.match(/<title>([^<]*)<\/title>/)?.[1] ?? '{}')
    const unitsEntry = { modelLength: title.modelLength, modelWidth: title.modelWidth, modelHeight: title.modelHeight, boundingRadius: title.R, pxPerModelUnit: title.pxPerModelUnit }
    manifest.units[unit] = unitsEntry
    for (let i = 0; i < COLORS.length; i++) {
      const png = Buffer.from(imgs[i], 'base64')
      const { width, height } = pngSize(png)
      if (!manifest.units[unit].spriteW || width > manifest.units[unit].spriteW) {
        manifest.units[unit].spriteW = width
        manifest.units[unit].spriteH = height
      }
      await writeFile(join(outDir, `${COLORS[i]}_${unit}.png`), png)
    }
    console.log(`rendered ${unit} (pxPerModelUnit ${String(Math.round(title.pxPerModelUnit * 100) / 100)})`)
  }

  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
  console.log(`wrote ${outDir}`)
} finally {
  server.kill()
}

function render(url) {
  return new Promise((res, rej) => {
    execFile('google-chrome', [
      '--headless=new', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
      '--virtual-time-budget=30000', '--dump-dom', url,
    ], { maxBuffer: 64 * 1024 * 1024, timeout: 120000 }, (err, stdout) => {
      if (err) rej(err)
      else res(stdout)
    })
  })
}

/** PNG width/height from the IHDR header (bytes 16..24). */
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}
