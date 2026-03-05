use std::path::Path;
use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::Connection;

pub type Db = Arc<Mutex<Connection>>;

pub fn open(path: &Path) -> Db {
    tracing::info!("Database: {}", path.display());
    let conn = Connection::open(path).expect("Failed to open database");
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = -64000;
         PRAGMA temp_store = MEMORY;",
    )
    .expect("Failed to set PRAGMAs");
    Arc::new(Mutex::new(conn))
}
