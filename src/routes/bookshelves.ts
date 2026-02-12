import { Hono } from 'hono'
import { prisma } from '../lib/db.js'

const app = new Hono()

app.get('/api/bookshelves/:name', async (c) => {
  const { name } = c.req.param()

  const result = await prisma.comic.findMany({
    where: { bookshelf: name },
    orderBy: { created_at: 'desc' },
  })

  return c.json(result)
})

export default app
