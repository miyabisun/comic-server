import { Hono } from 'hono'
import { prisma } from '../lib/db.js'

export function expandBrandName(name: string): string[] {
  const parts = name.split(/[()、]/).map((s) => s.trim())
  return [...new Set([name, ...parts].filter(Boolean))]
}

const app = new Hono()

app.get('/api/brands/:name', async (c) => {
  const { name } = c.req.param()
  const uniqueNames = expandBrandName(name)

  const results = await prisma.comic.findMany({
    where: { OR: uniqueNames.map((it) => ({ brand: { contains: it } })) },
    orderBy: { created_at: 'desc' },
  })

  return c.json(results)
})

export default app
