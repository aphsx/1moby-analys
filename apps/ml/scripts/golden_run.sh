#!/usr/bin/env bash
# Golden run: rebuild a scratch database, import the sample workbook, train, predict,
# and write the Prediction Outputs to CSV. Run it on the base commit and on your change,
# then compare:
#
#   apps/ml/scripts/golden_run.sh golden/before.csv
#   apps/ml/scripts/golden_run.sh golden/after.csv
#   python3 apps/ml/scripts/golden_run.py compare golden/before.csv golden/after.csv
#
# Output paths are relative to apps/ml (golden/ is gitignored). Needs the compose `db`
# running and bun on the host. The dev database and ./models are never touched.
set -euo pipefail

OUT="${1:?usage: golden_run.sh <out.csv relative to apps/ml>}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
env_value() { grep -E "^$1=" .env | head -1 | cut -d= -f2-; }
POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_PASSWORD="$(env_value POSTGRES_PASSWORD)"

GOLDEN_DB=moby_golden
HOST_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5433/${GOLDEN_DB}"
CONTAINER_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${GOLDEN_DB}"
psql_db() { docker compose exec -T db psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"; }

echo "[golden] rebuilding ${GOLDEN_DB}"
psql_db -d postgres -c "DROP DATABASE IF EXISTS ${GOLDEN_DB}" -c "CREATE DATABASE ${GOLDEN_DB}"
DATABASE_URL="$HOST_URL" bun run apps/api/src/db/migrate.ts > /dev/null

echo "[golden] importing data/sample-1moby-workbook.xlsx"
DATABASE_URL="$HOST_URL" bun run apps/api/scripts/seed-import.ts data/sample-1moby-workbook.xlsx > /dev/null

echo "[golden] training and predicting (a few minutes)"
mkdir -p "apps/ml/$(dirname "$OUT")"
# ponytail: golden run skips tabicl and XGBoost to stay fast; it guards pipeline structure, not candidate choice.
docker compose run --rm --no-deps -T \
  -v "$ROOT/apps/ml:/app" \
  -e DATABASE_URL="$CONTAINER_URL" \
  -e MODEL_DIR=/tmp/golden-models \
  -e CHURN_CANDIDATES=logistic_regression,lightgbm \
  -e ENABLE_XGB_CREDIT=0 \
  --entrypoint python ml scripts/golden_run.py dump --out "$OUT"
