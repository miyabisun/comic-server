import fs from 'fs'
import path from 'path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { getMimeType } from 'hono/utils/mime'
import { stream } from 'hono/streaming'

import comics from './routes/comics.js'
import bookshelves from './routes/bookshelves.js'
import brands from './routes/brands.js'
import register from './routes/register.js'
import { comicPath } from './lib/config.js'

const port = Number(process.env.PORT) || 3000
const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '')

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

// Image serving: /images/:bookshelf/:file/:path
sub.get('/images/*', async (c) => {
  const reqPath = c.req.path.replace(/^.*\/images\//, '')
  const filePath = path.resolve(comicPath, decodeURIComponent(reqPath))
  const resolvedBase = path.resolve(comicPath)

  if (!filePath.startsWith(resolvedBase + path.sep)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  if (!fs.existsSync(filePath)) {
    return c.json({ error: 'Not found' }, 404)
  }

  const stat = fs.statSync(filePath)
  const mimeType = getMimeType(filePath) || 'application/octet-stream'

  c.header('Content-Type', mimeType)
  c.header('Content-Length', stat.size.toString())
  c.header('Cache-Control', 'public, max-age=86400')

  return stream(c, async (s) => {
    const readable = fs.createReadStream(filePath)
    for await (const chunk of readable) {
      await s.write(chunk)
    }
  })
})

// Serve built frontend static files
sub.use('/*', serveStatic({ root: './client/build' }))

// SPA fallback - serve index.html for all non-API, non-image routes
sub.get('*', async (c) => {
  const indexPath = path.join(process.cwd(), 'client/build/index.html')
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, 'utf-8')
    return c.html(html)
  }
  return c.json({ error: 'Frontend not built. Run: npm run build:client' }, 404)
})

if (basePath) {
  app.route(basePath, sub)
} else {
  app.route('/', sub)
}

console.log(`Server running on http://localhost:${port}${basePath || '/'}`)
serve({ fetch: app.fetch, port })
