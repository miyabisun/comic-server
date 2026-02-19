import fs from 'fs'
import readdir from 'fs-readdir-recursive'
import { naturalSort } from 'smart-sort'
import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { comicPath } from '../lib/config.js'
import sanitizeFilename from '../lib/sanitize-filename.js'
import parseComicName from '../lib/parse-comic-name.js'

type Comic = InferSelectModel<typeof comics>

function toCustomPath(comic: Comic): RegExp | null {
  try {
    if (comic.custom_path) {
      const exp = new RegExp(comic.custom_path)
      exp.test('')
      return exp
    }
  } catch (error) {
    console.error(error)
  }
  return null
}

const app = new Hono()

// List all comics
app.get('/api/comics', (c) => {
  const result = db.select().from(comics).orderBy(desc(comics.created_at)).all()
  return c.json(result)
})

// Parse comic name to extract metadata
app.get('/api/parse', (c) => {
  const name = c.req.query('name')
  if (!name) {
    return c.json({ error: 'Missing name parameter' }, 400)
  }
  return c.json(parseComicName(name))
})

// Check existence by file (sanitizes input to match DB values)
app.get('/api/comics/exist', (c) => {
  const file = c.req.query('file')

  if (!file) {
    return c.json({ exists: false })
  }

  try {
    const comic = db.select().from(comics).where(eq(comics.file, sanitizeFilename(file))).get()
    return c.json({ exists: comic != null, comic })
  } catch (e) {
    console.error('[ERROR] Failed to check existence:', e)
    return c.json({ error: `Failed to check existence: ${(e as Error).message}` }, 500)
  }
})

// Get comic by id with images
app.get('/api/comics/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) {
    return c.json({ error: 'Invalid id' }, 400)
  }
  const comic = db.select().from(comics).where(eq(comics.id, id)).get()
  if (!comic) {
    return c.json({ error: 'Not found' }, 404)
  }

  const customPath = toCustomPath(comic)
  const comicFile = comic.file.replaceAll('/', '\\/')
  const comicDir = `${comicPath}/${comic.bookshelf}/${comicFile}`

  if (!fs.existsSync(comicDir)) {
    return c.json({ error: 'Not found' }, 404)
  }

  const allImages = readdir(comicDir)
  const images = naturalSort(
    allImages.filter((name: string) => /\.(png|jpe?g)$/.test(name)),
    true,
    'ASC',
  )

  const filteredImages = images.filter((name: string) => {
    if (!customPath) return true
    return customPath.test(name)
  })

  const result = { ...comic, images: filteredImages, 'origin-images': images }

  return c.json(result)
})

// Update comic
app.put('/api/comics/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) {
    return c.json({ error: 'Invalid id' }, 400)
  }
  const comic = db.select().from(comics).where(eq(comics.id, id)).get()
  if (!comic) {
    return c.json({ error: 'Not found' }, 404)
  }

  // image file check
  // Try original filename first, then sanitized version (for backward compatibility)
  const sanitizedFile = sanitizeFilename(comic.file)
  let foundPath: string | null = null
  if (fs.existsSync(`${comicPath}/${comic.bookshelf}/${comic.file}`)) {
    foundPath = `${comicPath}/${comic.bookshelf}/${comic.file}`
  } else if (fs.existsSync(`${comicPath}/${comic.bookshelf}/${sanitizedFile}`)) {
    foundPath = `${comicPath}/${comic.bookshelf}/${sanitizedFile}`
  } else if (fs.existsSync(`${comicPath}/haystack/${comic.file}`)) {
    foundPath = `${comicPath}/haystack/${comic.file}`
  } else if (fs.existsSync(`${comicPath}/haystack/${sanitizedFile}`)) {
    foundPath = `${comicPath}/haystack/${sanitizedFile}`
  }

  if (!foundPath) {
    return c.json({ error: 'Not found' }, 404)
  }

  // duplicate name check
  const body = await c.req.json()
  const comicFile = (body.file || comic.file).replaceAll('/', '\\/')
  if (comicFile !== comic.file) {
    const row = db.select().from(comics).where(eq(comics.file, comicFile)).get()
    // Check if the found row is not the current comic being updated
    if (row && row.id !== id) {
      return c.json({
        message: 'new file name is exists',
        data: { ...body, id },
      }, 400)
    }
  }

  try {
    db.transaction((tx) => {
      tx.update(comics).set({
        title: body.title || comic.title,
        file: comicFile,
        bookshelf: body.bookshelf || comic.bookshelf,
        genre: body.genre,
        brand: body.brand,
        original: body.original,
        custom_path: body.custom_path,
      }).where(eq(comics.id, id)).run()

      // path rename
      const after = `${comicPath}/${body.bookshelf || comic.bookshelf}/${comicFile}`
      if (foundPath !== after) {
        fs.renameSync(foundPath!, after)
      }
    })

    return c.json({
      message: 'update successful',
      data: { ...body, id },
    })
  } catch (e) {
    console.error(e)
    return c.json({
      message: (e as Error).message,
      data: { ...body, id },
    }, 400)
  }
})

// Delete comic (soft delete - move to 'deleted' bookshelf)
app.delete('/api/comics/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) {
    return c.json({ error: 'Invalid id' }, 400)
  }
  const comic = db.select().from(comics).where(eq(comics.id, id)).get()
  if (!comic) {
    return c.json({ error: 'Not found' }, 404)
  }

  // image file check
  const comicFile = comic.file.replaceAll('/', '\\/')
  if (!fs.existsSync(`${comicPath}/${comic.bookshelf}/${comicFile}`)) {
    return c.json({ error: 'Not found' }, 404)
  }

  try {
    db.transaction((tx) => {
      tx.update(comics).set({
        bookshelf: 'deleted',
        deleted_at: new Date().toISOString(),
      }).where(eq(comics.id, id)).run()

      const deletedDir = `${comicPath}/deleted`
      if (!fs.existsSync(deletedDir)) {
        fs.mkdirSync(deletedDir)
      }

      fs.renameSync(`${comicPath}/${comic.bookshelf}/${comicFile}`, `${deletedDir}/${comicFile}`)
    })

    return c.json({
      message: 'delete successful',
      data: id,
    })
  } catch (e) {
    console.error(e)
    return c.json({
      message: (e as Error).message,
      data: id,
    }, 400)
  }
})

// Create comic
app.post('/api/comics', async (c) => {
  const body = await c.req.json()

  if (!body.file || !body.title) {
    return c.json({ error: 'Missing required fields: file, title' }, 400)
  }

  try {
    const result = db.insert(comics).values({
      title: body.title,
      file: body.file,
      bookshelf: body.bookshelf || 'unread',
      genre: body.genre,
      brand: body.brand,
      original: body.original,
      custom_path: body.custom_path,
    }).onConflictDoUpdate({
      target: comics.file,
      set: {
        title: body.title,
        bookshelf: body.bookshelf || 'unread',
        genre: body.genre,
        brand: body.brand,
        original: body.original,
        custom_path: body.custom_path,
      },
    }).returning().get()

    return c.json(result, 201)
  } catch (e) {
    console.error(e)
    return c.json({ error: `Failed to upsert comic: ${(e as Error).message}` }, 500)
  }
})

export default app
