import path from 'node:path'
import { getMimeType } from 'hono/utils/mime'

// Normal viewing only; remaster/resize retain their own JPEG/PNG restrictions.
export function imageMimeType(filename: string): string | undefined {
  const extension = path.extname(filename).toLowerCase()
  if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) return undefined
  return getMimeType(extension)
}

// Format identification, not full decoding or sanitization. The original file is streamed unchanged.
export function matchesImageSignature(header: Buffer, mime: string): boolean {
  switch (mime) {
    case 'image/jpeg': return header.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    case 'image/png': return header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    case 'image/gif': return ['GIF87a', 'GIF89a'].includes(header.toString('latin1', 0, 6))
    case 'image/webp': return header.toString('latin1', 0, 4) === 'RIFF'
      && header.toString('latin1', 8, 12) === 'WEBP'
      && ['VP8 ', 'VP8L', 'VP8X'].includes(header.toString('latin1', 12, 16))
    default: return false
  }
}
