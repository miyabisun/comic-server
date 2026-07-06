---
version: alpha
name: Sumi / comic-server
description: >
  comic-server project overrides for the Sumi design system. The
  canonical template lives at ~/.claude/designs/sumi/DESIGN.md; this file
  records ONLY what is specific to comic-server (accent + functional
  data colors + domain components). CSS custom properties in
  client/src/global.sass are the implementation of these tokens.
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

**This project follows the Sumi design system.** The canonical template is
`~/.claude/designs/sumi/DESIGN.md` — all shared rules (neutral chrome,
one-accent rule, typography/spacing/radius scales, flat elevation,
iconography, component recipes) live there and are NOT restated here.
This document records only what is unique to comic-server. On chrome
questions the template wins; on the domain semantics below this file wins.

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
  moves the comic to that shelf — non-destructive, so no confirmation.
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
- Do keep destructive actions (single delete, delete-all) behind a
  two-step inline confirm (quiet trigger → danger-filled confirm +
  cancel, in place). Shelf moves via stars stay one-tap: they are cheap
  and reversible.
- Do keep the reader canvas checkerboard light in both themes — it is a
  proofing surface, not chrome.
- Don't let modal or overlay chrome compete with the page image: reader
  overlays stay on scrim tokens and appear only at the canvas edges.
- Don't reuse the dense-table 24px icon-button outside the Bookshelf /
  Brand tables — everywhere else the template's 36px recipe stands.
