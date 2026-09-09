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
| `RCUGAN_BIN` | `realcugan-ncnn-vulkan` | `scripts/upscale-images.sh`: executable name or path. Missing executable fails the script's dependency check. |
| `RCUGAN_NOISE` | `-1` | `scripts/upscale-images.sh`: passed directly to Real-CUGAN's `-n` option; no script validation. Rejected values fail image processing. |

`scripts/resize-images.sh` requires ImageMagick 7 (`magick`) and standard shell tools.
It downsizes images exceeding 3840×2160 to fit those bounds and skips smaller images;
it does not upscale. JPEG output uses quality 95 and PNG output uses maximum compression.
Remove the obsolete `-n` / `--noise` option from existing resize commands (it now fails
as an unknown option), and remove resize-only `RCUGAN_BIN` / `RCUGAN_MODEL` settings.
`RCUGAN_*` variables have no effect on resizing; keep the settings needed by
`scripts/upscale-images.sh` when using that separate script.

`PATH` is the OS executable search path for `bash`, ImageMagick (`magick`) and Real-CUGAN.
The current Docker image does not bundle the image-processing scripts or these processing
tools. API upscaling requires installing them and making the script available at
`UPSCALE_SCRIPT_PATH` in the runtime environment.
The maintenance CLI `scripts/fix-filenames.ts` uses the same `COMIC_PATH` and `DATABASE_PATH`
defaults as the server. Build and test environment settings are not server configuration.

## Folder Structure

The `/images/*` endpoint serves PNG/JPEG files only, checking the resolved file extension and signature. Files outside `COMIC_PATH`, private `.remaster` staging, databases and other non-image files are refused, including symlink aliases. Image bytes are streamed without re-encoding.

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

## Remaster (MangaJaNai)

MangaJaNai is integrated into comic-server's separate **remaster** feature.
Open a comic's information dialog and choose **リマスターを開始**. The original stays
in place; only a completely processed comic is registered on the `unread` shelf.
Its directory and title receive ` [リマスター版]`. Starting again returns the existing
result, including after a rename. Existing output directories are never overwritten,
and a remastered comic cannot be remastered again. Failed/cancelled jobs can be retried.

The runtime is a Rust `comic-remaster` child process using **ONNX Runtime 1.29.0 (CPU)**.
The current Docker build targets Linux x86-64 and includes the helper, runtime library,
models, and license notices. There is no Python or GUI inference environment in the
production image. Local Bun installations need the following one-time build:

```bash
cargo build --release --locked
python3 -m venv /tmp/comic-model-build
/tmp/comic-model-build/bin/pip install -r remaster/requirements-build.txt
/tmp/comic-model-build/bin/python remaster/prepare-models.py remaster/models
```

Install the [official ONNX Runtime 1.29.0 CPU archive](https://github.com/microsoft/onnxruntime/releases/tag/v1.29.0)
and set `ORT_DYLIB_PATH` to its `lib/libonnxruntime.so.1.29.0`. The Rust binary defaults
to `target/release/comic-remaster` (`REMASTER_BIN` overrides it); models default to
`remaster/models` (`REMASTER_MODEL_DIR` overrides it). These are administrator settings,
not request-controlled paths. The build-only Python environment can then be removed.

### Models, input range, and limits

- Seven **2x MangaJaNai V1 ESRGAN** models cover grayscale manga; the nearest input
  height among 1200/1300/1400/1500/1600/1920/2048 is selected for the whole page.
- Color pages use **2x IllustrationJaNai V1 ESRGAN 120k**. Detection is conservative:
  any pixel with a channel spread above 3/255 routes the page to the color model.
  Even small colored details therefore avoid the grayscale manga model.
- All PNG/JPEG pages in the comic directory, including subdirectories, are processed.
  Viewer `custom_path` filtering is not applied. Files become lossless PNGs named
  `<original filename>.png`; non-image files are not copied. EXIF orientation is applied; other source metadata is not copied. Transparent images are
  rejected instead of silently flattening them. The limit is 16 million input pixels,
  8192 pixels per side. All output is 2x; the separate 4K resize CLI is unchanged.
- One job and one page run at a time per server process. Inference uses two CPU threads
  and 128px tiles with 32px context. Browsing continues while inference runs. This build
  does not enable GPU providers; GPU acceleration requires a separately validated runtime/build.
- Model files total about 537 MB. They are **external ONNX files bundled beside the Rust
  executable**, not embedded bytes in it. Embedding would duplicate a large model payload
  into each binary rebuild and would still not eliminate ONNX Runtime's native library.
  The selected arrangement provides Rust inference without a custom inference engine.
- The build script verifies official archive SHA-256 values, converts FP16 PyTorch weights
  to FP32 ONNX opset 17, and checks numerical agreement at two input sizes. It does not
  retrain or quantize the models. Exported weights, source filenames, checksums, and
  conversion errors are recorded in `remaster/models/models.json`.

Processing files live under `.remaster/`, which image routes do not serve. Cancellation
stops the child and removes that job's staging directory. If the server exits, closing
its stdin pipe also terminates the Rust child. After a hard interruption, leftover private
staging directories may be removed while the server is stopped; completed registrations
remain linked to their source. A crash in the narrow filesystem-rename/database-commit
window can leave a complete, unregistered destination: it is preserved and a retry reports
a collision, rather than overwriting it. Run one server process for a library, as with the
existing upscale feature.

See [remaster validation](docs/remaster-validation.md) for measured quality, time, memory,
and the limits of the representative-page comparison. AI reconstruction can alter fine
texture and halftone patterns; keeping the original makes comparison and rollback possible.

## License and third-party attribution

Copyright © 2026 miyabisun. The project's original code is now distributed under
[CC BY-NC 4.0](LICENSE), by the owner's distribution-policy choice. This is not a claim
that MangaJaNai automatically requires the same license for application code. Earlier
permissions for already distributed versions are not retroactively revoked. Git history
identifies miyabisun as the sole author of the original application code; third-party
libraries and the Feather-derived SVG paths are expressly excluded from this grant.

**Model terms differ from the application terms.** The current upstream main branch has
CC BY-NC 4.0, but the adopted [V1 release](https://github.com/the-database/MangaJaNai/releases/tag/1.0.0)
carries [CC BY-NC-SA 4.0](https://raw.githubusercontent.com/the-database/MangaJaNai/1.0.0/LICENSE).
The two official V1 archives contain the selected weights and no per-weight replacement
license. We retain that release's BY-NC-SA terms for both original and converted models;
we do not relicense them as application code. Noncommercial use and attribution apply
also when the models are loaded externally. No commercial permission is included.

| Component | Adopted version / author or source | License / notice |
|---|---|---|
| MangaJaNai weights | V1, the-database; seven 2x ESRGAN models, 1200p 70k / 1300p 75k / 1400p 70k / 1500p 90k / 1600p 90k / 1920p 70k / 2048p 95k; [official archive](https://github.com/the-database/MangaJaNai/releases/download/1.0.0/MangaJaNai_V1_ModelsOnly.zip) | [CC BY-NC-SA 4.0](licenses/MangaJaNai-V1.txt) |
| IllustrationJaNai weights | V1 2x ESRGAN 120k, the-database; [official archive](https://github.com/the-database/MangaJaNai/releases/download/1.0.0/IllustrationJaNai_V1_ModelsOnly.zip) | [CC BY-NC-SA 4.0](licenses/MangaJaNai-V1.txt) |
| Bun | 1.4.2, Oven / Bun contributors; [source](https://github.com/oven-sh/bun/tree/bun-v1.4.2) | [MIT and bundled component terms](licenses/Bun.md) |
| ONNX Runtime | 1.29.0, Microsoft; [source/release](https://github.com/microsoft/onnxruntime/releases/tag/v1.29.0) | [MIT](licenses/ONNX-Runtime.txt), [third-party notices](licenses/ONNX-Runtime-ThirdPartyNotices.txt) |
| PyTorch (conversion only) | 2.14.0+cpu, PyTorch contributors; [source](https://github.com/pytorch/pytorch) | BSD-3-Clause; [notice](licenses/conversion-tools.txt) |
| torchvision (conversion only) | 0.29.0+cpu, PyTorch contributors; [source](https://github.com/pytorch/vision) | BSD-3-Clause; [notice](licenses/conversion-tools.txt) |
| spandrel (conversion only) | 0.4.2, chaiNNer contributors; [source](https://github.com/chaiNNer-org/spandrel) | MIT; [notice](licenses/conversion-tools.txt) |
| ONNX (conversion only) | 1.22.0, ONNX contributors; [source](https://github.com/onnx/onnx) | Apache-2.0; [notice](licenses/conversion-tools.txt) |
| NumPy (conversion check only) | 2.5.3, NumPy developers; [source](https://github.com/numpy/numpy) | BSD-3-Clause and bundled component terms; [notice](licenses/conversion-tools.txt) |
| Feather SVG paths | v4.29.2-compatible trash/info/x paths, Cole Bemis and contributors; [source](https://github.com/feathericons/feather) | [MIT](licenses/Feather.txt) |

The production image carries `LICENSE`, `README.md`, and `licenses/`. Original third-party
copyright and disclaimer texts are retained; the application's CC license does not
replace them. The following lockfile inventory includes runtime, build, optional, and
target-specific dependencies. Its [machine-readable form](licenses/dependencies.json)
and [collected notices](licenses/dependencies.txt) retain their original terms. The
[Drizzle ORM license](licenses/drizzle-orm.txt) is included separately because its npm
archive omits the license file. Build-only tools are not installed in the runtime image.

<details>
<summary>Dependency versions, sources and licenses</summary>

| Dependency | Version | Source | License |
|---|---|---|---|
| `@drizzle-team/brocli` | 0.10.2 | [upstream](https://github.com/drizzle-team/brocli) | Apache-2.0 |
| `@esbuild-kit/core-utils` | 3.3.2 | [upstream](esbuild-kit/core-utils) | MIT |
| `@esbuild-kit/esm-loader` | 2.6.5 | [upstream](esbuild-kit/esm-loader) | MIT |
| `@esbuild/linux-x64` | 0.19.12 | [upstream](https://github.com/evanw/esbuild) | MIT |
| `@esbuild/linux-x64` | 0.25.12 | [upstream](https://github.com/evanw/esbuild) | MIT |
| `@jridgewell/gen-mapping` | 0.3.13 | [upstream](https://github.com/jridgewell/sourcemaps) | MIT |
| `@jridgewell/remapping` | 2.3.5 | [upstream](https://github.com/jridgewell/sourcemaps) | MIT |
| `@jridgewell/resolve-uri` | 3.1.2 | [upstream](https://github.com/jridgewell/resolve-uri) | MIT |
| `@jridgewell/sourcemap-codec` | 1.5.5 | [upstream](https://github.com/jridgewell/sourcemaps) | MIT |
| `@jridgewell/trace-mapping` | 0.3.31 | [upstream](https://github.com/jridgewell/sourcemaps) | MIT |
| `@parcel/watcher` | 2.5.6 | [upstream](https://github.com/parcel-bundler/watcher) | MIT |
| `@parcel/watcher-linux-x64-glibc` | 2.5.6 | [upstream](https://github.com/parcel-bundler/watcher) | MIT |
| `@parcel/watcher-linux-x64-musl` | 2.5.6 | [upstream](https://github.com/parcel-bundler/watcher) | MIT |
| `@petamoriken/float16` | 3.9.3 | [upstream](https://github.com/petamoriken/float16) | MIT |
| `@rollup/rollup-linux-x64-gnu` | 4.57.1 | [upstream](https://github.com/rollup/rollup) | MIT |
| `@rollup/rollup-linux-x64-musl` | 4.57.1 | [upstream](https://github.com/rollup/rollup) | MIT |
| `@sveltejs/acorn-typescript` | 1.0.9 | [upstream](https://github.com/sveltejs/acorn-typescript) | MIT |
| `@sveltejs/vite-plugin-svelte` | 5.1.1 | [upstream](https://github.com/sveltejs/vite-plugin-svelte) | MIT |
| `@sveltejs/vite-plugin-svelte` | 6.2.4 | [upstream](https://github.com/sveltejs/vite-plugin-svelte) | MIT |
| `@sveltejs/vite-plugin-svelte-inspector` | 4.0.1 | [upstream](https://github.com/sveltejs/vite-plugin-svelte) | MIT |
| `@sveltejs/vite-plugin-svelte-inspector` | 5.0.2 | [upstream](https://github.com/sveltejs/vite-plugin-svelte) | MIT |
| `@types/bun` | 1.3.9 | [upstream](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT |
| `@types/estree` | 1.0.8 | [upstream](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT |
| `@types/node` | 25.3.0 | [upstream](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT |
| `@types/trusted-types` | 2.0.7 | [upstream](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT |
| `acorn` | 8.15.0 | [upstream](https://github.com/acornjs/acorn) | MIT |
| `adler2` | 2.0.1 | [upstream](https://github.com/oyvindln/adler2) | 0BSD OR MIT OR Apache-2.0 |
| `aria-query` | 5.3.2 | [upstream](https://github.com/A11yance/aria-query) | Apache-2.0 |
| `autocfg` | 1.5.1 | [upstream](https://github.com/cuviper/autocfg) | Apache-2.0 OR MIT |
| `axobject-query` | 4.1.0 | [upstream](https://github.com/A11yance/axobject-query) | Apache-2.0 |
| `bitflags` | 2.13.1 | [upstream](https://github.com/bitflags/bitflags) | MIT OR Apache-2.0 |
| `buffer-from` | 1.1.2 | [upstream](LinusU/buffer-from) | MIT |
| `bun-types` | 1.3.9 | [upstream](https://github.com/oven-sh/bun) | MIT |
| `bytemuck` | 1.25.2 | [upstream](https://github.com/Lokathor/bytemuck) | Zlib OR Apache-2.0 OR MIT |
| `byteorder-lite` | 0.1.0 | [upstream](https://github.com/image-rs/byteorder-lite) | Unlicense OR MIT |
| `cfg-if` | 1.0.4 | [upstream](https://github.com/rust-lang/cfg-if) | MIT OR Apache-2.0 |
| `chokidar` | 4.0.3 | [upstream](https://github.com/paulmillr/chokidar) | MIT |
| `clsx` | 2.1.1 | [upstream](lukeed/clsx) | MIT |
| `crc32fast` | 1.5.1 | [upstream](https://github.com/srijs/rust-crc32fast) | MIT OR Apache-2.0 |
| `date-fns` | 4.1.0 | [upstream](https://github.com/date-fns/date-fns) | MIT |
| `debug` | 4.4.3 | [upstream](https://github.com/debug-js/debug) | MIT |
| `deepmerge` | 4.3.1 | [upstream](https://github.com/TehShrike/deepmerge) | MIT |
| `detect-libc` | 2.1.2 | [upstream](https://github.com/lovell/detect-libc) | Apache-2.0 |
| `devalue` | 5.6.2 | [upstream](sveltejs/devalue) | MIT |
| `devalue` | 5.6.3 | [upstream](sveltejs/devalue) | MIT |
| `drizzle-kit` | 0.30.6 | [upstream](https://github.com/drizzle-team/drizzle-orm) | MIT |
| `drizzle-orm` | 0.39.3 | [upstream](https://github.com/drizzle-team/drizzle-orm) | Apache-2.0 |
| `env-paths` | 3.0.0 | [upstream](sindresorhus/env-paths) | MIT |
| `esbuild` | 0.19.12 | [upstream](https://github.com/evanw/esbuild) | MIT |
| `esbuild` | 0.25.12 | [upstream](https://github.com/evanw/esbuild) | MIT |
| `esbuild-register` | 3.6.0 | See package notices | MIT |
| `esm-env` | 1.2.2 | [upstream](https://github.com/benmccann/esm-env) | MIT |
| `esrap` | 2.2.3 | [upstream](https://github.com/sveltejs/esrap) | MIT |
| `fdeflate` | 0.3.7 | [upstream](https://github.com/image-rs/fdeflate) | MIT OR Apache-2.0 |
| `fdir` | 6.5.0 | [upstream](https://github.com/thecodrr/fdir) | MIT |
| `flate2` | 1.1.10 | [upstream](https://github.com/rust-lang/flate2-rs) | MIT OR Apache-2.0 |
| `fs-readdir-recursive` | 1.1.0 | [upstream](fs-utils/fs-readdir-recursive) | MIT |
| `gel` | 2.2.0 | [upstream](https://github.com/geldata/gel-js) | Apache-2.0 |
| `get-tsconfig` | 4.13.6 | [upstream](privatenumber/get-tsconfig) | MIT |
| `hono` | 4.11.10 | [upstream](https://github.com/honojs/hono) | MIT |
| `image` | 0.25.10 | [upstream](https://github.com/image-rs/image) | MIT OR Apache-2.0 |
| `immutable` | 5.1.4 | [upstream](https://github.com/immutable-js/immutable-js) | MIT |
| `is-extglob` | 2.1.1 | [upstream](jonschlinkert/is-extglob) | MIT |
| `is-glob` | 4.0.3 | [upstream](micromatch/is-glob) | MIT |
| `is-reference` | 3.0.3 | [upstream](https://github.com/Rich-Harris/is-reference) | MIT |
| `isexe` | 3.1.5 | [upstream](https://github.com/isaacs/isexe) | BlueOak-1.0.0 |
| `kleur` | 4.1.5 | [upstream](lukeed/kleur) | MIT |
| `libloading` | 0.9.0 | [upstream](https://github.com/nagisa/rust_libloading/) | ISC |
| `locate-character` | 3.0.0 | [upstream](https://gitlab.com/Rich-Harris/locate-character) | MIT |
| `magic-string` | 0.30.21 | [upstream](https://github.com/Rich-Harris/magic-string) | MIT |
| `matrixmultiply` | 0.3.11 | [upstream](https://github.com/bluss/matrixmultiply/) | MIT/Apache-2.0 |
| `miniz_oxide` | 0.8.9 | [upstream](https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide) | MIT OR Zlib OR Apache-2.0 |
| `miniz_oxide` | 0.9.1 | [upstream](https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide) | MIT OR Zlib OR Apache-2.0 |
| `moxcms` | 0.8.1 | [upstream](https://github.com/awxkee/moxcms) | BSD-3-Clause OR Apache-2.0 |
| `ms` | 2.1.3 | [upstream](vercel/ms) | MIT |
| `nanoid` | 3.3.11 | [upstream](ai/nanoid) | MIT |
| `ndarray` | 0.17.2 | [upstream](https://github.com/rust-ndarray/ndarray) | MIT OR Apache-2.0 |
| `node-addon-api` | 7.1.1 | [upstream](https://github.com/nodejs/node-addon-api) | MIT |
| `normalize.css` | 8.0.1 | [upstream](necolas/normalize.css) | MIT |
| `num-complex` | 0.4.6 | [upstream](https://github.com/rust-num/num-complex) | MIT OR Apache-2.0 |
| `num-integer` | 0.1.47 | [upstream](https://github.com/rust-num/num-integer) | MIT OR Apache-2.0 |
| `num-traits` | 0.2.19 | [upstream](https://github.com/rust-num/num-traits) | MIT OR Apache-2.0 |
| `obug` | 2.1.1 | [upstream](https://github.com/sxzz/obug) | MIT |
| `once_cell` | 1.21.4 | [upstream](https://github.com/matklad/once_cell) | MIT OR Apache-2.0 |
| `ort` | 2.0.0-rc.13 | [upstream](https://github.com/pykeio/ort) | MIT OR Apache-2.0 |
| `ort-sys` | 2.0.0-rc.13 | [upstream](https://github.com/pykeio/ort) | MIT OR Apache-2.0 |
| `picocolors` | 1.1.1 | [upstream](alexeyraspopov/picocolors) | ISC |
| `picomatch` | 4.0.3 | [upstream](micromatch/picomatch) | MIT |
| `pin-project-lite` | 0.2.17 | [upstream](https://github.com/taiki-e/pin-project-lite) | Apache-2.0 OR MIT |
| `png` | 0.18.1 | [upstream](https://github.com/image-rs/image-png) | MIT OR Apache-2.0 |
| `portable-atomic` | 1.15.0 | [upstream](https://github.com/taiki-e/portable-atomic) | Apache-2.0 OR MIT |
| `portable-atomic-util` | 0.2.8 | [upstream](https://github.com/taiki-e/portable-atomic-util) | Apache-2.0 OR MIT |
| `postcss` | 8.5.6 | [upstream](postcss/postcss) | MIT |
| `pxfm` | 0.1.30 | [upstream](https://github.com/awxkee/pxfm) | BSD-3-Clause OR Apache-2.0 |
| `rawpointer` | 0.2.1 | [upstream](https://github.com/bluss/rawpointer/) | MIT/Apache-2.0 |
| `readdirp` | 4.1.2 | [upstream](https://github.com/paulmillr/readdirp) | MIT |
| `resolve-pkg-maps` | 1.0.0 | [upstream](privatenumber/resolve-pkg-maps) | MIT |
| `rollup` | 4.57.1 | [upstream](https://github.com/rollup/rollup) | MIT |
| `sass` | 1.97.3 | [upstream](https://github.com/sass/dart-sass) | MIT |
| `semver` | 7.7.4 | [upstream](https://github.com/npm/node-semver) | ISC |
| `shell-quote` | 1.8.3 | [upstream](http://github.com/ljharb/shell-quote) | MIT |
| `simd-adler32` | 0.3.10 | [upstream](https://github.com/mcountryman/simd-adler32) | MIT |
| `smallvec` | 1.16.0 | [upstream](https://github.com/servo/rust-smallvec) | MIT OR Apache-2.0 |
| `smart-sort` | 0.0.3 | [upstream](simongfxu/smart-sort) | MIT |
| `source-map` | 0.6.1 | [upstream](http://github.com/mozilla/source-map) | BSD-3-Clause |
| `source-map-js` | 1.2.1 | [upstream](7rulnik/source-map-js) | BSD-3-Clause |
| `source-map-support` | 0.5.21 | [upstream](https://github.com/evanw/node-source-map-support) | MIT |
| `svelte` | 5.50.2 | [upstream](https://github.com/sveltejs/svelte) | MIT |
| `svelte` | 5.53.0 | [upstream](https://github.com/sveltejs/svelte) | MIT |
| `tinyglobby` | 0.2.15 | [upstream](https://github.com/SuperchupuDev/tinyglobby) | MIT |
| `tracing` | 0.1.44 | [upstream](https://github.com/tokio-rs/tracing) | MIT |
| `tracing-core` | 0.1.36 | [upstream](https://github.com/tokio-rs/tracing) | MIT |
| `typescript` | 5.9.3 | [upstream](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| `undici-types` | 7.18.2 | [upstream](https://github.com/nodejs/undici) | MIT |
| `vite` | 6.4.1 | [upstream](https://github.com/vitejs/vite) | MIT |
| `vite` | 7.3.1 | [upstream](https://github.com/vitejs/vite) | MIT |
| `vitefu` | 1.1.1 | [upstream](https://github.com/svitejs/vitefu) | MIT |
| `which` | 4.0.0 | [upstream](https://github.com/npm/node-which) | ISC |
| `windows-link` | 0.2.1 | [upstream](https://github.com/microsoft/windows-rs) | MIT OR Apache-2.0 |
| `zimmerframe` | 1.1.4 | [upstream](https://github.com/sveltejs/zimmerframe) | MIT |
| `zlib-rs` | 0.6.7 | [upstream](https://github.com/trifectatechfoundation/zlib-rs) | Zlib |
| `zune-core` | 0.5.3 | [upstream](https://github.com/etemesi254/zune-image) | MIT OR Apache-2.0 OR Zlib |
| `zune-jpeg` | 0.5.15 | [upstream](https://github.com/etemesi254/zune-image/tree/dev/crates/zune-jpeg) | MIT OR Apache-2.0 OR Zlib |

</details>
