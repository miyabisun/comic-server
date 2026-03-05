use std::fs;

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::Response;

use crate::error::AppError;

use super::AppState;

pub async fn serve_image(
    State(state): State<AppState>,
    axum::extract::Path(req_path): axum::extract::Path<String>,
) -> Result<Response, AppError> {
    let comic_path = state.comic_path.clone();

    let decoded = urlencoding::decode(&req_path)
        .unwrap_or(std::borrow::Cow::Borrowed(&req_path))
        .to_string();

    let file_path = comic_path.join(&decoded);

    // Canonicalize for path traversal check
    let resolved_base =
        fs::canonicalize(&comic_path).map_err(|e| AppError::Internal(e.to_string()))?;

    let resolved_file = match fs::canonicalize(&file_path) {
        Ok(p) => p,
        Err(_) => return Err(AppError::NotFound("Not found".to_string())),
    };

    if !resolved_file.starts_with(&resolved_base) {
        return Err(AppError::Forbidden);
    }

    if !resolved_file.is_file() {
        return Err(AppError::NotFound("Not found".to_string()));
    }

    let mime = mime_guess::from_path(&resolved_file)
        .first_or_octet_stream()
        .to_string();

    let metadata = fs::metadata(&resolved_file)?;
    let size = metadata.len();

    let contents = tokio::fs::read(&resolved_file)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, size)
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(contents))
        .unwrap())
}
