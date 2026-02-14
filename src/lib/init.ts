import fs from 'fs'
import { comicPath } from './config.js'
import { prisma } from './db.js'

const BOOKSHELF_DIRS = ['haystack', 'unread', 'hold', 'like', 'favorite', 'love', 'legend', 'deleted']

export async function init() {
  // Create COMIC_PATH and bookshelf directories
  for (const dir of BOOKSHELF_DIRS) {
    fs.mkdirSync(`${comicPath}/${dir}`, { recursive: true })
  }

  // Create tables if not exist
  // NOTE: This table definition must stay in sync with prisma/schema.prisma
  const [{ count }] = await prisma.$queryRawUnsafe<[{ count: number }]>(
    `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='comics'`,
  )
  if (count === 0) {
    console.log('Initializing database...')
    await prisma.$executeRawUnsafe(`
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
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX comics_file_key ON comics(file)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX comics_bookshelf_created_idx ON comics(bookshelf, created_at DESC)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX comics_brand_idx ON comics(brand)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX comics_created_at_idx ON comics(created_at)`)
    console.log('Database initialized')
  }
}
