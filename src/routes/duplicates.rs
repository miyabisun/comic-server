use std::fs;

use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

use crate::error::AppError;
use crate::helpers::sanitize_filename::sanitize_filename;
use crate::models::DuplicateEntry;

use super::AppState;

pub async fn list_duplicates(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let db = state.db.clone();
    let comic_path = state.comic_path.clone();

    let result = tokio::task::spawn_blocking(move || {
        let duplicates_dir = comic_path.join("duplicates");
        if !duplicates_dir.exists() {
            return vec![];
        }

        let entries: Vec<String> = match fs::read_dir(&duplicates_dir) {
            Ok(rd) => rd
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
                .filter_map(|e| e.file_name().into_string().ok())
                .collect(),
            Err(_) => return vec![],
        };

        if entries.is_empty() {
            return vec![];
        }

        let conn = db.lock();
        let sanitized_map: Vec<(String, String)> = entries
            .iter()
            .map(|name| (sanitize_filename(name), name.clone()))
            .collect();

        let sanitized_keys: Vec<&str> = sanitized_map.iter().map(|(k, _)| k.as_str()).collect();
        let placeholders: Vec<String> = (1..=sanitized_keys.len())
            .map(|i| format!("?{i}"))
            .collect();
        let sql = format!(
            "SELECT id, bookshelf, file FROM comics WHERE file IN ({})",
            placeholders.join(", ")
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        let params: Vec<&dyn rusqlite::types::ToSql> = sanitized_keys
            .iter()
            .map(|s| s as &dyn rusqlite::types::ToSql)
            .collect();
        let existing: std::collections::HashMap<String, (i64, String)> = stmt
            .query_map(&*params, |row| {
                Ok((
                    row.get::<_, String>(2)?,
                    (row.get::<_, i64>(0)?, row.get::<_, String>(1)?),
                ))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        entries
            .into_iter()
            .map(|name| {
                let sanitized = sanitize_filename(&name);
                let (existing_id, existing_bookshelf) = existing
                    .get(&sanitized)
                    .map(|(id, bs)| (Some(*id), Some(bs.clone())))
                    .unwrap_or((None, None));
                DuplicateEntry {
                    name,
                    existing_id,
                    existing_bookshelf,
                }
            })
            .collect()
    })
    .await
    .unwrap();

    Ok(Json(result))
}

pub async fn delete_duplicate(
    State(state): State<AppState>,
    axum::extract::Path(name): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let comic_path = state.comic_path.clone();
    let decoded = urlencoding::decode(&name)
        .unwrap_or(std::borrow::Cow::Borrowed(&name))
        .to_string();

    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        let duplicates_dir = comic_path.join("duplicates");
        let target = duplicates_dir.join(&decoded);
        let resolved_base = fs::canonicalize(&duplicates_dir)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let resolved_target =
            fs::canonicalize(&target).map_err(|_| AppError::NotFound("Not found".to_string()))?;

        if !resolved_target.starts_with(&resolved_base) {
            return Err(AppError::Forbidden);
        }

        if !resolved_target.exists() {
            return Err(AppError::NotFound("Not found".to_string()));
        }

        fs::remove_dir_all(&resolved_target).map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(())
    })
    .await
    .unwrap()?;

    Ok(Json(json!({ "message": "Deleted" })))
}
