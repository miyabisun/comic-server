import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { comicPath, remasterBinaryPath, remasterModelDir } from '../lib/config.js'
import sanitize from '../lib/sanitize-filename.js'

type Comic = typeof comics.$inferSelect
type Job = { comicId: number; status: 'processing' | 'completed' | 'failed'; total: number; processed: number; error: string | null; controller: AbortController }
// ponytail: one remaster at a time in this server process; no queue or distributed worker.
let job: Job | null = null
const app = new Hono()

function outputFor(id: number) {
  return db.select().from(comics).where(eq(comics.remaster_source_id, id)).get()
}

async function pages(dir: string, relative = ''): Promise<string[]> {
  const result: string[] = []
  for (const entry of await fsp.readdir(path.join(dir, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are unsupported in remaster input')
    const file = path.join(relative, entry.name)
    if (entry.isDirectory()) result.push(...await pages(dir, file))
    else if (entry.isFile() && /\.(png|jpe?g)$/i.test(file)) result.push(file)
  }
  return result.sort()
}

async function run(comic: Comic, source: string, filename: string, current: Job) {
  let staging = ''
  try {
    const files = await pages(source)
    if (!files.length) throw new Error('No PNG or JPEG pages found')
    current.total = files.length
    const privateRoot = path.join(comicPath, '.remaster')
    await fsp.mkdir(privateRoot, { recursive: true })
    staging = await fsp.mkdtemp(path.join(privateRoot, `${comic.id}-`))
    for (const file of files) {
      current.controller.signal.throwIfAborted()
      const output = path.join(staging, `${file}.png`)
      await fsp.mkdir(path.dirname(output), { recursive: true })
      await new Promise<void>((resolve, reject) => {
        const child = spawn(remasterBinaryPath, [remasterModelDir, path.join(source, file), output], {
          stdio: ['pipe', 'ignore', 'pipe'], signal: current.controller.signal,
          env: { ...process.env, COMIC_REMASTER_CHILD: '1' },
        })
        let error = ''
        child.stderr.on('data', (chunk) => { error = (error + chunk.toString()).slice(-4096) })
        let spawnError: Error | null = null
        child.once('error', (cause) => { spawnError = cause })
        child.once('close', (code) => spawnError ? reject(spawnError) : code === 0 ? resolve() : reject(new Error(error || `Inference exited with code ${code}`)))
      })
      if (!(await fsp.stat(output)).size) throw new Error('Inference produced an empty page')
      current.processed++
    }
    current.controller.signal.throwIfAborted()
    // Reserve the destination exclusively; rename can replace only our empty directory.
    const destination = path.join(comicPath, 'unread', filename)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    let reserved = false
    let published = false
    try {
      db.transaction((tx) => {
        tx.insert(comics).values({
          file: filename, title: `${comic.title} [リマスター版]`, bookshelf: 'unread',
          genre: comic.genre, brand: comic.brand, original: comic.original,
          remaster_source_id: comic.id,
        }).run()
        fs.mkdirSync(destination)
        reserved = true
        fs.renameSync(staging, destination)
        published = true
      })
    } catch (error) {
      if (published) fs.renameSync(destination, staging)
      else if (reserved) fs.rmdirSync(destination)
      throw error
    }
    current.status = 'completed'
  } catch (error) {
    current.status = 'failed'
    current.error = current.controller.signal.aborted ? 'Remaster cancelled' : (error as Error).message
  } finally {
    if (staging) await fsp.rm(staging, { recursive: true, force: true }).catch((error) => console.error('[remaster] staging cleanup:', error))
  }
}

app.post('/api/comics/:id/remaster', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'Invalid id' }, 400)
  const comic = db.select().from(comics).where(eq(comics.id, id)).get()
  if (!comic) return c.json({ error: 'Not found' }, 404)
  if (comic.remaster_source_id !== null || comic.file.includes('リマスター版') || comic.title.includes('リマスター版')) {
    return c.json({ error: 'This comic is already a remaster' }, 409)
  }
  const existing = outputFor(id)
  if (existing) return c.json({ status: 'completed', outputComicId: existing.id })
  if (job?.status === 'processing') return c.json({ error: 'Another remaster is running' }, 409)
  if (!fs.existsSync(remasterBinaryPath) || !fs.existsSync(remasterModelDir)) return c.json({ error: 'Remaster is not configured' }, 503)
  try {
    for (const part of [comic.bookshelf, comic.file]) {
      if (!part || part === '.' || part === '..' || part === '.remaster' || /[/\\]/.test(part)) return c.json({ error: 'Invalid comic path' }, 400)
    }
    const source = fs.realpathSync(path.join(comicPath, comic.bookshelf, comic.file))
    if (!source.startsWith(fs.realpathSync(comicPath) + path.sep)) return c.json({ error: 'Invalid comic path' }, 400)
    const filename = sanitize(`${comic.file} [リマスター版]`)
    if (db.select().from(comics).where(eq(comics.file, filename)).get() || fs.existsSync(path.join(comicPath, 'unread', filename))) {
      return c.json({ error: 'Remaster output already exists; it will not be overwritten' }, 409)
    }
    job = { comicId: id, status: 'processing', total: 0, processed: 0, error: null, controller: new AbortController() }
    void run(comic, source, filename, job)
    return c.json({ status: 'processing' }, 202)
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400)
  }
})

app.get('/api/comics/:id/remaster/status', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'Invalid id' }, 400)
  const comic = db.select().from(comics).where(eq(comics.id, id)).get()
  if (!comic) return c.json({ error: 'Not found' }, 404)
  const output = outputFor(id)
  if (output) return c.json({ status: 'completed', outputComicId: output.id })
  if (comic.remaster_source_id !== null) return c.json({ status: 'completed', outputComicId: id })
  if (job?.comicId === id) {
    const { controller, ...status } = job
    return c.json(status)
  }
  return c.json({ status: 'idle', available: fs.existsSync(remasterBinaryPath) && fs.existsSync(remasterModelDir) })
})

app.post('/api/comics/:id/remaster/cancel', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'Invalid id' }, 400)
  if (!job || job.comicId !== id || job.status !== 'processing') return c.json({ error: 'No running remaster' }, 409)
  job.controller.abort()
  return c.json({ status: 'cancelling' }, 202)
})

export default app
