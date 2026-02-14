# API Reference

All endpoints are prefixed with `/api` (or `BASE_PATH/api` when using a subpath).

## Comics

### `GET /api/comics`

List all comics, ordered by creation date (newest first).

**Response**: `Comic[]`

### `POST /api/comics`

Create or upsert a comic.

**Request body**:
```json
{
  "file": "string (required, unique)",
  "title": "string (required)",
  "bookshelf": "string (default: 'unread')",
  "genre": "string | null",
  "brand": "string | null",
  "original": "string | null",
  "custom_path": "string | null"
}
```

**Response**: `201 Comic`

### `GET /api/comics/:id`

Get a comic by ID, including its image file list.

**Response**:
```json
{
  "id": 1,
  "title": "...",
  "file": "...",
  "bookshelf": "unread",
  "genre": null,
  "brand": null,
  "original": null,
  "custom_path": null,
  "created_at": "2025-01-01T00:00:00.000Z",
  "deleted_at": null,
  "images": ["001.jpg", "002.jpg"],
  "origin-images": ["001.jpg", "002.jpg", "cover.png"]
}
```

- `images`: Filtered by `custom_path` regex (if set), sorted naturally.
- `origin-images`: All image files before filtering.

### `PUT /api/comics/:id`

Update a comic. Also renames the directory on disk if `file` or `bookshelf` changes.

**Request body**: Same fields as POST (all optional except changes).

**Response**: `{ message, data }`

### `DELETE /api/comics/:id`

Soft-delete a comic. Moves the directory to `deleted/` bookshelf and sets `deleted_at`.

**Response**: `{ message, data }`

### `GET /api/comics/exist`

Check if a comic exists by filename.

**Query**: `?file=filename`

**Response**: `{ exists: boolean, comic?: Comic }`

## Parse

### `GET /api/parse`

Parse a comic directory name to extract metadata. Strips known tags (e.g., `[DL版]`) before matching.

**Query**: `?name=filename`

**Response**:
```json
{
  "title": "...",
  "genre": "",
  "brand": "",
  "original": ""
}
```

## Bookshelves

### `GET /api/bookshelves`

Get record counts for each bookshelf.

**Response**:
```json
{
  "unread": 3468,
  "like": 3369,
  "favorite": 2857,
  "hold": 1439,
  "love": 520,
  "legend": 568,
  "haystack": 20,
  "deleted": 5
}
```

### `GET /api/bookshelves/:name`

List all comics in a bookshelf, ordered by creation date (newest first).

**Response**: `Comic[]`

## Brands

### `GET /api/brands/:name`

Search comics by brand name. Splits the name by delimiters (`()、`) and searches for partial matches.

**Response**: `Comic[]`

## Register

### `POST /api/register`

Scan the `haystack/` directory and register all comic directories found. For each directory, parses metadata from the name, sanitizes the filename, and moves it to `unread/`. Duplicates are moved to `duplicates/`.

**Request body**: None

**Response**:
```json
{
  "registered": ["dir1", "dir2"],
  "duplicated": ["dir3"],
  "errors": ["dir4"]
}
```

## Images

### `GET /images/:bookshelf/:file/:path`

Serves comic image files directly from `COMIC_PATH`. Responses include `Cache-Control: public, max-age=86400`.

## Comic Model

| Field | Type | Description |
|---|---|---|
| `id` | Int | Auto-increment primary key |
| `title` | String | Display title |
| `file` | String | Unique directory name |
| `bookshelf` | String | Bookshelf name (unread, like, etc.) |
| `genre` | String? | Genre tag |
| `brand` | String? | Brand/circle name |
| `original` | String? | Original work |
| `custom_path` | String? | Regex to filter images |
| `created_at` | DateTime | Registration date |
| `deleted_at` | DateTime? | Soft-delete timestamp |
