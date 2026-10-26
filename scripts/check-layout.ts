// Build the client first, then: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs bun scripts/check-layout.ts
// Only an isolated temporary library is used. Set LAYOUT_EVIDENCE to save browser screenshots.
// Every failed observation is collected and printed before the run fails, so the output also
// serves as a before/after measurement.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-layout-'))
process.env.COMIC_PATH = root
process.env.DATABASE_PATH = path.join(root, 'comic.db')
const { init } = await import('../src/lib/init.js')
const { createApp } = await import('../src/app.js')
const { db } = await import('../src/db/index.js')
const { comics } = await import('../src/db/schema.js')
init()

const longBrand = 'とても長いサークル名と作者名が続くブランド Long Brand Name'
const longTitle = (i: number) => `長いタイトルの漫画 ${i} 〜 横幅の狭い画面でも列が崩れないことを確かめるための十分に長い副題 Volume ${i}`
// Distinct registration times keep the shelf order identical between runs.
const rows = Array.from({ length: 240 }, (_, i) => ({
  created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  title: longTitle(i),
  file: `comic-${String(i).padStart(3, '0')}`,
  bookshelf: 'unread',
  brand: i % 4 === 0 ? longBrand : `brand-${i % 7}`,
}))
for (const row of rows) {
  db.insert(comics).values(row).run()
  fs.mkdirSync(path.join(root, 'unread', row.file), { recursive: true })
}
const reader = db.select().from(comics).all().find((c) => c.file === 'comic-000')!
for (let i = 1; i <= 3; i++) {
  const destination = path.join(root, 'unread', reader.file, `${i}.png`)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(new URL('../src/test/fixtures/images/static.png', import.meta.url), destination)
}

const evidence = process.env.LAYOUT_EVIDENCE
if (evidence) fs.mkdirSync(evidence, { recursive: true })
const failures: string[] = []
function check(ok: boolean, message: string) {
  if (!ok) failures.push(message)
}

// Page-level overflow, measured the way a scrollbar would appear.
const pageOverflow = () => ({
  width: document.documentElement.scrollWidth - innerWidth,
  height: document.documentElement.scrollHeight - innerHeight,
})

// Every element (other than the page itself) that actually scrolls vertically.
const verticalScrollers = () => [...document.querySelectorAll('body *')]
  .filter((el) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)
  .map((el) => el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(' ')[0]}` : ''))

// Rows fully visible inside the viewport and every clipping ancestor.
const visibleRows = () => [...document.querySelectorAll('table.comics tbody tr')].filter((tr) => {
  const r = tr.getBoundingClientRect()
  let top = 0, bottom = innerHeight
  for (let el = tr.parentElement; el; el = el.parentElement) {
    const style = getComputedStyle(el)
    if (style.overflowY !== 'visible' || style.overflowX !== 'visible') {
      const c = el.getBoundingClientRect()
      top = Math.max(top, c.top)
      bottom = Math.min(bottom, c.bottom)
    }
  }
  return r.height > 0 && r.top >= top - 0.5 && r.bottom <= bottom + 0.5
}).length

// Left edge of each column header and of the same column in a visible body row.
const columnEdges = () => {
  const heads = [...document.querySelectorAll('table.comics thead th')]
  const row = [...document.querySelectorAll('table.comics tbody tr')]
    .find((tr) => tr.getBoundingClientRect().top > heads[0].getBoundingClientRect().bottom)!
  return heads.map((th, i) => [th.getBoundingClientRect().left, row.children[i].getBoundingClientRect().left])
}

function rowScroller(page: any) {
  return page.locator('table.comics tbody').evaluateHandle((tbody: Element) => {
    for (let el: Element | null = tbody; el; el = el.parentElement) {
      if (['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el
    }
    return null
  })
}

// Scroll the rows sideways the way a user does, with a horizontal wheel over the list.
async function scrollSideways(page: any, toEnd: boolean) {
  const head = await page.locator('table.comics thead').boundingBox()
  await page.mouse.move(40, (head.y + head.height + page.viewportSize().height) / 2)
  await page.mouse.wheel(toEnd ? 5000 : -5000, 0)
  await page.evaluate(() => new Promise(requestAnimationFrame))
}

async function checkList(page: any, label: string) {
  check((await page.evaluate(verticalScrollers)).length === 1,
    `${label}: one vertical scroll area, got ${JSON.stringify(await page.evaluate(verticalScrollers))}`)
  const scroller = await rowScroller(page)

  const fixed = () => [document.querySelector('header')!.getBoundingClientRect().top, document.querySelector('table.comics thead th')!.getBoundingClientRect().top]
  const firstRow = () => document.querySelector('table.comics tbody tr')!.getBoundingClientRect().top
  const before = await page.evaluate(fixed)
  const rowBefore = await page.evaluate(firstRow)
  const box = await page.locator('table.comics tbody tr').nth(2).boundingBox()
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.wheel(0, 600)
  await page.waitForFunction((y: number) => document.querySelector('table.comics tbody tr')!.getBoundingClientRect().top < y, rowBefore, { timeout: 2000 }).catch(() => {})
  check(await page.evaluate(firstRow) < rowBefore, `${label}: wheel scrolls the rows`)
  check(JSON.stringify(await page.evaluate(fixed)) === JSON.stringify(before), `${label}: header and column headers stay put`)
  check(await page.evaluate(() => scrollY) === 0, `${label}: the page itself does not scroll`)

  for (const edge of ['start', 'end']) {
    await scrollSideways(page, edge === 'end')
    const misaligned = (await page.evaluate(columnEdges)).filter(([h, d]: number[]) => Math.abs(h - d) > 1)
    check(misaligned.length === 0, `${label}: columns aligned at scroll ${edge} ${JSON.stringify(misaligned)}`)
  }
  await scroller.evaluate((el: Element | null) => { if (el) el.scrollTo(0, 0) })
}

async function checkHeader(page: any, label: string) {
  const lines = await page.locator('header a.brand').evaluate((a: Element) => {
    const range = document.createRange()
    range.selectNodeContents(a)
    return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
  })
  check(lines === 1, `${label}: app name on one line (${lines} lines)`)
  for (const tab of await page.locator('header nav a').all()) {
    await tab.evaluate((a: Element) => a.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
    const [inside, pageX] = await tab.evaluate((a: Element) => {
      const r = a.getBoundingClientRect()
      const nav = a.parentElement!.getBoundingClientRect()
      return [r.left >= nav.left - 0.5 && r.right <= nav.right + 0.5 && r.right <= innerWidth + 0.5, scrollX]
    })
    check(inside && pageX === 0, `${label}: shelf tab ${await tab.innerText()} reachable inside the nav`)
  }
}

async function checkRowActions(page: any, label: string) {
  await scrollSideways(page, true)
  const row = page.locator('table.comics tbody tr').nth(1)
  const visible = async (locator: any) => locator.evaluate((el: Element) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return r.left >= 0 && r.right <= innerWidth && (hit === el || el.contains(hit))
  })
  const star = row.locator('td.review li').nth(1)
  const trash = row.getByRole('button', { name: 'この漫画を削除' })
  const starVisible = await visible(star)
  const trashVisible = await visible(trash)
  if (evidence) await page.screenshot({ path: path.join(evidence, `${label.replace(/\W+/g, '-')}-scrolled.png`) })
  check(starVisible && trashVisible, `${label}: star and delete reachable by scrolling the list (star ${starVisible}, delete ${trashVisible})`)
  if (!starVisible || !trashVisible) return

  const rated = await row.locator('td.title').innerText()
  await star.click()
  await page.getByText(rated, { exact: true }).waitFor({ state: 'detached' })
  const ratedComic = db.select().from(comics).all().find((c) => c.title === rated)!
  check(ratedComic.bookshelf === 'like', `${label}: star moved the comic to like (${ratedComic.bookshelf})`)

  const target = page.locator('table.comics tbody tr').nth(1)
  const deleted = await target.locator('td.title').innerText()
  await target.getByRole('button', { name: 'この漫画を削除' }).click()
  const confirm = target.getByRole('button', { name: 'この漫画を削除（確認）' })
  check(await visible(confirm), `${label}: delete confirmation visible`)
  await confirm.click()
  await page.getByText(deleted, { exact: true }).waitFor({ state: 'detached' })
  const deletedComic = db.select().from(comics).all().find((c) => c.title === deleted)!
  check(deletedComic.deleted_at != null, `${label}: delete confirmed`)
}

async function checkReader(page: any, label: string) {
  const canvas = await page.locator('#comic .canvas').evaluate((el: Element) => {
    const r = el.getBoundingClientRect()
    const header = document.querySelector('header')!.getBoundingClientRect()
    const img = el.querySelector('img')!.getBoundingClientRect()
    return { top: r.top - header.bottom, bottom: innerHeight - r.bottom, imgBottom: innerHeight - img.bottom, imgTop: img.top - r.top }
  })
  check(Math.abs(canvas.top) <= 1 && Math.abs(canvas.bottom) <= 1, `${label}: canvas fills the space below the header ${JSON.stringify(canvas)}`)
  check(canvas.imgBottom >= -1 && canvas.imgTop >= -1, `${label}: page image fits the canvas ${JSON.stringify(canvas)}`)
  await page.keyboard.press('ArrowRight')
  check(await page.locator('#comic .page').innerText() === '2 / 3', `${label}: page turn`)
  const shown = await page.locator('#comic .images img').nth(1).evaluate((img: Element) => {
    const r = img.getBoundingClientRect()
    return r.left >= -1 && r.right <= innerWidth + 1
  })
  check(shown, `${label}: second page shown after the turn`)
  await page.keyboard.press('ArrowLeft')
  for (const control of [page.locator('#comic .review li').nth(1), page.locator('#comic .page'), page.getByRole('button', { name: '情報を表示' })]) {
    const box = await control.boundingBox()
    check(box && box.y >= 0 && box.y + box.height <= page.viewportSize().height && box.x + box.width <= page.viewportSize().width,
      `${label}: overlay control inside the viewport ${JSON.stringify(box)}`)
  }
  await page.getByRole('button', { name: '情報を表示' }).click()
  check(await page.getByRole('dialog').isVisible(), `${label}: info dialog opens`)
  await page.keyboard.press('Escape')
}

const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 400, height: 800 }]
const browser = await chromium.launch({ headless: true })
console.log(`Chromium ${browser.version()}`)
const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: createApp('').fetch })
try {
  for (const colorScheme of ['dark', 'light']) {
    for (const viewport of viewports) {
      const name = `${colorScheme} ${viewport.width}x${viewport.height}`
      const page = await browser.newPage({ viewport, colorScheme })
      const errors: string[] = []
      page.on('pageerror', (e: Error) => errors.push(e.message))
      const origin = server.url.origin
      const shoot = async (screen: string) => {
        if (evidence) await page.screenshot({ path: path.join(evidence, `${screen}-${colorScheme}-${viewport.width}.png`) })
      }

      await page.goto(`${origin}/`)
      await page.locator('#dashboard').waitFor()
      const home = await page.evaluate(pageOverflow)
      check(home.width <= 0, `${name} home: no page horizontal scroll ${JSON.stringify(home)}`)
      await checkHeader(page, `${name} home`)
      await shoot('home')

      await page.goto(`${origin}/bookshelves/unread`)
      await page.locator('table.comics tbody tr').first().waitFor()
      await shoot('bookshelf')
      const shelf = await page.evaluate(pageOverflow)
      console.log(`${name} bookshelf: page overflow ${JSON.stringify(shelf)}, visible rows ${await page.evaluate(visibleRows)}`)
      check(shelf.width <= 0 && shelf.height <= 0, `${name} bookshelf: page fits the viewport ${JSON.stringify(shelf)}`)
      await checkList(page, `${name} bookshelf`)
      if (viewport.width === 400) await checkRowActions(page, `${name} bookshelf`)

      await page.goto(`${origin}/brand/${encodeURIComponent(longBrand)}?match=exact`)
      await page.locator('table.comics tbody tr').first().waitFor()
      await shoot('brand')
      const brand = await page.evaluate(pageOverflow)
      console.log(`${name} brand: page overflow ${JSON.stringify(brand)}, visible rows ${await page.evaluate(visibleRows)}`)
      check(brand.width <= 0 && brand.height <= 0, `${name} brand: page fits the viewport ${JSON.stringify(brand)}`)
      await checkList(page, `${name} brand`)

      await page.goto(`${origin}/comics/${reader.id}`)
      await page.locator('#comic .page').waitFor()
      await page.locator('#comic .images img').first().evaluate((img: HTMLImageElement) => img.decode())
      await shoot('reader')
      const comic = await page.evaluate(pageOverflow)
      console.log(`${name} reader: page overflow ${JSON.stringify(comic)}`)
      check(comic.width <= 0 && comic.height <= 0, `${name} reader: page fits the viewport ${JSON.stringify(comic)}`)
      await checkReader(page, `${name} reader`)

      check(errors.length === 0, `${name}: page errors ${JSON.stringify(errors)}`)
      await page.close()
    }
  }
} finally {
  await server.stop(true)
  await browser.close()
  fs.rmSync(root, { recursive: true, force: true })
}
for (const failure of failures) console.log(`FAIL ${failure}`)
assert.deepEqual(failures, [])
console.log('PASS layout: fixed page, one scrolling list with sticky column headers, reader below the header')
