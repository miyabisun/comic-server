use rusqlite::Row;
use serde::{Deserialize, Serialize};

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
            created_at: row.get(8)?,
            deleted_at: row.get(9)?,
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
