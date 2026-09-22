// Build the client first, then: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs bun scripts/check-image-viewer.ts
// Only an isolated temporary library is used. Set VIEWER_EVIDENCE to save browser screenshots.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-viewer-'))
process.env.COMIC_PATH = root
process.env.DATABASE_PATH = path.join(root, 'comic.db')
const { init } = await import('../src/lib/init.js')
const { createApp } = await import('../src/app.js')
const { db } = await import('../src/db/index.js')
const { comics } = await import('../src/db/schema.js')
const { __resetIndexHtmlCache } = await import('../src/lib/spa.js')
init()
const books = [
  { title: 'WebPのみ', pages: ['1.webp', '2.WEBP'], assets: ['static.webp', 'animated.webp'] },
  { title: 'GIFのみ', pages: ['1.gif', '2.GIF'], assets: ['static.gif', 'animated.gif'] },
  { title: '混在 日本語 #?%', pages: ['巻 #?%/1.webp', '巻 #?%/2.GIF', '巻 #?%/3.PNG', '巻 #?%/10.JPEG'], assets: ['static.webp', 'animated.gif', 'static.png', 'static.jpg'] },
]
for (const book of books) {
  for (let i = 0; i < book.pages.length; i++) {
    const destination = path.join(root, 'unread', book.title, book.pages[i])
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(new URL(`../src/test/fixtures/images/${book.assets[i]}`, import.meta.url), destination)
  }
  db.insert(comics).values({ title: book.title, file: book.title, bookshelf: 'unread' }).run()
}
const evidence = process.env.VIEWER_EVIDENCE
if (evidence) fs.mkdirSync(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const base of ['', '/comic']) {
    // Production uses one BASE_PATH per process; each isolated server needs a fresh SPA cache.
    __resetIndexHtmlCache()
    const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: createApp(base).fetch })
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 720 }, colorScheme: 'dark' })
      const errors: string[] = []
      page.on('pageerror', (e: Error) => errors.push(e.message))
      for (const [index, book] of books.entries()) {
        await page.goto(`${server.url.origin}${base}/bookshelves/unread`)
        await page.getByRole('link', { name: book.title, exact: true }).click()
        await page.locator('#comic .page').waitFor()
        if (evidence) await page.screenshot({ path: path.join(evidence, `${base ? 'prefix' : 'root'}-${index}.png`) })
        assert.equal(await page.locator('#comic .page').innerText(), `1 / ${book.pages.length}`)
        const images = page.locator('#comic .images img')
        assert.equal(await images.count(), book.pages.length)
        for (let i = 0; i < book.pages.length; i++) {
          if (i) await page.keyboard.press('ArrowRight')
          await images.nth(i).evaluate((img: HTMLImageElement) => img.decode())
          assert.deepEqual(await images.nth(i).evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]), [32, 32])
          assert.equal(await page.locator('#comic .page').innerText(), `${i + 1} / ${book.pages.length}`)
          if (evidence && !i) await page.screenshot({ path: path.join(evidence, `${base ? 'prefix' : 'root'}-${index}.png`) })
          const box = await images.nth(i).boundingBox()
          assert.ok(box && box.x >= 0 && box.x < 1000)
          if (book.assets[i].startsWith('animated')) {
            // Capture the actual compositor output, not drawImage (which may freeze animated images).
            const frames = new Set<string>()
            for (let frame = 0; frame < 8; frame++) {
              frames.add((await page.screenshot({ clip: { x: box.x + box.width / 2 - 2, y: box.y + box.height / 2 - 2, width: 4, height: 4 } })).toString('base64'))
              await page.waitForTimeout(180)
            }
            assert.ok(frames.size >= 2, `${book.title}: animation must advance`)
          }
        }
        await page.keyboard.press('ArrowLeft')
        assert.equal(await page.locator('#comic .page').innerText(), `${book.pages.length - 1} / ${book.pages.length}`)
        await page.getByRole('button', { name: '情報を表示' }).click()
        assert.ok((await page.getByRole('dialog').innerText()).includes(`images (${book.pages.length})`))
        await page.keyboard.press('Escape')
        console.log(`PASS ${base || '/'} ${book.title}: shelf → decode → page turn → animation → metadata`)
      }
      assert.deepEqual(errors, [])
      await page.close()
    } finally {
      await server.stop(true)
    }
  }
} finally {
  await browser.close()
  fs.rmSync(root, { recursive: true, force: true })
}
