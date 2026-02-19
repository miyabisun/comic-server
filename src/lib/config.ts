import path from 'path'

export const comicPath = process.env.COMIC_PATH || './comics'
export const databasePath = process.env.DATABASE_PATH || path.join(comicPath, 'comic.db')
