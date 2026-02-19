import { Hono } from 'hono'
import { desc, like, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'

export function expandBrandName(name: string): string[] {
  const parts = name.split(/[()、]/).map((s) => s.trim())
  return [...new Set([name, ...parts].filter(Boolean))]
}

const app = new Hono()

app.get('/api/brands/:name', (c) => {
  const { name } = c.req.param()
  const uniqueNames = expandBrandName(name)

  const results = db.select().from(comics)
    .where(or(...uniqueNames.map((n) => like(comics.brand, `%${n}%`))))
    .orderBy(desc(comics.created_at))
    .all()

  return c.json(results)
})

export default app
