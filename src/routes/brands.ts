import { Hono } from 'hono'
import { prisma } from '../lib/db.js'

const app = new Hono()

app.get('/api/brands/:name', async (c) => {
  const { name } = c.req.param()

  // Split by delimiters and trim, then concat original name
  const parts = name.split(/[()、]/).map((s: string) => s.trim())
  const allNames = [name, ...parts].filter(Boolean)
  const uniqueNames = [...new Set(allNames)]

  const results = await prisma.comic.findMany({
    where: { OR: uniqueNames.map((it) => ({ brand: { contains: it } })) },
    orderBy: { created_at: 'desc' },
  })

  return c.json(results)
})

export default app
