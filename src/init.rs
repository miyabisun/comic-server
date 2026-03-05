use std::fs;
use std::path::Path;

use rusqlite::Connection;

const BOOKSHELF_DIRS: &[&str] = &[
    "haystack",
    "unread",
    "hold",
    "like",
    "favorite",
    "love",
    "legend",
    "deleted",
    "duplicates",
];

pub fn init(comic_path: &Path, conn: &Connection) {
    // Create bookshelf directories
    for dir in BOOKSHELF_DIRS {
        fs::create_dir_all(comic_path.join(dir)).expect("Failed to create bookshelf directory");
    }

    // Create tables if not exist
    let table_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='comics'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);

    if !table_exists {
        tracing::info!("Initializing database...");
        conn.execute_batch(
            "CREATE TABLE comics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                file TEXT NOT NULL,
                bookshelf TEXT NOT NULL,
                genre TEXT,
                brand TEXT,
                original TEXT,
                custom_path TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z'),
                deleted_at TEXT
            );
            CREATE UNIQUE INDEX comics_file_key ON comics(file);
            CREATE INDEX comics_bookshelf_created_idx ON comics(bookshelf, created_at DESC);
            CREATE INDEX comics_brand_idx ON comics(brand);
            CREATE INDEX comics_created_at_idx ON comics(created_at);",
        )
        .expect("Failed to initialize database");
        tracing::info!("Database initialized");
    }
}
