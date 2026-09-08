import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const comics = sqliteTable('comics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  file: text('file').notNull().unique(),
  bookshelf: text('bookshelf').notNull(),
  genre: text('genre'),
  brand: text('brand'),
  original: text('original'),
  custom_path: text('custom_path'),
  remaster_source_id: integer('remaster_source_id').unique(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  deleted_at: text('deleted_at'),
})
