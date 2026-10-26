# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
It is the single source of truth for architecture and conventions. When prose here disagrees with code,
trust the code and fix this file.

# Moby Analytics — Project Context

## Project Overview

Internal analytics platform for **1Moby**, a B2B SaaS messaging company (SMS/Email service).
Used by internal staff across multiple teams (~10–50 users). Analyzes uploaded Excel data to
predict customer churn, segment customers by CLV / value tier, and forecast credit consumption.

**Access model (org-shared):** all data sources, runs, and dashboards are visible to every
authenticated user. There is no admin/member role — any signed-in user can import train
and predict data, trigger training, pin production models, delete sources/runs, and
trigger outcome backfill. Sign-in is Google OAuth. AI chat conversations stay private per user, but
Text-to-SQL queries are scoped org-wide (deterministic id allowlist in
`apps/api/src/lib/ai/scope.ts`).

**Deployment target:** Local Docker for dev. CI (`.github/workflows/ci.yml`) deploys `web` / `api` / `ml`
to Railway on push to `main` (Postgres + Redis are not deployed from CI).

## Commands

Package manager is **Bun** — Dockerfiles and CI use Bun 1.4 (`packageManager: bun@1.0.0` in `package.json`
is stale; older Bun can't read the text `bun.lock`). The monorepo is driven by **Turborepo**.
Run from repo root unless noted.

```bash
# Install all workspaces
bun install

# Full stack via Docker (recommended) — db, redis, ml, api, web.
# Fresh Postgres volumes initialize from the single schema at db/init/001_schema.sql.
docker compose up --build
docker compose up -d db redis ml     # backing services for local dev (host ports: db 5433, ml 8001)
docker compose up -d --build web     # the web image has no hot reload — `restart` won't pick up code changes
# Running api outside Docker needs DATABASE_URL=…@localhost:5433, ML_INTERNAL_URL=http://localhost:8001,
# REDIS_HOST, MODEL_DIR, BETTER_AUTH_URL, ALLOWED_ORIGINS — see docs/WEB-DEV-WORKFLOW.md (TH).

# Run everything in dev via Turbo (web :3000, api :3001)
bun run dev
bun run build                        # turbo build (web: next build; api: tsc --noEmit) — this is all CI runs
bun run typecheck                    # tsc --noEmit in web + api (`lint` is an alias for the same thing)

# Per-app dev (cd into the app)
cd apps/web && bun run dev           # Next.js on :3000
cd apps/api && bun run dev           # Elysia, hot-reload (bun --watch) on :3001
cd apps/api && bun run db:introspect # Drizzle reflects current PG schema into src/db/schema.ts (never `generate`)
```

ML service commands (CLIs, uvicorn) live in `apps/ml/CLAUDE.md`.

### Tests / verification

There are **no tests**. `bun run test` is wired to `bun test` per app but no test files exist; no pytest. ML correctness is checked by the
`apps/ml/scripts/verify_*.py` "contract" scripts — see `apps/ml/CLAUDE.md` for which to run.

When asked whether an ML rebuild task is "good enough / complete / ready", use the `ml-contract-review`
Cursor skill (`.cursor/skills/ml-contract-review/`) and `docs/ML-CALCULATIONS-TH.md` + `docs/ML-V2-DASHBOARD-SPEC.md`.

## Canonical Documentation

The documentation map lives in [`docs/README.md`](docs/README.md). Key references:

- `docs/ML-CALCULATIONS-TH.md` — **canonical ML reference (TH)**: every formula, metric, threshold, constant, the `ml_prediction_outputs` output contract, plus training design-contract & policy
- `docs/ML-V2-DASHBOARD-SPEC.md` — what every web page/widget shows, field-by-field
- `docs/AI-ASSISTANT.md` — AI chat assistant (separate feature)
- `docs/FINAL-REPORT-FULL-TH.md` — full Thai senior-project report (system explanation, submission copy); supersedes the removed HOW-IT-WORKS / MODEL-DEEP-DIVE / PROJECT-REPORT docs
- `moby-data-prep/docs/*` — Excel import contract, table naming, raw/clean schemas

When implementing anything ML- or dashboard-related, follow these docs over any legacy code.


Schema is a single bootstrap file at `db/init/001_schema.sql`, mounted into Postgres as
`/docker-entrypoint-initdb.d/001_schema.sql` for fresh Docker volumes. Drizzle only reflects that
schema for query building — **never run `drizzle-kit generate` or push schema from Drizzle**. There is
**no Alembic / migration framework**; schema changes are made directly in `001_schema.sql`.

## Traffic Flow

```
Browser → Next.js :3000   (src/proxy.ts = Next 16 middleware: session gate for pages)
  /api/auth/* → Elysia :3001/api/auth/*   (prefix kept for Better Auth)
  /api/*      → Elysia :3001/*            (prefix STRIPPED — Elysia routes live at /, e.g. /prediction-runs)

Elysia :3001
  → PostgreSQL (Drizzle / pg)
  → Redis (only the train-import progress Stream `train-import:{source_id}`)
  → FastAPI :8000/internal/training-runs     (token-gated, spawns python -m src.cli.train)
  → FastAPI :8000/internal/prediction-runs   (token-gated, spawns python -m src.cli.predict)
  → FastAPI :8000/internal/outcome-backfill  (spawns python -m src.cli.backfill_outcomes)
  → FastAPI :8000/internal/model-activate | model-delete | repoint-production-for-training-run
                                             (synchronous registry/alias ops, done in Python)
  → LLM (AI chat / insights) — Ollama by default, any OpenAI-compatible API via LLM_PROVIDER
    (apps/api/src/lib/ai/llm-config.ts)

FastAPI :8000/health  ← Docker healthcheck
ML runners            ← write results + `progress_json` / status to PostgreSQL (ml_* tables);
                        Elysia reads progress from the run row (polling), not from Redis
```

Frontend (`apps/web/src`): every `app/**/page.tsx` is a thin server component (metadata + compose
one client view); all UI lives in `features/<route>/*-view.tsx` (`"use client"`, flat, no barrel
files); cross-page state is zustand in `stores/`; data access goes through `lib/api.ts` /
`lib/ml-api.ts` (there is no mock layer). Don't put JSX bodies or `useState` in `page.tsx`.

## PostgreSQL Schema (Drizzle reflects `db/init/001_schema.sql`)

Key design decisions:

- Raw/clean data is scoped per source (`source_id` FK with CASCADE). Re-uploading clears and re-inserts.
- All ML output goes into a single `ml_prediction_outputs` table (not split by model type).
- Champion selection is via `ml_model_aliases` (`production` alias, one per model_type).
- Better Auth tables use camelCase column names — Drizzle schema preserves this in
  `apps/api/src/db/schema.ts`.

## ML v2 Components (see `docs/ML-CALCULATIONS-TH.md` — canonical)

| Component           | Type                                 | Output                                              |
| ------------------- | ------------------------------------ | --------------------------------------------------- |
| **Lifecycle**       | Rule-based (not ML)                  | `lifecycle_stage`, `sub_stage`                      |
| **Churn**           | LightGBM + calibration + SHAP        | `churn_probability`, `churn_risk_level`, factors    |
| **CLV**             | BG-NBD + Gamma-Gamma vs ML regressor | `predicted_clv_6m`, `p_alive`                       |
| **Credit Forecast** | LightGBM quantile regression         | `predicted_credit_usage_30d/90d`, days-until-topup  |

Win-back and conversion models (`comeback_probability`, `conversion_probability`)
were **permanently cut** — do not reintroduce them.

## Job Flow (prediction run)

1. A signed-in user imports predict data on `/runs` (`POST /predict-data-sources/import`) — raw + clean
   awaited inline in the request (no progress stream). Train import is the async one: it runs via
   `train-import-orchestrator.ts` and publishes progress to Redis Stream `train-import:{source_id}`.
2. On import success an **auto prediction run** is created + triggered with the suggested cutoff
   (`apps/api/src/lib/auto-prediction-run.ts`; opt out with `auto_run: false`). Users can still
   create manual runs (`POST /prediction-runs`) with `{ predict_source_id, name, cutoff_date }`.
3. Elysia calls FastAPI `/internal/prediction-runs` (token-gated, AbortController timeout
   `ML_INTERNAL_TIMEOUT_MS`, default 30s), which spawns `python -m src.cli.predict` detached and returns.
4. The prediction runner loads `predict_clean_*` → gates → features → lifecycle + eligibility →
   champion models (churn / clv / credit) → SHAP (churn) → derived fields → **batch insert** into
   `ml_prediction_outputs` (one row per customer).
5. Run status moves `in_progress` → `completed` / `failed` (every exception ends in `failed` + `error_message`).
   A stale-run reaper (`apps/api/src/lib/run-reaper.ts`) marks runs non-terminal for longer than
   `STALE_RUN_TIMEOUT_MINUTES` (default 120) as failed, on startup and every 5 minutes.

Training follows the same shape via `POST /training-runs` → `/internal/training-runs` → `python -m src.cli.train`
(see `docs/ML-CALCULATIONS-TH.md` §8–§12).

**Realized-outcome loop:** once a run's horizon has elapsed and newer predict data exists,
`python -m src.cli.backfill_outcomes` (spawned via `POST /internal/outcome-backfill`, triggered by
`POST /outcome-backfill`) rebuilds actual labels with the training label builders and upserts
per-run realized metrics as `ml_model_evaluations` rows (`evaluation_type='production_holdout'`,
keyed by `prediction_run_id`). Read via `GET /prediction-runs/:id/realized-outcomes`.

## Architectural Decisions

| Decision | Rationale |
|---|---|
| **Elysia (not FastAPI) owns REST** | ML pipeline code is Python-only; Elysia handles TypeScript-native concerns (typed API, SSE, Drizzle). |
| **FastAPI is internal-only** | Training/prediction/SHAP require Python. Elysia proxies via `INTERNAL_SERVICE_TOKEN`. FastAPI never serves the browser directly. |
| **ML runs as spawned CLIs** | `python -m src.cli.{train,predict,backfill_outcomes}` launched detached from FastAPI internal endpoints; results land in `ml_*` tables. |
| **Run progress in Postgres** | Runners write `progress_json` on the run row; the API polls it. Redis Streams are used only for train-import progress. (`arq` is in requirements.txt but unused.) |
| **SSE not WebSockets** | Server pushes only (AI chat tokens). Auto-reconnect, works behind any proxy. |
| **Drizzle in introspect mode** | `db/init/001_schema.sql` owns schema; Drizzle reflects it. No `drizzle-kit generate`, no Alembic. |
| **PostgreSQL not MongoDB** | Data is relational. All ML output is tabular. |

## Code Style Rules

### TypeScript (web + api)

- Strict mode on. No `any`.
- File naming: **kebab-case** for all files in `apps/web/src/` (e.g. `my-component.tsx`, `my-store.ts`). Export names stay PascalCase/camelCase.
- Elysia: use `t.Object({...})` for input validation. Group routes by resource in `apps/api/src/routes/`.
- Drizzle: prefer query builder over raw `sql`. Use explicit snake_case column aliases in `select()`.
- Shared types live in `packages/types` (`@moby/types`). Do not redefine across apps — import from there.
- Response keys must be snake_case (matches the frontend contract).
- Shared Excel parsing utilities are in `apps/api/src/lib/data-import/excel-core.ts` — do not duplicate in `train-import.ts` / `predict-import.ts`.

Python (ml) style rules live in `apps/ml/CLAUDE.md`.

### Universal

- Every async operation must handle failure. Runs must update `status='failed'` with `error_message` on exception.
- Never log sensitive data (session tokens, API keys, user PII).
- Environment variables from `process.env` / `os.environ` only. Never hardcode.
- Magic strings (queue names, stream keys, status values) extracted to constants.

## What To Build Next (Phase 2)

- **AI chat RAG** — enable the `vector` extension + knowledge tables, ingest `docs/`, real retrieval
  (see `docs/AI-ASSISTANT.md`).
- **R2 integration** — store `.pkl` artifacts in Cloudflare R2 (currently local filesystem).
- **CLV log-space retrain (P1)** — proper fix for whale under-prediction (hybrid tail mitigation
  is shipped; retrain + promotion gates need a populated DB).
- **Production hardening** — app services deploy to Railway via CI; still need scheduled Postgres backups.
- **Real email notifications** on pipeline completion.

## What NOT to Change

- `apps/ml/src/training/` and `apps/ml/src/prediction/` — ML pipeline code. Touch only to fix bugs, never to refactor style.
- `db/init/001_schema.sql` — single schema bootstrap; edit deliberately and keep Drizzle in sync.
- `apps/ml/src/cli/train.py` / `apps/ml/src/cli/predict.py` — CLI entrypoints (spawned by FastAPI via `python -m`). `train_v2.py`/`predict_v2.py` are compat shims that forward to these.

## Always Check

- Is the run status updated to `in_progress`/`completed`/`failed` at the right points?
- Are all Elysia routes behind `requireUser`? Reads and writes are org-wide for any
  authenticated user (train import, training, champion pinning, backfill, deletes).
- Are uploaded files validated (size, MIME, required sheet presence) before inserting?
- Are batch inserts used (never row-by-row `for` loops)?
