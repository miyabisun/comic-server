mod config;
mod db;
mod error;
mod init;
mod models;
mod helpers;
mod routes;

use std::net::SocketAddr;

use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use config::Config;
use routes::{AppState, build_router};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let config = Config::from_env();

    // Open database and initialize
    let db = db::open(&config.database_path);
    {
        let conn = db.lock();
        init::init(&config.comic_path, &conn);
    }

    let state = AppState {
        db: db.clone(),
        comic_path: config.comic_path.clone(),
        base_path: config.base_path.clone(),
    };

    let app = build_router(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let base = if config.base_path.is_empty() {
        "/".to_string()
    } else {
        config.base_path.clone()
    };
    tracing::info!("Server running on http://localhost:{}{}", config.port, base);

    // Start polling task
    let poll_comic_path = config.comic_path.clone();
    let poll_db = db.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            let cp = poll_comic_path.clone();
            let d = poll_db.clone();
            if let Err(e) = tokio::task::spawn_blocking(move || {
                routes::register::register_all(&cp, &d);
            })
            .await
            {
                tracing::error!("[polling] register failed: {e}");
            }
        }
    });

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
