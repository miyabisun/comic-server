# Development Guide

## Architecture

| Layer | Technology | Role |
|---|---|---|
| Backend | Hono (Node.js) | REST API, image serving, static file hosting |
| Frontend | Svelte 5 + Vite (SPA) | Browser UI, built as static files |
| Database | SQLite via Prisma | Comic metadata storage |
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
│   │   └── register.ts     # POST /api/register
│   ├── lib/                # Shared utilities
│   │   ├── db.ts           # Prisma client
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
├── prisma/
│   └── schema.prisma       # Database schema (SQLite)
├── Dockerfile
├── docker-compose.yml
└── .github/workflows/
    └── release.yml         # CI/CD → ghcr.io
```

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
# Install dependencies
npm install
cd client && npm install && cd ..
```

The database and bookshelf directories are created automatically on first server startup.

## Development

Start backend and frontend in separate terminals:

```bash
# Terminal 1: Backend (port 3000)
COMIC_PATH=/path/to/comics npm run dev

# Terminal 2: Frontend (port 5173, proxies API to backend)
npm run dev:client
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` and `/images` requests to the backend.

## Production Build

```bash
npm run build:client
COMIC_PATH=/path/to/comics npm start
```

The built frontend is served by Hono at `http://localhost:3000`.

## npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start backend with tsx |
| `npm run dev:client` | Start frontend dev server (Vite) |
| `npm run build:client` | Build frontend for production |
| `npm run build` | Alias for `build:client` |
| `npm start` | Start production server |
| `npm run db:push` | Sync Prisma schema to database |
| `npm run db:migrate` | Create Prisma migration |

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
