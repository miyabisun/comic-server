import { beforeAll, beforeEach, expect, it } from 'bun:test'
import { createApp } from '../app.js'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { init } from '../lib/init.js'

const app = createApp('/comic')
const names = ['めぐ', 'めぐ', 'めぐみ', '本名(めぐ、別名)', '本名', '別名', '%_', 'AB', "' OR 1=1 --", '', null]
beforeAll(init)
beforeEach(() => {
  db.delete(comics).run()
  names.forEach((brand, i) => db.insert(comics).values({
    brand, file: `brand-${i}`, title: `title-${i}`, bookshelf: 'unread',
  }).run())
})

async function search(name: string, query = '') {
  return app.request(`/comic/api/brands/${encodeURIComponent(name)}${query}`)
}

it('retains fuzzy expansion and matches the full stored brand literally in exact mode', async () => {
  for (const name of ['めぐ', '本名(めぐ、別名)', '%_', "' OR 1=1 --"]) {
    const response = await search(name, '?match=exact')
    expect(response.status).toBe(200)
    expect((await response.json()).map((comic: { brand: string }) => comic.brand)).toEqual(names.filter((brand) => brand === name))
  }
  for (const query of ['', '?match=fuzzy']) {
    const response = await search('本名(めぐ、別名)', query)
    expect((await response.json()).map((comic: { brand: string }) => comic.brand).sort()).toEqual(names.slice(0, 6).sort())
  }
})

it('rejects empty brand and invalid modes without broadening the query', async () => {
  for (const [name, query] of [[' ', '?match=exact'], [' ', ''], ['めぐ', '?match=invalid']]) {
    const response = await search(name, query)
    expect(response.status).toBe(400)
    expect(await response.json()).toHaveProperty('error')
  }
})
