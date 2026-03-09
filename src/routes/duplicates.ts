import fs from 'fs'
import path from 'path'
import { Hono } from 'hono'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { comicPath } from '../lib/config.js'
import sanitize from '../lib/sanitize-filename.js'
import parseComicName from '../lib/parse-comic-name.js'

const app = new Hono()

const duplicatesDir = path.join(comicPath, 'duplicates')

// Find the existing comic that matches a sanitized name.
// First try exact match, then try matching sanitized DB values.
function findExisting(sanitizedName: string, allComics: { id: number; bookshelf: string; file: string }[]) {
  // Exact match (DB file === sanitized duplicate name)
  const exact = allComics.find((c) => c.file === sanitizedName)
  if (exact) return exact

  // Fuzzy match (sanitize(DB file) === sanitized duplicate name)
  return allComics.find((c) => sanitize(c.file) === sanitizedName)
}

app.get('/api/duplicates', (c) => {
  if (!fs.existsSync(duplicatesDir)) {
    return c.json([])
  }

  const entries = fs.readdirSync(duplicatesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  if (entries.length === 0) return c.json([])

  // Collect all sanitized names for lookup
  const sanitizedNames = entries.map((name) => sanitize(name))

  // Also collect raw DB files that might need sanitize() to match
  // We need broader lookup, so fetch by both sanitized names and do a fuzzy pass
  const exactMatches = db.select({
    id: comics.id,
    bookshelf: comics.bookshelf,
    file: comics.file,
  }).from(comics).where(inArray(comics.file, sanitizedNames)).all()

  // For entries that didn't get an exact match, we need to check if
  // sanitize(db.file) matches. This requires scanning all comics with
  // problematic characters, but since fix-filenames should have cleaned
  // most of these, we do a targeted search.
  const unmatchedNames = sanitizedNames.filter(
    (sn) => !exactMatches.some((c) => c.file === sn),
  )

  let allCandidates = [...exactMatches]
  if (unmatchedNames.length > 0) {
    // Fetch comics whose file contains backslash or other raw chars
    const extras = db.select({
      id: comics.id,
      bookshelf: comics.bookshelf,
      file: comics.file,
    }).from(comics).all().filter(
      (c) => unmatchedNames.includes(sanitize(c.file)),
    )
    allCandidates = [...allCandidates, ...extras]
  }

  const results = entries.map((name) => {
    const sanitizedName = sanitize(name)
    const existing = findExisting(sanitizedName, allCandidates)
    return {
      name,
      sanitizedName,
      existingId: existing?.id ?? null,
      existingFile: existing?.file ?? null,
      existingBookshelf: existing?.bookshelf ?? null,
    }
  })

  return c.json(results)
})

// Compare a duplicate with its existing DB record
app.get('/api/duplicates/:name/compare', (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const targetDir = path.resolve(duplicatesDir, name)

  if (!targetDir.startsWith(path.resolve(duplicatesDir) + path.sep)) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  if (!fs.existsSync(targetDir)) {
    return c.json({ error: 'Not found' }, 404)
  }

  const sanitizedName = sanitize(name)
  const dupParsed = parseComicName(name)

  // Find existing
  const allComics = db.select({
    id: comics.id,
    bookshelf: comics.bookshelf,
    file: comics.file,
    title: comics.title,
    genre: comics.genre,
    brand: comics.brand,
    original: comics.original,
  }).from(comics).all()

  const existing = findExisting(sanitizedName, allComics)

  return c.json({
    duplicate: {
      name,
      sanitizedName,
      parsed: dupParsed,
    },
    existing: existing ? {
      id: existing.id,
      file: existing.file,
      bookshelf: existing.bookshelf,
      title: (allComics.find((c) => c.id === existing.id) as any)?.title,
      genre: (allComics.find((c) => c.id === existing.id) as any)?.genre,
      brand: (allComics.find((c) => c.id === existing.id) as any)?.brand,
      original: (allComics.find((c) => c.id === existing.id) as any)?.original,
    } : null,
  })
})

// Replace existing with the duplicate
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

  // Find the existing comic
  const allComics = db.select({
    id: comics.id,
    bookshelf: comics.bookshelf,
    file: comics.file,
  }).from(comics).all()

  const existing = findExisting(sanitizedName, allComics)
  if (!existing) {
    return c.json({ error: 'Existing comic not found in DB' }, 404)
  }

  const oldDir = path.join(comicPath, existing.bookshelf, existing.file)
  const newDir = path.join(comicPath, existing.bookshelf, sanitizedName)
  const parsed = parseComicName(name)

  try {
    db.transaction((tx) => {
      // Update DB record with sanitized name and re-parsed metadata
      tx.update(comics).set({
        file: sanitizedName,
        title: parsed.title || sanitizedName,
        genre: parsed.genre || null,
        brand: parsed.brand || null,
        original: parsed.original || null,
      }).where(eq(comics.id, existing.id)).run()

      // Remove old directory if it exists
      if (fs.existsSync(oldDir)) {
        fs.rmSync(oldDir, { recursive: true, force: true })
      }

      // Move duplicate to the existing bookshelf
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
