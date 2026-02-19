import path from 'path'
import { serveStatic } from 'hono/bun'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { getMimeType } from 'hono/utils/mime'

import comics from './routes/comics.js'
import bookshelves from './routes/bookshelves.js'
import brands from './routes/brands.js'
import register, { registerAll } from './routes/register.js'
import duplicates from './routes/duplicates.js'
import { comicPath } from './lib/config.js'
import { init } from './lib/init.js'
import { getIndexHtml } from './lib/spa.js'

init()

const port = Number(process.env.PORT) || 3000
const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '')
if (basePath && !/^\/[\w\-\/]*$/.test(basePath)) {
  throw new Error(`Invalid BASE_PATH: ${basePath}`)
}

const app = new Hono()

// Middleware
app.use('*', cors())
app.use('*', logger())

// Mount all routes under basePath
const sub = new Hono()

// API routes
sub.route('/', comics)
sub.route('/', bookshelves)
sub.route('/', brands)
sub.route('/', register)
sub.route('/', duplicates)

// Image serving: /images/:bookshelf/:file/:path
sub.get('/images/*', async (c) => {
  const reqPath = c.req.path.replace(/^.*\/images\//, '')
  const filePath = path.resolve(comicPath, decodeURIComponent(reqPath))
  const resolvedBase = path.resolve(comicPath)

  if (!filePath.startsWith(resolvedBase + path.sep)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const file = Bun.file(filePath)
  if (!await file.exists()) {
    return c.json({ error: 'Not found' }, 404)
  }

  const mimeType = getMimeType(filePath) || 'application/octet-stream'

  c.header('Content-Type', mimeType)
  c.header('Content-Length', file.size.toString())
  c.header('Cache-Control', 'public, max-age=86400')

  return c.body(file.stream())
})

// Serve built frontend static files (assets only; index.html goes through SPA fallback)
sub.use('/assets/*', serveStatic({
  root: './client/build',
  rewriteRequestPath: (p) => p.startsWith(basePath) ? p.slice(basePath.length) : p,
}))

// SPA fallback - serve index.html for all non-API, non-image routes
sub.get('*', (c) => {
  const html = getIndexHtml(basePath)
  if (html) return c.html(html)
  return c.json({ error: 'Frontend not built. Run: bun run build:client' }, 404)
})

if (basePath) {
  app.route(basePath, sub)
} else {
  app.route('/', sub)
}

console.log(`Server running on http://localhost:${port}${basePath || '/'}`)

// Auto-register from haystack/ every 60 seconds
setInterval(() => {
  try {
    registerAll()
  } catch (e) {
    console.error('[polling] register failed:', e)
  }
}, 60_000)

export default { port, fetch: app.fetch }
