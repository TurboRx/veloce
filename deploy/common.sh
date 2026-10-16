#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

set -a
source "$ROOT/deploy/config.env"
if [ -f "$ROOT/deploy/.env" ]; then
  source "$ROOT/deploy/.env"
fi
set +a

# Ensure pnpm and go are in PATH if using nvm/asdf
if ! command -v pnpm >/dev/null && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null
fi

if [ -z "${DEPLOY_HOST:-}" ]; then
  echo "Missing DEPLOY_HOST, copy deploy/.env.example to deploy/.env and fill it in." >&2
  exit 1
fi

SERVICE_UNITS=""
for ((i = 0; i < CLUSTER_COUNT; i++)); do
  SERVICE_UNITS="$SERVICE_UNITS veloce-service@$i"
done

# Detection for sudo requirement on remote host
REMOTE_SUDO='S=; [ "$(id -u)" -eq 0 ] || S=sudo'

echo "Deploying $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'current') on $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'branch')"
if [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
  echo "Warning: the working tree has uncommitted changes, they will be deployed too."
fi
