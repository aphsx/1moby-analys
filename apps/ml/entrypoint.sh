#!/bin/bash
set -e

echo "=== Starting ML v2 internal API (health + training/prediction job triggers) ==="

exec uvicorn api.main:app --host "${ML_HOST:-::}" --port "${ML_PORT:-8000}"