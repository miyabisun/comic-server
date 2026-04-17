import fs from 'fs'
import { sql } from 'drizzle-orm'
import { comicPath } from './config.js'
import { db } from '../db/index.js'

const BOOKSHELF_DIRS = ['haystack', 'unread', 'hold', 'like', 'favorite', 'love', 'legend', 'deleted']
const SYSTEM_DIRS = ['backup']

function toISO(value: string): string | null {
  // Pure integer timestamp
  if (/^\d+$/.test(value)) {
    const ts = Number(value)
    const ms = ts > 1e12 ? ts : ts * 1000
    return new Date(ms).toISOString()
  }
  // "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS.000Z"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(' ', 'T') + '.000Z'
  }
  return null
}

function migrateTimestamps(column: 'created_at' | 'deleted_at') {
  const notNull = column === 'deleted_at' ? `${column} IS NOT NULL AND` : ''
  const rows = db.all<{ id: number; val: string }>(
    sql.raw(`SELECT id, ${column} as val FROM comics WHERE ${notNull} ${column} NOT LIKE '____-__-__T%'`),
  )
  if (rows.length === 0) return
  console.log(`Migrating ${rows.length} ${column} values to ISO 8601...`)
  for (const row of rows) {
    const iso = toISO(row.val)
    if (iso) {
      db.run(sql.raw(`UPDATE comics SET ${column} = '${iso}' WHERE id = ${row.id}`))
    } else {
      console.warn(`  skip id=${row.id}: unrecognized format "${row.val}"`)
    }
  }
}

export function init() {
  // Create COMIC_PATH and bookshelf directories
  for (const dir of [...BOOKSHELF_DIRS, ...SYSTEM_DIRS]) {
    fs.mkdirSync(`${comicPath}/${dir}`, { recursive: true })
  }

  // Create tables if not exist
  const [row] = db.all<{ count: number }>(
    sql`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='comics'`,
  )
  if (row.count === 0) {
    console.log('Initializing database...')
    db.run(sql`
      CREATE TABLE comics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        file TEXT NOT NULL,
        bookshelf TEXT NOT NULL,
        genre TEXT,
        brand TEXT,
        original TEXT,
        custom_path TEXT,
        created_at DATETIME NOT NULL,
        deleted_at DATETIME
      )
    `)
    db.run(sql`CREATE UNIQUE INDEX comics_file_key ON comics(file)`)
    db.run(sql`CREATE INDEX comics_bookshelf_created_idx ON comics(bookshelf, created_at DESC)`)
    db.run(sql`CREATE INDEX comics_brand_idx ON comics(brand)`)
    db.run(sql`CREATE INDEX comics_created_at_idx ON comics(created_at)`)
    console.log('Database initialized')
  }

  // Migrate non-ISO timestamps to ISO 8601
  // Patterns: integer unix timestamps, "YYYY-MM-DD HH:MM:SS" (missing T separator)
  migrateTimestamps('created_at')
  migrateTimestamps('deleted_at')
}
