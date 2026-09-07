# comic-server

> [日本語ドキュメントはこちら](README.ja.md)

A self-hosted comic library server with a built-in web viewer. Point it at your image folders and browse, organize, and review your collection from the browser.

## Quick Start (Docker)

```bash
docker run -p 3000:3000 -v /path/to/comics:/comics -e COMIC_PATH=/comics ghcr.io/miyabisun/comic-server:latest
```

Open `http://localhost:3000` in your browser.

## Quick Start (Bun)

```bash
bun install && bun run build:client
COMIC_PATH=/path/to/comics bun start
```

Open `http://localhost:3000` in your browser.

> To deploy under an Nginx subpath, see [Reverse Proxy docs](docs/reverse-proxy.md).

## Environment variables

All server settings below are optional. `bun start` reads `.env` through Bun's
`--env-file` option; containers receive their settings through `environment` / `-e`.
Relative paths are resolved from the process working directory.

| Variable | Default when unset | Purpose and handling of empty / invalid values |
|---|---|---|
| `COMIC_PATH` | `./comics` | Root directory for comic folders. Empty uses the default. Inaccessible paths can fail database opening or directory creation at startup; there is no separate path validation. |
| `DATABASE_PATH` | `COMIC_PATH/comic.db` | SQLite file. Empty uses the default. An unusable file or missing parent directory fails at database opening. |
| `PORT` | `3000` | Server port. Converted with `Number(value)`; empty, whitespace, zero and nonnumeric values fall back to `3000`. Other numbers are passed to Bun without application range validation. |
| `BASE_PATH` | Empty (root) | Runtime URL prefix, e.g. `/comic`. Trailing slashes are removed (`/` becomes root). Nonempty values must start with `/` and contain only ASCII letters, digits, `_`, `-` and `/`; other values fail startup. No rebuild needed. |
| `UPSCALE_SCRIPT_PATH` | Repository `scripts/upscale-images.sh` (absolute path derived from the source location) | Script run by `bash` for API upscale jobs. Empty uses the default. No startup validation; a missing or unusable script fails the job when invoked. |
| `NODE_ENV` | Check HTML modification time before reusing the cache | `production` keeps the first SPA HTML cache. Every other value, including empty or unknown values, checks for updates. The Docker image explicitly sets `production`. |

The database is opened before bookshelf directories are created, so its parent directory
must already exist. The default SQLite file is inside `COMIC_PATH`; setting `DATABASE_PATH`
changes that location. The Docker image explicitly sets `PORT=3000`, but does not set
`COMIC_PATH`: the volume path and `COMIC_PATH` must agree, as in the
[Compose example](docs/docker-compose.md).

### Image-processing scripts and OS environment

These optional settings are consumed by the bundled scripts, not by the server parser.
The API inherits the server process environment when starting the upscale script.
Empty values use the defaults.

| Variable | Default when unset | Consumer and invalid-value handling |
|---|---|---|
| `RCUGAN_BIN` | `realcugan-ncnn-vulkan` | Both image scripts: executable name or path. Missing executable fails the script's dependency check. |
| `RCUGAN_NOISE` | `-1` | `scripts/upscale-images.sh`: passed directly to Real-CUGAN's `-n` option; no script validation. Rejected values fail image processing. |

`scripts/resize-images.sh` currently downsizes with ImageMagick and only checks that
`RCUGAN_BIN` exists. Its `RCUGAN_MODEL` assignment and noise option do not affect processing.

`PATH` is the OS executable search path for `bash`, ImageMagick (`magick`) and Real-CUGAN.
The current Docker image does not bundle the image-processing scripts or these processing
tools. API upscaling requires installing them and making the script available at
`UPSCALE_SCRIPT_PATH` in the runtime environment.
The maintenance CLI `scripts/fix-filenames.ts` uses the same `COMIC_PATH` and `DATABASE_PATH`
defaults as the server. Build and test environment settings are not server configuration.

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

### 3. Register via API

After placing a folder in `haystack/`, call the registration API with the folder name:

```bash
curl -X POST http://localhost:3000/api/regist \
  -H 'Content-Type: application/json' \
  -d '{"name": "(同人誌) [Circle Name] My Comic Title (Original Work)"}'
```

The folder is:

1. Parsed to extract metadata from the folder name
2. Registered in the database as `unread`
3. Moved from `haystack/` to `unread/`

If a comic with the same name already exists, the folder is moved to `duplicates/` instead.

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
