# Development Guide

## Architecture

| Layer | Technology | Role |
|---|---|---|
| Backend | Hono (Bun) | REST API, image serving, static file hosting |
| Frontend | Svelte 5 + Vite (SPA) | Browser UI, built as static files |
| Database | SQLite via Drizzle ORM | Comic metadata storage |
| Image storage | Local filesystem | Mounted directory of comic image folders |

## Project Structure

```
comic-server/
├── src/                    # Backend (TypeScript)
│   ├── index.ts            # Hono server entry point
│   ├── routes/             # API route handlers
│   │   ├── comics.ts       # CRUD /api/comics, GET /api/parse
│   │   ├── bookshelves.ts  # GET /api/bookshelves/:name
│   │   ├── brands.ts       # GET /api/brands/:name
│   │   ├── duplicates.ts   # GET /api/duplicates
│   │   └── register.ts     # POST /api/register
│   ├── db/                 # Database layer
│   │   ├── index.ts        # Drizzle + bun:sqlite connection
│   │   └── schema.ts       # Drizzle schema definition
│   ├── lib/                # Shared utilities
│   │   ├── config.ts       # COMIC_PATH, DATABASE_PATH
│   │   ├── init.ts         # DB/directory initialization
│   │   ├── spa.ts          # SPA index.html serving
│   │   ├── parse-comic-name.ts
│   │   ├── sanitize-filename.ts
│   │   └── normalize-brackets.ts
│   └── types.d.ts
├── client/                 # Frontend (Svelte 5 + Vite)
│   ├── index.html          # Vite entry HTML
│   ├── src/
│   │   ├── main.js         # Svelte mount point
│   │   ├── App.svelte      # Layout + router + global styles
│   │   ├── pages/          # Page components
│   │   │   ├── Home.svelte
│   │   │   ├── Bookshelf.svelte
│   │   │   ├── Brand.svelte
│   │   │   └── Comic.svelte
│   │   └── lib/            # Components, helpers
│   │       ├── router.svelte.js  # Minimal SPA router
│   │       ├── config.js
│   │       └── components/
│   └── vite.config.js
├── drizzle.config.ts       # Drizzle Kit configuration
├── Dockerfile
└── .github/workflows/
    └── release.yml         # CI/CD → ghcr.io
```

## Prerequisites

- Bun

## Setup

```bash
# Install dependencies
bun install
cd client && bun install && cd ..
```

The database and bookshelf directories are created automatically on first server startup.

## Development

Start backend and frontend in separate terminals:

```bash
# Terminal 1: Backend (port 3000)
COMIC_PATH=/path/to/comics bun run dev

# Terminal 2: Frontend (port 5173, proxies API to backend)
cd client && bunx vite dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` and `/images` requests to the backend.

## Production Build

```bash
bun run build:client
COMIC_PATH=/path/to/comics bun start
```

The built frontend is served by Hono at `http://localhost:3000`.

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start backend + frontend watch build |
| `bun run build:client` | Build frontend for production |
| `bun run build` | Alias for `build:client` |
| `bun start` | Start production server |
| `bun test` | Run tests |

## Docker

### Build locally

```bash
docker build -t comic-server .
```

### CI/CD

Push to `main` triggers GitHub Actions (`.github/workflows/release.yml`):

1. Builds Docker image
2. Pushes to `ghcr.io/miyabisun/comic-server:latest`

Requires repository Settings > Actions > General > Workflow permissions set to "Read and write".

## Notes

- `BASE_PATH` is injected at runtime by the server when serving `index.html`. No rebuild is needed to change the subpath. See [reverse-proxy.md](reverse-proxy.md).
