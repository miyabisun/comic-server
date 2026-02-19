import { Hono } from 'hono'
import { eq, desc, count } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'

const app = new Hono()

app.get('/api/bookshelves', (c) => {
  const counts = db.select({
    bookshelf: comics.bookshelf,
    count: count(),
  }).from(comics).groupBy(comics.bookshelf).all()

  const result = Object.fromEntries(
    counts.map((r) => [r.bookshelf, r.count])
  )
  return c.json(result)
})

app.get('/api/bookshelves/:name', (c) => {
  const { name } = c.req.param()

  const result = db.select({
    id: comics.id,
    title: comics.title,
    file: comics.file,
    bookshelf: comics.bookshelf,
    brand: comics.brand,
    created_at: comics.created_at,
    deleted_at: comics.deleted_at,
  }).from(comics).where(eq(comics.bookshelf, name)).orderBy(desc(comics.created_at)).all()

  return c.json(result)
})

export default app
