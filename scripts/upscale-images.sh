#!/usr/bin/env bash
# Upscale images with Real-CUGAN 2x, then fit to 4K bounds.
#
# - Copies <target-dir> to <backup-dir> first (rollback safety)
# - Applies Real-CUGAN 2x upscale to each image
# - Fits result within 4K (3840x2160) bounds
# - Overwrites original files in place, preserving format (JPEG q95 / PNG level 9)
# - Outputs JSON Lines progress to stdout for the API to parse
#
# Usage: scripts/upscale-images.sh <target-dir> <backup-dir>
#
# Refuses to run if <backup-dir> already exists (prevents accidental overwrite).

set -euo pipefail

MAX_W=3840
MAX_H=2160
JPEG_QUALITY=95
RCUGAN_BIN="${RCUGAN_BIN:-realcugan-ncnn-vulkan}"
RCUGAN_NOISE="${RCUGAN_NOISE:--1}"

TARGET_DIR="${1:-}"
BAK_DIR="${2:-}"
[[ -z "$TARGET_DIR" ]] && { echo '{"event":"error","message":"target directory required"}'; exit 1; }
[[ -z "$BAK_DIR" ]] && { echo '{"event":"error","message":"backup directory required"}'; exit 1; }
[[ ! -d "$TARGET_DIR" ]] && { echo '{"event":"error","message":"target directory not found"}'; exit 1; }
[[ -d "$BAK_DIR" ]] && { echo '{"event":"error","message":"backup directory already exists"}'; exit 1; }

BAK_PARENT="$(dirname "$BAK_DIR")"
[[ ! -d "$BAK_PARENT" ]] && { echo '{"event":"error","message":"backup parent directory does not exist"}'; exit 1; }

command -v magick &>/dev/null || { echo '{"event":"error","message":"magick not found"}'; exit 1; }
command -v "$RCUGAN_BIN" &>/dev/null || { echo '{"event":"error","message":"realcugan not found"}'; exit 1; }

is_image() {
  local ext="${1##*.}"
  ext="${ext,,}"
  [[ "$ext" == "jpg" || "$ext" == "jpeg" || "$ext" == "png" ]]
}

json_escape() {
  # Escape backslash and double quote for JSON string
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

# --- Collect target images ---
images=()
for f in "$TARGET_DIR"/*; do
  [[ -f "$f" ]] || continue
  is_image "$f" && images+=("$f")
done

total=${#images[@]}
if [[ $total -eq 0 ]]; then
  echo '{"event":"error","message":"no images in target directory"}'
  exit 1
fi

# --- Backup ---
echo "{\"event\":\"copying\"}"
cp -a "$TARGET_DIR" "$BAK_DIR"

echo "{\"event\":\"start\",\"total\":${total}}"

# --- Process each image ---
tmpdir=$(mktemp -d)
trap "rm -rf '$tmpdir'" EXIT

processed=0
for f in "${images[@]}"; do
  base=$(basename "$f")
  ext="${f##*.}"
  ext_lower=$(echo "$ext" | tr '[:upper:]' '[:lower:]')

  upscaled="${tmpdir}/up.png"

  # Real-CUGAN 2x upscale
  if ! "$RCUGAN_BIN" -i "$f" -o "$upscaled" -n "$RCUGAN_NOISE" -s 2 -f png 2>/dev/null; then
    escaped_base=$(json_escape "$base")
    echo "{\"event\":\"error\",\"message\":\"realcugan failed on ${escaped_base}\"}"
    exit 1
  fi

  # Fit to 4K then save in original format
  if [[ "$ext_lower" == "png" ]]; then
    magick "$upscaled" -resize "${MAX_W}x${MAX_H}" -define png:compression-level=9 "$f"
  else
    magick "$upscaled" -resize "${MAX_W}x${MAX_H}" -quality "$JPEG_QUALITY" "$f"
  fi

  processed=$((processed + 1))
  escaped_base=$(json_escape "$base")
  echo "{\"event\":\"progress\",\"processed\":${processed},\"total\":${total},\"file\":\"${escaped_base}\"}"
done

echo "{\"event\":\"done\",\"processed\":${processed},\"total\":${total}}"
