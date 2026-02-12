import path from 'path'

export const comicPath = process.env.COMIC_PATH || './comics'
export const databasePath = path.join(comicPath, 'comic.db')
export const databaseUrl = `file:${path.resolve(databasePath)}`

// Set DATABASE_URL for Prisma before any PrismaClient is created
process.env.DATABASE_URL = databaseUrl
