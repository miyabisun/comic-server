# Reverse Proxy (Subpath Deployment)

When deploying behind a reverse proxy at a subpath (e.g., `http://example.com/comic`), set the `BASE_PATH` environment variable at **runtime only**. No rebuild is needed.

The server injects `BASE_PATH` into the frontend HTML at request time via `window.__BASE_PATH__`, and mounts all routes under the subpath prefix.

## Docker Compose with Nginx

A recommended production setup using Nginx for reverse proxy and static image serving.

### 1. `docker-compose.yml`

```yaml
services:
  comic-server:
    image: ghcr.io/miyabisun/comic-server:latest
    environment:
      - COMIC_PATH=/comics
      - BASE_PATH=/comic
    volumes:
      - /path/to/comics:/comics       # Replace with your comic folder path
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /path/to/comics:/var/www/images:ro   # Same path as above (read-only)
    depends_on:
      - comic-server
    restart: unless-stopped
```

### 2. `nginx.conf`

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

Key points:

- `location /comic/images/` must appear **before** `location /comic/` so Nginx serves images directly via `sendfile` without going through Node.js
- Both the `location` and `proxy_pass` trailing `/` are required for correct path forwarding
- `location = /comic` redirects bare `/comic` to `/comic/` for consistent routing
- The comic folder is mounted **read-only** (`:ro`) in Nginx since it only reads images. comic-server mounts the same folder with write access for registration and organization

### 3. Deploy

```bash
docker compose up -d
```

Access at `http://localhost/comic/`.

### Makefile (optional)

For redeploying after image updates:

```makefile
.PHONY: comic-deploy

comic-deploy:
	docker compose pull comic-server
	docker compose up -d comic-server
```

## Standalone (without Nginx)

For simple setups without a reverse proxy, see [Docker Compose docs](docker-compose.md).
