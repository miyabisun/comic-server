import fs from 'fs'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { comicPath } from '../lib/config.js'
import parseComicName from '../lib/parse-comic-name.js'
import sanitize from '../lib/sanitize-filename.js'

const app = new Hono()

const haystackDir = `${comicPath}/haystack`
const duplicatesDir = `${comicPath}/duplicates`
const unreadDir = `${comicPath}/unread`

app.post('/api/regist', async (c) => {
  let body: { name?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }

  const { name } = body
  if (!name || typeof name !== 'string') {
    return c.json({ error: 'name is required' }, 400)
  }

  if (name.includes('/') || name.includes('\\') || name === '..' || name === '.') {
    return c.json({ error: 'invalid name' }, 400)
  }

  const src = `${haystackDir}/${name}`
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    return c.json({ error: 'not found in haystack' }, 404)
  }

  const sanitizedName = sanitize(name)

  // Check DB for existing comic with same file name
  const existing = db.select({
    id: comics.id,
    bookshelf: comics.bookshelf,
    file: comics.file,
  }).from(comics).where(
    eq(comics.file, sanitizedName)
  ).get()

  if (existing) {
    if (!fs.existsSync(duplicatesDir)) fs.mkdirSync(duplicatesDir)
    const dest = `${duplicatesDir}/${name}`
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    fs.renameSync(src, dest)
    console.warn(`[regist] duplicate moved to duplicates/: ${name} (id: ${existing.id}, bookshelf: ${existing.bookshelf})`)
    return c.json({ status: 'duplicated', name })
  }

  // Check if destination already exists in unread/
  const dest = `${unreadDir}/${sanitizedName}`
  if (fs.existsSync(dest)) {
    if (!fs.existsSync(duplicatesDir)) fs.mkdirSync(duplicatesDir)
    const dupDest = `${duplicatesDir}/${name}`
    if (fs.existsSync(dupDest)) fs.rmSync(dupDest, { recursive: true, force: true })
    fs.renameSync(src, dupDest)
    console.warn(`[regist] destination exists in unread/, moved to duplicates/: ${name}`)
    return c.json({ status: 'duplicated', name })
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
    fs.renameSync(src, dest)
  })

  console.log(`[regist] registered: ${name} -> unread/${sanitizedName}`)
  return c.json({ status: 'registered', name })
})

export default app
