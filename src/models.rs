use rusqlite::types::ValueRef;
use rusqlite::Row;
use serde::{Deserialize, Serialize};

pub fn read_timestamp(row: &Row, idx: usize) -> rusqlite::Result<String> {
    match row.get_ref(idx)? {
        ValueRef::Text(bytes) => Ok(String::from_utf8_lossy(bytes).into_owned()),
        ValueRef::Integer(i) => Ok(i.to_string()),
        other => Err(rusqlite::Error::InvalidColumnType(
            idx,
            "timestamp".into(),
            other.data_type(),
        )),
    }
}

pub fn read_optional_timestamp(row: &Row, idx: usize) -> rusqlite::Result<Option<String>> {
    match row.get_ref(idx)? {
        ValueRef::Null => Ok(None),
        ValueRef::Text(bytes) => Ok(Some(String::from_utf8_lossy(bytes).into_owned())),
        ValueRef::Integer(i) => Ok(Some(i.to_string())),
        other => Err(rusqlite::Error::InvalidColumnType(
            idx,
            "timestamp".into(),
            other.data_type(),
        )),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Comic {
    pub id: i64,
    pub title: String,
    pub file: String,
    pub bookshelf: String,
    pub genre: Option<String>,
    pub brand: Option<String>,
    pub original: Option<String>,
    pub custom_path: Option<String>,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

impl Comic {
    /// Map from a rusqlite Row with columns:
    /// id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            title: row.get(1)?,
            file: row.get(2)?,
            bookshelf: row.get(3)?,
            genre: row.get(4)?,
            brand: row.get(5)?,
            original: row.get(6)?,
            custom_path: row.get(7)?,
            created_at: read_timestamp(row, 8)?,
            deleted_at: read_optional_timestamp(row, 9)?,
        })
    }
}

#[derive(Debug, Serialize)]
pub struct ComicWithImages {
    pub id: i64,
    pub title: String,
    pub file: String,
    pub bookshelf: String,
    pub genre: Option<String>,
    pub brand: Option<String>,
    pub original: Option<String>,
    pub custom_path: Option<String>,
    pub created_at: String,
    pub deleted_at: Option<String>,
    pub images: Vec<String>,
    #[serde(rename = "origin-images")]
    pub origin_images: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct BookshelfComic {
    pub id: i64,
    pub title: String,
    pub file: String,
    pub bookshelf: String,
    pub brand: Option<String>,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateComic {
    pub title: Option<String>,
    pub file: Option<String>,
    pub bookshelf: Option<String>,
    pub genre: Option<String>,
    pub brand: Option<String>,
    pub original: Option<String>,
    pub custom_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateComic {
    pub title: Option<String>,
    pub file: Option<String>,
    pub bookshelf: Option<String>,
    pub genre: Option<String>,
    pub brand: Option<String>,
    pub original: Option<String>,
    pub custom_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ParseResult {
    pub title: String,
    pub genre: String,
    pub brand: String,
    pub original: String,
}

#[derive(Debug, Serialize)]
pub struct DuplicateEntry {
    pub name: String,
    #[serde(rename = "existingId")]
    pub existing_id: Option<i64>,
    #[serde(rename = "existingBookshelf")]
    pub existing_bookshelf: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RegisterResult {
    pub registered: Vec<String>,
    pub duplicated: Vec<String>,
    pub errors: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE comics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                file TEXT NOT NULL UNIQUE,
                bookshelf TEXT NOT NULL,
                genre TEXT,
                brand TEXT,
                original TEXT,
                custom_path TEXT,
                created_at,
                deleted_at
            )",
        )
        .unwrap();
        conn
    }

    #[test]
    fn from_row_with_text_timestamps() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO comics (title, file, bookshelf, created_at, deleted_at)
             VALUES ('test', 'test.zip', 'unread', '2025-01-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z')",
            [],
        )
        .unwrap();

        let comic = conn
            .query_row(
                "SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at FROM comics WHERE id = 1",
                [],
                Comic::from_row,
            )
            .unwrap();

        assert_eq!(comic.created_at, "2025-01-01T00:00:00.000Z");
        assert_eq!(comic.deleted_at, Some("2025-06-01T00:00:00.000Z".to_string()));
    }

    #[test]
    fn from_row_with_integer_timestamps() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO comics (title, file, bookshelf, created_at, deleted_at)
             VALUES ('test', 'test.zip', 'unread', 1709700000, 1717200000)",
            [],
        )
        .unwrap();

        let comic = conn
            .query_row(
                "SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at FROM comics WHERE id = 1",
                [],
                Comic::from_row,
            )
            .unwrap();

        assert_eq!(comic.created_at, "1709700000");
        assert_eq!(comic.deleted_at, Some("1717200000".to_string()));
    }

    #[test]
    fn from_row_with_real_timestamp_fails() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO comics (title, file, bookshelf, created_at)
             VALUES ('test', 'test.zip', 'unread', 1709700000.123)",
            [],
        )
        .unwrap();

        let result = conn.query_row(
            "SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at FROM comics WHERE id = 1",
            [],
            Comic::from_row,
        );

        assert!(result.is_err());
    }

    #[test]
    fn from_row_with_null_optional_fields() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO comics (title, file, bookshelf, created_at)
             VALUES ('test', 'test.zip', 'unread', 1709700000)",
            [],
        )
        .unwrap();

        let comic = conn
            .query_row(
                "SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at FROM comics WHERE id = 1",
                [],
                Comic::from_row,
            )
            .unwrap();

        assert_eq!(comic.genre, None);
        assert_eq!(comic.brand, None);
        assert_eq!(comic.original, None);
        assert_eq!(comic.custom_path, None);
        assert_eq!(comic.created_at, "1709700000");
        assert_eq!(comic.deleted_at, None);
    }
}
