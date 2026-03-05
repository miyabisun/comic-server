use std::path::PathBuf;

pub struct Config {
    pub comic_path: PathBuf,
    pub database_path: PathBuf,
    pub port: u16,
    pub base_path: String,
}

impl Config {
    pub fn from_env() -> Self {
        let comic_path =
            PathBuf::from(std::env::var("COMIC_PATH").unwrap_or_else(|_| "./comics".to_string()));
        let database_path = std::env::var("DATABASE_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| comic_path.join("comic.db"));
        let port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);
        let base_path = std::env::var("BASE_PATH")
            .unwrap_or_default()
            .trim_end_matches('/')
            .to_string();

        if !base_path.is_empty() {
            let re = regex::Regex::new(r"^/[\w\-/]*$").unwrap();
            if !re.is_match(&base_path) {
                panic!("Invalid BASE_PATH: {base_path}");
            }
        }

        Self {
            comic_path,
            database_path,
            port,
            base_path,
        }
    }
}
