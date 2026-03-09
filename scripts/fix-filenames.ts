#!/usr/bin/env bun
// Fix DB file names that don't match filesystem due to sanitize logic gaps.
// Also renames filesystem directories when the sanitized name differs.
//
// Usage: COMIC_PATH=/mnt/comic-ssd/comic bun run scripts/fix-filenames.ts [--dry-run]

import fs from 'fs'
import path from 'path'
import { Database } from 'bun:sqlite'
import sanitize from '../src/lib/sanitize-filename.js'

const dryRun = process.argv.includes('--dry-run')
const comicPath = process.env.COMIC_PATH || './comics'
const dbPath = process.env.DATABASE_PATH || path.join(comicPath, 'comic.db')

if (dryRun) console.log('=== DRY RUN (no changes will be made) ===\n')

const sqlite = new Database(dbPath)
const rows = sqlite.query('SELECT id, file, bookshelf FROM comics').all() as {
  id: number
  file: string
  bookshelf: string
}[]

let fixCount = 0
let errorCount = 0

for (const row of rows) {
  const sanitized = sanitize(row.file)
  if (sanitized === row.file) continue

  const oldDir = path.join(comicPath, row.bookshelf, row.file)
  const newDir = path.join(comicPath, row.bookshelf, sanitized)

  console.log(`[id=${row.id}] ${row.bookshelf}/`)
  console.log(`  DB:        ${row.file}`)
  console.log(`  sanitized: ${sanitized}`)

  // Check if the old directory exists on filesystem
  const oldExists = fs.existsSync(oldDir)
  const newExists = fs.existsSync(newDir)

  if (!oldExists && !newExists) {
    console.log(`  SKIP: neither path exists on filesystem\n`)
    continue
  }

  if (oldExists && newExists && oldDir !== newDir) {
    console.log(`  WARN: both old and new paths exist, skipping to avoid data loss\n`)
    errorCount++
    continue
  }

  if (!dryRun) {
    // Rename filesystem directory if needed
    if (oldExists && oldDir !== newDir) {
      fs.renameSync(oldDir, newDir)
      console.log(`  FS:  renamed`)
    }

    // Update DB
    sqlite.run('UPDATE comics SET file = ? WHERE id = ?', [sanitized, row.id])
    console.log(`  DB:  updated`)
  } else {
    if (oldExists && oldDir !== newDir) {
      console.log(`  FS:  would rename`)
    }
    console.log(`  DB:  would update`)
  }

  fixCount++
  console.log()
}

sqlite.close()
console.log(`Done. ${fixCount} fixed, ${errorCount} errors.`)
