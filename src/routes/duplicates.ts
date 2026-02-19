import fs from 'fs'
import path from 'path'
import { Hono } from 'hono'
import { inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { comicPath } from '../lib/config.js'
import sanitize from '../lib/sanitize-filename.js'

const app = new Hono()

const duplicatesDir = path.join(comicPath, 'duplicates')

app.get('/api/duplicates', (c) => {
  if (!fs.existsSync(duplicatesDir)) {
    return c.json([])
  }

  const entries = fs.readdirSync(duplicatesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  if (entries.length === 0) return c.json([])

  const sanitizedMap = new Map(entries.map((name) => [sanitize(name), name]))
  const existingComics = db.select({
    id: comics.id,
    bookshelf: comics.bookshelf,
    file: comics.file,
  }).from(comics).where(inArray(comics.file, [...sanitizedMap.keys()])).all()
  const comicByFile = new Map(existingComics.map((c) => [c.file, c]))

  const results = entries.map((name) => {
    const existing = comicByFile.get(sanitize(name))
    return {
      name,
      existingId: existing?.id ?? null,
      existingBookshelf: existing?.bookshelf ?? null,
    }
  })

  return c.json(results)
})

app.delete('/api/duplicates/:name', (c) => {
  const { name } = c.req.param()

  const targetDir = path.resolve(duplicatesDir, decodeURIComponent(name))
  if (!targetDir.startsWith(path.resolve(duplicatesDir) + path.sep)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  if (!fs.existsSync(targetDir)) {
    return c.json({ error: 'Not found' }, 404)
  }

  fs.rmSync(targetDir, { recursive: true, force: true })
  return c.json({ message: 'Deleted' })
})

export default app
