import fs from 'fs'
import fsp from 'fs/promises'
import { spawn } from 'child_process'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { comics } from '../db/schema.js'
import { backupPath, comicPath, upscaleScriptPath } from '../lib/config.js'

type UpscaleJob = {
  comicId: number
  total: number
  processed: number
  currentFile: string
  startedAt: string
  error: string | null
}

// Single-slot concurrency control.
// IMPORTANT: all reads and writes to activeJob must be synchronous (no await
// between the check and the assignment) to avoid TOCTOU races. Hono handlers
// run on the event loop, so as long as we stay synchronous this is safe.
let activeJob: UpscaleJob | null = null

// Flag for confirm/rollback operations. These are async (fs.promises) so we
// need a separate lock to prevent a concurrent upscale start from entering a
// partial-rename state window.
let isMutating = false

function getComicDir(id: number): { comic: typeof comics.$inferSelect, dir: string, bakDir: string } | null {
  const comic = db.select().from(comics).where(eq(comics.id, id)).get()
  if (!comic) return null
  const dir = `${comicPath}/${comic.bookshelf}/${comic.file}`
  const bakDir = `${backupPath}/${comic.file}`
  return { comic, dir, bakDir }
}

/**
 * Determine the upscale state of a comic.
 * Returns one of:
 *   - 'idle':       no backup directory, ready for upscale
 *   - 'processing': upscale is running for this comic
 *   - 'pending':    backup exists but no active job (confirm or rollback needed)
 *
 * Note: if the server restarts while a job is running, the backup stays on
 * disk but activeJob is lost. Such a comic will appear as 'pending' and the
 * user must manually rollback. This is intentional per the design decision.
 */
function determineStatus(comicId: number, bakDir: string): 'idle' | 'processing' | 'pending' {
  if (activeJob && activeJob.comicId === comicId) return 'processing'
  if (fs.existsSync(bakDir)) return 'pending'
  return 'idle'
}

const app = new Hono()

// Start an upscale job
app.post('/api/comics/:id/upscale', (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const info = getComicDir(id)
  if (!info) return c.json({ error: 'Not found' }, 404)
  if (!fs.existsSync(info.dir)) return c.json({ error: 'Directory not found' }, 404)

  // TOCTOU-safe: no await between the check and the set below.
  if (activeJob) {
    return c.json({ error: 'Another upscale job is already running', jobComicId: activeJob.comicId }, 409)
  }
  if (isMutating) {
    return c.json({ error: 'A confirm/rollback operation is in progress' }, 409)
  }
  if (fs.existsSync(info.bakDir)) {
    return c.json({ error: 'backup already exists, confirm or rollback first' }, 409)
  }

  activeJob = {
    comicId: id,
    total: 0,
    processed: 0,
    currentFile: '',
    startedAt: new Date().toISOString(),
    error: null,
  }

  const child = spawn('bash', [upscaleScriptPath, info.dir, info.bakDir], { stdio: ['ignore', 'pipe', 'pipe'] })

  let buffer = ''
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      let evt: { event?: string, total?: unknown, processed?: unknown, file?: unknown, message?: unknown }
      try {
        evt = JSON.parse(line)
      } catch {
        continue // ignore non-JSON output
      }
      if (!activeJob) continue
      switch (evt.event) {
        case 'start':
          activeJob.total = Number(evt.total) || 0
          break
        case 'progress':
          activeJob.processed = Number(evt.processed) || 0
          activeJob.total = Number(evt.total) || activeJob.total
          activeJob.currentFile = typeof evt.file === 'string' ? evt.file : ''
          break
        case 'copying':
          activeJob.currentFile = '(backing up files...)'
          break
        case 'error':
          activeJob.error = typeof evt.message === 'string' ? evt.message : 'unknown error'
          break
      }
    }
  })

  child.stderr.on('data', (chunk) => {
    console.error('[upscale]', chunk.toString())
  })

  // Cleanup runs once per process lifecycle (whichever of error/close fires first).
  // Safe to call twice: null activeJob just skips the branch.
  const cleanup = (err: Error | null, code: number | null) => {
    if (activeJob && !activeJob.error) {
      if (err) activeJob.error = err.message
      else if (code !== null && code !== 0) activeJob.error = `script exited with code ${code}`
    }
    // Clear activeJob. Backup remains on disk so status becomes 'pending'.
    activeJob = null
  }
  child.on('error', (err) => { console.error('[upscale] spawn error:', err); cleanup(err, null) })
  child.on('close', (code) => cleanup(null, code))

  return c.json({ message: 'upscale started', comicId: id })
})

// Confirm the upscale (delete backup)
app.post('/api/comics/:id/upscale/confirm', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const info = getComicDir(id)
  if (!info) return c.json({ error: 'Not found' }, 404)

  const status = determineStatus(id, info.bakDir)
  if (status === 'processing') return c.json({ error: 'Still processing' }, 409)
  if (status === 'idle') return c.json({ error: 'Nothing to confirm' }, 400)
  if (isMutating) return c.json({ error: 'Another mutation is in progress' }, 409)

  isMutating = true
  try {
    await fsp.rm(info.bakDir, { recursive: true, force: true })
  } finally {
    isMutating = false
  }
  return c.json({ message: 'upscale confirmed' })
})

// Rollback the upscale (restore from backup)
//
// Safe 3-step rename sequence:
//   1. rename dir       -> dir.old    (upscaled files parked aside)
//   2. rename backup    -> dir        (original restored in place)
//   3. rm -rf dir.old   (upscaled files discarded)
//
// dir.old is created adjacent to dir (same filesystem) to keep rename atomic.
// If step 2 fails, we attempt to restore dir from dir.old so the user can
// retry. If that restore also fails, the admin must recover manually from
// dir.old and backup, but no data is lost.
app.post('/api/comics/:id/upscale/rollback', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const info = getComicDir(id)
  if (!info) return c.json({ error: 'Not found' }, 404)

  const status = determineStatus(id, info.bakDir)
  if (status === 'processing') return c.json({ error: 'Still processing' }, 409)
  if (status === 'idle') return c.json({ error: 'Nothing to rollback' }, 400)
  if (isMutating) return c.json({ error: 'Another mutation is in progress' }, 409)

  isMutating = true
  const oldDir = `${info.dir}.old`
  try {
    await fsp.rename(info.dir, oldDir)
    try {
      await fsp.rename(info.bakDir, info.dir)
    } catch (e) {
      // Step 2 failed: try to put the upscaled dir back so state is recoverable.
      await fsp.rename(oldDir, info.dir).catch((revertErr) => {
        console.error('[upscale] rollback restore failed:', revertErr)
      })
      throw e
    }
    await fsp.rm(oldDir, { recursive: true, force: true })
  } catch (e) {
    return c.json({ error: `rollback failed: ${(e as Error).message}` }, 500)
  } finally {
    isMutating = false
  }
  return c.json({ message: 'upscale rolled back' })
})

// Get the upscale status
app.get('/api/comics/:id/upscale/status', (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const info = getComicDir(id)
  if (!info) return c.json({ error: 'Not found' }, 404)

  const status = determineStatus(id, info.bakDir)
  const response: Record<string, unknown> = { status }

  if (status === 'processing' && activeJob) {
    response.processed = activeJob.processed
    response.total = activeJob.total
    response.currentFile = activeJob.currentFile
    response.startedAt = activeJob.startedAt
  }

  return c.json(response)
})

export default app
