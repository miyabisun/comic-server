import path from 'path'

export const comicPath = process.env.COMIC_PATH || './comics'
export const databasePath = process.env.DATABASE_PATH || path.join(comicPath, 'comic.db')
export const backupPath = path.join(comicPath, 'backup')
export const upscaleScriptPath =
  process.env.UPSCALE_SCRIPT_PATH ||
  path.resolve(import.meta.dir, '../../scripts/upscale-images.sh')
