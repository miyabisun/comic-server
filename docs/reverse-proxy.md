# Reverse Proxy (Subpath Deployment)

When deploying behind a reverse proxy at a subpath (e.g., `http://example.com/comic`), set the `BASE_PATH` environment variable at **runtime only**. No rebuild is needed.

The server injects `BASE_PATH` into the frontend HTML at request time via `window.__BASE_PATH__`, and mounts all routes under the subpath prefix.

## Docker Compose

```yaml
services:
  comic-server:
    image: ghcr.io/miyabisun/comic-server:latest
    environment:
      - BASE_PATH=/comic             # Runtime: injected into frontend + server route prefix
      - COMIC_PATH=/comics
    volumes:
      - /path/to/comics:/comics
```

## Local Build

```bash
npm run build:client                    # Build frontend (no BASE_PATH needed)
BASE_PATH=/comic npm start             # Start server with subpath
```

## Nginx Configuration

```nginx
location /comic/ {
    proxy_pass http://comic-server:3000/comic/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

The trailing `/` in both `location` and `proxy_pass` is important to preserve the path correctly.
