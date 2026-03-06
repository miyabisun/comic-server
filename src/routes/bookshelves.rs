use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

use crate::error::AppError;
use crate::models::{read_optional_timestamp, read_timestamp, BookshelfComic};

use super::AppState;

pub async fn list_bookshelves(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let db = state.db.clone();
    let counts = tokio::task::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn
            .prepare("SELECT bookshelf, count(*) FROM comics GROUP BY bookshelf")
            .unwrap();
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        rows
    })
    .await
    .unwrap();

    let mut map = serde_json::Map::new();
    for (bookshelf, count) in counts {
        map.insert(bookshelf, json!(count));
    }
    Ok(Json(serde_json::Value::Object(map)))
}

pub async fn get_bookshelf(
    State(state): State<AppState>,
    axum::extract::Path(name): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let db = state.db.clone();
    let comics = tokio::task::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn
            .prepare(
                "SELECT id, title, file, bookshelf, brand, created_at, deleted_at
                 FROM comics WHERE bookshelf = ?1 ORDER BY created_at DESC",
            )
            .unwrap();
        let rows = stmt
            .query_map([&name], |row| {
                Ok(BookshelfComic {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    file: row.get(2)?,
                    bookshelf: row.get(3)?,
                    brand: row.get(4)?,
                    created_at: read_timestamp(row, 5)?,
                    deleted_at: read_optional_timestamp(row, 6)?,
                })
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        rows
    })
    .await
    .unwrap();

    Ok(Json(comics))
}
