#!/usr/bin/env bash
# One-time environment bootstrap for the Moby Analytics stack.
#
# The whole application (Postgres+pgvector, Redis, ML/FastAPI, API/Elysia,
# Web/Next.js) runs via docker compose, so the VM only needs Docker plus the
# nested-container tweaks. This script is idempotent and safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Docker engine + fuse-overlayfs (nested-container support).
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
if ! command -v fuse-overlayfs >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq -o Dpkg::Options::=--force-confold fuse-overlayfs
fi

# 2. Generate .env with fresh secrets (never clobber an existing file).
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^INTERNAL_SERVICE_TOKEN=.*|INTERNAL_SERVICE_TOKEN=$(openssl rand -hex 32)|" .env
  sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -hex 32)|" .env
  # FastAPI must bind IPv4 for the docker bridge; its default `::` is IPv6-only here.
  grep -q '^ML_HOST=' .env || printf '\nML_HOST=0.0.0.0\n' >>.env
fi

# 3. Start the daemon and pre-build images so they are baked into the snapshot.
sudo bash "$REPO_ROOT/.cursor/dockerd-up.sh"
sudo docker compose build

echo "install complete"
