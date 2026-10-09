import { expect, test } from 'bun:test'
import fs from 'node:fs'
import { imageMimeType, matchesImageSignature } from './image-format.js'

test('normal viewing accepts the same image extensions regardless of case', () => {
  for (const [extension, mime] of Object.entries({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', jxl: 'image/jxl' })) {
    expect(imageMimeType(`巻/ページ 1.${extension}`)).toBe(mime)
    expect(imageMimeType(`巻/ページ 1.${extension.toUpperCase()}`)).toBe(mime)
  }
  for (const name of ['page.svg', 'comic.db', 'page.gif.txt', 'pagewebp', 'page.webp/secret', 'page.avifs', 'page.jxl.txt', 'page.heic']) {
    expect(imageMimeType(name)).toBeUndefined()
  }
})

test('signatures distinguish image formats, WebP chunk types and both GIF versions', () => {
  for (const name of ['static.webp', 'animated.webp', 'static.gif', 'animated.gif']) {
    const bytes = fs.readFileSync(new URL(`../test/fixtures/images/${name}`, import.meta.url))
    const mime = imageMimeType(name)!
    expect(matchesImageSignature(bytes.subarray(0, 16), mime)).toBe(true)
    expect(matchesImageSignature(bytes, mime === 'image/gif' ? 'image/webp' : 'image/gif')).toBe(false)
  }
  for (const version of ['GIF87a', 'GIF89a']) expect(matchesImageSignature(Buffer.from(version), 'image/gif')).toBe(true)
  expect(matchesImageSignature(Buffer.from('GIF90a'), 'image/gif')).toBe(false)
  expect(matchesImageSignature(Buffer.from([0xc7, 0x49, 0x46, 0x38, 0x39, 0x61]), 'image/gif')).toBe(false)
  for (const chunk of ['VP8 ', 'VP8L', 'VP8X']) {
    const header = Buffer.from(`RIFF\x20\x00\x00\x00WEBP${chunk}`)
    expect(matchesImageSignature(header, 'image/webp')).toBe(true)
    expect(matchesImageSignature(header.subarray(0, 15), 'image/webp')).toBe(false)
    header[0] |= 0x80
    expect(matchesImageSignature(header, 'image/webp')).toBe(false)
  }
  for (const header of ['RIFF1234AVI VP8 ', 'RIFF1234WEBPFAKE', 'xxxx1234WEBPVP8 ', '<svg/>', '']) {
    expect(matchesImageSignature(Buffer.from(header), 'image/webp')).toBe(false)
    expect(matchesImageSignature(Buffer.from(header), 'image/gif')).toBe(false)
  }
})

test('AVIF signatures require an ftyp box naming avif or avis as a brand', () => {
  const bytes = fs.readFileSync(new URL('../test/fixtures/images/static.avif', import.meta.url))
  expect(matchesImageSignature(bytes.subarray(0, 64), 'image/avif')).toBe(true)
  const ftyp = (major: string, minor: string, ...compatible: string[]) => {
    const body = Buffer.from(`ftyp${major}${minor}${compatible.join('')}`, 'latin1')
    const size = Buffer.alloc(4)
    size.writeUInt32BE(body.length + 4)
    return Buffer.concat([size, body, Buffer.from('\0\0\0\x08meta', 'latin1')])
  }
  for (const header of [ftyp('avif', '\0\0\0\0'), ftyp('avis', '\0\0\0\0'), ftyp('mif1', '\0\0\0\0', 'miaf', 'avif'), ftyp('msf1', '\0\0\0\0', 'avis')]) {
    expect(matchesImageSignature(header, 'image/avif')).toBe(true)
  }
  // Brands outside the box, in the minor-version slot or in other ISO-BMFF files do not count.
  for (const header of [ftyp('heic', '\0\0\0\0', 'mif1', 'heic'), ftyp('mif1', 'avif', 'miaf'), ftyp('isom', '\0\0\0\0', 'mp41'), ftyp('mif1', '\0\0\0\0').subarray(0, 12), Buffer.from('\0\0\0\x10moovavifavifavif', 'latin1'), Buffer.from(''), bytes.subarray(0, 8)]) {
    expect(matchesImageSignature(header, 'image/avif')).toBe(false)
  }
  const truncated = ftyp('mif1', '\0\0\0\0', 'miaf')
  truncated.writeUInt32BE(16)
  expect(matchesImageSignature(Buffer.concat([truncated.subarray(0, 16), Buffer.from('avif')]), 'image/avif')).toBe(false)
  expect(matchesImageSignature(bytes, 'image/jxl')).toBe(false)
})

test('JPEG XL signatures accept bare codestreams and ISO-BMFF containers', () => {
  const bytes = fs.readFileSync(new URL('../test/fixtures/images/static.jxl', import.meta.url))
  expect(matchesImageSignature(bytes.subarray(0, 16), 'image/jxl')).toBe(true)
  expect(matchesImageSignature(Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a, 0, 0, 0, 0x14]), 'image/jxl')).toBe(true)
  for (const header of [[0xff, 0x0b], [0xff], [0x7f, 0x0a], [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x07, 0x0a], [0xff, 0xd8, 0xff, 0xe0], []]) {
    expect(matchesImageSignature(Buffer.from(header), 'image/jxl')).toBe(false)
  }
  expect(matchesImageSignature(bytes, 'image/avif')).toBe(false)
})
