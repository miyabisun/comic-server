# comic-server

> [日本語ドキュメントはこちら](README.ja.md)

A self-hosted comic library server with a built-in web viewer. Point it at your image folders and browse, organize, and review your collection from the browser.

## Quick Start (Docker)

1. Create a `docker-compose.yml`:

```yaml
services:
  comic-server:
    image: ghcr.io/miyabisun/comic-server:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - /path/to/comics:/comics    # ← Replace with your comic folder path
    environment:
      - DATABASE_URL=file:/app/data/comic.db
      - COMIC_PATH=/comics
      - PORT=3000
```

2. Start the server:

```bash
docker compose up -d
```

3. Open `http://localhost:3000` in your browser.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./prisma/comic.db` | Database file path |
| `COMIC_PATH` | `./comics` | Root directory for comic image folders |
| `PORT` | `3000` | Server port |
| `BASE_PATH` | (empty) | Path prefix for reverse proxy deployment (e.g., `/comic`) |

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

## Documentation

- [Development Guide](docs/development.md) — Local setup, build, and project structure
- [Reverse Proxy](docs/reverse-proxy.md) — Deploying under a subpath with Nginx
- [API Reference](docs/api.md) — REST API specification
