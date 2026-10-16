#!/usr/bin/env bash
# Helper script to expose Veloce to the internet with a free HTTPS domain using Cloudflare Tunnel.
set -euo pipefail

PORT="${1:-8080}"

# Check if cloudflared is installed
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed."
  echo "Installing cloudflared binary to ~/.local/bin/cloudflared..."
  mkdir -p "$HOME/.local/bin"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) CF_ARCH="amd64" ;;
    aarch64|arm64) CF_ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH" && exit 1 ;;
  esac
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH" -o "$HOME/.local/bin/cloudflared"
  chmod +x "$HOME/.local/bin/cloudflared"
  export PATH="$HOME/.local/bin:$PATH"
  echo "cloudflared successfully installed!"
fi

echo "=========================================================="
echo " Starting Cloudflare Tunnel for http://localhost:$PORT..."
echo " You will receive a FREE public HTTPS domain instantly."
echo "=========================================================="

cloudflared tunnel --url "http://localhost:$PORT"
