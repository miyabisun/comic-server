import { Hono } from 'hono'
import { prisma } from '../lib/db.js'

const app = new Hono()

app.get('/api/bookshelves', async (c) => {
  const counts = await prisma.comic.groupBy({
    by: ['bookshelf'],
    _count: { id: true },
  })
  const result = Object.fromEntries(
    counts.map((r) => [r.bookshelf, r._count.id])
  )
  return c.json(result)
})

app.get('/api/bookshelves/:name', async (c) => {
  const { name } = c.req.param()

  const result = await prisma.$queryRaw`
    SELECT id, title, file, bookshelf, brand, created_at, deleted_at
    FROM comics
    WHERE bookshelf = ${name}
    ORDER BY created_at DESC
  `

  return c.json(result)
})

export default app
