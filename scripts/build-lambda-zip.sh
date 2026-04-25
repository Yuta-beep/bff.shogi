#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/.lambda-build"
STAGING_DIR="$BUILD_DIR/staging"
OUT_DIR="$ROOT_DIR/dist"
ZIP_PATH="$OUT_DIR/lambda.zip"

rm -rf "$BUILD_DIR"
mkdir -p "$STAGING_DIR" "$OUT_DIR"

cd "$ROOT_DIR"
bun run build

cp -R .next/standalone/. "$STAGING_DIR/"
mkdir -p "$STAGING_DIR/.next"
cp -R .next/static "$STAGING_DIR/.next/static"

if [ -d public ]; then
  cp -R public "$STAGING_DIR/public"
fi

cat > "$STAGING_DIR/run.sh" <<'EOF'
#!/bin/sh
set -e
exec node server.js
EOF

chmod +x "$STAGING_DIR/run.sh"

cd "$STAGING_DIR"
zip -qr "$ZIP_PATH" .

echo "Created $ZIP_PATH"
