import fs from 'fs'
import { Hono } from 'hono'
import { inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { comicPath } from '../lib/config.js'
import parseComicName from '../lib/parse-comic-name.js'
import sanitize from '../lib/sanitize-filename.js'

const app = new Hono()

const haystackDir = `${comicPath}/haystack`
const duplicatesDir = `${comicPath}/duplicates`
const unreadDir = `${comicPath}/unread`

let running = false

export function registerAll() {
  if (running) return { registered: [], duplicated: [], errors: [] }
  running = true

  try {
    return _registerAll()
  } finally {
    running = false
  }
}

function _registerAll() {
  if (!fs.existsSync(haystackDir)) return { registered: [], duplicated: [], errors: [] }

  const entries = fs.readdirSync(haystackDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  if (entries.length === 0) return { registered: [], duplicated: [], errors: [] }

  // Batch lookup for existing comics
  const sanitizedNames = entries.map((name) => sanitize(name))
  const existingComics = db.select({
    id: comics.id,
    bookshelf: comics.bookshelf,
    file: comics.file,
  }).from(comics).where(inArray(comics.file, sanitizedNames)).all()
  const existingByFile = new Map(existingComics.map((c) => [c.file, c]))

  const registered: string[] = []
  const duplicated: string[] = []
  const errors: string[] = []

  for (const name of entries) {
    try {
      const sanitizedName = sanitize(name)
      const existing = existingByFile.get(sanitizedName)

      if (existing) {
        if (!fs.existsSync(duplicatesDir)) fs.mkdirSync(duplicatesDir)
        const dest = `${duplicatesDir}/${name}`
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
        fs.renameSync(`${haystackDir}/${name}`, dest)
        console.warn(`[register] duplicate moved to duplicates/: ${name} (id: ${existing.id}, bookshelf: ${existing.bookshelf})`)
        duplicated.push(name)
        continue
      }

      const parsed = parseComicName(name)

      db.transaction((tx) => {
        tx.insert(comics).values({
          title: parsed.title || name,
          file: sanitizedName,
          bookshelf: 'unread',
          genre: parsed.genre || null,
          brand: parsed.brand || null,
          original: parsed.original || null,
        }).run()

        if (!fs.existsSync(unreadDir)) fs.mkdirSync(unreadDir)
        fs.renameSync(`${haystackDir}/${name}`, `${unreadDir}/${sanitizedName}`)
      })

      console.log(`[register] registered: ${name} -> unread/${sanitizedName}`)
      registered.push(name)
    } catch (e) {
      console.error(`[register] failed: ${name}`, e)
      errors.push(name)
    }
  }

  if (registered.length || duplicated.length || errors.length) {
    console.log(`[register] summary: ${registered.length} registered, ${duplicated.length} duplicated, ${errors.length} errors`)
  }

  return { registered, duplicated, errors }
}

app.post('/api/register', (c) => {
  const result = registerAll()
  return c.json(result)
})

export default app
