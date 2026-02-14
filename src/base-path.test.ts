import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'

function createApp(basePath: string) {
  const app = new Hono()
  const sub = new Hono()

  // Serve built frontend static files (assets only; index.html goes through SPA fallback)
  sub.use('/assets/*', serveStatic({
    root: './client/build',
    rewriteRequestPath: (p) => p.startsWith(basePath) ? p.slice(basePath.length) : p,
  }))

  // SPA fallback
  sub.get('*', async (c) => {
    const indexPath = path.join(process.cwd(), 'client/build/index.html')
    let html = fs.readFileSync(indexPath, 'utf-8')
    html = html.replace('<head>', `<head>\n\t\t<base href="${basePath}/">`)
    html = html.replace('window.__BASE_PATH__ = ""', `window.__BASE_PATH__ = ${JSON.stringify(basePath)}`)
    return c.html(html)
  })

  if (basePath) {
    app.route(basePath, sub)
  } else {
    app.route('/', sub)
  }

  return app
}

describe('BASE_PATH injection', () => {
  it('injects BASE_PATH into HTML at /comic/', async () => {
    const app = createApp('/comic')
    const res = await app.request('/comic/')
    const html = await res.text()
    expect(html).toContain('window.__BASE_PATH__ = "/comic"')
    expect(html).toContain('<base href="/comic/">')
  })

  it('injects BASE_PATH into HTML at SPA sub-routes', async () => {
    const app = createApp('/comic')
    const res = await app.request('/comic/bookshelves/unread')
    const html = await res.text()
    expect(html).toContain('window.__BASE_PATH__ = "/comic"')
    expect(html).toContain('<base href="/comic/">')
  })

  it('serves static assets without BASE_PATH injection', async () => {
    const app = createApp('/comic')
    const jsFiles = fs.readdirSync('./client/build/assets').filter(f => f.endsWith('.js'))
    if (jsFiles.length === 0) throw new Error('No JS files in build output')
    const res = await app.request(`/comic/assets/${jsFiles[0]}`)
    expect(res.status).toBe(200)
    const contentType = res.headers.get('content-type') || ''
    expect(contentType).toContain('javascript')
  })

  it('works without BASE_PATH', async () => {
    const app = createApp('')
    const res = await app.request('/')
    const html = await res.text()
    expect(html).toContain('window.__BASE_PATH__ = ""')
    expect(html).toContain('<base href="/">')
  })
})
