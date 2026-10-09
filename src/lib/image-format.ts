import path from 'node:path'
import { getMimeType } from 'hono/utils/mime'

// Normal viewing only; remaster/resize retain their own JPEG/PNG restrictions.
export function imageMimeType(filename: string): string | undefined {
  const extension = path.extname(filename).toLowerCase()
  if (extension === '.jxl') return 'image/jxl'
  if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(extension)) return undefined
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
    case 'image/avif': return hasAvifBrand(header)
    case 'image/jxl': return header.subarray(0, 2).equals(Buffer.from([0xff, 0x0a]))
      || header.subarray(0, 12).equals(Buffer.from([0, 0, 0, 12, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]))
    default: return false
  }
}

// ISO-BMFF ftyp box: major brand at 8, minor version at 12, compatible brands until the box ends.
function hasAvifBrand(header: Buffer): boolean {
  if (header.length < 12 || header.toString('latin1', 4, 8) !== 'ftyp') return false
  const end = Math.min(header.readUInt32BE(0), header.length)
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    if (offset !== 12 && ['avif', 'avis'].includes(header.toString('latin1', offset, offset + 4))) return true
  }
  return false
}
