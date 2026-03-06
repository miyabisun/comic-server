use std::path::PathBuf;

use axum::routing::{delete, get, post, put};
use axum::Router;

use crate::db::Db;

pub mod bookshelves;
pub mod brands;
pub mod comics;
pub mod duplicates;
pub mod images;
pub mod register;
pub mod spa;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub comic_path: PathBuf,
    pub base_path: String,
}

pub fn build_router(state: AppState) -> Router {
    let api = Router::new()
        .route("/api/comics", get(comics::list_comics))
        .route("/api/comics", post(comics::create_comic))
        .route("/api/comics/exist", get(comics::check_exist))
        .route("/api/comics/{id}", get(comics::get_comic))
        .route("/api/comics/{id}", put(comics::update_comic))
        .route("/api/comics/{id}", delete(comics::delete_comic))
        .route("/api/parse", get(comics::parse))
        .route("/api/bookshelves", get(bookshelves::list_bookshelves))
        .route("/api/bookshelves/{name}", get(bookshelves::get_bookshelf))
        .route("/api/brands/{name}", get(brands::get_brand))
        .route("/api/register", post(register::post_register))
        .route("/api/duplicates", get(duplicates::list_duplicates))
        .route(
            "/api/duplicates/{name}",
            delete(duplicates::delete_duplicate),
        )
        .route("/images/{*path}", get(images::serve_image))
        .route("/assets/{*path}", get(spa::serve_assets))
        .route("/favicon.ico", get(spa::serve_favicon))
        .route("/", get(spa::spa_fallback))
        .fallback(spa::spa_fallback)
        .with_state(state.clone());

    let base_path = &state.base_path;
    if base_path.is_empty() {
        api
    } else {
        let bp = state.base_path.clone();
        let trailing = format!("{base_path}/");
        Router::new()
            .nest(base_path, api)
            .route(
                &trailing,
                get(move || async move {
                    spa::spa_fallback_with_base(&bp).await
                }),
            )
    }
}
