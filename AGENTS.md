# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor) working in this repository. `CLAUDE.md` files
import this one. It is the single source of truth for architecture and conventions. When prose here
disagrees with code, trust the code and fix this file.

**Refactor in progress.** Before any refactor, cleanup or restructuring change, read
[`docs/REFACTOR-PLAN.md`](docs/REFACTOR-PLAN.md): follow its ground rules and tick its boxes.
Name things with the terms in [`GLOSSARY.md`](GLOSSARY.md). Decisions with their reasons live in
[`docs/adr/`](docs/adr/).

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

**Deployment target:** Local Docker for dev. CI (`.github/workflows/ci.yml`) runs checks on every push
and PR; deploying `web` / `api` / `ml` to Railway is a manual run of that workflow on `main`
(Postgres + Redis are not deployed from CI). The Railway services are
currently stopped to save cost; model files live only in the local `./models` volume.

## Commands

Package manager is **Bun 1.4** (`packageManager` in `package.json`, the Dockerfiles and CI agree; older
Bun can't read the text `bun.lock`). The monorepo is driven by **Turborepo**.
Run from repo root unless noted.

```bash
# Install all workspaces
bun install

# Full stack via Docker (recommended) — db, redis, ml, api, web.
# Postgres starts empty; the api applies db/migrations/ on boot.
docker compose up --build
docker compose up -d db redis ml     # backing services for local dev (host ports: db 5433, ml 8001)
docker compose up -d --build web     # the web image has no hot reload — `restart` won't pick up code changes
# Running api outside Docker needs DATABASE_URL=…@localhost:5433, ML_INTERNAL_URL=http://localhost:8001,
# REDIS_HOST, MODEL_DIR, BETTER_AUTH_URL, ALLOWED_ORIGINS — see .env.example.

# Run everything in dev via Turbo (web :3000, api :3001)
bun run dev
bun run build                        # turbo build (web: next build; api: tsc --noEmit)
bun run typecheck                    # tsc --noEmit in web + api (`lint` is an alias for the same thing)

# Per-app dev (cd into the app)
cd apps/web && bun run dev           # Next.js on :3000
cd apps/api && bun run dev           # Elysia, hot-reload (bun --watch) on :3001
cd apps/api && bun run db:introspect # Drizzle reflects current PG schema into src/db/schema.ts (never `generate`)
```

ML service commands (CLIs, uvicorn) live in `apps/ml/AGENTS.md`.

### Tests / verification

`bun run test` runs the `*.test.ts` files next to the API code (`bun test`): small, pure-logic checks
for the SQL guard, the AI scope check and the Excel cell parsers. Add one beside any new parser,
guard or money path. CI runs `typecheck`, `test`, `build`, a Python compile check, and the
database-free contract scripts. ML correctness is checked by the
`apps/ml/scripts/verify_*.py` "contract" scripts — see `apps/ml/AGENTS.md` for which to run.

## Documentation

The old docs (Thai ML reference, dashboard spec, data-import docs, the final report) are archived on
the `academic` branch and are not canonical. Until the refactor's new docs land (plan Phase 7), the
code is the reference for every formula, threshold and output field.

The UI refactor has its own docs in [`docs/ui/`](docs/ui/) (Thai): `DESIGN.md` (tokens, components,
charts), `CONTENT.md` (copy, number formats, ⓘ texts, enum labels) and `REFACTOR-PLAN.md` (phases).
They replace steps 5.2–5.4 and 5.12 of the main plan.

### UI rules

- Follow `docs/ui/DESIGN.md` and `docs/ui/CONTENT.md`. Work through `docs/ui/REFACTOR-PLAN.md`
  phase by phase; one phase per PR.
- Use tokens via Tailwind theme names (`bg-surface`, `text-muted`, `border-border`); never hardcode
  hex colours in components.
- Format every number with `apps/web/src/lib/format.ts`; every enum label with `apps/web/src/lib/labels.ts`.
- No gradients, glows, uppercase labels, icon tiles on KPIs, sparklines, zebra rows or shimmer skeletons.
- Each page answers one question: the largest block answers it, every KPI and chart title has an `InfoTip`.

## Schema

The schema lives in numbered plain-SQL migrations in `db/migrations/`
([ADR 0001](docs/adr/0001-plain-sql-migrations.md)). `001_schema.sql` is the baseline; the API applies
every unapplied file in order at boot (`apps/api/src/db/migrate.ts`, also `bun run db:migrate`) and
records it in `schema_migrations`. To change the schema:

1. Add `db/migrations/NNN_short_name.sql` with the next number. Never edit a file that has already
   been applied anywhere.
2. Run `cd apps/api && bun run db:migrate`, then `bun run db:introspect` to refresh `src/db/schema.ts`.

Drizzle only reflects the schema for query building — **never run `drizzle-kit generate` or push
schema from Drizzle**.

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

## PostgreSQL Schema (Drizzle reflects `db/migrations/`)

Key design decisions:

- Raw/clean data is scoped per source (`source_id` FK with CASCADE). Re-uploading clears and re-inserts.
- All ML output goes into a single `ml_prediction_outputs` table (not split by model type).
- Champion selection is via `ml_model_aliases` (`production` alias, one per model_type).
- Better Auth tables use camelCase column names — Drizzle schema preserves this in
  `apps/api/src/db/schema.ts`.

## ML v2 Components

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
   `lib/data-import/train-progress/orchestrator.ts` and publishes progress to Redis Stream `train-import:{source_id}`.
2. On import success an **auto prediction run** is created + triggered with the suggested cutoff
   (`apps/api/src/lib/ml/auto-prediction-run.ts`; opt out with `auto_run: false`). Users can still
   create manual runs (`POST /prediction-runs`) with `{ predict_source_id, name, cutoff_date }`.
3. Elysia calls FastAPI `/internal/prediction-runs` (token-gated, AbortController timeout
   `ML_INTERNAL_TIMEOUT_MS`, default 30s), which spawns `python -m src.cli.predict` detached and returns.
4. The prediction runner loads `predict_clean_*` → gates → features → lifecycle + eligibility →
   champion models (churn / clv / credit) → SHAP (churn) → derived fields → **batch insert** into
   `ml_prediction_outputs` (one row per customer).
5. Run status moves `in_progress` → `completed` / `failed` (every exception ends in `failed` + `error_message`).
   A stale-run reaper (`apps/api/src/lib/ml/run-reaper.ts`) marks runs non-terminal for longer than
   `STALE_RUN_TIMEOUT_MINUTES` (default 120) as failed, on startup and every 5 minutes.

Training follows the same shape via `POST /training-runs` → `/internal/training-runs` → `python -m src.cli.train`.

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
| **Drizzle in introspect mode** | `db/migrations/` owns the schema; Drizzle reflects it. No `drizzle-kit generate`, no Alembic. |
| **PostgreSQL not MongoDB** | Data is relational. All ML output is tabular. |

## Code Style Rules

### TypeScript (web + api)

- Strict mode on. No `any`.
- File naming: **kebab-case** for all files in `apps/web/src/` (e.g. `my-component.tsx`, `my-store.ts`). Export names stay PascalCase/camelCase.
- Elysia: use `t.Object({...})` for input validation. Group routes by resource in `apps/api/src/routes/`.
- Drizzle: prefer query builder over raw `sql`. Use explicit snake_case column aliases in `select()`.
- Shared types live in `packages/types` (`@moby/types`). Do not redefine across apps — import from there.
- Response keys must be snake_case (matches the frontend contract).
- Errors: throw `HttpError` / `badRequest` / `notFound` / `conflict` (`apps/api/src/lib/http/errors.ts`);
  the app-level `onError` answers `{ message, code? }`. Routes never set `set.status` for errors.
- Shared Excel parsing utilities are in `apps/api/src/lib/data-import/excel-core.ts` — do not duplicate in `train-import.ts` / `predict-import.ts`.

Python (ml) style rules live in `apps/ml/AGENTS.md`.

### Universal

- Every async operation must handle failure. Runs must update `status='failed'` with `error_message` on exception.
- Never log sensitive data (session tokens, API keys, user PII).
- Environment variables from `process.env` / `os.environ` only. Never hardcode.
- Magic strings (queue names, stream keys, status values) extracted to constants.

## What To Build Next (Phase 2)

- **AI chat RAG** — enable the `vector` extension + knowledge tables, ingest `docs/`, real retrieval.
- **CLV log-space retrain (P1)** — proper fix for whale under-prediction (hybrid tail mitigation
  is shipped; retrain + promotion gates need a populated DB).
- **Production hardening** — on redeploy, attach a Railway volume to `ml` at `/app/models` (model files
  are local files, not in Postgres); schedule Postgres backups together with that volume.
- **Real email notifications** on pipeline completion.

## Change Rules

- **ML maths is bug-fix-only.** In `apps/ml/src/training/`, these files take only bug fixes, deletion of
  code nothing calls, and swapping a literal for a constant of the same value: `features.py`,
  `churn_trainer.py`, `clv_trainer.py`, `credit_trainer.py`, `metrics.py`, `labels.py`, `leakage.py`,
  `preprocessing.py`, `promotion.py`, `drift.py`.
- **The rest of `apps/ml` may be restructured** (the three `runner.py`, `registry.py`, `data.py`,
  `repository.py`, `artifacts.py`, `datasets.py`, `validation.py` data loading, `api/`), as long as the
  golden run is unchanged (plan step 0.6).
- **A change is structure-only or behaviour-only**, never both in one PR.
- `db/migrations/*.sql` — never edit an applied migration; add a new numbered file and re-introspect Drizzle.
- `apps/ml/src/cli/train.py` / `apps/ml/src/cli/predict.py` — CLI entrypoints spawned by FastAPI via
  `python -m`; keep their arguments stable.

## Always Check

- Is the run status updated to `in_progress`/`completed`/`failed` at the right points?
- Are all Elysia routes behind `requireUser`? Reads and writes are org-wide for any
  authenticated user (train import, training, champion pinning, backfill, deletes).
- Are uploaded files validated (size, MIME, required sheet presence) before inserting?
- Are batch inserts used (never row-by-row `for` loops)?
