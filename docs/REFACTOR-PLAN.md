# Refactor plan

Goal: make the codebase easy to read and maintain for an engineer who has never seen it, before it
runs in production. Built from a full review of `apps/web`, `apps/api`, `apps/ml`, `db/` and repo
infra (2026-10-23), then a decision session with the project owner.

- Each `- [ ]` is one PR unless it says otherwise. Tick it when merged.
- `file:line` references are as of commit `a0889f4` plus the working tree on 2026-10-23. Lines drift,
  so search by the symbol name if a number is off.
- Words like Data Source, Champion, Cutoff Date and Prediction Output are defined in
  [`GLOSSARY.md`](../GLOSSARY.md). Use them in new code and when renaming.
- Delete this file when the last box is ticked.

## Ground rules

1. **A PR either changes structure or changes behaviour, never both.** Each step is tagged
   `[structure]` or `[behaviour]`. If a structure PR turns up a bug, write it down and fix it in its own PR.
2. **Every PR passes** `bun run build && bun run typecheck && bun test` (all added to CI in Phase 0).
3. **ML maths stays bug-fix-only.** In `apps/ml/src/training/`, these files only get bug fixes,
   deletion of code nothing calls, and swapping a literal for a constant of the same value:
   `features.py`, `churn_trainer.py`, `clv_trainer.py`, `credit_trainer.py`, `metrics.py`, `labels.py`,
   `leakage.py`, `preprocessing.py`, `promotion.py`, `drift.py`. Every other ML file (the three
   `runner.py`, `registry.py`, `data.py`, `repository.py`, `artifacts.py`, `datasets.py`,
   `validation.py` data loading, `api/`) may be restructured.
4. **Any PR that touches `apps/ml/` or the import pipeline must leave the golden run unchanged**
   (step 0.6). A PR that is *meant* to change model output records a new golden baseline
   and says so in its description.
5. Thai **UI text** and user-facing messages stay as they are; they are product copy. Thai **code
   comments** get translated to English when their file is touched.

---

## Phase 0: Baseline and safety net

- [x] **0.1 Commit the current dead-code cleanup** `[structure]`
  The working tree already deletes `apps/web/src/mocks/ml.ts`, `lib/auth-client.ts`,
  `apps/ml/api/models.py`, `quick-prompts-aside.tsx`, `model-type-help.ts`, `apps/web/bun.lock`, and
  others (about 1,570 lines). Commit it as the baseline.
  *Done when:* `bun run build` passes and `git status` is clean.

- [x] **0.2 Archive academic material and the old docs** `[structure]`
  1. Create the `academic` branch from main at 0.1 and push it. It keeps everything below.
  2. On main, `git rm`:
     - `DIAGRAMS.docx`, `docx/`, `docs/*.docx`, `docs/generate-report-docx.js`
     - every `docs/*.md` except this file and `docs/adr/`
     - `moby-data-prep/` (docs, the Python import script, the yaml, the requirements)
     - `.cursor/skills/ml-contract-review/` and `.agents/skills/ml-contract-review/`, which point at
       docs that no longer exist
  3. Remove `dependencies.docx` from the root `package.json`.
  4. Add `archive/` to `.gitignore`, for local copies.
  5. Rename `data/[1Moby] Data_example for Bangkok university.xlsx` to
     `data/sample-1moby-workbook.xlsx`. It is mock data from 1Moby, kept as the fixture.
  6. Update the code comments that mention `moby-data-prep` or `excel_schema.yaml`
     (`apps/api/src/lib/sheet-cleaners.ts:2`, `train-excel-contract.ts:2`, `train-import.ts:3`).

  *Done when:* `git grep -E "Data_example|ML-CALCULATIONS|FINAL-REPORT|moby-data-prep|excel_schema"`
  returns nothing.

- [x] **0.3 Make `AGENTS.md` the single source of agent instructions** `[structure]`
  - Move the current `CLAUDE.md` content into `AGENTS.md`, replacing the untracked `AGENTS.md`, which
    is an older diverged fork. `CLAUDE.md` becomes the single line `@AGENTS.md`.
  - Do the same for `apps/ml/CLAUDE.md` → `apps/ml/AGENTS.md`.
  - While moving, edit:
    - Replace "What NOT to change" with ground rule 3 above.
    - Remove R2 from "What to build next".
    - Remove every link to archived docs, and the `train_v2.py` / `predict_v2.py` mentions.
    - Replace "There are no tests" with the 0.4–0.6 commands.
    - Point to `GLOSSARY.md` and `docs/adr/`.

- [x] **0.4 Make CI check everything, and deploy only on demand** `[behaviour]`
  `.github/workflows/ci.yml:36` runs only `bun run build`, and `ml` deploys on every push.
  - Add `bun run typecheck` and `bun test`.
  - Add a Python job:
    - `pip install -r apps/ml/requirements.txt`
    - `python -m compileall -q src api`
    - the database-free contract scripts `scripts/verify_promotion_policy.py` and
      `scripts/verify_constants_sync.py`
  - Change the Railway deploy job to `on: workflow_dispatch` only. Railway is stopped to save cost.

  *Done when:* a push to main runs all checks and deploys nothing.

- [x] **0.5 Unit tests for the risky pure logic in the API** `[structure]`
  Plain `bun test` files next to the code, a handful of cases each, focused on what must be rejected:
  - `lib/ai/sql-guard.ts`: rejects writes, multiple statements, disallowed tables
  - `lib/ai/scope.ts`: injects the org-wide id allowlist
  - `lib/sheet-cleaners.ts` and `lib/train-clean-cell.ts`: dates, numbers, blanks, junk cells

  *Done when:* `bun test` in `apps/api` runs more than zero tests and CI runs them.

- [x] **0.6 Golden run: an end-to-end regression check for ML and import changes** `[structure]`
  Add `apps/ml/scripts/golden_run.py`:
  1. Create a scratch database `moby_golden` and apply the schema.
  2. Import `data/sample-1moby-workbook.xlsx` as both a train and a predict Data Source, via
     `bun run apps/api/scripts/seed-import.ts`.
  3. Insert a Training Run row with a fixed Cutoff Date and call `run_training`.
  4. Insert a Prediction Run row with a fixed Cutoff Date and call `run_prediction`.
  5. Dump `ml_prediction_outputs`, sorted by customer, to CSV.

  Use `MODEL_DIR` pointed at a temp dir so real models are never touched.
  `golden_run.py --compare before.csv after.csv` checks:
  - categorical columns exactly
  - numeric columns within `1e-6`

  Run it twice on unchanged code first. If the two runs differ (LightGBM uses `n_jobs=-1`), make the
  golden run single-threaded before trusting it.
  *Done when:* two runs on the same commit compare clean.

---

## Phase 1: Bugs (each one its own PR)

Data-loss and corruption bugs come first.

- [x] **1.1 Model versions can collide and overwrite a Champion's files** `[behaviour]`
  - `apps/ml/src/training/registry.py:27-38` numbers a version as `count(*)` of this month's versions.
  - Delete one, or run two trainings at once, and it hands out a version that already exists.
  - `artifacts.py:25` uses `mkdir(exist_ok=True)`, so `save_artifacts` overwrites that version's
    `model.pkl` before the insert fails on `uq_ml_model_versions_type_version`.

  Fix:
  - Compute `max(seq)+1` under an advisory lock in the insert transaction.
  - Use `mkdir(exist_ok=False)`.
  - In the API, reject `POST /training-runs` with 409 while another Training Run is `pending` or
    `in_progress` (`apps/api/src/routes/training-runs.ts:185`).

- [x] **1.2 Retried runs get killed by the reaper** `[behaviour]`
  - `apps/api/src/routes/prediction-runs/runs.ts:128-131` resets `status` but not `startedAt`.
  - The runner keeps the old value (`apps/ml/src/prediction/runner.py:1363`,
    `COALESCE(started_at, NOW())`).
  - So a retry of a run first started more than 120 minutes ago is reaped within 5 minutes.

  Fix: set `startedAt: null, finishedAt: null` on retry.

- [x] **1.3 Failed Prediction Runs keep their outputs** `[behaviour]`
  `apps/ml/src/prediction/runner.py:363-368` runs the post-check after `_replace_outputs` has
  committed. Fix: delete the run's `ml_prediction_outputs` rows in the failure branch of
  `run_prediction`.

- [x] **1.4 Deleting a Model Version removes its files before its row** `[behaviour]`
  - `registry.py:442-452` runs `rmtree` before the database transaction at `:453`.
  - The reference check and the delete use different connections.

  Fix: do the check and the delete in one transaction, then `rmtree` after commit.

- [x] **1.5 Verify the artifact checksum when loading a model** `[behaviour]`
  The checksum stored at save time is never checked (`artifacts.py:78`). Fail loudly when it is
  missing or wrong, so a lost volume or a corrupted file can't be served silently.

- [x] **1.6 Training logs are thrown away** `[behaviour]`
  `apps/ml/src/training/runner.py:150-153` captures stdout in a `StringIO` that is never saved, so
  `docker compose logs ml` shows nothing. Fix: drop the `redirect_stdout` and the unused `log_buffer`
  parameter (`:166`). Phase 6.4 then turns the prints into logger calls.

- [x] **1.7 AI chat ignores runs created by colleagues** `[behaviour]`
  `apps/api/src/lib/ai/orchestrator.ts:98` filters the bound run by `createdBy = userId`, although
  access is org-wide. A chat bound to a colleague's run silently falls back to global scope.
  Fix: drop the `createdBy` condition.

- [x] **1.8 The AI SQL agent is given the wrong status values** `[behaviour]`
  `apps/api/src/lib/ai/semantic-layer.ts:36` and `:94` describe statuses as
  `pending, ready, failed` and `pending, running, done, failed`. Fix: use the real values,
  `importing / cleaning / ready / failed` and `pending / in_progress / completed / failed`.

- [x] **1.9 Credit Urgency colours are swapped between pages** `[behaviour]`
  `apps/web/src/features/customers/customers-view.tsx:155-160` has monitor gray / stable blue, while
  `features/dashboard/palette.ts:22-27` has Monitor blue / Stable gray. Fix: the customers page uses
  `CREDIT_PALETTE` from `palette.ts`.

- [x] **1.10 The Customer 360 back link drops filters** `[behaviour]`
  `apps/web/src/app/customers/[id]/page.tsx:14-20` keeps only 5 query keys and drops
  `credit_urgency_level`, sort and page. So going back from the low-credit preset resets the list.
  Fix: keep every customer-list query key.

### Small behaviour fixes

- [x] **1.11 "Active run" means `pending` or `in_progress` everywhere** `[behaviour]`
  The Runs page polls only `in_progress` (`apps/web/src/features/runs/runs-view.tsx:42`); Training
  also counts `pending` (`features/training/training-view.tsx:37`). Each has its own 3000 ms constant.
  Fix: one `isActiveRunStatus` and one poll interval in `lib/run-status.ts`.

- [x] **1.12 Set `finished_at` when triggering a run fails** `[behaviour]`
  Add `finishedAt: new Date()` to the four failure updates:
  - `routes/prediction-runs/runs.ts:78-85` and `:133-140`
  - `routes/training-runs.ts:196-203`
  - `lib/auto-prediction-run.ts:61-75`

  Phase 4.4 then merges the four into one helper.

- [x] **1.13 Record a warning when SHAP explanations fail** `[behaviour]`
  `apps/ml/src/prediction/runner.py:462` completes the run with null factors and no sign of the
  failure. Fix: append a warning to the run's `progress_json.warnings`, and show it on the run in the
  Runs page.

- [x] **1.14 Move stuck-import cleanup out of read endpoints** `[behaviour]`
  - `lib/abort-data-source.ts` runs from inside the GET list handlers (`routes/train-data.ts:171`,
    `routes/predict-data.ts:51`).
  - It deletes row by row (`:37-39`, `:57-59`).

  Fix: move it into `lib/run-reaper.ts`, which already runs every 5 minutes, as one `DELETE … RETURNING`.

- [x] **1.15 Remove the fake UI** `[behaviour]`
  - The disabled email/password form in `apps/web/src/app/login/page.tsx:56-96` (sign-in is Google only).
  - The "Chat API connected · no mock prediction data" text in `components/ai-chat-widget.tsx:354`.

- [x] **1.16 A malformed id returns 422, not 500** `[behaviour]`
  Replace the 17 hand-written `UUID_RE.test` checks with `t.String({ format: "uuid" })` in route
  `params`. That also covers routes that skip the check today (`routes/train-data.ts:286`, `:337`,
  `routes/predict-data.ts:59`).

---

## Phase 2: Database migrations

See [ADR 0001](adr/0001-plain-sql-migrations.md).

- [x] **2.1 Hand-clean the baseline schema** `[structure]`
  `db/init/001_schema.sql` is a raw pg_dump: 1,744 of its 2,681 lines are headers and blank lines.
  - Rewrite it by hand: put constraints, defaults and indexes inline per table, and drop the
    psql-only `\restrict` / `\unrestrict` lines (`:5`, `:2680`).
  - Move it to `db/migrations/001_schema.sql`.

  *Done when:* `pg_dump --schema-only` of a database built from the old file and one built from the
  new file are identical.

- [x] **2.2 Migration runner at API boot** `[behaviour]`
  - Add `apps/api/src/db/migrate.ts` (about 30 lines). It:
    - takes `pg_advisory_lock`
    - creates `schema_migrations(filename, applied_at)`
    - applies the unapplied `db/migrations/*.sql` files in order, each in a transaction
  - A database that already has the tables but no `schema_migrations` gets `001` marked as applied.
  - Call it where `ensureImportSchemaCompat()` is called today (`apps/api/src/index.ts:14`).
  - Remove the `docker-entrypoint-initdb.d` mount from `docker-compose.yml`, so the runner is the
    only path for fresh and existing databases alike.
  - Document "new migration → run → `bun run db:introspect`" in `AGENTS.md`.

- [x] **2.3 Turn `schema-compat.ts` into `002_schema_compat.sql`** `[structure]`
  Move its idempotent `ALTER`s (`IF EXISTS` / `IF NOT EXISTS`) into the migration, then delete
  `apps/api/src/lib/schema-compat.ts`. Existing local volumes catch up; on fresh ones it does nothing.

- [x] **2.4 `003`: drop dead columns, add CHECK constraints** `[behaviour]`
  - Drop `ml_model_versions.model_card_path`, `ml_model_evaluations.error_analysis_json` and
    `ml_model_evaluations.artifact_path`. Nothing reads or writes them.
  - Add CHECK constraints on the `ml_*` status columns, `output_status`, and the risk / urgency /
    tier columns, matching `packages/types/src/enums.ts`.
  - Run `SELECT DISTINCT` on each column first, in case existing rows hold an unexpected value.
  - Re-introspect Drizzle.

---

## Phase 3: Dependencies and infra hygiene

- [x] **3.1 Pin and prune Python dependencies (tabicl stays)** `[structure]`
  - **tabicl is kept.** The decision was to drop it unless it had been winning on real data, and it
    has: the current churn Champion (`churn-2026.09.0`) is a tabicl model. Removing the package would
    also make that Champion impossible to load. `docs/ml.md` (7.3) records why it stays. The golden run
    skips it to stay fast, so tabicl-only code paths are not covered by that gate.
  - Delete the dependencies nothing uses: `arq`, `msgpack`, `redis`, `boto3`, `matplotlib`,
    `seaborn`, `openpyxl`, `python-multipart`. Grep for each one before deleting it.
  - Keep the direct dependencies in `requirements.in`, and generate a fully pinned `requirements.txt`
    with `pip freeze` from a working image.

- [x] **3.2 docker-compose and image cleanup** `[structure]`
  - In `docker-compose.yml`:
    - Remove the api `./models` mount (it was for `/model-metrics`, which is gone; the API never
      reads `MODEL_DIR`).
    - Remove the ml `./data:/data` mount and ml's `depends_on: redis`.
    - Fix the pgvector comment that cites a nonexistent `ai_knowledge_chunks`.
  - Add `apps/ml/.dockerignore`, and remove `apps/web/bun.lock` from the root `.dockerignore`.
  - ~~Run the ml container as a non-root user.~~ Deferred to the deploy checklist (7.1): a non-root user
    can't write to a root-owned `./models` or Railway volume without a `chown` step.
  - Remove the unused `MODEL_DIR` from `apps/ml/entrypoint.sh:4`.

- [x] **3.3 Sync `.env.example` with the code** `[structure]`
  - Add the variables the code reads but the example lacks: `CHURN_CANDIDATES`,
    `ENABLE_XGB_CREDIT`, `ML_HOST`, `ML_PORT`, `IMPORT_MAX_UPLOAD_BYTES`, `IMPORT_TIMEOUT_MS`,
    `REDIS_PORT`, `REDIS_URL`, `PORT`.
  - Remove the ones nothing reads: `AI_RAG_TOP_K`, `DATA_DIR`, `DOCKER_BUILD`, `TRAIN_CUTOFF_DATE`,
    and, after 4.7, `AI_CHAT_DEFAULT_ROLE`. Keep `TABICL_*` and `TORCH_VARIANT` (tabicl stays, see 3.1).

- [x] **3.4 Package metadata** `[structure]`
  - Root `package.json`: set `packageManager` to `bun@1.4.0`, to match CI and the Dockerfiles.
  - Rename `apps/web` from `moby-dashboard` to `@moby/web`, rename the `moby-dashboard#build` key in
    `turbo.json` to match, and drop its pointless `dist/**` output.
  - In `apps/web`:
    - Remove the unused deps `pg`, `@types/pg` and `@elysiajs/eden`.
    - Remove the unused tsconfig path `@moby/api`, the `test` script pointing at a missing `tests/`
      dir, and the empty `e2e/.auth` and `test-results` dirs.
  - Delete `apps/ml/pyproject.toml`, which has an invalid build backend, no deps and dead scripts.

---

## Phase 4: API (`apps/api`)

Target layout of `src/lib/` (routes stay grouped by resource in `src/routes/`):

```
lib/
  env.ts                  one place that reads and parses process.env
  http/                   auth-middleware, errors (HttpError, notFound)
  data-import/            excel-core, sheet-contract, raw-import, clean, clean-mapping,
                          sheet-cleaners, cell-parsers, clean-manifest, clean-cutoff,
                          data-source-dto, import-timeout
  data-import/train-progress/   orchestrator, stream, progress, redis
  ml/                     ml-internal, model-registry, prediction-runs, training-runs,
                          auto-prediction-run, run-reaper, run-aggregates, customers
  ai/                     as today, minus the customer data loader
```

- [x] **4.1 Move files into the layout** `[structure]`
  Moves and import-path updates only.
  - ~~Move `ai/customer-dataset.ts` to `ml/customers.ts`.~~ Kept in `ai/`: only the AI customer
    explanation uses it, so the move bought nothing.
  - Move `routes/prediction-runs/_helpers.ts` to `ml/prediction-runs.ts`.
  - Rename `routes/train-data.ts` and `routes/predict-data.ts` to `train-data-sources.ts` and
    `predict-data-sources.ts`, matching the URLs.
  - Create `env.ts`. The same env-number parsing is written in `constants.ts:105-113`,
    `ml-internal.ts:15` and `run-reaper.ts:22`, and the `localhost:3000` default appears 3 times.
    Done as one `positiveNumberEnv` helper; the two origin defaults differ on purpose (auth also
    trusts `:3001`), so they stayed.

- [x] **4.2 One import pipeline for both kinds of Data Source** `[structure]`
  Split into 3 PRs; gate each with the golden run plus a UI import of the sample workbook as both kinds.
  - **a. Contract and raw import.**
    - `predict-excel-contract.ts:21-57` writes out by hand what `train-excel-contract.ts:66` builds
      with a helper. Merge the two into one `sheet-contract.ts`.
    - Merge `train-import.ts` and `predict-import.ts` (about 80% identical) into
      `importRaw(kind)`, driven by a per-kind map `{ sourcesTable, rawTables, cleanTables }`.
    - Keep one `readImportBuffer` (`predict-data.ts:104-109` rewrites the one in
      `train-import-orchestrator.ts:34`).
  - **b. Clean.**
    - Merge `train-clean.ts` and `predict-clean.ts` (about 95% identical) into `cleanFromRaw(kind)`.
    - Keep one `chunk()` (it is defined at `excel-core.ts:11`, `train-clean.ts:55` and
      `predict-clean.ts:48`).
    - Rename `train-clean-mapping.ts` / `train-clean-cell.ts` to `clean-mapping.ts` /
      `cell-parsers.ts`, since predict uses them too.
  - **c. Progress and rollback.**
    - Rollback happens in seven places: `train-import.ts:224`, `train-clean.ts:222`,
      `train-import-orchestrator.ts:102`, `train-data.ts:84` and `:148`, `predict-clean.ts:200`,
      `predict-data.ts:154`. Make the top-level function the only one that rolls back.
    - Move the import-progress state machine out of the handler (`train-data.ts:180-285`) into the
      stream module.
    - Merge `train-import-progress.ts` and `train-pipeline-progress.ts` into one table of percentages.
      This also replaces the hard-coded 97 at `train-import.ts:203` and `:205` and the 4 copies of
      "Ready for model training".
  - Delete the synchronous `POST /…/import` route (`train-data.ts:52-102`); the web only calls
    `/import/async`.
  - Update `apps/api/scripts/seed-import.ts`.

- [x] **4.3 One error shape and one way to guard** `[behaviour]`
  - Add an `HttpError` class and an `app.onError` that returns `{ message, code? }`, where `code` is
    `SCREAMING_SNAKE`. Today responses mix these shapes:
    - `{message}`
    - `{message, error_code}`
    - `{status: "not_found", message}` (`train-data.ts:208`)
    - `{message, details}`

    Codes are also inconsistent: `IMPORT_TIMEOUT` vs `run_not_found`.
  - Replace the `ServiceError` unions (`ai/customer-ai-service.ts:23`, `ai/run-insight.ts:37`) and
    their `"status" in result` checks (`prediction-runs/insight.ts:35`, `customer-360.ts:71`) with
    thrown errors.
  - Replace `requireFoundForRead` (`lib/access-control.ts`) with `if (!run) throw notFound(...)`.
    That removes about 20 `run!` / `version!` assertions; delete `access-control.ts`.
  - Map upstream ML errors in `ml-internal.ts` once. `upstream === 400 ? 409 : 502` appears 3 times:
    `model-performance.ts:482`, `training-runs.ts:322`, `:347`.
  - Update the web's error reader (`apps/web/src/lib/ui-error.ts`) in the same PR.

- [x] **4.4 Run and Model Version helpers in `lib/ml/`** `[structure]`
  - `ml/prediction-runs.ts` and a new `ml/training-runs.ts` own the select, row type, mapping and
    fetch. Today:
    - `training-runs.ts:33-97` rebuilds them inline.
    - `RunRow` / `TrainingRunRow` are copied by hand instead of inferred from the select.
    - `summary.ts:128-137` repeats `fetchRun`'s join.
    - `customer-360.ts:53-63` and `outputs.ts:99-109` duplicate the output lookup.
    - `ai/customer-ai-service.ts:8` defines a third `RunRow`.
  - Add `triggerRunOrFail(table, id, path)` in `ml-internal.ts` and use it in the four places fixed
    in 1.12.
  - Move the Gate 3 raw SQL out of the route (`training-runs.ts:144-175`) into
    `clean-cutoff.ts:checkTrainCutoff()`, reusing its activity UNION. Use one constant for the
    180-day Horizon (`train-data.ts:320`, `training-runs.ts:30`).
  - `ml/model-registry.ts` owns the "Prediction Runs still use this Model Version" check and its 409
    message. It is duplicated at `model-performance.ts:299-315` and `:457-471`, and
    `training-runs.ts:275-303`.
  - Fold the leftover sub-instances from the old role split into their main route groups:
    `trainImportRoutes` (`train-data.ts:50`), `trainingWriteRoutes` (`training-runs.ts:99`),
    `modelActivateRoutes` (`model-performance.ts:317`).
  - ~~Call `model-activate` through `callMlInternalJson`.~~ Fixed the doc comment instead: activate
    doesn't need the response body, so `triggerMlJob` is right.

- [x] **4.5 Shared types and constants come from `@moby/types`** `[structure]`
  - Delete the enum copies in `lib/constants.ts:10-103` and import from `@moby/types`.
  - Delete `lib/ml-contract.ts`, which only re-exports.
  - Move `RunInsight` (`ai/run-insight.ts:25`) and `CustomerAiExplanationResult`
    (`ai/customer-ai-service.ts:15`) into `@moby/types`. Rename the different shape that reuses the
    name in `ai/customer-explanation.ts:28`.
  - Add `MODEL_TYPES` to `@moby/types`. The union is written 5 times: `model-performance.ts:28`,
    `runs.ts:55`, and three times inside packages/types. The web copies are handled in 5.11.
  - Repoint `apps/ml/scripts/verify_constants_sync.py` from `apps/api/src/lib/constants.ts` to
    `packages/types/src/enums.ts` in the same PR, or the CI check breaks.
  - New constants:
    - `IMPORT_STATUS`, replacing 25 literals
    - `MODEL_ALIAS.PRODUCTION`: `model-performance.ts:208`, `:388`, `:434`; `summary.ts:27`;
      `training-runs.ts:305`
    - `EVALUATION_TYPE`: `model-performance.ts:176` is a bare literal while
      `realized-outcomes.ts:20` already has the constant
    - and replace the bare `"completed"` at `insight.ts:29`

- [x] **4.6 Snake_case responses for AI chat** `[behaviour]`
  - `routes/ai-chat.ts:70-86`, `:109`, `:141` and `:165` return raw Drizzle rows (`runId`,
    `evidenceJson`, …). Map them to snake_case.
  - Put `ChatMsg`, `Conversation` and `ChatEvidence` in `@moby/types`. The web defines its own at
    `apps/web/src/stores/chat-store.ts:45` and `:228`.
  - Give the body of `model-performance.ts:326` a `t.Object` schema using `model_version_id`.
  - Update the web in the same PR.

- [x] **4.7 Dead code and stale comments** `[structure]`
  Grep-confirm each one before deleting it.
  - Dead code:
    - the re-export line at `prediction-runs/_helpers.ts:217`
    - the deprecated aliases in `clean-manifest.ts:22-26`
    - the unused sheet lists in `train-excel-contract.ts:20-22` and `predict-excel-contract.ts:8-9`
    - in `excel-core.ts:70`, the unused `expected` variable and `sheetConfig` parameter
    - `onSourceCreated` (`train-import.ts:120`)
    - `deferReadyCatalog`, which is always true, together with its dead `else` branches
    - `embedModel` in `llm-config.ts`
  - Role-model leftovers: `semantic-layer.ts:1`, `:17-21` and `:138-142`; `AI_CHAT_DEFAULT_ROLE`;
    the "user's own" wording in `scope.ts`; the `AuthUser` comment in `packages/types/src/auth.ts:2-8`.
  - Stale comments:
    - 11 `[NEW]` tags
    - references to docs that don't exist: `index.ts:59`, `outcome-backfill.ts:2`,
      `run-insight.ts:12`, `model-performance.ts:4`, `training-runs.ts:3`, `predict-excel-contract.ts:4`
    - "no DB" in `excel-core.ts:3`
    - the misplaced note at `predict-data.ts:6`

- [x] **4.8 Use the query builder for plain selects** `[structure]`
  `ml/customers.ts` (formerly `ai/customer-dataset.ts:32-55`) is a single-table select written in raw SQL.

---

## Phase 5: Web (`apps/web`)

shadcn/ui replaces the home-made components early (5.2–5.4), so the later splits are written once,
on the new components.

- [ ] **5.1 Delete dead code first** `[structure]`
  Grep-confirm each one.
  - In `components/ui.tsx`:
    - six components with no importers: `KpiCard` (66), `DeltaPill` (128), `StackBar` (186),
      `Sparkline` (220), `ActionChip` (293), `AlertItem` (308)
    - the ignored `eyebrow` prop on `PageHeader` (13) and the deprecated `dot` prop on
      `StatusPill` (168)
  - Unused helpers: `training-utils.ts:28` and `:36`; `getSession` in `lib/auth/client.ts:18`.
  - Unreachable code:
    - the `"init"` id check in `ai-chat-widget.tsx:61`
    - the `Inner` wrapper (`customers-view.tsx:592`) and `pendingRows` (`:271`)
    - the `/api/` branch in `proxy.ts:17`
    - `clearMessages` (`stores/chat-store.ts:390`) and its `formatTime` re-export (`:410`)
  - Stale comments:
    - `training-view.tsx:3-8`, `api.ts:1-7` and `:33-34`, `nav.ts:42`, `run-store.ts:9`
    - six `eslint-disable` comments (there is no ESLint config)

- [ ] **5.2 Upgrade to Tailwind v4** `[structure]`
  - Run the official codemod (`npx @tailwindcss/upgrade`). It moves `tailwind.config` into CSS
    (`@theme` in `src/app/globals.css`) and renames changed utilities.
  - Keep the existing 1Moby colour variables as they are; 5.4 maps them onto shadcn's names.

  *Done when:* `bun run build` passes and before/after screenshots of every page match.

- [ ] **5.3 React 19 and `shadcn init`** `[structure]`
  - Upgrade `react`, `react-dom` and `@types/react*` to 19; the current shadcn components expect it.
  - Run `shadcn init`. It adds `components.json`, `lib/utils.ts` (`cn()` = `clsx` + `tailwind-merge`),
    `class-variance-authority`, and the theme variables in `globals.css`.
  - Point shadcn's theme variables at the existing brand colours so nothing changes colour:
    `--primary` = Moby blue, `--destructive` = `--danger`, `--muted-foreground` = the `--ink-*` text
    grey, and so on. Fold `lib/login-brand-colors.ts` and `dashboard/palette.ts` into those variables,
    and keep the chart-only hex values in one `lib/brand.ts`.

  *Done when:* the app builds and looks the same, and no component uses shadcn yet.

- [ ] **5.4 Swap the home-made primitives for shadcn, one PR each** `[behaviour]`
  Each PR adds one shadcn component, replaces every use of the old one, deletes the old one, and is
  reviewed with before/after screenshots. Expect small spacing and focus-ring changes.
  1. `Button`, replacing the duplicated class strings (`create-run-panel.tsx:160`, `:395`;
     `PRIMARY_BUTTON_CLS` in `training-utils.ts:6`)
  2. `Card` for `SectionCard`
  3. `Badge` for `StatusPill`
  4. `Select` for the 324-line `components/select.tsx`
  5. `Dialog` / `AlertDialog` for `components/status-dialog.tsx`
  6. `Alert` for the error banners and `Skeleton` for loading
  7. `Input` / `Textarea` for the form fields and the chat box

  While each file is open:
  - Replace its `[color:var(--…)]` classes (448 in total) with theme utilities such as
    `text-muted-foreground`.
  - Replace its `[].join(" ")` and template-string class names with `cn()`.

  *Done when:* `components/select.tsx` and `components/status-dialog.tsx` are gone,
  `components/ui.tsx` holds only app-specific pieces such as `PageHeader`, and
  `git grep "\[color:var(--"` is empty.

- [ ] **5.5 One HTTP client** `[structure]`
  - Put a single `requestJson<T>(url, init)` in `lib/http.ts` that handles the 401 redirect and
    `{ message, code }` errors. Today:
    - `lib/api.ts` repeats parse + throw 5 times and copies the 401 redirect at `:146`.
    - `ml-api.ts:73-95` has its own client, whose `sendJson` skips the 401 redirect.
    - `IMPORT_TIMEOUT` is built at `api.ts:175`, `:217` and `:371`.
  - Move chat HTTP and SSE (`chat-store.ts:100-168`) into `lib/ai-chat-api.ts`.
  - Remove the barrel re-exports (`ml-api.ts:10-51`, `api.ts:11`, the `export *` in
    `lib/auth/index.ts`) and import from `@moby/types` directly.

- [ ] **5.6 Load data one way; fetch the run list once** `[structure]`
  - Add a small `useAsync` hook to replace the 9 copies of the `let alive` effect.
  - Move the run list and its loading and error state into `stores/run-store.ts`. Today it is fetched
    by the header, the page, and `ai-chat-view.tsx:408`.
  - Move `useActiveRun` out of `components/run-selector.tsx:13` into the store.
  - Keep only one `?run=` sync, `run-url-sync.tsx`, moved to `components/`. Remove the copies in
    `customers-client.tsx:211-216` and `customer-detail-client.tsx:39-44`.
  - Fix the reverse import from `status-dialog-store` into `components/`.

- [ ] **5.7 Show errors and loading one way** `[behaviour]`
  - Use shadcn `Alert` for errors and `Skeleton` for loading on every page (from 5.4).
  - `getDisplayError` returns a string; this replaces the 13 inline `e instanceof Error` checks.
  - Stop swallowing errors at `training-view.tsx:110` (which makes `loadError` unreachable),
    `ai-chat-view.tsx:412`, `chat-store.ts:196` and `run-insight-card.tsx:26`.
  - A failed run-list fetch shows an error, not "no completed run".
  - Remove the redundant `Suspense` at `customers-client.tsx:341`.

- [ ] **5.8 One container convention: `*-view.tsx`** `[structure]`
  - `*-view.tsx` is the route's container (it fetches data and owns state). Presentational pieces are
    named for what they render. The `-client` suffix goes away:
    - `dashboard-client` + `dashboard-view` → `dashboard-view` + `dashboard-grid`
    - `customers-client` + `customers-view` → `customers-view` + `customers-table` + `customers-filters`
    - `customer-detail-client` + `customer-detail-view` → `customer-detail-view` + `customer-detail-layout`
  - Move the 160-line client page `app/login/page.tsx` to `features/login/login-view.tsx`, leaving
    the page thin.
  - Move the href builder in `app/customers/[id]/page.tsx` to `features/customers/`, shared with
    `customerHref`.
  - In `customers-client.tsx`:
    - Merge the four URL writers (`:134-207`) into one `writeQuery(mutate)`.
    - Stop copying `URLSearchParams` 9 times, and stop rebuilding the fetch query that
      `toOutputsQuery` already builds (`customers-view.tsx:141`).
  - Type `CustomerFilters` with `OutputsQuery` fields, which removes the casts at
    `customers-view.tsx:148-151` and `customers-client.tsx:223-231`.
  - Rename `dashboard/types.ts` to `dashboard-view-model.ts` and trim it: drop
    `output_status: "mock"` and 6 unused fields, and give every card the same input
    (`dashboard-view.tsx:89-98`).
  - Use named exports everywhere except `page.tsx`: `shell`, `sidebar`, `ai-chat-widget`,
    `run-selector` and `user-nav-profile` use default exports today.
  - Merge `training-utils.ts` into `training-run-utils.ts`, and remove the status re-export shims
    (`runs-utils.ts:9`, `training-run-utils.ts:4`).
  - Rename `selectedSourceId2` (`training-view.tsx:152`).

- [ ] **5.9 One pannable chart** `[structure]`
  - Put `usePannableViewport(length, defaultVisible)` and `<ChartNavigator>` in
    `components/pannable-chart.tsx`.
  - Today each chart has its own viewport, clamp, range label, wheel and drag handlers, and
    navigator:
    - `dashboard/monthly-revenue-card.tsx:17-62`
    - `customers/customer-usage-chart.tsx:19-73`, `:186-337`, `:436-469`
    - `customers/customer-payment-chart.tsx:17-68`, `:86-247`, `:351-384`
  - Afterwards each chart keeps only its data mapping and its `<Line>` / `<Bar>`.

- [ ] **5.10 AI chat: share the pieces, split the view** `[structure]`
  - Share the message, streaming and thinking bubbles, the auto-resizing textarea (shadcn `Textarea`), auto-scroll and
    the LLM status label in `components/chat/`, used by both `features/ai-chat/ai-chat-view.tsx` and
    `components/ai-chat-widget.tsx`. Today the two copies use different textarea max heights (160 vs
    96) and different status labels (`view:451` vs `widget:152`).
  - Split `ai-chat-view.tsx` (604 lines) into `chat-sidebar` (`:36-228`), `evidence-panel`
    (`:231-306`) and `message-list` (`:509-563`).
  - Rename its local `EmptyState` (`:331`) to `ChatWelcome`.
  - Use selectors with `useChatStore` (`:136`, `:398`), so the sidebar stops re-rendering on every
    streamed token.

- [ ] **5.11 Types come from `@moby/types`** `[structure]`
  - Replace `CustomerDetail` (`customer-detail-view.tsx:27-57`) with `PredictionOutput`.
  - `CleanCounts` is redefined at `runs-utils.ts:16` and `training-utils.ts:9`.
  - `TrainCleanManifest` / `TrainImportProgress` (`api.ts:55-102`) and `DeleteTrainingRunResult`
    (`ml-api.ts:223`) move to `@moby/types`, shared with the API.
  - Use `MODEL_TYPES` instead of the copies at `create-run-panel.tsx:41` and `model-status-cards.tsx:34`.
  - Replace `STAGES` (`customers-view.tsx:31`) with `LIFECYCLE_STAGES`.
  - `icon?: any` (`ui.tsx:270`) becomes `LucideIcon`.

- [ ] **5.12 One formatter set and one name per page** `[behaviour]`
  - `lib/format.ts` owns all display formats:
    - currency `฿12,345`, compact `฿12.3K` / `฿1.2M`
    - dates `23 Oct 2026`, or `23 Oct 2026, 14:05` when the time matters

    It replaces these local formatters:
    - dates: `customer-profile-panel.tsx:6`, `training-utils.ts:36`, `metric-info.ts:325`,
      `runs-utils.ts:48`, `profile-view.tsx:54`, `run-insight-card.tsx:83`
    - currency: `lib/format.ts:12`, `customer-payment-chart.tsx:388`, `monthly-revenue-card.tsx:98`,
      `value-risk-matrix-card.tsx:103`
    - the three copies of `formatCompact`
  - Page names are the same in the sidebar, the header and the browser tab (`lib/nav.ts`,
    `app/*/page.tsx` metadata): Dashboard, Customers, Customer 360, Prediction Runs, Model Training,
    Model Performance, AI Assistant, My Account.
  - Give Model Training and Model Performance different nav icons (`nav.ts:49`, `:55`).

- [ ] **5.13 Small duplicates** `[structure]`
  - One `HighValueMedal` (`customer-row-ui.tsx:50`, `customer-detail-primitives.tsx:132`), one
    `isHighValueTier`, and one `initials` (`user-nav-profile.tsx:10`, `profile-view.tsx:9`).
  - Split `InlineImportForm` (`create-run-panel.tsx:288-409`) into `predict-import-form.tsx`.

---

## Phase 6: ML structure (`apps/ml`, every PR gated by the golden run)

- [ ] **6.1 Dead code** `[structure]`
  Grep-confirm each one.
  - `_promotion_decision` (`training/runner.py:1368`) and `_beats_existing_champion` (`:1397`),
    about 70 lines replaced by `promotion.py`
  - `train_churn` (`churn_trainer.py:463`) and `build_preprocessor` (`preprocessing.py:42`)
  - `source_id_of` (`runner.py:1439`), which re-queries a run that is already loaded
  - `cli/train_v2.py` and `cli/predict_v2.py`, which nothing calls
  - `_incumbent_backtests` (`runner.py:649`), which becomes a call to
    `_incumbent_backtests_by_metric(..., "pr_auc")`

- [ ] **6.2 One database module: `src/db.py`** `[structure]`
  - One cached engine replaces the 32 `create_engine(database_url())` calls.
  - One JSON helper replaces `registry.py:23`, `outcomes/runner.py:752` and `repository.py:148`.
  - One "JSON or string" loader replaces `runner.py:657`, `:678`, `:1413` and
    `outcomes/runner.py:560`.
  - One `update_run(table, id, **fields)` / `load_run` replaces `prediction/runner.py:1313` and
    `:1334`, `registry.py:782` and `:823`, and `outcomes/runner.py:499`. Run-row CRUD leaves the
    model registry.

- [ ] **6.3 One home for constants** `[structure]`
  Move them into `src/constants.py` and change no values.
  - `RANDOM_SEED`:
    - defined 5 times: `datasets.py:26`, `leakage.py:27`, `churn_trainer.py:69`,
      `clv_trainer.py:63`, `credit_trainer.py:50`
    - literal 42 at `runner.py:191`, `:288`, `churn_trainer.py:419`, `metrics.py:214`, `:270`, `:319`
  - `EARLY_STOPPING_ROUNDS`: defined 3 times, plus the literal 50 at `credit_trainer.py:706`.
  - `URGENT_TOPUP_DAYS` (`credit_trainer.py:56`) → `DerivedThresholds.URGENCY_CRITICAL_DAYS`. Only if
    the values are equal; otherwise log it as a bug.
  - The `"tier_a_27"` / `"tier_a_31"` literals (`runner.py:482`, `:896`, `:1179`).
  - Status literals (`runner.py:158`, `:186`, `:326`) → `RunStatus`; `_risk_level` literals
    (`prediction/runner.py:416-420`) → `RiskLevel`.

- [ ] **6.4 One logging and one progress shape** `[structure]`
  - Turn the 27 `print()` calls in training into `logger` calls, as prediction already does.
  - Training progress is `{phase, pct}` and prediction progress is `{step, pct}`. Use
    `{phase, pct}` for both, and update the web reader in the same PR.
  - Fix the stale "24-feature" docstring (`prediction/runner.py:93`; the list has 27).

- [ ] **6.5 Split `training/runner.py` (1,487 lines)** `[structure]`
  - `_train_and_register_churn` (`:336`, 311 lines), `_clv` (`:780`, 277) and `_credit` (`:1062`, 291)
    share a tail of about 150 lines. Extract it as `_register_and_promote()` and
    `_persist_evaluations()`. The tail is: next version → feature contract → save artifacts → insert
    version → evaluation loops → verify load → promote.
  - Move the backtest and credit-cutoff dataset building (`:224-280`) into `datasets.py`.
  - Make `_resolve_candidates` public and import it at the top of the file (it is imported privately
    inside a function at `:281`).

- [ ] **6.6 Split `prediction/runner.py` (1,423 lines)** `[structure]`
  Into `scoring.py` (apply the churn, CLV and credit models), `derived.py` (descriptive and derived
  fields, Segments) and `persistence.py` (`OUTPUT_COLUMNS`, `_replace_outputs`, `_post_check`, the
  run row). The long functions go with them: `_run_prediction_inner` (175 lines),
  `_build_output_rows` (116), `_apply_derived` (106), `_apply_descriptive` (96).

- [ ] **6.7 Break up the long registry functions** `[structure]`
  Split `promote_model_version` (`registry.py:200`, 158 lines), `delete_model_version` (`:360`, 199)
  and `repoint_production_away_from_training_run` (`:638`, 99) into named steps.

- [ ] **6.8 Load clean data once per run** `[structure]`
  - Today each validation gate calls `load_clean_dataset` (`validation.py:159`, `:180`, `:254`,
    `:274`), so a Training Run reads its train data 5 times and a Prediction Run reads its predict
    data 3 times.
  - Load it once in the runner and pass a `CleanDataset` into the gates. The checks themselves don't
    change.

- [ ] **6.9 FastAPI `api/` cleanup** `[structure]`
  - Delete `api/database.py`, which is async SQLAlchemy only for `/health`. `/health` uses
    `src/db.py` instead, and `asyncpg` leaves `requirements.in`.
  - Drop CORS (`main.py:46`); the service is internal only.
  - Move the mid-file imports (`main.py:74-75`) to the top.
  - Check the token with a `Depends`, and use pydantic request models instead of raw `request.json()`.
  - Make the synchronous registry handlers plain `def`, so they stop blocking the event loop.
  - Fix the logging claim in the comment at `main.py:79`.
  - Replace the `assert` invariant at `outcomes/runner.py:176` with an explicit `raise`.

---

## Phase 7: New docs, written from the refactored code

- [ ] **7.1 `README.md`** covers what the project is, how to run it locally, and a deploy checklist:
  - attach a Railway volume to `ml` at `/app/models`
  - set the required env vars
  - deploy with the manual `workflow_dispatch`
  - back up Postgres together with the models volume, because Model Version rows point at those files
  - give `ml` internet access or a persistent `HF_HOME` volume: loading a tabicl Champion downloads
    its TabICL checkpoint from Hugging Face on first use
- [ ] **7.2 `AGENTS.md`** gets trimmed to architecture, conventions and commands. Anything a reader
  can learn from the code faster than from prose goes.
- [ ] **7.3 `docs/ml.md`** is the English ML reference: each Model Type's formulas, thresholds and
  constants, eligibility rules, promotion policy, and the `ml_prediction_outputs` output contract.
  Written from the code, citing files rather than line numbers.
- [ ] **7.4 Final check** that `GLOSSARY.md` and `docs/adr/` are current, then delete this plan.

---

## Not doing (and when to reconsider)

| Skipped | Why | Reconsider when |
|---|---|---|
| Cloudflare R2 for model files | A Railway volume on `ml` is enough for 11 MB of models | More than one `ml` instance, or models need off-box backups |
| TanStack Query | `useAsync` plus `run-store` covers about 10 pages and 10–50 users | Caching or de-duplication bugs keep coming back |
| One table for all raw sheets | The 16 raw tables cost schema size, not code, once 4.2 is done | Never on its own; only if the workbook format changes |
| Outcome backfill job-status table | Logs are enough at this scale | Backfill failures go unnoticed |
| Single Postgres driver (Better Auth on Drizzle) | Swapping touches sign-in for one fewer pool | Connection limits become a problem |
| New linters (ruff, ESLint) | Strict `tsc` and `compileall` gate CI; this plan is already large | Review comments keep catching lint-level issues |
| Rewriting ML maths | No tests pin it; the golden run only proves "unchanged" | A bug or a deliberate model change, as its own PR |
