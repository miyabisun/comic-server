import { Hono } from 'hono'
import { desc, eq, like, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'

export function expandBrandName(name: string): string[] {
  const parts = name.split(/[()、]/).map((s) => s.trim())
  return [...new Set([name, ...parts].filter(Boolean))]
}

const app = new Hono()

app.get('/api/brands/:name', (c) => {
  const { name } = c.req.param()
  const match = c.req.query('match') ?? 'fuzzy'
  if (!name.trim() || !['fuzzy', 'exact'].includes(match)) {
    return c.json({ error: 'A brand name and fuzzy or exact match mode are required' }, 400)
  }
  const condition = match === 'exact'
    ? eq(comics.brand, name)
    : or(...expandBrandName(name).map((n) => like(comics.brand, `%${n}%`)))

  const results = db.select().from(comics)
    .where(condition)
    .orderBy(desc(comics.created_at))
    .all()

  return c.json(results)
})

export default app
