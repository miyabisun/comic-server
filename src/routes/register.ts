import fs from 'fs'
import { Hono } from 'hono'
import { prisma } from '../lib/db.js'
import { comicPath } from '../lib/config.js'
import parseComicName from '../lib/parse-comic-name.js'
import sanitize from '../lib/sanitize-filename.js'

const app = new Hono()

const haystackDir = `${comicPath}/haystack`
const duplicatesDir = `${comicPath}/duplicates`
const unreadDir = `${comicPath}/unread`

let running = false

export async function registerAll() {
  if (running) return { registered: [], duplicated: [], errors: [] }
  running = true

  try {
    return await _registerAll()
  } finally {
    running = false
  }
}

async function _registerAll() {
  if (!fs.existsSync(haystackDir)) return { registered: [], duplicated: [], errors: [] }

  const entries = fs.readdirSync(haystackDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  if (entries.length === 0) return { registered: [], duplicated: [], errors: [] }

  // Batch lookup for existing comics
  const sanitizedNames = entries.map((name) => sanitize(name))
  const existingComics = await prisma.comic.findMany({
    where: { file: { in: sanitizedNames } },
    select: { id: true, bookshelf: true, file: true },
  })
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

      await prisma.$transaction(async (tx) => {
        await tx.comic.create({
          data: {
            title: parsed.title || name,
            file: sanitizedName,
            bookshelf: 'unread',
            genre: parsed.genre || null,
            brand: parsed.brand || null,
            original: parsed.original || null,
          },
        })

        if (!fs.existsSync(unreadDir)) fs.mkdirSync(unreadDir)
        fs.renameSync(`${haystackDir}/${name}`, `${unreadDir}/${sanitizedName}`)
      })

      registered.push(name)
    } catch (e) {
      console.error(`[register] failed: ${name}`, e)
      errors.push(name)
    }
  }

  return { registered, duplicated, errors }
}

app.post('/api/register', async (c) => {
  const result = await registerAll()
  return c.json(result)
})

export default app
