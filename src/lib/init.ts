import fs from 'fs'
import { sql } from 'drizzle-orm'
import { comicPath } from './config.js'
import { db } from '../db/index.js'

const BOOKSHELF_DIRS = ['haystack', 'unread', 'hold', 'like', 'favorite', 'love', 'legend', 'deleted']

export function init() {
  // Create COMIC_PATH and bookshelf directories
  for (const dir of BOOKSHELF_DIRS) {
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
}
