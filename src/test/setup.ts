import fs from 'fs'
import os from 'os'
import path from 'path'

// Point COMIC_PATH at a fresh writable temp dir BEFORE any module (config.ts / db/index.ts)
// is loaded. bun test does not read .env, so without this the db module would try to open
// bun:sqlite at ./comics/comic.db, whose parent dir does not exist -> ENOENT at import time.
// This preload runs before test files and their import chains, so the db opens a valid path.
const comicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-server-test-'))
process.env.COMIC_PATH = comicDir
