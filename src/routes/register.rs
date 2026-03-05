use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;

use crate::db::Db;
use crate::error::AppError;
use crate::helpers::parse_comic_name::parse_comic_name;
use crate::helpers::sanitize_filename::sanitize_filename;
use crate::models::RegisterResult;

use super::AppState;

static RUNNING: AtomicBool = AtomicBool::new(false);

pub fn register_all(comic_path: &PathBuf, db: &Db) -> RegisterResult {
    if RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return RegisterResult {
            registered: vec![],
            duplicated: vec![],
            errors: vec![],
        };
    }

    let result = _register_all(comic_path, db);
    RUNNING.store(false, Ordering::SeqCst);
    result
}

fn _register_all(comic_path: &PathBuf, db: &Db) -> RegisterResult {
    let haystack_dir = comic_path.join("haystack");
    let duplicates_dir = comic_path.join("duplicates");
    let unread_dir = comic_path.join("unread");

    let empty = RegisterResult {
        registered: vec![],
        duplicated: vec![],
        errors: vec![],
    };

    if !haystack_dir.exists() {
        return empty;
    }

    let entries: Vec<String> = match fs::read_dir(&haystack_dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
            .filter_map(|e| e.file_name().into_string().ok())
            .collect(),
        Err(_) => return empty,
    };

    if entries.is_empty() {
        return empty;
    }

    // Batch lookup for existing comics
    let conn = db.lock();
    let sanitized_names: Vec<String> = entries.iter().map(|n| sanitize_filename(n)).collect();

    let placeholders: Vec<String> = (1..=sanitized_names.len())
        .map(|i| format!("?{i}"))
        .collect();
    let sql = format!(
        "SELECT id, bookshelf, file FROM comics WHERE file IN ({})",
        placeholders.join(", ")
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let params: Vec<&dyn rusqlite::types::ToSql> = sanitized_names
        .iter()
        .map(|s| s as &dyn rusqlite::types::ToSql)
        .collect();
    let existing: Vec<(i64, String, String)> = stmt
        .query_map(&*params, |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    let existing_by_file: std::collections::HashMap<String, (i64, String)> = existing
        .into_iter()
        .map(|(id, bookshelf, file)| (file, (id, bookshelf)))
        .collect();

    let mut registered = Vec::new();
    let mut duplicated = Vec::new();
    let mut errors = Vec::new();

    for (i, name) in entries.iter().enumerate() {
        let sanitized_name = &sanitized_names[i];

        if let Some((existing_id, existing_bookshelf)) = existing_by_file.get(sanitized_name) {
            // Duplicate
            fs::create_dir_all(&duplicates_dir).ok();
            let dest = duplicates_dir.join(name);
            if dest.exists() {
                fs::remove_dir_all(&dest).ok();
            }
            if let Err(e) = fs::rename(haystack_dir.join(name), &dest) {
                tracing::error!("[register] failed to move duplicate {name}: {e}");
                errors.push(name.clone());
                continue;
            }
            tracing::warn!(
                "[register] duplicate moved to duplicates/: {name} (id: {existing_id}, bookshelf: {existing_bookshelf})"
            );
            duplicated.push(name.clone());
            continue;
        }

        let parsed = parse_comic_name(name);
        let title = if parsed.title.is_empty() {
            name.clone()
        } else {
            parsed.title
        };
        let genre: Option<&str> = if parsed.genre.is_empty() {
            None
        } else {
            Some(&parsed.genre)
        };
        let brand: Option<&str> = if parsed.brand.is_empty() {
            None
        } else {
            Some(&parsed.brand)
        };
        let original: Option<&str> = if parsed.original.is_empty() {
            None
        } else {
            Some(&parsed.original)
        };

        // Move file first, then insert into DB
        fs::create_dir_all(&unread_dir).ok();
        if let Err(e) = fs::rename(haystack_dir.join(name), unread_dir.join(sanitized_name)) {
            tracing::error!("[register] failed to move {name}: {e}");
            errors.push(name.clone());
            continue;
        }

        match conn.execute(
            "INSERT INTO comics (title, file, bookshelf, genre, brand, original) VALUES (?1, ?2, 'unread', ?3, ?4, ?5)",
            rusqlite::params![title, sanitized_name, genre, brand, original],
        ) {
            Ok(_) => {
                tracing::info!("[register] registered: {name} -> unread/{sanitized_name}");
                registered.push(name.clone());
            }
            Err(e) => {
                // Rollback: move file back to haystack
                fs::rename(unread_dir.join(sanitized_name), haystack_dir.join(name)).ok();
                tracing::error!("[register] failed to insert {name}: {e}");
                errors.push(name.clone());
            }
        }
    }

    if !registered.is_empty() || !duplicated.is_empty() || !errors.is_empty() {
        tracing::info!(
            "[register] summary: {} registered, {} duplicated, {} errors",
            registered.len(),
            duplicated.len(),
            errors.len()
        );
    }

    RegisterResult {
        registered,
        duplicated,
        errors,
    }
}

pub async fn post_register(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let comic_path = state.comic_path.clone();
    let db = state.db.clone();
    let result = tokio::task::spawn_blocking(move || register_all(&comic_path, &db))
        .await
        .unwrap();
    Ok(Json(result))
}
