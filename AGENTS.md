# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor) in this repository; `CLAUDE.md` files import it.
When this file disagrees with the code, trust the code and fix this file.

- Name things with the terms in [`GLOSSARY.md`](GLOSSARY.md).
- **ML work** (anything in `apps/ml`, or a formula, threshold or output field): read
  [`docs/ml.md`](docs/ml.md) and [`apps/ml/AGENTS.md`](apps/ml/AGENTS.md) first.
- **UI work**: follow [`docs/ui/DESIGN.md`](docs/ui/DESIGN.md) and [`docs/ui/CONTENT.md`](docs/ui/CONTENT.md).
- A decision that is hard to reverse gets an ADR in [`docs/adr/`](docs/adr/).

## Project

Internal analytics for **1Moby**, a B2B messaging company (SMS, Email, OTP on prepaid credit), used by
~10–50 staff. Uploaded Excel workbooks become predictions of churn, CLV / Value Tier and the next credit
top-up. Three Model Types (churn, CLV, credit) plus rule-based Lifecycle Stages; win-back and conversion
models were cut for good.

- **Access is org-shared.** Every signed-in User can do everything: import, train, pin Champions, delete
  sources and runs, trigger outcome backfill. Sign-in is Google OAuth. AI chat conversations stay private
  per user; Text-to-SQL is scoped org-wide by the id allowlist in `apps/api/src/lib/ai/scope.ts`.
- **Deployment.** Local Docker for dev. CI checks every push and PR; deploying `web` / `api` / `ml` to
  Railway is a manual run of that workflow on `main` (checklist in `README.md`). The Railway services are
  stopped; model files live only in the local `./models` volume.

## Commands

Bun 1.4 (older Bun can't read the text `bun.lock`) drives the Turborepo. Run from the repo root.

```bash
bun install
docker compose up --build            # db, redis, ml, api, web; the api applies db/migrations/ on boot
docker compose up -d db redis ml     # backing services for local dev (host ports: db 5433, ml 8001)
docker compose up -d --build web     # the web image has no hot reload — `restart` won't pick up changes
bun run dev                          # web :3000, api :3001 via Turbo
bun run typecheck && bun run test && bun run build
cd apps/api && bun run db:introspect # refresh src/db/schema.ts from Postgres (never `generate`)
```

Running the api outside Docker needs `DATABASE_URL=…@localhost:5433`, `ML_INTERNAL_URL=http://localhost:8001`,
`REDIS_HOST`, `MODEL_DIR`, `BETTER_AUTH_URL`, `ALLOWED_ORIGINS` (see `.env.example`). ML commands, the
contract scripts and the golden run are in `apps/ml/AGENTS.md`.

**Tests.** `bun run test` runs the `*.test.ts` files beside the code: small, pure-logic checks that never
need a database. Add one beside any new parser, guard, money path or derived number.

## Architecture

```
Browser → Next.js :3000   (src/proxy.ts: session gate for pages)
  /api/auth/* → Elysia :3001/api/auth/*   (prefix kept for Better Auth)
  /api/*      → Elysia :3001/*            (prefix STRIPPED — Elysia routes live at /, e.g. /prediction-runs)

Elysia :3001
  → PostgreSQL (Drizzle / pg)
  → Redis (only the train-import progress Stream `train-import:{source_id}`)
  → FastAPI :8000/internal/{training-runs,prediction-runs,outcome-backfill}
                       token-gated; each spawns python -m src.cli.{train,predict,backfill_outcomes} detached
  → FastAPI :8000/internal/{model-activate,model-delete,repoint-production-for-training-run}
                       synchronous registry operations in Python
  → LLM for AI chat / insights (Ollama by default, any OpenAI-compatible API via LLM_PROVIDER)

ML runners → write results, progress_json and status to the ml_* tables; Elysia polls the run row
```

- **Web** (`apps/web/src`): every `app/**/page.tsx` is a thin server component (metadata + one view). A
  route's container is `features/<route>/<route>-view.tsx` (`"use client"`, fetches and owns state);
  presentational pieces are named for what they render. Cross-page state is zustand in `stores/`; data
  access goes through `lib/api.ts`, `lib/ml-api.ts` and `lib/http.ts`; loading through `lib/use-async.ts`.
- **Prediction run**: importing predict data (`POST /predict-data-sources/import`, awaited inline) creates
  and triggers an automatic run at the suggested cutoff (`auto_run: false` opts out); users can also
  create runs (`POST /prediction-runs`). Train import is the async one, streaming progress over Redis.
- **Runs end in `completed` or `failed`**: every exception sets `failed` + `error_message`, and the
  stale-run reaper (`apps/api/src/lib/ml/run-reaper.ts`) fails runs stuck longer than
  `STALE_RUN_TIMEOUT_MINUTES` (120).
- **Realized outcomes**: `POST /outcome-backfill` measures runs whose Horizon has passed; read them via
  `GET /prediction-runs/:id/realized-outcomes`.

| Decision | Reason |
|---|---|
| Elysia, not FastAPI, owns REST | The ML code is Python-only; typed API, SSE and Drizzle are TypeScript-native |
| FastAPI is internal-only | Training, prediction and SHAP need Python; Elysia proxies with `INTERNAL_SERVICE_TOKEN` |
| ML runs as spawned CLIs | Jobs outlive the HTTP call; results land in the `ml_*` tables |
| Run progress lives in Postgres | Runners write `progress_json`; the API polls it. (`arq` is in requirements but unused) |
| SSE, not WebSockets | Server pushes only (AI chat tokens); reconnects on its own, works behind any proxy |
| Drizzle in introspect mode | `db/migrations/` owns the schema ([ADR 0001](docs/adr/0001-plain-sql-migrations.md)) |

## Schema

Numbered plain-SQL migrations in `db/migrations/`; `001_schema.sql` is the baseline and the API applies
every unapplied file in order at boot. To change the schema:

1. Add `db/migrations/NNN_short_name.sql` with the next number. A file that has been applied anywhere is
   frozen.
2. `cd apps/api && bun run db:migrate && bun run db:introspect`.

Drizzle only reflects the schema for query building: schema changes go through migrations, never
`drizzle-kit generate` or a push. Raw and clean data are scoped per Data Source (`source_id` FK with
CASCADE; re-upload clears and re-inserts). All ML output goes into one `ml_prediction_outputs` table. The
Champion is the `production` alias in `ml_model_aliases`. Better Auth tables keep camelCase columns.

## Conventions

### TypeScript (web + api)

- Strict mode, no `any`. Files in `apps/web/src/` are kebab-case; exports stay PascalCase / camelCase.
- Shared types live in `packages/types` (`@moby/types`) and are imported from there.
- API response keys are snake_case. Validate input with `t.Object({...})`; group routes by resource.
- Drizzle: prefer the query builder with explicit snake_case aliases in `select()`.
- Errors: throw `HttpError` / `badRequest` / `notFound` / `conflict` (`apps/api/src/lib/http/errors.ts`);
  the app-level `onError` answers `{ message, code? }`, so routes leave `set.status` alone.
- Excel parsing helpers live once, in `apps/api/src/lib/data-import/excel-core.ts`.

Python style is in `apps/ml/AGENTS.md`.

### UI

- Work in tokens through Tailwind theme names (`bg-surface`, `text-muted`, `border-border`); colours
  live in `globals.css`.
- Format every number with `apps/web/src/lib/format.ts` and every enum label with `apps/web/src/lib/labels.ts`.
- Each page answers one question: the largest block answers it, and every KPI and chart title has an
  `InfoTip`. Every overview number is built once in `overview-model.ts`.
- Surfaces stay flat and KPIs stay text: no gradients, glows, uppercase labels, icon tiles on KPIs,
  sparklines, zebra rows or shimmer skeletons (`DESIGN.md` §10).

### Everywhere

- Every async operation handles failure; a run that throws ends `failed` with `error_message`.
- Logs never contain session tokens, API keys or user PII.
- Configuration comes from `process.env` / `os.environ`; magic strings (queue names, stream keys,
  statuses) are constants.
- Batch inserts, never row-by-row loops. Every Elysia route sits behind `requireUser`. Uploads are
  validated (size, MIME, required sheets) before inserting.

### Change rules

- **A change is structure-only or behaviour-only**, never both in one PR.
- **ML maths is bug-fix-only.** `features.py`, `churn_trainer.py`, `clv_trainer.py`, `credit_trainer.py`,
  `metrics.py`, `labels.py`, `leakage.py`, `preprocessing.py`, `promotion.py` and `drift.py` take only bug
  fixes, deletion of code nothing calls, and a literal swapped for a constant of the same value. The rest
  of `apps/ml` may be restructured.
- **Any change under `apps/ml/` or the import pipeline leaves the golden run unchanged**
  (`apps/ml/AGENTS.md`). A change meant to alter model output records a new baseline and says so.
- `apps/ml/src/cli/{train,predict,backfill_outcomes}.py` are spawned by FastAPI with `python -m`: keep
  their arguments stable.
