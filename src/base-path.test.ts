import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createApp } from './app.js'
import { getIndexHtml, __resetIndexHtmlCache } from './lib/spa.js'

// Minimal index.html fixture. It MUST contain both replace targets (`<head>` and
// `window.__BASE_PATH__ = ""`), otherwise the real injection in spa.ts would silently no-op.
const INDEX_HTML = `<!doctype html>
<html lang="ja">
<head>
	<title>comic-server</title>
	<script>window.__BASE_PATH__ = ""</script>
</head>
<body>
	<div id="app"></div>
</body>
</html>`

const JS_FILE = 'app-fixture.js'

const tempDirs: string[] = []

// Creates an isolated fixture: <dir>/build/index.html and <dir>/build/assets/<JS_FILE>.
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-fixture-'))
  tempDirs.push(dir)
  const buildDir = path.join(dir, 'build')
  const assetsDir = path.join(buildDir, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  const indexPath = path.join(buildDir, 'index.html')
  fs.writeFileSync(indexPath, INDEX_HTML)
  fs.writeFileSync(path.join(assetsDir, JS_FILE), 'console.log("fixture")')
  return { buildDir, indexPath }
}

// Wires the real createApp to a fixture: real getIndexHtml (bound to indexPath, defaulting
// to the fixture's) and the fixture build dir as the serveStatic root.
function appWith(
  basePath: string,
  fx: { buildDir: string; indexPath: string },
  indexPath: string = fx.indexPath,
) {
  return createApp(basePath, {
    staticRoot: fx.buildDir,
    getIndexHtml: (bp) => getIndexHtml(bp, indexPath),
  })
}

beforeEach(() => {
  // spa.ts keeps a module-level cache keyed only by mtime; reset it so each test is isolated.
  __resetIndexHtmlCache()
})

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
})

describe('BASE_PATH injection (real createApp + real getIndexHtml)', () => {
  it('injects BASE_PATH into HTML at /comic/', async () => {
    const app = appWith('/comic', makeFixture())
    const res = await app.request('/comic/')
    const html = await res.text()
    expect(html).toContain('window.__BASE_PATH__ = "/comic"')
    expect(html).toContain('<base href="/comic/">')
  })

  it('injects BASE_PATH into HTML at SPA sub-routes', async () => {
    const app = appWith('/comic', makeFixture())
    const res = await app.request('/comic/bookshelves/unread')
    const html = await res.text()
    expect(html).toContain('window.__BASE_PATH__ = "/comic"')
    expect(html).toContain('<base href="/comic/">')
  })

  it('serves static assets without BASE_PATH injection', async () => {
    const app = appWith('/comic', makeFixture())
    const res = await app.request(`/comic/assets/${JS_FILE}`)
    expect(res.status).toBe(200)
    const contentType = res.headers.get('content-type') || ''
    expect(contentType).toContain('javascript')
    const body = await res.text()
    // Asset content must be served verbatim (no BASE_PATH rewriting).
    expect(body).toBe('console.log("fixture")')
  })

  it('works without BASE_PATH', async () => {
    const app = appWith('', makeFixture())
    const res = await app.request('/')
    const html = await res.text()
    expect(html).toContain('window.__BASE_PATH__ = ""')
    expect(html).toContain('<base href="/">')
  })
})

describe('SPA fallback behavior', () => {
  it('returns 404 JSON when index.html is missing', async () => {
    const fx = makeFixture()
    const missing = path.join(path.dirname(fx.indexPath), 'does-not-exist.html')
    const app = appWith('', fx, missing)
    const res = await app.request('/')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'Frontend not built. Run: bun run build:client' })
  })

  it('reloads index.html in dev mode when mtime changes', async () => {
    const fx = makeFixture()
    const t1 = new Date('2020-01-01T00:00:00Z')
    fs.utimesSync(fx.indexPath, t1, t1)

    const first = getIndexHtml('', fx.indexPath)
    expect(first).toContain('<title>comic-server</title>')

    // Update content and advance mtime -> should be re-read.
    fs.writeFileSync(fx.indexPath, INDEX_HTML.replace('<title>comic-server</title>', '<title>UPDATED</title>'))
    const t2 = new Date('2020-01-02T00:00:00Z')
    fs.utimesSync(fx.indexPath, t2, t2)

    const second = getIndexHtml('', fx.indexPath)
    expect(second).toContain('<title>UPDATED</title>')
    expect(second).not.toContain('<title>comic-server</title>')
  })

  it('serves cached HTML when mtime is unchanged', async () => {
    const fx = makeFixture()
    const t = new Date('2020-01-01T00:00:00Z')
    fs.utimesSync(fx.indexPath, t, t)

    const first = getIndexHtml('', fx.indexPath)
    expect(first).toContain('<title>comic-server</title>')

    // Rewrite content but keep the same mtime -> cache must win, new content ignored.
    fs.writeFileSync(fx.indexPath, INDEX_HTML.replace('<title>comic-server</title>', '<title>SHOULD-NOT-APPEAR</title>'))
    fs.utimesSync(fx.indexPath, t, t)

    const second = getIndexHtml('', fx.indexPath)
    expect(second).toBe(first)
    expect(second).not.toContain('SHOULD-NOT-APPEAR')
  })
})
