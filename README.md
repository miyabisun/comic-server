# comic-server

> [日本語ドキュメントはこちら](README.ja.md)

A self-hosted comic library server with a built-in web viewer. Point it at your image folders and browse, organize, and review your collection from the browser.

## Quick Start (Docker)

```bash
docker run -p 3000:3000 -v /path/to/comics:/comics ghcr.io/miyabisun/comic-server:latest
```

Open `http://localhost:3000` in your browser.

## Quick Start (Bun)

```bash
bun install && bun run build:client
COMIC_PATH=/path/to/comics bun start
```

Open `http://localhost:3000` in your browser.

> To deploy under an Nginx subpath, see [Reverse Proxy docs](docs/reverse-proxy.md).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `COMIC_PATH` | `./comics` | Root directory for comic image folders |
| `DATABASE_PATH` | `COMIC_PATH/comic.db` | Path to SQLite database file |
| `PORT` | `3000` | Server port |
| `BASE_PATH` | (empty) | Path prefix for reverse proxy deployment (e.g., `/comic`). Runtime only — no rebuild needed. |

The database (`comic.db`) is automatically created inside `COMIC_PATH` on first startup. Bookshelf directories are also created automatically.

## Folder Structure

Place comic folders (containing PNG/JPEG images) inside bookshelf directories under `COMIC_PATH`:

```
COMIC_PATH/
├── haystack/    # Staging area (drop folders here to register)
├── unread/      # Registered, not yet read
├── hold/        # On hold
├── like/        # Good
├── favorite/    # Great
├── love/        # Excellent
├── legend/      # Best
└── deleted/     # Soft-deleted
```

## Usage

### 1. Start the server

All bookshelf directories (including `haystack/`) are created automatically on first startup.

### 2. Add comics to `haystack/`

Place folders containing image files (`.jpg`, `.png`) into the `haystack/` directory.

Folder names should follow the format `(genre) [brand] title (original)`:

```
haystack/
├── (同人誌) [Circle Name] My Comic Title (Original Work)/
│   ├── 001.jpg
│   ├── 002.jpg
│   └── ...
├── (成年コミック) [Author Name] Another Title [DL版]/
│   └── ...
└── (同人CG集) [Studio Name] CG Collection Name (Series Name)/
    └── ...
```

Each part is parsed automatically into database fields:

| Part | Example | DB field |
|------|---------|----------|
| `(genre)` | `(同人誌)` | `genre` |
| `[brand]` | `[Circle Name]` | `brand` |
| title | `My Comic Title` | `title` |
| `(original)` | `(Original Work)` | `original` |

### 3. Wait for auto-registration

The server scans `haystack/` every 60 seconds. Each folder is:

1. Parsed to extract metadata from the folder name
2. Registered in the database as `unread`
3. Moved from `haystack/` to `unread/`

If a comic with the same name already exists, the folder is moved to `duplicates/` instead.

You can also trigger registration immediately via `POST /api/register`.

### 4. Browse and rate

Open the web UI, navigate to the `unread` bookshelf, and click a comic to read it. Tap the stars to rate and move comics between bookshelves:

| Stars | Bookshelf |
|-------|-----------|
| 1 | hold |
| 2 | like |
| 3 | favorite |
| 4 | love |
| 5 | legend |

## Documentation

- [Docker Compose](docs/docker-compose.md) — Deploying with Docker Compose
- [Reverse Proxy](docs/reverse-proxy.md) — Deploying under a subpath with Nginx
- [Development Guide](docs/development.md) — Local setup, build, and project structure
- [API Reference](docs/api.md) — REST API specification
