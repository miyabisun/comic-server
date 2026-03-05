use std::fs;
use std::path::PathBuf;
use parking_lot::Mutex;

use axum::body::Body;
use axum::http::{header, StatusCode};
use axum::response::Response;

use crate::error::AppError;

struct CachedIndex {
    html: String,
    mtime: u64,
}

static CACHE: Mutex<Option<CachedIndex>> = Mutex::new(None);

fn get_index_path() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_default()
        .join("client/build/index.html")
}

pub fn get_index_html(base_path: &str) -> Option<String> {
    let index_path = get_index_path();
    let is_prod = std::env::var("NODE_ENV")
        .map(|v| v == "production")
        .unwrap_or(false);

    let mut cache = CACHE.lock();

    if is_prod {
        if let Some(ref cached) = *cache {
            return Some(cached.html.clone());
        }
    }

    let metadata = fs::metadata(&index_path).ok()?;
    let mtime = metadata
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;

    if let Some(ref cached) = *cache {
        if cached.mtime == mtime {
            return Some(cached.html.clone());
        }
    }

    let raw = fs::read_to_string(&index_path).ok()?;
    let html = raw
        .replace("<head>", &format!("<head>\n\t\t<base href=\"{base_path}/\">"))
        .replace(
            "window.__BASE_PATH__ = \"\"",
            &format!(
                "window.__BASE_PATH__ = {}",
                serde_json::to_string(base_path).unwrap()
            ),
        );

    *cache = Some(CachedIndex {
        html: html.clone(),
        mtime,
    });

    Some(html)
}

pub async fn spa_fallback(
    axum::extract::State(state): axum::extract::State<super::AppState>,
) -> Result<Response, AppError> {
    let html = get_index_html(&state.base_path);
    match html {
        Some(html) => Ok(Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(html))
            .unwrap()),
        None => Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                r#"{"error":"Frontend not built. Run: bun run build:client"}"#,
            ))
            .unwrap()),
    }
}

pub async fn serve_assets(
    axum::extract::Path(path): axum::extract::Path<String>,
) -> Result<Response, AppError> {
    let assets_dir = std::env::current_dir()
        .unwrap_or_default()
        .join("client/build/assets");
    let file_path = assets_dir.join(&path);

    // Path traversal check
    let resolved_base = fs::canonicalize(&assets_dir)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let resolved_file = fs::canonicalize(&file_path)
        .map_err(|_| AppError::NotFound("Not found".to_string()))?;
    if !resolved_file.starts_with(&resolved_base) {
        return Err(AppError::Forbidden);
    }

    if !resolved_file.is_file() {
        return Err(AppError::NotFound("Not found".to_string()));
    }

    let mime = mime_guess::from_path(&file_path)
        .first_or_octet_stream()
        .to_string();

    let contents = tokio::fs::read(&file_path)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(Body::from(contents))
        .unwrap())
}
