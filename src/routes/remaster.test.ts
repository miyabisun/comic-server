import { beforeAll, beforeEach, expect, it } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { createApp } from '../app.js'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { comicPath } from '../lib/config.js'
import { init } from '../lib/init.js'

const app = createApp('/comic')
let sourceId: number
let source: string
const destination = path.join(comicPath, 'unread', 'original [リマスター版]')
const request = (suffix = '', method = 'GET') => app.request(`/comic/api/comics/${sourceId}/remaster${suffix}`, { method })
async function finished() {
  for (let n = 0; n < 100; n++) {
    const result = await (await request('/status')).json()
    if (result.status !== 'processing') return result
    await Bun.sleep(10)
  }
  throw new Error('job did not finish')
}

beforeAll(init)
beforeEach(() => {
  db.delete(comics).run()
  for (const name of ['unread', 'like', '.remaster', 'models']) fs.rmSync(path.join(comicPath, name), { recursive: true, force: true })
  source = path.join(comicPath, 'like', 'original')
  fs.mkdirSync(path.join(source, 'nested'), { recursive: true })
  fs.mkdirSync(process.env.REMASTER_MODEL_DIR!, { recursive: true })
  fs.writeFileSync(path.join(source, '001.jpg'), 'original page')
  fs.writeFileSync(path.join(source, 'nested', '002.png'), 'second page')
  fs.writeFileSync(process.env.REMASTER_BIN!, '#!/usr/bin/env bash\ncp "$2" "$3"\n', { mode: 0o755 })
  sourceId = db.insert(comics).values({ file: 'original', title: 'Original title', bookshelf: 'like', brand: 'brand' }).returning().get().id
})

it('publishes a separate comic once, retaining originals and relation after renaming', async () => {
  expect((await request('', 'POST')).status).toBe(202)
  const done = await finished()
  expect(done.status).toBe('completed')
  const output = db.select().from(comics).where(eq(comics.id, done.outputComicId)).get()!
  expect(output).toMatchObject({ file: 'original [リマスター版]', title: 'Original title [リマスター版]', brand: 'brand', bookshelf: 'unread', remaster_source_id: sourceId })
  expect(fs.readFileSync(path.join(source, '001.jpg'), 'utf8')).toBe('original page')
  expect(fs.readFileSync(path.join(destination, 'nested', '002.png.png'), 'utf8')).toBe('second page')
  db.update(comics).set({ file: 'renamed' }).where(eq(comics.id, sourceId)).run()
  expect((await request('', 'POST')).status).toBe(200)
  expect(db.select().from(comics).all()).toHaveLength(2)
  expect((await app.request(`/comic/api/comics/${output.id}/remaster`, { method: 'POST' })).status).toBe(409)
})

it('rejects a name collision without touching the existing output', async () => {
  fs.mkdirSync(destination, { recursive: true })
  fs.writeFileSync(path.join(destination, 'keep'), 'existing')
  expect((await request('', 'POST')).status).toBe(409)
  expect(fs.readFileSync(path.join(destination, 'keep'), 'utf8')).toBe('existing')
  expect(db.select().from(comics).all()).toHaveLength(1)
})

it('keeps failed or cancelled inference private, and allows retry', async () => {
  fs.writeFileSync(process.env.REMASTER_BIN!, '#!/usr/bin/env bash\necho partial > "$3"\nexit 7\n')
  expect((await request('', 'POST')).status).toBe(202)
  expect((await finished()).status).toBe('failed')
  expect(fs.existsSync(destination)).toBe(false)
  fs.writeFileSync(process.env.REMASTER_BIN!, '#!/usr/bin/env bash\necho started > "$1/started"\nexec sleep 30\n')
  expect((await request('', 'POST')).status).toBe(202)
  expect((await request('', 'POST')).status).toBe(409)
  for (let n = 0; n < 100 && !fs.existsSync(path.join(process.env.REMASTER_MODEL_DIR!, 'started')); n++) await Bun.sleep(10)
  expect(fs.existsSync(path.join(process.env.REMASTER_MODEL_DIR!, 'started'))).toBe(true)
  expect((await request('/cancel', 'POST')).status).toBe(202)
  expect((await finished()).status).toBe('failed')
  expect(fs.readFileSync(path.join(source, '001.jpg'), 'utf8')).toBe('original page')
  expect(fs.existsSync(destination)).toBe(false)
  expect(db.select().from(comics).all()).toHaveLength(1)
})

it('rolls back a registration failure and never serves staging images', async () => {
  db.run(sql`CREATE TRIGGER fail_remaster BEFORE INSERT ON comics WHEN NEW.remaster_source_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'registration rejected'); END`)
  try {
    expect((await request('', 'POST')).status).toBe(202)
    expect((await finished()).status).toBe('failed')
    expect(fs.existsSync(destination)).toBe(false)
    expect(db.select().from(comics).all()).toHaveLength(1)
  } finally { db.run(sql`DROP TRIGGER fail_remaster`) }
  fs.mkdirSync(path.join(comicPath, '.remaster'), { recursive: true })
  fs.writeFileSync(path.join(comicPath, '.remaster', 'private.png'), 'private')
  for (const prefix of ['.remaster', '%2eremaster']) {
    expect((await app.request(`/comic/images/${prefix}/private.png`)).status).toBe(403)
  }
})

it('rejects unsafe source paths and records executable launch failures', async () => {
  for (const file of ['../outside', '.remaster']) {
    db.update(comics).set({ file }).where(eq(comics.id, sourceId)).run()
    expect((await request('', 'POST')).status).toBe(400)
  }
  db.update(comics).set({ file: 'original' }).where(eq(comics.id, sourceId)).run()
  fs.chmodSync(process.env.REMASTER_BIN!, 0o644)
  try {
    expect((await request('', 'POST')).status).toBe(202)
    expect((await finished()).status).toBe('failed')
    expect(fs.existsSync(destination)).toBe(false)
    expect(fs.readFileSync(path.join(source, '001.jpg'), 'utf8')).toBe('original page')
  } finally { fs.chmodSync(process.env.REMASTER_BIN!, 0o755) }
})
