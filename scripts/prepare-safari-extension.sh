#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
EXT_DIR="$ROOT/extension"
OUT_DIR="$ROOT/safari/extension"

if [ ! -d "$EXT_DIR" ]; then
  echo "extension directory not found: $EXT_DIR" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Copy current build output; remove OUT_DIR manually if you need a clean slate.
cp -R "$EXT_DIR/"* "$OUT_DIR/"

if [ ! -f "$EXT_DIR/manifest.safari.json" ]; then
  echo "manifest.safari.json not found in $EXT_DIR" >&2
  exit 1
fi

cp "$EXT_DIR/manifest.safari.json" "$OUT_DIR/manifest.json"
rm -f "$OUT_DIR/manifest.safari.json"

echo "Prepared Safari extension at: $OUT_DIR"
echo "Next: xcrun safari-web-extension-converter \"$OUT_DIR\""
