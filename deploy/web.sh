#!/usr/bin/env bash
# Builds veloce-web as a static export and uploads it to the remote server.
source "$(dirname "$0")/common.sh"

cd "$ROOT/veloce-web"
pnpm install --frozen-lockfile
rm -rf out

echo "Building veloce-web static export with Next.js Turbopack..."
OUTPUT=export NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" pnpm run build

echo "Syncing frontend assets to $DEPLOY_HOST:$WEB_DIR..."
# Old hashed assets are preserved so open browser tabs keep running without chunk load errors.
rsync -az --no-owner --no-group out/_next/ "$DEPLOY_HOST:$WEB_DIR/_next/"
rsync -az --no-owner --no-group --delete --exclude /_next/ out/ "$DEPLOY_HOST:$WEB_DIR/"

echo "Frontend static export successfully deployed to $WEB_DIR"
