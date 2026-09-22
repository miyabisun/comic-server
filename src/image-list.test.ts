import { afterEach, expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { createApp } from './app.js'
import { db } from './db/index.js'
import { comics } from './db/schema.js'
import { comicPath } from './lib/config.js'
import { init } from './lib/init.js'

init()
const rows: number[] = []
const dirs: string[] = []
afterEach(() => {
  for (const id of rows.splice(0)) db.delete(comics).where(eq(comics.id, id)).run()
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

test('WebP-only, GIF-only and mixed books expose naturally ordered pages and matching counts', async () => {
  for (const names of [
    ['10.WEBP', '2.webp', '1.webp'],
    ['10.GIF', '2.gif', '1.gif'],
    ['別巻/10.webp', '別巻/2.GIF', '別巻/1.PNG', '表紙/2.JPEG', '表紙/1.jpg'],
  ]) {
    const dir = fs.mkdtempSync(path.join(comicPath, 'unread', '閲覧 #?-'))
    const file = path.basename(dir)
    const duplicateDir = path.join(comicPath, 'duplicates', file)
    dirs.push(dir, duplicateDir)
    for (const root of [dir, duplicateDir]) {
      for (const name of [...names, 'notes.txt', 'art.svg', 'fake.webp.txt']) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
        fs.writeFileSync(path.join(root, name), 'listing fixture')
      }
    }
    const row = db.insert(comics).values({ title: file, file, bookshelf: 'unread', custom_path: '^(別巻/)?[12]\\.' }).returning().get()
    rows.push(row.id)
    const ordered = [names[2], names[1], names[0], ...names.slice(3).reverse()]
    for (const base of ['', '/comic']) {
      const app = createApp(base)
      const response = await app.request(`${base}/api/comics/${row.id}`)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body['origin-images']).toEqual(ordered)
      expect(body.images).toEqual([names[2], names[1]])
      const compare = await (await app.request(`${base}/api/duplicates/${encodeURIComponent(file)}/compare`)).json()
      expect(compare.existing.imageCount).toBe(names.length)
      expect(compare.duplicate.imageCount).toBe(names.length)
    }
    db.update(comics).set({ custom_path: null }).where(eq(comics.id, row.id)).run()
    const body = await (await createApp('').request(`/api/comics/${row.id}`)).json()
    expect(body.images).toEqual(ordered)
  }
})
