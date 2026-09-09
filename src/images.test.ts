import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from './app.js'
import { comicPath } from './lib/config.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gkJDBQzk3fwmAAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOS0wOVQxMjoyMDo1MSswMDowMDb9R10AAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDktMDlUMTI6MjA6NTErMDA6MDBHoP/hAAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA5LTA5VDEyOjIwOjUxKzAwOjAwELXePgAAAAxJREFUCNdjYGBgAAAABAABJzQnCgAAAABJRU5ErkJggg==', 'base64')
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAHCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADoDFU3/2Q==', 'base64')
let fixture: string
let outside: string
let privateDir: string
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(comicPath, '画像 配信-'))
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-outside-'))
  fs.mkdirSync(path.join(comicPath, '.remaster'), { recursive: true })
  privateDir = fs.mkdtempSync(path.join(comicPath, '.remaster', 'image-test-'))
})
afterEach(() => {
  for (const dir of [fixture, outside, privateDir]) fs.rmSync(dir, { recursive: true, force: true })
})

test('serves PNG and JPEG bytes with encoded paths and internal image links', async () => {
  for (const [name, bytes, mime] of [['page.png', png, 'image/png'], ['page.jpg', jpeg, 'image/jpeg'], ['page.JPEG', jpeg, 'image/jpeg']] as const) {
    fs.writeFileSync(path.join(fixture, name), bytes)
    fs.symlinkSync(name, path.join(fixture, `link-${name}`))
    for (const base of ['', '/comic']) {
      const app = createApp(base)
      for (const file of [name, `link-${name}`]) {
        const response = await app.request(`${base}/images/${encodeURIComponent(path.basename(fixture))}/${file}`)
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe(mime)
        expect(response.headers.get('content-length')).toBe(String(bytes.length))
        expect(response.headers.get('x-content-type-options')).toBe('nosniff')
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
      }
    }
  }
})

test('never serves databases, disguised files, outside links or private staging', async () => {
  const db = new Database(path.join(fixture, 'comic.db'))
  db.exec('CREATE TABLE secret (value TEXT); INSERT INTO secret VALUES ("private metadata")')
  db.close()
  fs.writeFileSync(path.join(fixture, 'settings.yaml'), 'secret: private metadata')
  fs.writeFileSync(path.join(fixture, 'script.svg'), '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')
  fs.copyFileSync(path.join(fixture, 'comic.db'), path.join(fixture, 'disguised.jpg'))
  fs.copyFileSync(path.join(fixture, 'comic.db'), path.join(fixture, 'disguised.png'))
  fs.symlinkSync('comic.db', path.join(fixture, 'database.png'))
  fs.writeFileSync(path.join(outside, 'outside.jpg'), jpeg)
  fs.symlinkSync(path.join(outside, 'outside.jpg'), path.join(fixture, 'outside.jpg'))
  fs.writeFileSync(path.join(privateDir, 'page.png'), png)
  fs.symlinkSync(path.join(privateDir, 'page.png'), path.join(fixture, 'private.png'))
  fs.symlinkSync(privateDir, path.join(fixture, 'private-dir'))
  const app = createApp('/comic')
  const prefix = `/comic/images/${encodeURIComponent(path.basename(fixture))}/`
  for (const name of ['comic.db', 'comic%2edb', 'settings.yaml', 'script.svg', 'disguised.jpg', 'disguised.png', 'database.png', 'outside.jpg', 'private.png', 'private-dir/page.png']) {
    const response = await app.request(prefix + name)
    expect(response.status, name).toBe(403)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.text()).not.toContain('private metadata')
  }
  expect((await app.request(`/comic/images/%2eremaster/${path.basename(privateDir)}/page.png`)).status).toBe(403)
  const traversal = encodeURIComponent(path.relative(comicPath, path.join(outside, 'outside.jpg')))
  expect((await app.request(`/comic/images/${traversal}`)).status).toBe(403)
  expect((await app.request(prefix + '%zz')).status).toBe(400)
  expect((await app.request(prefix + 'missing.png')).status).toBe(404)
})
