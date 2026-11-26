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
// A longer comic on another shelf, so the unread list measured above stays the same.
const longPages = 36
db.insert(comics).values({ title: 'reader-input', file: 'reader-input', bookshelf: 'hold' }).run()
const longReader = db.select().from(comics).all().find((c) => c.file === 'reader-input')!
fs.mkdirSync(path.join(root, 'hold', longReader.file), { recursive: true })

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

// What the pointer reaches at the middle of the reader canvas, and whether that is the current page's image.
const readerCenter = () => {
  const canvas = document.querySelector('#comic .canvas')!.getBoundingClientRect()
  const x = canvas.left + canvas.width / 2, y = canvas.top + canvas.height / 2
  const pageNumber = Number(document.querySelector('#comic .page')!.textContent!.split('/')[0])
  const current = document.querySelectorAll('#comic .images img')[pageNumber - 1]
  const hit = document.elementFromPoint(x, y)
  const shown = current.getBoundingClientRect()
  return { x, y, pageNumber, hit: hit?.tagName, current: hit === current, shown: shown.left <= x && shown.right >= x }
}

// Right-click the current page the way a user does and report the contextmenu event the browser sends.
async function rightClickPage(page: any) {
  await page.evaluate(() => addEventListener('contextmenu', (e) => { (window as any).lastMenu = e }, { once: true }))
  const { x, y } = await page.evaluate(readerCenter)
  await page.mouse.click(x, y, { button: 'right' })
  return page.evaluate(() => {
    const e = (window as any).lastMenu as Event | undefined
    const pageNumber = Number(document.querySelector('#comic .page')!.textContent!.split('/')[0])
    return { target: (e?.target as Element | undefined)?.tagName, current: e?.target === document.querySelectorAll('#comic .images img')[pageNumber - 1], prevented: e?.defaultPrevented }
  })
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
  const first = await page.evaluate(readerCenter)
  check(first.current, `${label}: the pointer reaches page 1's image ${JSON.stringify(first)}`)
  await page.keyboard.press('ArrowRight')
  check(await page.locator('#comic .page').innerText() === '2 / 3', `${label}: page turn`)
  const shown = await page.locator('#comic .images img').nth(1).evaluate((img: Element) => {
    const r = img.getBoundingClientRect()
    return r.left >= -1 && r.right <= innerWidth + 1
  })
  check(shown, `${label}: second page shown after the turn`)
  const second = await page.evaluate(readerCenter)
  check(second.current, `${label}: the pointer reaches page 2's image after the turn ${JSON.stringify(second)}`)
  const menu = await rightClickPage(page)
  check(menu.current && menu.prevented === false, `${label}: right-click reaches the page image and keeps the browser's menu ${JSON.stringify(menu)}`)
  await page.keyboard.press('ArrowLeft')
  check(await page.locator('#comic .page').innerText() === '1 / 3', `${label}: page turn back after the right-click`)
  for (const [name, control] of [['star', page.locator('#comic .review li').nth(1)], ['page number', page.locator('#comic .page')], ['info button', page.getByRole('button', { name: '情報を表示' })]]) {
    const box = await control.boundingBox()
    check(box && box.y >= 0 && box.y + box.height <= page.viewportSize().height && box.x + box.width <= page.viewportSize().width,
      `${label}: overlay control inside the viewport ${JSON.stringify(box)}`)
    const onTop = await control.evaluate((el: Element) => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
    })
    check(onTop, `${label}: overlay ${name} stays above the page image`)
  }
  await page.getByRole('button', { name: '情報を表示' }).click()
  check(await page.getByRole('dialog').isVisible(), `${label}: info dialog opens`)
  await page.keyboard.press('Escape')
}

// Distinct comic-sized JPEG pages drawn by the browser, so every turn decodes real image data.
async function drawLongComic() {
  const page = await browser.newPage()
  for (let i = 1; i <= longPages; i++) {
    const jpeg = await page.evaluate((i: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1000
      canvas.height = 1414
      const g = canvas.getContext('2d')!
      const pixels = g.createImageData(canvas.width, canvas.height)
      let seed = i
      for (let p = 0; p < pixels.data.length; p += 4) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
        const noise = seed >>> 26
        pixels.data[p] = (i * 37) % 192 + noise
        pixels.data[p + 1] = (i * 91) % 192 + noise
        pixels.data[p + 2] = (i * 53) % 192 + noise
        pixels.data[p + 3] = 255
      }
      g.putImageData(pixels, 0, 0)
      g.fillStyle = 'white'
      g.font = 'bold 400px sans-serif'
      g.fillText(String(i), 150, 800)
      return canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
    }, i)
    fs.writeFileSync(path.join(root, 'hold', longReader.file, `${String(i).padStart(3, '0')}.jpg`), Buffer.from(jpeg, 'base64'))
  }
  await page.close()
}

// Clicking, right-clicking or dragging the page image must leave the keys turning every page promptly.
// Run once: it moves the long comic from hold to like.
async function checkReaderInput(page: any, label: string, origin: string) {
  const pageNumber = async () => Number((await page.locator('#comic .page').innerText()).split('/')[0])
  const turn = async (key: string, expected: number) => {
    const start = performance.now()
    await page.keyboard.press(key)
    await page.locator('#comic .images img').nth(expected - 1).evaluate(async (img: HTMLImageElement) => {
      await img.decode()
      await new Promise(requestAnimationFrame)
    })
    const ms = performance.now() - start
    const at = { ...await page.evaluate(readerCenter), scrollLeft: await page.locator('#comic .canvas').evaluate((el: Element) => el.scrollLeft) }
    check(at.pageNumber === expected && at.shown && at.scrollLeft === 0, `${label}: ${key} shows page ${expected} ${JSON.stringify(at)}`)
    return ms
  }
  const toFirstPage = async () => {
    while (await pageNumber() > 1) await page.keyboard.press('ArrowUp')
  }

  await page.goto(`${origin}/bookshelves/hold`)
  await page.getByRole('link', { name: longReader.title, exact: true }).click()
  await page.locator('#comic .page').waitFor()
  await page.locator('#comic .images img').first().evaluate((img: HTMLImageElement) => img.decode())
  await page.evaluate(() => {
    (window as any).drags = 0
    addEventListener('dragstart', () => { (window as any).drags++ })
  })

  const { x, y } = await page.evaluate(readerCenter)
  await page.mouse.click(x, y)
  const menu = await rightClickPage(page)
  check(menu.current && menu.prevented === false, `${label}: right-click reaches the page image and keeps the browser's menu ${JSON.stringify(menu)}`)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 300, y, { steps: 10 })
  await page.mouse.up()
  check(await page.evaluate(() => (window as any).drags) === 0, `${label}: dragging the page image starts no native drag`)
  for (const [key, expected] of [['ArrowRight', 2], ['ArrowRight', 3], ['ArrowLeft', 2], ['ArrowDown', 12], ['ArrowUp', 2], ['ArrowLeft', 1]] as const) {
    await turn(key, expected)
  }
  if (evidence) await page.screenshot({ path: path.join(evidence, 'reader-input-after-pointer.png') })

  const times: number[] = []
  for (let n = 2; n <= longPages; n++) times.push(await turn('ArrowRight', n))
  for (let n = longPages - 1; n >= 1; n--) times.push(await turn('ArrowLeft', n))
  for (const n of [11, 21, 31, 36]) times.push(await turn('ArrowDown', n))
  for (const n of [26, 16, 6, 1]) times.push(await turn('ArrowUp', n))
  times.sort((a, b) => a - b)
  const [median, p90, max] = [times[times.length >> 1], times[Math.floor(times.length * 0.9)], times.at(-1)!].map(Math.round)
  console.log(`${label} reader input: ${times.length} turns, decoded and painted in median ${median}ms, p90 ${p90}ms, max ${max}ms`)
  check(max < 1000, `${label}: every turn shows its decoded page within 1s (max ${max}ms)`)

  // A pinch-zoomed page must not pan sideways while the arrow keys turn it.
  await toFirstPage()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor: 2, relativeSpeed: 800 })
  const pan = () => page.evaluate(() => [Math.round(visualViewport!.scale * 10) / 10, visualViewport!.offsetLeft])
  const zoomed = await pan()
  await turn('ArrowRight', 2)
  await turn('ArrowLeft', 1)
  const after = await pan()
  check(zoomed[0] > 1 && after[1] === zoomed[1], `${label}: zoomed in ${zoomed[0]}x, ArrowRight/ArrowLeft keep the view in place (${zoomed[1]} → ${after[1]})`)
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
  await cdp.detach()

  await page.locator('#comic .review li').nth(1).click()
  await page.locator('#comic .review li.up').nth(1).waitFor()
  check(db.select().from(comics).all().find((c) => c.id === longReader.id)!.bookshelf === 'like', `${label}: the reader star moves the comic to like`)
  await page.locator('#comic .images img').first().evaluate((img: HTMLImageElement) => img.decode())
  await page.getByRole('button', { name: '情報を表示' }).click()
  check(await page.getByRole('dialog').isVisible(), `${label}: info dialog opens over the page image`)
  await page.keyboard.press('Escape')
  check(await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 1000 }).then(() => true, () => false), `${label}: Escape closes the info dialog`)
  await turn('ArrowRight', 2)

  // Key repeat runs on page timers; a fake clock steps through them instead of waiting.
  // After this the page's requestAnimationFrame is fake too, so turn() is not used below.
  await page.clock.install()
  const hold = async (key: string, interrupt?: () => Promise<unknown>) => {
    const from = await pageNumber()
    await page.keyboard.down(key)
    if (interrupt) await interrupt()
    await page.clock.runFor(800)
    await page.keyboard.up(key)
    const held = await pageNumber()
    await page.clock.runFor(1000)
    return { from, held, settled: await pageNumber() }
  }
  const right = await hold('ArrowRight')
  check(right.held - right.from >= 5 && right.settled === right.held, `${label}: holding ArrowRight repeats and stops on release ${JSON.stringify(right)}`)
  const left = await hold('ArrowLeft')
  check(left.from - left.held >= 5 && left.settled === left.held, `${label}: holding ArrowLeft repeats and stops on release ${JSON.stringify(left)}`)
  for (const [what, interrupt] of [
    ['right-click', () => page.mouse.click(x, y, { button: 'right' })],
    ['window blur', () => page.evaluate(() => dispatchEvent(new FocusEvent('blur')))],
  ] as const) {
    await toFirstPage()
    const held = await hold('ArrowRight', interrupt)
    check(held.held === held.from + 1 && held.settled === held.held, `${label}: ${what} while ArrowRight is held stops the repeat ${JSON.stringify(held)}`)
  }
  const beforePress = await pageNumber()
  await page.keyboard.press('ArrowRight')
  check(await pageNumber() === beforePress + 1, `${label}: one press turns one page after the repeats`)

  await page.keyboard.press('Backspace')
  await page.waitForURL(`${origin}/bookshelves/hold`, { timeout: 2000 }).catch(() => {})
  check(new URL(page.url()).pathname === '/bookshelves/hold', `${label}: Backspace returns to the shelf (${page.url()})`)
}

const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 400, height: 800 }]
const browser = await chromium.launch({ headless: true })
console.log(`Chromium ${browser.version()}`)
const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: createApp('').fetch })
try {
  await drawLongComic()
  for (const colorScheme of ['dark', 'light']) {
    for (const viewport of viewports) {
      const name = `${colorScheme} ${viewport.width}x${viewport.height}`
      const page = await browser.newPage({ viewport, colorScheme })
      const errors: string[] = []
      page.on('pageerror', (e: Error) => errors.push(e.message))
      page.on('console', (m: any) => { if (m.type() === 'error') errors.push(m.text()) })
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
      if (name === 'dark 1440x900') await checkReaderInput(page, name, origin)

      check(errors.length === 0, `${name}: page and console errors ${JSON.stringify(errors)}`)
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
console.log('PASS layout: fixed page, one scrolling list with sticky column headers, reader below the header, keys turn pages after pointer use on the page image')
