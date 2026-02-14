# comic-server

> [日本語ドキュメントはこちら](README.ja.md)

A self-hosted comic library server with a built-in web viewer. Point it at your image folders and browse, organize, and review your collection from the browser.

## Quick Start (Docker + Nginx)

Recommended setup: Nginx serves static images directly, comic-server handles the API and SPA.

1. Create `docker-compose.yml`:

```yaml
services:
  comic-server:
    image: ghcr.io/miyabisun/comic-server:latest
    environment:
      - COMIC_PATH=/comics
      - PORT=3000
      - BASE_PATH=/comic
    volumes:
      - /path/to/comics:/comics       # ← Replace with your comic folder path
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /path/to/comics:/var/www/images:ro   # ← Same path as above
    depends_on:
      - comic-server
    restart: unless-stopped
```

2. Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    include       mime.types;
    sendfile      on;

    upstream comic {
        server comic-server:3000;
    }

    server {
        listen 80;

        # Static images - served directly by Nginx (bypasses Node.js)
        location /comic/images/ {
            alias /var/www/images/;
            expires 1d;
            add_header Cache-Control "public, immutable";
        }

        # Application (API + SPA)
        location = /comic {
            return 301 /comic/;
        }
        location /comic/ {
            proxy_pass http://comic/comic/;
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

3. Start:

```bash
docker compose up -d
```

4. Open `http://localhost/comic/` in your browser.

> For standalone deployment (without Nginx), see [Reverse Proxy docs](docs/reverse-proxy.md#standalone-without-nginx).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `COMIC_PATH` | `./comics` | Root directory for comic image folders |
| `PORT` | `3000` | Server port |
| `BASE_PATH` | (empty) | Path prefix for reverse proxy deployment (e.g., `/comic`). Runtime only — no rebuild needed. |

The database (`comic.db`) is automatically created inside `COMIC_PATH` on first startup. Bookshelf directories are also created automatically.

## Folder Structure

Place comic folders (containing PNG/JPEG images) inside bookshelf directories under `COMIC_PATH`:

```
COMIC_PATH/
├── haystack/    # Staging area (drop folders here to register)
├── unread/      # Registered, not yet read
├── trash/       # Low quality
├── hold/        # On hold
├── like/        # Good
├── favorite/    # Great
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
| 1 | trash |
| 2 | hold |
| 3 | like |
| 4 | favorite |
| 5 | legend |

## Documentation

- [Development Guide](docs/development.md) — Local setup, build, and project structure
- [Reverse Proxy](docs/reverse-proxy.md) — Deploying under a subpath with Nginx
- [API Reference](docs/api.md) — REST API specification
