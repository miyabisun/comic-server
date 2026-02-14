# Docker Compose

For a single-container deployment without a reverse proxy.

## docker-compose.yml

```yaml
services:
  comic-server:
    image: ghcr.io/miyabisun/comic-server:latest
    ports:
      - "3000:3000"
    volumes:
      - /path/to/comics:/comics
    environment:
      - COMIC_PATH=/comics
```

Replace `/path/to/comics` with the actual path to your comic image folders.

## Deploy

```bash
docker compose up -d
```

Access at `http://localhost:3000`.

## Update

```bash
docker compose pull
docker compose up -d
```

## Advanced

To deploy behind a reverse proxy at a subpath (e.g., `http://example.com/comic`), see [Reverse Proxy docs](reverse-proxy.md).
