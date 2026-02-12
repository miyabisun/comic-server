import fs from 'fs'
import { Hono } from 'hono'
import { prisma } from '../lib/db.js'
import { comicPath } from '../lib/config.js'
import parseComicName from '../lib/parse-comic-name.js'
import sanitize from '../lib/sanitize-filename.js'

const app = new Hono()

// Register a comic from haystack directory
app.post('/api/register', async (c) => {
  const body = await c.req.json()
  const name = body.name as string | undefined

  if (!name) {
    return c.json({ error: 'Missing name' }, 400)
  }

  if (name.includes('/') || name.includes('..')) {
    return c.json({ error: 'Invalid name' }, 400)
  }

  const haystackDir = `${comicPath}/haystack/${name}`

  if (!fs.existsSync(haystackDir)) {
    return c.json({ error: `Directory not found: haystack/${name}` }, 404)
  }

  // Parse metadata from raw name (before sanitization)
  const parsed = parseComicName(name)

  // Sanitize for filesystem/web-safe directory name
  const sanitizedName = sanitize(name)

  const existing = await prisma.comic.findFirst({ where: { file: sanitizedName } })

  if (existing) {
    fs.rmSync(haystackDir, { recursive: true, force: true })
    console.warn(`[register] duplicate skipped: ${name} (id: ${existing.id}, bookshelf: ${existing.bookshelf})`)
    return c.json({ message: 'already registered, removed from haystack', data: { name: sanitizedName }, deduplicated: true }, 200)
  }

  try {
    // NOTE: fs operations inside transaction won't rollback if DB fails after rename
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

      const unreadDir = `${comicPath}/unread`
      if (!fs.existsSync(unreadDir)) {
        fs.mkdirSync(unreadDir)
      }

      fs.renameSync(haystackDir, `${unreadDir}/${sanitizedName}`)
    })

    return c.json({ message: 'register successful', data: { name: sanitizedName } }, 201)
  } catch (e) {
    console.error(e)
    return c.json({ message: (e as Error).message, data: { name } }, 400)
  }
})

export default app
