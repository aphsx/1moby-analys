# Moby Analytics

Internal analytics platform for **1Moby**, a B2B messaging company (SMS, Email, OTP on prepaid credit).
Staff upload the fixed 8-sheet Excel export; the platform then predicts which customers will **churn**,
what they are worth (**CLV**, Value Tier) and when they will **top up credit** next, and shows who to act
on first. About 10–50 internal users, all with the same rights, signed in with Google.

> **New here?** [`AGENTS.md`](AGENTS.md) has the architecture and conventions, [`GLOSSARY.md`](GLOSSARY.md)
> the domain terms, and [`docs/ml.md`](docs/ml.md) how every prediction is made.

## Stack

| Layer | Tech |
|---|---|
| **Web** (`apps/web`) | Next.js 16 (App Router) · React 18 · TypeScript · Tailwind 3 · Better Auth client · recharts |
| **API** (`apps/api`) | Elysia on Bun · Better Auth · Drizzle ORM (introspect only) · ioredis |
| **ML** (`apps/ml`) | Python 3.11 · FastAPI (health + internal triggers) · LightGBM · XGBoost · TabICL · SHAP · lifetimes · Optuna |
| **Database** | PostgreSQL 15 (`pgvector/pgvector:pg15`); schema in `db/migrations/`, applied by the API on boot |
| **Redis** | Progress stream of train imports only |
| **Monorepo** | Turborepo + Bun workspaces |

## Run it locally

### Docker (recommended)

```bash
cp .env.example .env          # fill in secrets: Google OAuth, BETTER_AUTH_SECRET, INTERNAL_SERVICE_TOKEN, LLM
docker compose up --build     # db, redis, ml, api, web
```

Open <http://localhost:3000>. Postgres starts empty; the API applies `db/migrations/` when it boots. The
`web` image has no hot reload: after a code change run `docker compose up -d --build web`.

### Fast UI loop

Run the backing services in Docker and the frontend on the host:

```bash
docker compose up -d db redis api    # add `ml` for training and prediction
cd apps/web && bun install
ELYSIA_URL=http://localhost:3001 bun run dev   # Next.js on :3000
```

### Checks

```bash
bun run typecheck && bun run test && bun run build   # web + api
apps/ml/scripts/golden_run.sh golden/after.csv      # any change under apps/ml or the import pipeline
```

The ML contract scripts and the golden run are described in [`apps/ml/AGENTS.md`](apps/ml/AGENTS.md).

## Service ports

| Service | Internal | External | Notes |
|---|---|---|---|
| `web` (Next.js) | `:3000` | `:3000` | proxies `/api/*` to the API |
| `api` (Elysia) | `:3001` | `:3001` | REST, Better Auth, SSE |
| `ml` (FastAPI) | `:8000` | `:8001` | internal only: `/health` and token-gated `/internal/*` |
| `db` (Postgres) | `:5432` | `:5433` | |
| `redis` | `:6379` | — | |

## How data flows

```
Excel (8 sheets) ─import→ {train,predict}_raw_* ─clean→ {train,predict}_clean_*

TRAINING   train_clean_* → gates → labels + features → backtests
           → candidates per Model Type → promotion policy → Model Versions (Champion = "production" alias)

PREDICTION predict_clean_* → gates → features → lifecycle rules → Champions
           → derived fields → ml_prediction_outputs (one row per Customer per run)

WEB        Overview · Customers · Customer page · Runs · Training · Model performance · AI assistant
```

The API owns every user-facing route, auth and SSE. It triggers ML jobs over the ML service's token-gated
`/internal/*` endpoints, which spawn `python -m src.cli.train` / `src.cli.predict` / `src.cli.backfill_outcomes`.
There are three Model Types (churn, CLV, credit) plus rule-based Lifecycle Stages.

## Deploy checklist (Railway)

CI (`.github/workflows/ci.yml`) checks every push. Deploying `web`, `api` and `ml` is a manual
**`workflow_dispatch`** run on `main`; Postgres and Redis are not deployed from CI. The services are
currently stopped.

1. **Models volume.** Attach a Railway volume to `ml` at `/app/models` (`MODEL_DIR=/app/models`).
   Model Version rows point at the files there.
2. **Backups.** Back up Postgres *together with* the models volume; one without the other leaves
   Model Versions pointing at missing artifacts, or artifacts no row knows.
3. **TabICL.** Give `ml` internet access or a persistent `HF_HOME` volume: a TabICL Champion downloads
   its checkpoint from Hugging Face on first use.
4. **Environment variables.**

   | Service | Variables |
   |---|---|
   | `api` | `DATABASE_URL`, `REDIS_HOST`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_ORIGINS`, `INTERNAL_SERVICE_TOKEN`, `ML_INTERNAL_URL`; optional `ML_INTERNAL_TIMEOUT_MS`, `STALE_RUN_TIMEOUT_MINUTES`; AI chat: `LLM_PROVIDER` with `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`, or `OLLAMA_HOST` / `OLLAMA_MODEL` |
   | `ml` | `DATABASE_URL`, `INTERNAL_SERVICE_TOKEN` (same value as the API's), `MODEL_DIR`; optional `CHURN_CANDIDATES`, `TABICL_MAX_ROWS`, `ENABLE_XGB_CREDIT` |
   | `web` | `ELYSIA_URL` (the API's internal URL), `NEXT_PUBLIC_AUTH_URL` |

5. **Deploy** with the manual workflow run (repo secret `RAILWAY_TOKEN`).

## Documentation

| Doc | Purpose |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Architecture, conventions and commands |
| [`GLOSSARY.md`](GLOSSARY.md) | Domain terms and the words to avoid |
| [`docs/ml.md`](docs/ml.md) | ML reference: lifecycle, labels, models, promotion, output contract |
| [`docs/ui/`](docs/ui/) | UI design system, copy rules and the UI plan (Thai) |
| [`docs/adr/`](docs/adr/) | Architecture decision records |
| `DASHBOARD.md` | Spec of the overview page |
