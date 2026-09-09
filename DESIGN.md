---
version: alpha
name: Sumi / comic-server
description: >
  Self-contained comic-server design contract. CSS custom properties in
  client/src/global.sass implement the project tokens.
colors:
  # --- Project accent (violet) ---
  # Unsuffixed = Washi theme (light), -dark = Sumi theme (dark).
  # The Washi value is a dark violet ink (white-on-accent ~9.9:1); the
  # Sumi value reads ~5.2:1 (AA) on surface-dark. Violet keeps this tool
  # tellable at a glance from its siblings: amber = 5ch-viewer,
  # blue = novel-server, red = youtube-sub-feed.
  accent: "#5a2d82"
  accent-subtle: "rgba(90, 45, 130, 0.12)"
  accent-dark: "#a878f0"
  accent-subtle-dark: "rgba(168, 120, 240, 0.15)"
  # --- Functional data colors (Washi / Sumi pairs) ---
  # star-on = a lit review star (the comic's shelf level). Gold,
  # deliberately decoupled from the chrome accent so a page of ratings
  # never reads as a page of buttons.
  star-on: "#8a6000"
  star-on-dark: "#e0a800"
---

# comic-server — Sumi Project Overrides

## Overview

This file owns the project design contract. The existing tokens and shared
styles in `client/src/global.sass` are its implementation. External templates
are bootstrap references and do not override this contract.

Shared chrome uses system fonts, the 12/14/15/16/17px type scale, 4/8/12/16/24px
spacing, 6/8/12px radii, neutral surfaces, and the violet accent. Use existing
SVG icons and visible keyboard focus. Keep buttons native, with at least 36px
height outside dense tables. Status is expressed in text; do not rely on color.

comic-server is a self-hosted comic library: bookshelves of comics browsed
as dense tables, and a full-viewport page reader. The chrome recedes; the
comic pages are the content.

Accent: **violet** (`#5a2d82` Washi / `#a878f0` Sumi). It marks
interactive chrome only: the active shelf tab underline, the single
primary button per screen, focused inputs, the shared focus ring.

Themes follow the family's Sumi-first convention: `:root` in
`client/src/global.sass` IS the Sumi (dark) theme, and Washi (light,
e-paper) is applied via `@media (prefers-color-scheme: light)` — the OS
decides; there is no in-app toggle and no `data-theme` attribute.

## Colors

Functional data colors in the Sumi sense — they encode domain state,
never decoration, and are exempt from the one-accent rule:

- **star-on (#8a6000 / #e0a800):** the lit state of a review star.
  Gold, intentionally separate from the violet accent: stars encode the
  comic's shelf level (data), not "you are here" (chrome). Unlit stars
  are muted chrome. Hover preview of a would-be level renders in accent
  (an interaction cue, not a data value).
- **Shelf levels (unread / hold / like / favorite / love / legend)**
  carry **no per-level color**: the level is expressed by the *count* of
  lit stars only. Any future per-level color must first be declared here
  as a Washi darkness ramp (5ch-viewer's rate scale is the model).

Everything else that looks stateful maps to template roles, not new
colors:

- **Upscale workflow (request → processing → pending):** confirm is the
  screen's one primary (accent-filled) button, rollback is the danger
  role, request is a default button. No green "success" color exists in
  this project.
- **Excluded file rows** (custom_path misses) and **missing-directory
  warnings**: danger role — they are error states, not a new meaning.
- **Deleted comics** (soft-deleted rows): muted chrome, not a data color.

## Layout

The template's two-pane list+detail grid does not apply. This project has
two domain layouts instead:

- **Bookshelf table:** a dense, full-width table (brand / title /
  registered / review / delete) whose entire purpose is scanning many
  rows at once. It stays a table at every viewport width. Chrome
  (borders, row hover, scrollbars) uses tokens; rules are 1px hairlines.
  Sortable column headers signal with `cursor: pointer` and a hover wash.
- **Reader (Comic page):** a full-viewport canvas; the page image is the
  screen. All chrome on this screen floats over the image (see Reader
  canvas below).

## Components

Domain components on top of the Sumi recipes:

- **Reader canvas:** the surface comic pages render on. Its checkerboard
  background (white base, `#ccc` squares, 60px tile — for judging
  transparent-PNG edges) is a **domain exception that stays light in
  both themes**, the image-viewer exception of the template applied to a
  proofing surface: page images are the ground truth and are not tinted
  by theme. The checkerboard values live as reader-local constants, not
  global tokens. The page counter, review stars, and info button sit ON
  the image and therefore use scrim-on-image tokens
  (`--c-scrim` / `--c-on-scrim`), not surface colors.
- **ReviewStars:** ★ glyphs are **data visualization, not chrome** — the
  template's emoji/text-glyph ban does not apply to them. Lit = star-on,
  unlit = muted; level order comes from `lib/levels.js`. Tapping a star
  moves that one comic directly. Bulk classification requires an explicit confirmation.
- **Dense-table row controls (Bookshelf / Brand tables):** inside these
  two tables — and only there — the template's 36px icon-button recipe
  is relaxed to a **24×24px hit area** (the floor; never smaller) so
  that control chrome does not set the row height. All tbody rows share
  **one uniform computed height** across every shelf (with or without a
  delete control, including soft-deleted rows), and Bookshelf and Brand
  rows match each other. The row height is driven by the type line box
  plus a consistent `--sp-1` vertical cell padding — roughly 32px at
  body size — never by buttons and never by a hardcoded per-row height.
  Icon-buttons everywhere else (reader info button, modal close) keep
  the template's 36px recipe; this exception must not leak out of the
  dense tables.
- **Shelf nav (Header):** the shelf list is the app's primary nav and
  uses the Sumi tab recipe: label type, muted when inactive, on-surface
  with a 2px accent underline for the current shelf. The app title links
  home. No breadcrumb separators.
- **Duplicates notification + compare panel (Home):** the notification
  is a Sumi card; the compare panel is a card with a two-column
  definition grid (labels caption-muted, file paths monospace).
  "Keep duplicate" (the replace action) is the screen's primary button;
  "Keep existing" / "Register as new" are default buttons.
- **Metadata edit modal (Comic):** Sumi modal recipe (lg radius, scrim,
  quiet SVG × button, Esc/scrim-click to close). Its right pane — the
  **line-numbered monospace file preview** with excluded rows struck
  through (danger role) and clickable rows jumping the reader — is a
  domain element and keeps its terminal-like density. Inputs follow the
  template input recipe; the regex-error line under custom_path is
  danger-role caption text.
- **Info button (reader):** a Sumi icon-button (sm radius, SVG info
  glyph, `aria-label`) floating over the canvas on scrim tokens. Not a
  circular FAB — the template has no circular buttons.

## Do's and Don'ts

- Do keep star gold monosemous: star-on = shelf level, accent = chrome.
  Never color chrome gold or render a lit star in accent.
- Don't add a per-level color, upscale-state green, or any new hue
  without declaring it here first as a Washi/Sumi pair (Washi as a
  darkness ramp).
- Do keep deletions behind a two-step confirmation with cancellation as the
  default. Individual shelf moves are direct; bulk classification requires an
  explicit scope/count confirmation because it determines future reading.
- Do keep the reader canvas checkerboard light in both themes — it is a
  proofing surface, not chrome.
- Don't let modal or overlay chrome compete with the page image: reader
  overlays stay on scrim tokens and appear only at the canvas edges.
- Don't reuse the dense-table 24px icon-button outside the Bookshelf /
  Brand tables — everywhere else the template's 36px recipe stands.

## Remaster interaction

The reader information modal offers a separate “リマスター” section alongside
upscaling. Its quiet start button explains that the original is retained and a
new “リマスター版” comic is created. Show processing page counts, a cancel button,
a recoverable error, or a link to the completed comic. Poll only while the modal
is visible. Announce progress politely and errors as alerts. Starting and cancelling
are reversible operations; no extra confirmation dialog is needed.

Reuse the upscale section's neutral surface and default button recipe. Wrap long
messages on narrow screens, and keep controls keyboard operable in both OS themes.
The reader remains usable while inference runs. A missing installation is described
as unavailable, with setup details in the documentation.

## Brand search

Brand pages keep the existing fuzzy search as the default for legacy URLs and
provide a native, labelled fuzzy/exact selector. The URL owns the selected mode;
reload, direct links and history navigation restore it. Exact matching uses the
entire saved brand name; empty brand links are unavailable.

Show the selected mode and the number of non-deleted results targeted by bulk
rating/deletion beside the controls. Bulk controls operate on those displayed IDs;
loading, failed or stale results cannot become an action target. Reset deletion
confirmation when the search changes. Use the shared deletion confirmation and
native keyboard-accessible rating buttons with the dense-table tokens.

## Keyboard selection and reading

The 2026-09-09 user workflow owns these interactions. Stars classify future reading;
bulk classification is consequential and requires a count-and-scope confirmation.
Individual rating remains a direct action. Bulk rating/deletion is available through
its explicit controls only; individual keyboard commands never invoke it.

Bookshelf and brand pages share an ID-based virtual cursor. The first row is the
initial target. Sorting and refresh retain that ID. After a successful rating removes
it, select the row now at its former index, or the previous row at the end. Empty
lists have no target. A failed update keeps the target; pending updates block further
commands. Save cursor, sorting and list scroll in the browser history entry so returning
from reading restores them. Cursor movement scrolls only as far as needed and does
not fetch comic details. The table remains a dense table at every width, with a
scrolling container and a visible active row. DOM focus within a row synchronizes the
cursor; the table exposes its active row to assistive technology. Only the active row's
controls enter the normal Tab sequence, alongside table-level controls.

List keys: j/k move, Enter/Space open, 1–5 classify hold/like/favorite/love/legend,
dd requests deletion of that one comic, b opens its exact brand, and ? opens help.
Reader keys: h/l and left/right move one page, k/j and up/down move ten, 1–5 classify,
i opens the existing metadata dialog, dd requests deletion, b opens its exact brand,
and ? opens help. Keep the existing arrow-key hold behavior. No list i, gg/G, counts,
or undo commands are introduced.

Deletion uses a native dialog naming the frozen target, with cancellation focused by
default. dd requires two non-repeat d presses within 500ms; another key, focus change,
or navigation clears it. Only a subsequent non-repeat y confirms an individual delete;
n/N/Esc/Enter cancel. A failed delete keeps the same target and displays its error.
Click/tap deletion retains its two-step operation through the same dialog. Bulk dialogs
name their captured scope/count and require their explicit confirm control; y is not
a bulk shortcut. The confirmation dialog is shared by pointer and keyboard entry paths.

After reader deletion succeeds, navigate to the captured brand's exact search. If the
brand is empty, return to the comic's pre-delete bookshelf. Empty-brand b does not
navigate; explain that no brand is set. An empty result stays an empty list. Input,
select, contenteditable, IME, Ctrl/Alt/Meta and open dialogs suppress normal commands;
key repeat cannot classify or delete another comic. Help closes with ?/Esc or its
close button. Metadata editing keeps native form controls; file-preview buttons work
with Enter/Space and never enable reader commands inside the dialog. File-preview
buttons retain their terminal-like density with a 24px minimum target; this is a
reader-modal exception to the general 36px button recipe.
