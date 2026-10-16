#!/usr/bin/env bash
# Builds veloce-service for the remote server, applies pending migrations,
# swaps the binary and restarts clusters. Pass --rollback to restart with previous binary.
source "$(dirname "$0")/common.sh"

restart="$REMOTE_SUDO
  \$S systemctl restart $SERVICE_UNITS
  sleep 3
  for unit in $SERVICE_UNITS; do
    if ! systemctl is-active --quiet \"\$unit\"; then
      systemctl status --no-pager \"\$unit\"
      exit 1
    fi
  done
  echo 'All Veloce clusters are healthy and active'"

if [ "${1:-}" = "--rollback" ]; then
  echo "Rolling back to previous binary..."
  ssh -t "$DEPLOY_HOST" "set -e
  cd '$SERVICE_DIR'
  mv veloce.prev veloce
  $restart"
  exit
fi

build="$(mktemp -d)"
trap 'rm -rf "$build"' EXIT

echo "Building veloce binary for linux/$SERVICE_ARCH..."
cd "$ROOT/veloce-service"
CGO_ENABLED=0 GOOS=linux GOARCH="$SERVICE_ARCH" go build -tags "embedweb" -ldflags="-s -w" -o "$build/veloce" .

echo "Uploading binary to $DEPLOY_HOST:$SERVICE_DIR/veloce.new..."
scp "$build/veloce" "$DEPLOY_HOST:$SERVICE_DIR/veloce.new"

echo "Applying migrations and restarting service..."
ssh -t "$DEPLOY_HOST" "set -e
  cd '$SERVICE_DIR'
  chmod +x veloce.new
  ./veloce.new database migrate up
  if [ -f veloce ]; then cp -p veloce veloce.prev; fi
  mv veloce.new veloce
  $restart"
