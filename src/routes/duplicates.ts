import fs from 'fs'
import path from 'path'
import { Hono } from 'hono'
import { prisma } from '../lib/db.js'
import { comicPath } from '../lib/config.js'
import sanitize from '../lib/sanitize-filename.js'

const app = new Hono()

const duplicatesDir = path.join(comicPath, 'duplicates')

app.get('/api/duplicates', async (c) => {
  if (!fs.existsSync(duplicatesDir)) {
    return c.json([])
  }

  const entries = fs.readdirSync(duplicatesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  const sanitizedMap = new Map(entries.map((name) => [sanitize(name), name]))
  const existingComics = await prisma.comic.findMany({
    where: { file: { in: [...sanitizedMap.keys()] } },
    select: { id: true, bookshelf: true, file: true },
  })
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

app.delete('/api/duplicates/:name', async (c) => {
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
