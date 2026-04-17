#!/usr/bin/env bash
# Resize images to fit within 4K (3840x2160) bounds.
#
# - Large images (> 4K):   downscale with magick
# - Small images (<= 4K):  upscale with Real-CUGAN 2x, then fit to 4K
# - Already 4K-fit images: skip
# - JPEG source -> JPEG q95 output
# - PNG source  -> PNG max compression output
#
# Modes:
#   Output mode:   scripts/resize-images.sh <input-dir> <output-dir> [options]
#   In-place mode: scripts/resize-images.sh --in-place <target-dir> [options]
#                  scripts/resize-images.sh --in-place -r <root-dir> [options]
#
# Options:
#   --in-place          Overwrite original files in place
#   -r, --recursive     Process all subdirectories recursively (requires --in-place)
#   -n, --noise <0-3>   Real-CUGAN denoise level (default: -1, no denoise)
#   --dry-run           Show what would be done without processing
#
# Example:
#   scripts/resize-images.sh /path/to/comic ./out
#   scripts/resize-images.sh --in-place /path/to/comic
#   scripts/resize-images.sh --in-place -r /mnt/comic-ssd/comic --dry-run

set -euo pipefail

MAX_W=3840
MAX_H=2160
JPEG_QUALITY=95
RCUGAN_BIN="${RCUGAN_BIN:-realcugan-ncnn-vulkan}"
RCUGAN_NOISE=-1
RCUGAN_MODEL="${RCUGAN_MODEL:-models-se}"
DRY_RUN=false
IN_PLACE=false
RECURSIVE=false

usage() {
  sed -n '2,/^$/{ s/^# \?//; p }' "$0"
  exit 1
}

# --- Parse arguments ---
POSITIONAL=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--noise)     RCUGAN_NOISE="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=true; shift ;;
    --in-place)     IN_PLACE=true; shift ;;
    -r|--recursive) RECURSIVE=true; shift ;;
    -h|--help)      usage ;;
    *)              POSITIONAL+=("$1"); shift ;;
  esac
done

if $IN_PLACE; then
  TARGET_DIR="${POSITIONAL[0]:-}"
  [[ -z "$TARGET_DIR" ]] && usage
  [[ ! -d "$TARGET_DIR" ]] && { echo "Error: directory not found: $TARGET_DIR" >&2; exit 1; }
else
  INPUT_DIR="${POSITIONAL[0]:-}"
  OUTPUT_DIR="${POSITIONAL[1]:-}"
  [[ -z "$INPUT_DIR" || -z "$OUTPUT_DIR" ]] && usage
  [[ ! -d "$INPUT_DIR" ]] && { echo "Error: directory not found: $INPUT_DIR" >&2; exit 1; }
fi

if $RECURSIVE && ! $IN_PLACE; then
  echo "Error: --recursive requires --in-place" >&2
  exit 1
fi

# --- Verify dependencies ---
command -v magick &>/dev/null || { echo "Error: magick (ImageMagick 7) is required" >&2; exit 1; }
command -v "$RCUGAN_BIN" &>/dev/null || { echo "Error: $RCUGAN_BIN not found" >&2; exit 1; }

# --- Helpers ---
is_jpeg() {
  local ext="${1##*.}"
  [[ "${ext,,}" == "jpg" || "${ext,,}" == "jpeg" ]]
}

is_png() {
  local ext="${1##*.}"
  [[ "${ext,,}" == "png" ]]
}

is_image() {
  is_jpeg "$1" || is_png "$1"
}

# --- Process a single file ---
# Returns: 0=processed, 1=skipped, 2=error
process_file() {
  local file="$1"
  local out_file="$2"

  local dims w h
  dims=$(magick identify -format "%w %h" "$file" 2>/dev/null) || return 2
  read -r w h <<< "$dims"

  # Skip if already within 4K bounds
  if [[ $w -le $MAX_W && $h -le $MAX_H ]]; then
    return 1
  fi

  local save_args=()
  if is_jpeg "$file"; then
    save_args=(-quality "$JPEG_QUALITY")
  else
    save_args=(-define png:compression-level=9)
  fi

  if [[ $w -gt $MAX_W || $h -gt $MAX_H ]]; then
    # Large image: magick downscale
    if ! $DRY_RUN; then
      magick "$file" -resize "${MAX_W}x${MAX_H}" "${save_args[@]}" "$out_file"
    fi
    echo "downscale ${w}x${h}"
  fi

  return 0
}

# --- Process one directory ---
process_directory() {
  local dir="$1"
  local dir_total=0 dir_processed=0 dir_skipped=0

  for file in "$dir"/*; do
    [[ -f "$file" ]] || continue
    is_image "$file" || continue

    local basename
    basename="$(basename "$file")"

    local out_file
    if $IN_PLACE; then
      out_file="${file}.tmp"
    else
      local ext="${file##*.}"
      out_file="${OUTPUT_DIR}/${basename}"
    fi

    ((dir_total++)) || true

    local result
    result=$(process_file "$file" "$out_file" 2>&1) && status=$? || status=$?

    case $status in
      0)
        ((dir_processed++)) || true
        if $IN_PLACE && ! $DRY_RUN; then
          mv "$out_file" "$file"
        fi
        local out_info=""
        if ! $DRY_RUN; then
          local out_size out_dims
          if $IN_PLACE; then
            out_size=$(stat -c%s "$file")
            out_dims=$(magick identify -format "%wx%h" "$file")
          else
            out_size=$(stat -c%s "$out_file")
            out_dims=$(magick identify -format "%wx%h" "$out_file")
          fi
          out_info=" -> ${out_dims} ($(numfmt --to=iec "$out_size"))"
        fi
        echo "  [${dir_total}] ${basename}: ${result}${out_info}"
        ;;
      1)
        ((dir_skipped++)) || true
        ;;
      2)
        ((dir_skipped++)) || true
        echo "  [${dir_total}] ${basename}: error reading"
        ;;
    esac
  done

  echo "  (${dir_processed} processed, ${dir_skipped} skipped, ${dir_total} total)"
  # Output counts to fd 3 for aggregation
  echo "${dir_processed} ${dir_skipped} ${dir_total}" >&3
}

# --- Main ---
if ! $IN_PLACE; then
  mkdir -p "$OUTPUT_DIR"
fi

grand_processed=0
grand_skipped=0
grand_total=0
dir_count=0

if $RECURSIVE; then
  # Recursive: find all leaf directories containing images
  while IFS= read -r dir; do
    # Check if directory has any image files
    has_images=false
    for f in "$dir"/*; do
      [[ -f "$f" ]] && is_image "$f" && { has_images=true; break; }
    done
    $has_images || continue

    ((dir_count++)) || true
    rel_path="${dir#"$TARGET_DIR"/}"
    echo "[dir ${dir_count}] ${rel_path}"

    counts=$(process_directory "$dir" 3>&1 >&2) 2>&1
    read -r dp ds dt <<< "$counts"
    ((grand_processed += dp)) || true
    ((grand_skipped += ds)) || true
    ((grand_total += dt)) || true
  done < <(find "$TARGET_DIR" -mindepth 1 -type d | sort)
else
  if $IN_PLACE; then
    echo "[dir] $(basename "$TARGET_DIR")"
    counts=$(process_directory "$TARGET_DIR" 3>&1 >&2) 2>&1
    read -r dp ds dt <<< "$counts"
    grand_processed=$dp
    grand_skipped=$ds
    grand_total=$dt
  else
    echo "[dir] $(basename "$INPUT_DIR")"
    counts=$(process_directory "$INPUT_DIR" 3>&1 >&2) 2>&1
    read -r dp ds dt <<< "$counts"
    grand_processed=$dp
    grand_skipped=$ds
    grand_total=$dt
  fi
fi

echo ""
echo "=== Summary ==="
if $RECURSIVE; then
  echo "Directories: ${dir_count}"
fi
echo "Processed: ${grand_processed}"
echo "Skipped:   ${grand_skipped}"
echo "Total:     ${grand_total}"
