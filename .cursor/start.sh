#!/usr/bin/env bash
# Per-boot startup: bring the docker compose stack up in the background.
# Runs on every agent boot; the heavy image builds already happened in install.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

sudo bash "$REPO_ROOT/.cursor/dockerd-up.sh"
sudo docker compose up -d

echo "docker compose stack is up (web :3000, api :3001, ml :8001, db :5433)"
