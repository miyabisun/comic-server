import { expect, test } from 'bun:test'
import fs from 'node:fs'
import { imageMimeType, matchesImageSignature } from './image-format.js'

test('normal viewing accepts the same image extensions regardless of case', () => {
  for (const [extension, mime] of Object.entries({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' })) {
    expect(imageMimeType(`巻/ページ 1.${extension}`)).toBe(mime)
    expect(imageMimeType(`巻/ページ 1.${extension.toUpperCase()}`)).toBe(mime)
  }
  for (const name of ['page.svg', 'comic.db', 'page.gif.txt', 'pagewebp', 'page.webp/secret']) {
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
