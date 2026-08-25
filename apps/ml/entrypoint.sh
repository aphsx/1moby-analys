#!/bin/bash
set -e

MODEL_DIR="${MODEL_DIR:-/app/models}"

echo "=== Starting ML v2 internal API (health + training/prediction job triggers) ==="

exec uvicorn api.main:app --host "${ML_HOST:-::}" --port "${ML_PORT:-8000}"