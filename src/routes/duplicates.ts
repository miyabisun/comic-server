import fs from 'fs'
import path from 'path'
import readdir from 'fs-readdir-recursive'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { comicPath } from '../lib/config.js'
import sanitize from '../lib/sanitize-filename.js'
import parseComicName from '../lib/parse-comic-name.js'

const app = new Hono()

const duplicatesDir = path.join(comicPath, 'duplicates')

// Strip all characters that sanitize would replace, for loose matching.
// This handles cases where DB has corrupted data (e.g. \! instead of !)
function normalize(name: string): string {
  return name.replace(/[\\#?<>:"|*%＃？＜＞：\u201D｜＊＼％]/g, '')
}

function countImages(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  return readdir(dir).filter((f: string) => /\.(png|jpe?g)$/i.test(f)).length
}

// Find the existing comic that matches a duplicate name.
function findExisting(dupName: string) {
  const sanitizedName = sanitize(dupName)
  const normalizedName = normalize(sanitizedName)

  // 1. Exact match on sanitized name
  const exact = db.select().from(comics).where(eq(comics.file, sanitizedName)).get()
  if (exact) return exact

  // 2. Loose match: normalize both sides and compare
  const all = db.select().from(comics).all()
  return all.find((c) => normalize(c.file) === normalizedName) ?? null
}

app.get('/api/duplicates', (c) => {
  if (!fs.existsSync(duplicatesDir)) {
    return c.json([])
  }

  const entries = fs.readdirSync(duplicatesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  if (entries.length === 0) return c.json([])

  const results = entries.map((name) => {
    const existing = findExisting(name)
    return {
      name,
      existingId: existing?.id ?? null,
      existingBookshelf: existing?.bookshelf ?? null,
    }
  })

  return c.json(results)
})

// Compare a duplicate with its existing DB record
app.get('/api/duplicates/:name/compare', (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const dupDir = path.resolve(duplicatesDir, name)

  if (!dupDir.startsWith(path.resolve(duplicatesDir) + path.sep)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  if (!fs.existsSync(dupDir)) {
    return c.json({ error: 'Not found' }, 404)
  }

  const existing = findExisting(name)
  const dupImageCount = countImages(dupDir)

  let existingData = null
  if (existing) {
    const existingDir = path.join(comicPath, existing.bookshelf, existing.file)
    existingData = {
      id: existing.id,
      file: existing.file,
      bookshelf: existing.bookshelf,
      imageCount: countImages(existingDir),
      dirExists: fs.existsSync(existingDir),
    }
  }

  return c.json({
    duplicate: {
      name,
      imageCount: dupImageCount,
    },
    existing: existingData,
  })
})

// Replace existing with the duplicate (keep duplicate)
app.post('/api/duplicates/:name/replace', (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const srcDir = path.resolve(duplicatesDir, name)

  if (!srcDir.startsWith(path.resolve(duplicatesDir) + path.sep)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  if (!fs.existsSync(srcDir)) {
    return c.json({ error: 'Duplicate not found' }, 404)
  }

  const sanitizedName = sanitize(name)
  const existing = findExisting(name)
  if (!existing) {
    return c.json({ error: 'Existing comic not found in DB' }, 404)
  }

  const newDir = path.join(comicPath, existing.bookshelf, sanitizedName)
  const parsed = parseComicName(name)

  // Collect all possible old directory paths (DB file as-is and sanitized)
  const oldDirCandidates = [
    path.join(comicPath, existing.bookshelf, existing.file),
    path.join(comicPath, existing.bookshelf, sanitizedName),
  ]

  try {
    db.transaction((tx) => {
      tx.update(comics).set({
        file: sanitizedName,
        title: parsed.title || sanitizedName,
        genre: parsed.genre || null,
        brand: parsed.brand || null,
        original: parsed.original || null,
      }).where(eq(comics.id, existing.id)).run()

      // Remove old directories (both raw and sanitized paths)
      for (const dir of oldDirCandidates) {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true })
        }
      }

      fs.renameSync(srcDir, newDir)
    })

    return c.json({
      message: 'Replaced',
      data: { id: existing.id, file: sanitizedName, bookshelf: existing.bookshelf },
    })
  } catch (e) {
    console.error('[duplicates] replace failed:', e)
    return c.json({ error: (e as Error).message }, 500)
  }
})

// Keep existing, delete the duplicate
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
