# Reverse Proxy (Subpath Deployment)

When deploying behind a reverse proxy at a subpath (e.g., `http://example.com/comic`), `BASE_PATH` must be set at **both build time and runtime**.

## Why Both?

- **Build time**: SvelteKit bakes `BASE_PATH` into the frontend HTML/JS (navigation links, asset paths). Changing the subpath requires rebuilding the client.
- **Runtime**: Hono uses `BASE_PATH` to mount all routes (`/api`, `/images`, static files) under the subpath prefix.

## Docker Compose (build from source)

```yaml
services:
  comic-server:
    build:
      context: ./comic-server
      args:
        - BASE_PATH=/comic           # Build-time: baked into frontend
    environment:
      - BASE_PATH=/comic             # Runtime: server route prefix
      - COMIC_PATH=/comics
    volumes:
      - /path/to/comics:/comics
```

> **Note**: The pre-built `ghcr.io/miyabisun/comic-server:latest` image is built with `BASE_PATH=""` (root). To use a subpath, you must build the image yourself with the `BASE_PATH` build arg.

## Local Build

```bash
BASE_PATH=/comic npm run build:client   # Build frontend with subpath
BASE_PATH=/comic npm start              # Start server with subpath
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
