# Development Guide

## Architecture

| Layer | Technology | Role |
|---|---|---|
| Backend | Rust (Axum + rusqlite) | REST API, image serving, static file hosting |
| Frontend | Svelte 5 + Vite (SPA) | Browser UI, built as static files |
| Database | SQLite via rusqlite | Comic metadata storage |
| Image storage | Local filesystem | Mounted directory of comic image folders |

## Project Structure

```
comic-server/
├── Cargo.toml
├── src/                       # Backend (Rust)
│   ├── main.rs                # Entry point (init, router, polling, serve)
│   ├── config.rs              # Config (COMIC_PATH, DATABASE_PATH, PORT, BASE_PATH)
│   ├── db.rs                  # rusqlite Connection init, PRAGMAs, Db type
│   ├── models.rs              # Comic struct, request/response types
│   ├── error.rs               # AppError enum, IntoResponse impl
│   ├── init.rs                # Directory + table initialization
│   ├── routes/
│   │   ├── mod.rs             # Router construction
│   │   ├── comics.rs          # GET/POST/PUT/DELETE /api/comics, /api/parse
│   │   ├── bookshelves.rs     # GET /api/bookshelves/:name
│   │   ├── brands.rs          # GET /api/brands/:name
│   │   ├── register.rs        # POST /api/register
│   │   ├── duplicates.rs      # GET/DELETE /api/duplicates
│   │   ├── images.rs          # GET /images/* (static image serving)
│   │   └── spa.rs             # SPA fallback + /assets/*
│   └── helpers/
│       ├── mod.rs
│       ├── parse_comic_name.rs
│       ├── sanitize_filename.rs
│       ├── normalize_brackets.rs
│       └── natural_sort.rs
├── client/                    # Frontend (Svelte 5 + Vite) — unchanged
│   ├── index.html
│   ├── src/
│   └── vite.config.js
├── Dockerfile
└── .github/workflows/
    └── release.yml            # CI/CD → ghcr.io
```

## Prerequisites

- Rust (latest stable)
- Node.js 22+ (for frontend build)

## Setup

```bash
# Build frontend
cd client && npm install && cd ..

# Build backend
cargo build
```

The database and bookshelf directories are created automatically on first server startup.

## Development

```bash
# Terminal 1: Backend
COMIC_PATH=/path/to/comics cargo run

# Terminal 2: Frontend dev server (port 5173, proxies API to backend)
cd client && npx vite dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` and `/images` requests to the backend.

## Production Build

```bash
cd client && npm install && npm run build && cd ..
cargo build --release
COMIC_PATH=/path/to/comics ./target/release/comic-server
```

The built frontend is served by Axum at `http://localhost:3000`.

## Docker

### Build locally

```bash
docker build -t comic-server .
```

### CI/CD

Push to `main` triggers GitHub Actions (`.github/workflows/release.yml`):

1. Builds Docker image (3-stage: Node.js client build → Rust build → slim runtime)
2. Pushes to `ghcr.io/miyabisun/comic-server:latest`

Requires repository Settings > Actions > General > Workflow permissions set to "Read and write".

## Notes

- `BASE_PATH` is injected at runtime by the server when serving `index.html`. No rebuild is needed to change the subpath. See [reverse-proxy.md](reverse-proxy.md).
