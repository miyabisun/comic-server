import path from 'path'
import { serveStatic } from 'hono/bun'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { getMimeType } from 'hono/utils/mime'

import comics from './routes/comics.js'
import bookshelves from './routes/bookshelves.js'
import brands from './routes/brands.js'
import regist from './routes/regist.js'
import duplicates from './routes/duplicates.js'
import upscale from './routes/upscale.js'
import remaster from './routes/remaster.js'
import fs from 'node:fs/promises'
import { comicPath } from './lib/config.js'
import { getIndexHtml as realGetIndexHtml } from './lib/spa.js'

interface CreateAppOptions {
  staticRoot?: string
  getIndexHtml?: (basePath: string) => string | null
}

// Assembles the Hono app for the given (already validated) basePath.
// Defaults are wired so the runtime behavior is identical to the previous inline setup.
export function createApp(
  basePath: string,
  { staticRoot = './client/build', getIndexHtml = realGetIndexHtml }: CreateAppOptions = {},
): Hono {
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
  sub.route('/', regist)
  sub.route('/', duplicates)
  sub.route('/', upscale)
  sub.route('/', remaster)

  // Image serving: /images/:bookshelf/:file/:path
  sub.get('/images/*', async (c) => {
    const reqPath = c.req.path.replace(/^.*\/images\//, '')
    let filePath: string
    try {
      filePath = await fs.realpath(path.resolve(comicPath, decodeURIComponent(reqPath)))
    } catch (error) {
      return c.json({ error: error instanceof URIError ? 'Invalid path' : 'Not found' }, error instanceof URIError ? 400 : 404)
    }
    const resolvedBase = await fs.realpath(comicPath)
    const privateRoot = path.join(resolvedBase, '.remaster')
    if (filePath === privateRoot || filePath.startsWith(privateRoot + path.sep)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    if (!filePath.startsWith(resolvedBase + path.sep)) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const file = Bun.file(filePath)
    if (!await file.exists()) {
      return c.json({ error: 'Not found' }, 404)
    }

    const mimeType = getMimeType(filePath.toLowerCase())
    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
      return c.json({ error: 'Forbidden' }, 403)
    }
    const signature = Buffer.from(await file.slice(0, 8).arrayBuffer())
    const matches = mimeType === 'image/png'
      ? signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : signature.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    if (!matches) return c.json({ error: 'Forbidden' }, 403)

    c.header('Content-Type', mimeType)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Content-Length', file.size.toString())
    c.header('Cache-Control', 'public, max-age=86400')

    return c.body(file.stream())
  })

  // Serve built frontend static files (assets only; index.html goes through SPA fallback)
  sub.use('/assets/*', serveStatic({
    root: staticRoot,
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

  return app
}
