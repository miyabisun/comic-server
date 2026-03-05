use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;

use crate::error::AppError;
use crate::models::Comic;

use super::AppState;

fn expand_brand_name(name: &str) -> Vec<String> {
    let mut parts: Vec<String> = name
        .split(|c| c == '(' || c == ')' || c == '、')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    // Ensure original name is first
    if !parts.contains(&name.to_string()) {
        parts.insert(0, name.to_string());
    }

    // Deduplicate while preserving order
    let mut seen = std::collections::HashSet::new();
    parts.retain(|p| seen.insert(p.clone()));
    parts
}

pub async fn get_brand(
    State(state): State<AppState>,
    axum::extract::Path(name): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let db = state.db.clone();
    let unique_names = expand_brand_name(&name);

    let comics = tokio::task::spawn_blocking(move || {
        let conn = db.lock();
        // Build dynamic WHERE clause with LIKE for each name variant
        let conditions: Vec<String> = unique_names
            .iter()
            .enumerate()
            .map(|(i, _)| format!("brand LIKE ?{}", i + 1))
            .collect();
        let where_clause = conditions.join(" OR ");
        let sql = format!(
            "SELECT id, title, file, bookshelf, genre, brand, original, custom_path, created_at, deleted_at
             FROM comics WHERE {where_clause} ORDER BY created_at DESC"
        );
        let mut stmt = conn.prepare(&sql).unwrap();
        let params: Vec<String> = unique_names.iter().map(|n| format!("%{n}%")).collect();
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p as &dyn rusqlite::types::ToSql).collect();
        let rows = stmt
            .query_map(&*param_refs, Comic::from_row)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        rows
    })
    .await
    .unwrap();

    Ok(Json(comics))
}
