use std::fs;

use axum::extract::{Json, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde_json::json;
use walkdir::WalkDir;

use crate::error::AppError;
use crate::helpers::natural_sort::natural_sort;
use crate::helpers::parse_comic_name::parse_comic_name;
use crate::helpers::sanitize_filename::sanitize_filename;
use crate::models::{Comic, ComicWithImages, CreateComic, UpdateComic};

use super::AppState;

pub async fn list_comics(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let db = state.db.clone();
    let comics = tokio::task::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn
            .prepare("SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at FROM comics ORDER BY created_at DESC")
            .unwrap();
        let rows = stmt
            .query_map([], Comic::from_row)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        rows
    })
    .await
    .unwrap();

    Ok(Json(comics))
}

#[derive(serde::Deserialize)]
pub struct ParseQuery {
    name: Option<String>,
}

pub async fn parse(Query(q): Query<ParseQuery>) -> Result<impl IntoResponse, AppError> {
    let Some(name) = q.name else {
        return Err(AppError::BadRequest("Missing name parameter".to_string()));
    };
    Ok(Json(parse_comic_name(&name)))
}

#[derive(serde::Deserialize)]
pub struct ExistQuery {
    file: Option<String>,
}

pub async fn check_exist(
    State(state): State<AppState>,
    Query(q): Query<ExistQuery>,
) -> Result<impl IntoResponse, AppError> {
    let Some(file) = q.file else {
        return Ok(Json(json!({ "exists": false })));
    };
    let db = state.db.clone();
    let sanitized = sanitize_filename(&file);
    let result = tokio::task::spawn_blocking(move || {
        let conn = db.lock();
        let mut stmt = conn
            .prepare("SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at FROM comics WHERE file = ?1")
            .unwrap();
        stmt.query_row([&sanitized], Comic::from_row).ok()
    })
    .await
    .unwrap();

    match result {
        Some(comic) => Ok(Json(json!({ "exists": true, "comic": comic }))),
        None => Ok(Json(json!({ "exists": false }))),
    }
}

pub async fn get_comic(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let db = state.db.clone();
    let comic_path = state.comic_path.clone();

    let comic = tokio::task::spawn_blocking(move || {
        let conn = db.lock();
        conn.query_row(
            "SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at FROM comics WHERE id = ?1",
            [id],
            Comic::from_row,
        )
        .ok()
    })
    .await
    .unwrap();

    let Some(comic) = comic else {
        return Err(AppError::NotFound("Not found".to_string()));
    };

    let comic_file = comic.file.replace('/', "\\/");
    let comic_dir = comic_path.join(&comic.bookshelf).join(&comic_file);

    if !comic_dir.exists() {
        return Err(AppError::NotFound("Not found".to_string()));
    }

    // Build custom_path regex
    let custom_re = comic.custom_path.as_deref().and_then(|p| {
        if p.is_empty() {
            return None;
        }
        regex::Regex::new(p).ok()
    });

    // Collect all image files recursively
    let mut all_images: Vec<String> = Vec::new();
    for entry in WalkDir::new(&comic_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ext_lower == "png" || ext_lower == "jpg" || ext_lower == "jpeg" {
                    if let Ok(rel) = path.strip_prefix(&comic_dir) {
                        all_images.push(rel.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    natural_sort(&mut all_images);

    let filtered_images = match &custom_re {
        Some(re) => all_images.iter().filter(|name| re.is_match(name)).cloned().collect(),
        None => all_images.clone(),
    };

    let result = ComicWithImages {
        id: comic.id,
        title: comic.title,
        file: comic.file,
        bookshelf: comic.bookshelf,
        genre: comic.genre,
        brand: comic.brand,
        original: comic.original,
        custom_path: comic.custom_path,
        created_at: comic.created_at,
        deleted_at: comic.deleted_at,
        images: filtered_images,
        origin_images: all_images,
    };

    Ok(Json(json!(result)))
}

pub async fn update_comic(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i64>,
    Json(body): Json<UpdateComic>,
) -> Result<impl IntoResponse, AppError> {
    let db = state.db.clone();
    let comic_path = state.comic_path.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let conn = db.lock();

        // Find existing comic
        let comic = conn
            .query_row(
                "SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at FROM comics WHERE id = ?1",
                [id],
                Comic::from_row,
            )
            .map_err(|_| AppError::NotFound("Not found".to_string()))?;

        // Find the actual directory
        let sanitized_file = sanitize_filename(&comic.file);
        let candidates = [
            comic_path.join(&comic.bookshelf).join(&comic.file),
            comic_path.join(&comic.bookshelf).join(&sanitized_file),
            comic_path.join("haystack").join(&comic.file),
            comic_path.join("haystack").join(&sanitized_file),
        ];
        let found_path = candidates.iter().find(|p| p.exists());
        let Some(found_path) = found_path.cloned() else {
            return Err(AppError::NotFound("Not found".to_string()));
        };

        // Check for duplicate file name
        let comic_file = body.file.as_deref().unwrap_or(&comic.file).replace('/', "\\/");
        if comic_file != comic.file {
            let existing: Option<i64> = conn
                .query_row(
                    "SELECT id FROM comics WHERE file = ?1",
                    [&comic_file],
                    |row| row.get(0),
                )
                .ok();
            if let Some(existing_id) = existing {
                if existing_id != id {
                    return Ok(json!({
                        "message": "new file name is exists",
                        "data": { "id": id }
                    }));
                }
            }
        }

        let new_title = body.title.as_deref().unwrap_or(&comic.title);
        let new_bookshelf = body.bookshelf.as_deref().unwrap_or(&comic.bookshelf);
        let new_genre = if body.genre.is_some() { &body.genre } else { &comic.genre };
        let new_brand = if body.brand.is_some() { &body.brand } else { &comic.brand };
        let new_original = if body.original.is_some() { &body.original } else { &comic.original };
        let new_custom_path = if body.custom_path.is_some() { &body.custom_path } else { &comic.custom_path };

        // Rename directory first, then update DB
        let after = comic_path.join(new_bookshelf).join(&comic_file);
        if found_path != after {
            if let Some(parent) = after.parent() {
                fs::create_dir_all(parent).ok();
            }
            fs::rename(&found_path, &after).map_err(|e| AppError::Internal(e.to_string()))?;
        }

        if let Err(e) = conn.execute(
            "UPDATE comics SET title = ?1, file = ?2, bookshelf = ?3, genre = ?4, brand = ?5, original = ?6, custom_path = ?7 WHERE id = ?8",
            rusqlite::params![new_title, comic_file, new_bookshelf, new_genre, new_brand, new_original, new_custom_path, id],
        ) {
            // Rollback: move directory back
            if found_path != after {
                fs::rename(&after, &found_path).ok();
            }
            return Err(AppError::from(e));
        }

        Ok(json!({
            "message": "update successful",
            "data": { "id": id }
        }))
    })
    .await
    .unwrap()?;

    // Check if it was a duplicate name error (400)
    if result.get("message").and_then(|m| m.as_str()) == Some("new file name is exists") {
        return Ok((StatusCode::BAD_REQUEST, Json(result)).into_response());
    }

    Ok(Json(result).into_response())
}

pub async fn delete_comic(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let db = state.db.clone();
    let comic_path = state.comic_path.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<serde_json::Value, AppError> {
        let conn = db.lock();

        let comic = conn
            .query_row(
                "SELECT id, file, bookshelf FROM comics WHERE id = ?1",
                [id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .map_err(|_| AppError::NotFound("Not found".to_string()))?;

        let (_comic_id, file, bookshelf) = comic;
        let comic_file = file.replace('/', "\\/");
        let source = comic_path.join(&bookshelf).join(&comic_file);

        if !source.exists() {
            return Err(AppError::NotFound("Not found".to_string()));
        }

        // Move file first, then update DB to avoid inconsistency
        let deleted_dir = comic_path.join("deleted");
        fs::create_dir_all(&deleted_dir).ok();
        let dest = deleted_dir.join(&comic_file);
        fs::rename(&source, &dest)
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if let Err(e) = conn.execute(
            "UPDATE comics SET bookshelf = 'deleted', deleted_at = strftime('%Y-%m-%dT%H:%M:%f','now') || 'Z' WHERE id = ?1",
            rusqlite::params![id],
        ) {
            // Rollback: move file back
            fs::rename(&dest, &source).ok();
            return Err(AppError::from(e));
        }

        Ok(json!({
            "message": "delete successful",
            "data": id
        }))
    })
    .await
    .unwrap()?;

    Ok(Json(result))
}

pub async fn create_comic(
    State(state): State<AppState>,
    Json(body): Json<CreateComic>,
) -> Result<impl IntoResponse, AppError> {
    let Some(ref file) = body.file else {
        return Err(AppError::BadRequest(
            "Missing required fields: file, title".to_string(),
        ));
    };
    let Some(ref title) = body.title else {
        return Err(AppError::BadRequest(
            "Missing required fields: file, title".to_string(),
        ));
    };

    let db = state.db.clone();
    let file = file.clone();
    let title = title.clone();
    let bookshelf = body.bookshelf.clone().unwrap_or_else(|| "unread".to_string());
    let genre = body.genre.clone();
    let brand = body.brand.clone();
    let original = body.original.clone();
    let custom_path = body.custom_path.clone();

    let comic = tokio::task::spawn_blocking(move || -> Result<Comic, AppError> {
        let conn = db.lock();
        conn.execute(
            "INSERT INTO comics (title, file, bookshelf, genre, brand, original, custom_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(file) DO UPDATE SET
               title = excluded.title,
               bookshelf = excluded.bookshelf,
               genre = excluded.genre,
               brand = excluded.brand,
               original = excluded.original,
               custom_path = excluded.custom_path",
            rusqlite::params![title, file, bookshelf, genre, brand, original, custom_path],
        )?;

        let comic = conn.query_row(
            "SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at FROM comics WHERE file = ?1",
            [&file],
            Comic::from_row,
        )?;

        Ok(comic)
    })
    .await
    .unwrap()?;

    Ok((StatusCode::CREATED, Json(comic)))
}

