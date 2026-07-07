import { init } from './lib/init.js'
import { createApp } from './app.js'

init()

const port = Number(process.env.PORT) || 3000
const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '')
if (basePath && !/^\/[\w\-\/]*$/.test(basePath)) {
  throw new Error(`Invalid BASE_PATH: ${basePath}`)
}

const app = createApp(basePath)

console.log(`Server running on http://localhost:${port}${basePath || '/'}`)

export default { port, fetch: app.fetch }
