import { beforeAll, beforeEach, expect, it } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { createApp } from '../app.js'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { comicPath } from '../lib/config.js'
import { init } from '../lib/init.js'

const app = createApp('')
const name = '(genre) [brand] title? (original)'
const file = '(genre) [brand] title？ (original)'

function folder(shelf: string, filename: string, content: string) {
  const dir = path.join(comicPath, shelf, filename)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '001.jpg'), content)
  return dir
}

function post(route: string, body: unknown) {
  return app.request(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeAll(init)
beforeEach(() => {
  db.delete(comics).run()
  for (const shelf of ['haystack', 'unread', 'like', 'duplicates']) {
    fs.rmSync(path.join(comicPath, shelf), { recursive: true, force: true })
  }
})

it('registers metadata and moves images to the sanitized unread directory', async () => {
  const source = folder('haystack', name, 'new image')
  const response = await post('/api/regist', { name })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ status: 'registered', name })
  expect(db.select().from(comics).get()).toMatchObject({
    file, title: 'title?', bookshelf: 'unread', genre: 'genre', brand: 'brand', original: 'original',
  })
  expect(fs.existsSync(source)).toBe(false)
  expect(fs.readFileSync(path.join(comicPath, 'unread', file, '001.jpg'), 'utf8')).toBe('new image')
})

for (const collision of ['database', 'directory']) {
  it(`moves a ${collision} collision to duplicates, replacing the previous duplicate`, async () => {
    const source = folder('haystack', name, 'new duplicate')
    const existingDir = folder(collision === 'database' ? 'like' : 'unread', file, 'existing comic')
    const duplicateDir = folder('duplicates', name, 'old duplicate')
    fs.writeFileSync(path.join(duplicateDir, 'old.jpg'), 'stale')
    if (collision === 'database') {
      db.insert(comics).values({ file, title: 'existing title', bookshelf: 'like' }).run()
    }
    const before = db.select().from(comics).all()

    const response = await post('/api/regist', { name })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'duplicated', name })
    expect(db.select().from(comics).all()).toEqual(before)
    expect(fs.existsSync(source)).toBe(false)
    expect(fs.readFileSync(path.join(existingDir, '001.jpg'), 'utf8')).toBe('existing comic')
    expect(fs.readdirSync(duplicateDir)).toEqual(['001.jpg'])
    expect(fs.readFileSync(path.join(duplicateDir, '001.jpg'), 'utf8')).toBe('new duplicate')
  })
}

it('rejects invalid or missing registration sources without writing records', async () => {
  for (const [body, status, error] of [
    [{}, 400, 'name is required'],
    [{ name: '../escape' }, 400, 'invalid name'],
    [{ name: 'missing' }, 404, 'not found in haystack'],
  ] as const) {
    const response = await post('/api/regist', body)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error })
  }
  expect(db.select().from(comics).all()).toEqual([])
})

it('rolls back registration metadata when the directory move fails', async () => {
  const source = folder('haystack', name, 'original image')
  fs.writeFileSync(path.join(comicPath, 'unread'), 'not a directory')
  const response = await post('/api/regist', { name })
  expect(response.status).toBe(500)
  expect(db.select().from(comics).all()).toEqual([])
  expect(fs.readFileSync(path.join(source, '001.jpg'), 'utf8')).toBe('original image')
})

it('upserts only writable fields, retaining timestamps and omitted metadata', async () => {
  const first = await post('/api/comics', {
    file, title: 'first', genre: 'genre', brand: 'brand', original: 'original', custom_path: '001',
    id: 999, created_at: 'ignored', deleted_at: 'ignored',
  })
  expect(first.status).toBe(201)
  const created = await first.json()
  expect(created).toMatchObject({ file, title: 'first', bookshelf: 'unread', deleted_at: null })
  expect(created.id).not.toBe(999)
  expect(Number.isNaN(Date.parse(created.created_at))).toBe(false)

  const second = await post('/api/comics', {
    file, title: 'second', bookshelf: 'like', genre: null, brand: '',
    created_at: 'ignored', deleted_at: 'ignored',
  })
  expect(second.status).toBe(201)
  expect(await second.json()).toEqual({ ...created, title: 'second', bookshelf: 'like', genre: null, brand: '' })
  const third = await post('/api/comics', { file, title: 'third', bookshelf: '' })
  expect(third.status).toBe(201)
  expect(await third.json()).toMatchObject({ id: created.id, bookshelf: 'unread', original: 'original', custom_path: '001' })
  expect(db.select().from(comics).all()).toHaveLength(1)
})
