import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

function debugLogPlugin(): Plugin {
  const logFile = path.resolve(process.cwd(), 'debug.log')
  return {
    name: 'debug-log-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/debug-log' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const entry = JSON.parse(body)
              const time = entry.time || new Date().toISOString()
              const level = entry.level || 'INFO'
              const category = entry.category || 'APP'
              const msg = entry.message || ''
              const details = entry.data !== undefined ? ' | ' + (typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)) : ''
              const line = `[${time}] [${level}] [${category}] ${msg}${details}\n`
              fs.appendFileSync(logFile, line, 'utf-8')
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true }))
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: String(err) }))
            }
          })
          return
        }
        if (req.url === '/api/debug-log' && req.method === 'GET') {
          try {
            const content = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf-8') : ''
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end(content)
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }
        if (req.url === '/api/debug-log/clear' && req.method === 'POST') {
          try {
            if (fs.existsSync(logFile)) fs.writeFileSync(logFile, '', 'utf-8')
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(err) }))
          }
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), debugLogPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
  // the sprite renderers under tools/render are standalone pages that import three from a CDN; without this
  // the dev server's dependency scan follows them, fails to resolve three and serves a broken page
  optimizeDeps: { entries: ['index.html'] },
  test: {
    // the engine suite runs in node; UI test files opt into jsdom with a `@vitest-environment` docblock
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/ui/test/setup.ts'],
    // the ten seeded full games in fullGame.test.ts sit right at the five second default on a loaded machine
    testTimeout: 30000,
  },
})
