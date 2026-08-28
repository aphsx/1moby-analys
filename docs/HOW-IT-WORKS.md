# How This System Works — End-to-End Walkthrough

Plain-English explanation of the whole Moby Analytics codebase: what happens from the
moment someone drags an Excel file into the browser to the moment an account manager
sees "this customer has a 71% chance of churning, and here's why".

Technical terms are used freely, but every one of them is unpacked.

**Companion docs (deeper, per model):**
- [`MODEL-CHURN-DEEP-DIVE.md`](MODEL-CHURN-DEEP-DIVE.md) — the churn model, line by line
- [`MODEL-CLV-CREDIT-DEEP-DIVE.md`](MODEL-CLV-CREDIT-DEEP-DIVE.md) — CLV and credit forecast

---

## 1. What the product actually is

1Moby sells SMS and Email messaging credit to businesses. Customers **pre-pay** — they
buy a block of credit, then burn it down over weeks or months by sending messages.

That business shape drives every design decision in this repo:

- There is **no subscription and no cancel button**, so "churn" cannot be read off a
  status column. It has to be *inferred* from silence.
- A customer can pay once and be healthy for six months. So "only paid once" is not a
  danger signal here the way it would be in a SaaS seat business.
- Usage data arrives **monthly** (year, month, count), not per-message. That single fact
  forces every date cutoff in the system to be snapped to the 1st of a month.

The platform is an **internal** tool for ~10–50 1Moby staff. Everything is shared
org-wide: any logged-in user sees every dataset, run and dashboard. Only `admin` users
can import training data, trigger training, pin champion models, or run the outcome
backfill.

The platform answers four questions per customer:

| Question | Output | How it's answered |
|---|---|---|
| What state is this customer in? | `lifecycle_stage` | Deterministic rules, not ML |
| Will they stop buying? | `churn_probability` | Supervised classifier (LightGBM / TabICL / LR) |
| How much are they worth in the next 6 months? | `predicted_clv_6m` | BG-NBD+Gamma-Gamma vs Tweedie GBM vs Hurdle |
| When do they need more credit, and how much? | `predicted_credit_usage_30d/90d`, `estimated_days_until_topup` | LightGBM quantile regression + XGBoost AFT survival |

---

## 2. The five services

```
Browser
   │
   ▼
Next.js  :3000    ← UI. Server components render pages; /api/* is proxy-rewritten to Elysia.
   │
   ▼
Elysia   :3001    ← The only service the browser talks to. Auth, REST, SSE, Excel import,
   │                orchestration. TypeScript on Bun.
   ├──► PostgreSQL 15   (all data: raw sheets, clean tables, ML outputs, model registry)
   ├──► Redis           (progress event streams during import)
   ├──► Ollama          (LLM for AI chat + generated explanations)
   └──► FastAPI :8000   ← INTERNAL ONLY. Token-gated. Never serves the browser.
              │
              └──► spawns `python -m src.cli.train` / `src.cli.predict` as detached
                   subprocesses. Those processes write results straight back to Postgres.
```

**Why the split?** The ML libraries (LightGBM, SHAP, `lifetimes`, Optuna) only exist in
Python. Everything else — typed API, auth sessions, SSE, Drizzle queries — is far nicer
in TypeScript. So Elysia owns all HTTP the user sees, and FastAPI exists purely as a
"start this Python job" button protected by a shared `INTERNAL_SERVICE_TOKEN`.

**Why subprocesses?** Training takes minutes. The FastAPI endpoint spawns the job with
`start_new_session=True` and returns a PID immediately. The Python runner then owns the
entire lifecycle of the run row: it flips `status` to `in_progress`, writes progress JSON
as it goes, and ends at `completed` or `failed`. No HTTP request is ever held open.

**Schema ownership.** `db/init/001_schema.sql` is the single bootstrap file. Drizzle runs
in *introspect-only* mode — it reflects that schema so queries are typed, but never
generates or pushes migrations. There is no Alembic. To change schema you edit the SQL
file and (for a fresh volume) let Postgres re-bootstrap.

---

## 3. Data model: two parallel worlds

Everything exists twice: **train** and **predict**.

```
train_data_sources  →  train_raw_sheet_*  (8 tables)  →  train_clean_*  (3 tables)
predict_data_sources → predict_raw_sheet_* (8 tables)  → predict_clean_* (3 tables)
```

They are physically separate tables with identical shapes. Why: a training file must
contain history *plus* the future window you're going to grade the model against. A
predict file is the freshest snapshot you have and has no future at all. Mixing them is
exactly how you leak future information into a model. Separate tables make that mistake
structurally impossible.

### The Excel contract (fixed, 8 sheets)

| Sheet | Becomes | Key columns |
|---|---|---|
| `Users+User_profile` | `*_clean_customers` | acc_id, join_date, status (SMS/Email), credit, expire, last_access, last_send |
| `Backend_payment` | `*_clean_payments` | uid, acc_id, payment_date, amount, credit_add, credit_type |
| `SMS_usage (BC)` / `(API)` / `(OTP)` | `*_clean_usage` (channel=sms) | year, month, acc_id, usage |
| `Email_usage (BC)` / `(API)` / `(OTP)` | `*_clean_usage` (channel=email) | year, month, acc_id, usage |

Six usage sheets collapse into one `usage` table with two discriminator columns:
`channel` ∈ {sms, email} and `usage_source` ∈ {bc, api, otp}.

### Raw → clean, and why raw exists at all

**Raw** tables store the sheet *verbatim*: one row per Excel row, the whole row as a
`jsonb` blob (`row_payload`), plus `excel_row` so you can always point at the exact
spreadsheet line. Dates that Excel gave as serial numbers are wrapped as
`{_excel: "datetime", iso, serial}` rather than being guessed at.

**Clean** tables are typed and are what the ML actually reads. The mapping lives in
`apps/api/src/lib/sheet-cleaners.ts` + `train-clean-cell.ts`:

- `acc_id` missing → row skipped, counted in the skip manifest (never silently dropped).
- `payment_date` missing → payment row skipped.
- Numeric cells parsed permissively; unparseable → `null` or `"0"` depending on the field.
- Excel serial dates converted with the 1899-12-30 epoch.

Every clean row keeps `raw_row_id` + `excel_row`. Full lineage back to the spreadsheet.

**Re-uploading the same file is allowed** — each upload is a new snapshot (checksum is stored for audit, not uniqueness). There is no merge with prior sources.

---

## 4. Import flow, step by step

`POST /predict-data-sources/import` (any user) or `POST /train-data-sources/import` (admin):

1. Browser POSTs the `.xlsx` via `XMLHttpRequest` so upload byte progress is visible.
2. Elysia SHA-256s the buffer (audit only — duplicates are allowed as new snapshots), reads the workbook with `xlsx`,
   and validates that all 8 required sheets exist and each has its required headers.
   A missing header aborts before a single row is written.
3. A `*_data_sources` catalog row is created with `import_status='importing'` **first**,
   so the browser can subscribe to progress before parsing starts.
4. Each sheet is parsed and batch-inserted into its raw table (`insertSheetRows`,
   chunked — never row-by-row).
5. Status flips to `'cleaning'`. Inside one transaction: delete existing clean rows for
   this source, map every raw row, batch-insert into the three clean tables.
6. Status → `'ready'`, with a manifest of `{raw counts, clean counts, skipped reasons, warnings}`.
7. Progress the whole way is pushed to a **Redis Stream** (`predict-import:{source_id}`);
   the browser reads it via SSE / polling.

**Then, for predict imports only:** `createAutoPredictionRun()` fires. It computes a
suggested cutoff, inserts an `ml_prediction_runs` row named `Auto — {source} {date}`, and
triggers the ML job. This is wrapped so it can *never* fail the import — worst case it
logs and marks the run failed. Pass `auto_run: false` to skip it.

### The cutoff date, and why it's always the 1st of a month

The **cutoff** is the imaginary "today" of a run. Features may only look at data strictly
*before* it; labels may only look at data on/after it.

`apps/api/src/lib/clean-cutoff.ts` computes it in SQL:

- **Predict cutoff** = `date_trunc('month', latest_activity + 1 day)`.
  If your data ends 2026-03-31, cutoff = 2026-04-01 (March is complete, include it).
  If your data ends 2026-03-14, cutoff = 2026-03-01 (March is partial, drop it).
- **Train cutoff** = `date_trunc('month', latest_activity − horizon_days)` — the newest
  cutoff that still has a full label window after it.

The training runner **hard-rejects** a non-month-aligned cutoff with an error. Reason:
usage is monthly-stamped at the 1st. A cutoff of, say, March 15 would let a feature see
the *whole* of March's usage (stamped March 1, which is `< March 15`) — including the
half of March that happens after the cutoff. That is a leak, and it silently inflates
every metric.

---

## 5. The feature layer (shared by all three models)

`apps/ml/src/training/features.py` — 1,237 lines, and the single most important file in
the repo. Both training and prediction call the *same* function, `build_all_features()`,
so a feature can never be computed one way at fit time and another way at serve time.

### The account spine

Which accounts get a row? Not just the customer sheet. The spine is:

```
customer-sheet accounts  ∪  accounts with any pre-cutoff payment  ∪  accounts with any pre-cutoff positive usage
```

Profile sheets aren't guaranteed to cover every account that pays or sends. Those
"orphan" accounts still carry full behavioural signal, so dropping them would quietly
shrink the dataset.

### The 27 base features ("Tier A")

Everything is computed strictly from rows where `payment_date < cutoff` or
`usage.period < cutoff`.

**Profile (1)** — `customer_age_days` = cutoff − join_date.

**Payment / RFM (8)** — `days_since_last_payment`, `payment_count_all`,
`payment_count_180d`, `total_revenue_all`, `total_revenue_180d`,
`avg_transaction_value`, `payment_interval_mean_days` (mean gap between consecutive
payments), `payment_overdue_ratio` (days since last payment ÷ their usual gap — "1.0
means they're due, 3.0 means they're three cycles late"), `payment_amount_cv` (std ÷ mean
of payment size — separates steady payers from spiky whales).

**Usage volume & trend (9)** — `days_since_last_usage`, `usage_total_180d`,
`usage_recent_90d`, `usage_prev_90d` (the 90–180 day window),
`usage_change_90d_pct`, `usage_decay_ratio`, `usage_slope_6m` (least-squares slope of the
last 6 monthly totals), `usage_active_months_180d`, `usage_consistency_ratio`.

**Channel mix (7)** — `sms_usage_share`, `email_usage_share`, `bc_usage_share`,
`api_usage_share`, `otp_usage_share`, `channel_hhi` (Herfindahl concentration:
`sms² + email²`; 1.0 = single-channel, ~0.5 = balanced), `multichannel_flag`.

**Cross-source (1)** — `days_since_last_activity` = days since the latest of
{any payment, any positive usage}.

**Credit-only extras (+4 → 31 features)** — `credit_added_180d`, `credit_balance_proxy`,
`credit_runway_months`, `credit_usage_decel`. Only the credit model gets these; they're
directly tied to future usage but add noise to churn/CLV.

### Three details worth understanding

**1. `credit_balance_proxy` is reconstructed, not read.**
The customer sheet has `credit_sms` / `credit_email` columns — but those are the balance
*at Excel export time*, not at the cutoff. Using them would leak the future. So the
balance is rebuilt as `sum(credit_add before cutoff) − sum(usage before cutoff)`.
The snapshot columns survive only as display-only fields in `profile_snapshot_json`.

**2. Heavy-tailed ratios get `signed_log1p`.**
A customer ramping from 3 messages to 30,000 produces a `usage_change_90d_pct` in the
tens of thousands, which dominates any linear model and (perversely) makes fast-growing
customers look like churn risks. The fix is `sign(x) · log1p(|x|)` — parameter-free,
monotonic (so ranking is untouched), no dataset-specific cap to tune.

**3. Null handling is a declared contract, not an accident.**
`ZERO_DEFAULT_FEATURES` (counts, sums, shares) fill with `0.0` — "no payments in the
window" genuinely means zero. `NULLABLE_CONTRACT_FEATURES` (ages, means, ratios) stay
`NaN` — "we don't know your payment cadence" is not the same as "your cadence is 0". The
preprocessor imputes nullables with the **train-split median**.

### Lifecycle: rules, not a model

`build_lifecycle_outputs()` assigns a state from three booleans:

| Condition | `lifecycle_stage` | `sub_stage` |
|---|---|---|
| No activity history at all | `Ghost` | Ghost |
| Has history, but nothing in the last 180 days | `Churned` | Churned Paid / Churned Free |
| Active in last 180d, has ever paid | `Active Paid` | Active Paid |
| Active in last 180d, never paid | `Active Free` | Active Free |

This is the gatekeeper for the models:

| Model | Eligible when |
|---|---|
| churn | `Active Paid` |
| CLV | `Active Paid` or `Active Free` |
| credit | `Active Paid` or `Active Free` |

Ineligible customers still get an output row — with nulls and a machine-readable reason
in `model_eligibility_json`. The system never silently omits a customer.

### Feature code hashing

`feature_code_hash()` SHA-256s the **actual Python source** of every feature-builder
function plus the feature list and metadata. It's stored in the model card. At prediction
time, if the hash differs, the runner distinguishes two cases:

- Different feature *list* → old artifact on a narrower contract. All needed columns are
  present → safe, logs a version-lag note.
- Same list, different *source* → the feature computation itself changed since training.
  That's **train/serve skew**. Loud warning: retrain recommended.

---

## 6. A training run, step by step

`POST /training-runs` (admin) → inserts an `ml_training_runs` row → calls FastAPI
`/internal/training-runs` → spawns `python -m src.cli.train --training-run-id <uuid>` →
`apps/ml/src/training/runner.py::run_training`.

The whole body is wrapped so that **any** exception ends with `status='failed'` and an
`error_message`. `stdout` is captured into a log buffer.

### Phase 1 — Gates (3%)

Five validation reports, all persisted to `ml_data_validation_reports`:

1. **Source readiness** — source exists, `import_status='ready'`, clean tables non-empty.
2. **Schema quality** — required columns present, invalid-date rate < 0.5%, allowed values
   for status/channel/usage_source, duplicate customer check, orphan-activity rate,
   high-null-rate warnings.
3. **Cutoff feasibility** — history exists *before* `cutoff − 180d`, and activity exists
   *after* `cutoff + horizon_days`. Without the latter you cannot grade a label.
4. **Label viability** — the one that stops garbage models. For churn:
   ≥500 eligible rows, ≥100 positives, ≥100 negatives, positive rate between 5% and 80%.
   Similar floors for CLV and credit.
5. **Feature leakage** — no feature source row is dated ≥ cutoff.

Any `blocker` failure raises and the run dies here. Warnings are recorded and continue.

### Phase 2 — Datasets (8–12%)

`build_cutoff_datasets()` builds features + all four label sets at the primary cutoff
(C1), then splits each model's frame **60 / 20 / 20** stratified on its label.

Because there is exactly one row per `acc_id` per cutoff, a stratified *row* split is
automatically a *group* split — no customer straddles two splits.

**Backtest cutoffs** are then chosen adaptively: walk back 2 calendar months at a time,
keep every cutoff that still has ≥365 days of history before it and a full label window
after it, cap at 6. A 2-year upload yields more backtests than a 1-year upload.

**Credit gets its own, fresher cutoff.** Its labels only need 30/90 days of future data,
not 180. So credit trains at `month_start(max_activity − 90d)` when that's later than C1
— it would be wasteful to burn the newest three months of data on churn's horizon.

**Multi-cutoff pooling.** `pool_train_rows()` adds older-cutoff rows to the **train split
only**. Validation and test stay purely at C1 so holdout numbers keep their meaning.
Any `acc_id` held out at C1 is excluded from the pooled rows, so split contamination is
impossible by construction. At ~1.5–2k active-paid rows per cutoff, this is the single
biggest lever on churn model quality.

### Phase 3 — Per-model training (15% → 92%)

Churn (15–48%), CLV (55–70%), Credit (75–92%). Each follows the same shape:

```
fit preprocessor on TRAIN only
  → fit candidate models
  → rank them
  → calibrate / threshold / magnitude-correct
  → evaluate on the untouched TEST split (once)
  → run the leakage suite
  → refit at each backtest cutoff
  → run the two-stage promotion policy
  → write artifacts + registry rows
  → promote (or keep the incumbent)
```

Details per model are in the two deep-dive docs.

### Phase 4 — Artifacts and the registry

Each model writes `models/{model_type}/{version}/`:

| File | Contents |
|---|---|
| `model.pkl` | The estimator, `dill`-pickled (a dict bundle for CLV/credit) |
| `calibrator.pkl` | Churn only — the Platt/isotonic calibrator |
| `preprocessor.json` | Feature order, imputation values, centers, scales |
| `feature_names.json` | The exact contract this model consumes |
| `thresholds.json` | Churn risk cuts, or CLV p_alive cuts |
| `feature_baseline.json` | Training feature distribution, for PSI drift at serve time |
| `metrics.json`, `model_card.json` | Everything the Model Performance page renders |

Version naming: `{type}-{YYYY.MM}.{seq}`, e.g. `churn-2026.08.3`.

The registry is three tables:
- `ml_model_versions` — one row per trained model, with metrics and the model card.
- `ml_model_evaluations` — many rows per version: holdout/validation, holdout/test, one per
  backtest cutoff, one per baseline per split. This is what the charts read.
- `ml_model_aliases` — the `production` pointer, one per model type. **Prediction only ever
  loads through this alias.** Every change is journalled in `ml_model_activation_history`.

### The promotion gate (`promotion.py`)

Deliberately split into two questions that used to be conflated:

**Stage 1 — SAFETY (binary, non-negotiable).** A candidate is *eligible* only if:
- leakage suite passed, and its artifact loads and predicts;
- it beats the trivial baselines on validation, on test, **and on every backtest cutoff**;
- it beats the current champion on the *aggregate* backtest metric by at least
  `max(absolute floor, 1% relative)` — a smaller gap counts as a tie-on-noise and the
  incumbent is kept (this is what stops the champion rotating on sampling jitter);
- it is *stable* — the worst backtest cutoff is not more than 30% below the median cutoff;
- (churn only) calibration error is below a loose **safety ceiling** of ECE ≤ 0.10.

**Stage 2 — QUALITY (relative).** Among eligible candidates, maximize
`composite = mean(test, backtests…) − penalty × max(0, ECE − 0.05)`.

The point of the split: the old gate used a hairline `ECE < 0.05` veto, so the
best-ranking model could be knocked out by a noise-sized, *recoverable* calibration miss
while a clearly worse ranker got promoted. Ranking is churn's actual job; calibration is
fixable by recalibration. So calibration is now a guardrail with a soft penalty, not a veto.

If nothing is eligible, **the incumbent stays**. The new version is still written and
still visible in the UI — just not promoted.

---

## 7. A prediction run, step by step

`POST /prediction-runs` (any user) or the auto-run after import → `/internal/prediction-runs`
→ `python -m src.cli.predict` → `apps/ml/src/prediction/runner.py`.

**5% — Load champions.** For each of churn/clv/credit, resolve the `production` alias
(or a per-run override in `model_overrides_json`, which lets you A/B an older version)
and load its artifact bundle. No production model for a type → the run fails immediately
rather than silently skipping a column.

**10% — Gates.** Three predict-side reports: source readiness, schema quality, feature
leakage. Any blocker fails the run.

**20% — Features.** Same `build_all_features()` as training, at the run's cutoff. The
lifecycle frame is merged in, and the serve-time eligibility matrix is set:
`el_churn = (stage == Active Paid)`, `el_clv = el_credit = (stage ∈ Active)`.
Then `_feature_contract_guard` checks every artifact's required columns are present and
compares feature hashes.

**30% — Drift monitoring.** For each model, bin the live features against the training
`feature_baseline.json` quantile edges and compute **PSI** (Population Stability Index)
per feature:

| PSI | Meaning |
|---|---|
| < 0.10 | stable |
| 0.10 – 0.25 | minor drift — watch |
| ≥ 0.25 | major drift — consider retraining |

The *run* is only escalated to `major_drift` when **≥2 features** cross 0.25 — one noisy
feature shouldn't flip every customer to `partial`. Drift never blocks a run; it flags it.

**35–45% — Churn.** Transform → `predict_proba` → calibrator → clip to [0,1] → risk level
from the artifact's thresholds → top-5 SHAP factors per customer.
(Full detail: [`MODEL-CHURN-DEEP-DIVE.md`](MODEL-CHURN-DEEP-DIVE.md).)

**55% — CLV + `p_alive`.** BG-NBD is always run for `p_alive` even when a GBM wins the
revenue forecast. Whale-tail blending and magnitude calibration are applied.

**65% — Credit.** Quantile predictions per horizon, cross-horizon monotonicity enforced
(90d ≥ 30d), AFT top-up timing.

**75% — Derived fields.** This is where raw model outputs become business language.

**85% — Batch insert.** One row per customer into `ml_prediction_outputs`, chunked at
1,000, `ON CONFLICT (prediction_run_id, acc_id) DO UPDATE`. A **column contract guard**
compares the keys actually produced against `OUTPUT_COLUMNS` and raises on any mismatch —
this catches the silent class of bug where a derived field is computed but never persisted.

**95% — Post-check (Gate 15).** Re-reads the table and fails the run if:
- inserted row count ≠ customer count;
- any `churn_probability` or `p_alive` outside [0,1];
- among customers we actually *attempted* to score (eligible **and** not abstained), the
  null rate exceeds 1%.

Only then does the run become `completed`.

---

## 8. Anatomy of one output row

`ml_prediction_outputs` is one flat wide table — deliberately not split per model type,
because every page reads a customer as a whole.

**State:** `lifecycle_stage`, `sub_stage`, `ever_paid`, `days_since_last_activity`.

**Churn:** `churn_probability` (calibrated 0–1), `churn_risk_level`
(low/medium/high/critical), `churn_factors_json` (top-5 SHAP).

**Value:** `predicted_clv_6m`, `p_alive`, `customer_value_tier`.

**Credit:** `predicted_credit_usage_30d/90d`, `credit_forecast_interval_json`
(p10/p90 per horizon), `estimated_days_until_topup`, `credit_urgency_level`.

**Descriptive:** `n_purchases`, `total_revenue`, `avg_transaction_value`, `usage_trend`,
`profile_snapshot_json` (display-only Tier B: join date, status, credit balance, expiry).

**Derived business fields:**

| Field | Formula |
|---|---|
| `revenue_at_risk` | `churn_probability × predicted_clv_6m` — expected money lost |
| `customer_value_tier` | Percentile of CLV among active customers with CLV > 0: ≥0.90 → high, ≥0.50 → mid, else low |
| `usage_trend` | From `usage_change_90d_pct`: > +10% increasing, < −10% declining, else stable (or `no_usage`) |
| `credit_urgency_level` | Days-to-topup: ≤14 critical, ≤30 warning, ≤90 monitor, else stable |
| `priority_score` | `log1p(revenue_at_risk)` min-max rescaled to 0–100. **Purely cosmetic** — ordering is identical to `revenue_at_risk` |
| `needs_review` | `high/critical churn` **OR** (valuable AND `p_alive` < at-risk cut AND usage declining) |
| `segment` | Value × health × lifecycle, first match wins (below) |
| `priority_rank` | Global 1..N: sort by segment priority, then by money within segment |

**`needs_review` is the "silent decline" catch.** A big customer with years of payment
history can have collapsed recently — the churn model, leaning on that long history,
still scores them low, while BG-NBD's `p_alive` has already gone to near zero. The flag
is the union of both signals, so a human looks before anyone treats the low churn score
as safety.

**Segments** (evaluated in order, first match wins — lifecycle checks come first so
churned/ghost rows never fall through into the active tiers):

```
Ghost                    → Ghost
Churned + ever paid      → Lapsed
Churned                  → Dormant
valuable & at-risk       → High-Value At-Risk     ← the retention work list
valuable & watch         → Mid-Value At-Risk
valuable                 → High-Value Stable
at-risk                  → Low-Value At-Risk
watch                    → Low-Value Watch
growing                  → Emerging
(default)                → Stable
```

where *valuable* = tier high or mid; *at-risk* = churn high/critical **or** `p_alive` below
the model's at-risk cut; *watch* = churn medium **or** `p_alive` below the watch cut.

**Status fields:** `output_status` is `predicted` (all eligible models produced a number),
`partial` (some eligible model produced nothing, or a model this customer was scored by
has major drift), or `insufficient_data` (nothing was predictable).
`model_eligibility_json` explains per model, in Thai, exactly why.

---

## 9. The web app

Next.js 16 App Router. Convention: `page.tsx` files are server components that do nothing
but render a client component from `src/features/{domain}/`. State is `zustand`; charts
are `recharts`; the API client is generated from the Elysia types via `@elysiajs/eden`.

| Route | What it shows |
|---|---|
| `/` | Dashboard for the selected run: lifecycle mix, risk buckets, value tiers, monthly revenue, credit urgency, value×risk matrix, top-priority list, AI run insight |
| `/customers` | Paginated, sortable, filterable table over `/prediction-runs/:id/outputs` |
| `/customers/:acc_id` | Customer 360: churn drivers (SHAP), usage & payment charts, profile snapshot, AI explanation |
| `/runs` | Predict import + run creation + run history |
| `/training` | Train import + trigger training + live progress + training history |
| `/model-performance` | Champion per model type, metrics vs baselines, calibration curve, lift table, churn diagnostics |
| `/ai-chat` | Full-page chat |

The dashboard reads one endpoint, `/prediction-runs/:id/summary`, which does all the
aggregation **in SQL** rather than pulling thousands of rows into Node.

`reasoning.ts` maps raw feature codes into Thai labels for the UI (e.g.
`days_since_last_activity` → "จำนวนวันที่ไม่มีการใช้งาน"). There is deliberately **no
rule-based text headline** — priority is expressed as a number, and any prose comes from
the AI layer grounded in the SHAP factors.

---

## 10. The AI assistant

Two distinct features:

**1. Per-customer / per-run explanations.** An LLM is handed the *already computed*
numbers and SHAP factors and asked to verbalize them. It is explicitly not allowed to
invent reasons from raw features — the model output is the ground truth, the LLM is the
translator. Results are cached on the output row (`ai_explanation`, `ai_status`).

**2. Text-to-SQL chat** (`apps/api/src/lib/ai/`) — a self-correcting agent:

```
plan SQL → guard → scope check → execute
       ↳ on any failure, feed the exact reason back to the planner and retry
         (bounded by MAX_SQL_ATTEMPTS) → else fall back to a direct answer
```

Two independent safety layers:

- **`sql-guard.ts`** proves the query is a read-only `SELECT` over modeled tables:
  blocked token list (insert/update/drop/…), an allow-list of functions, a forced `LIMIT`,
  string literals stripped before token analysis.
- **`scope.ts`** proves it only touches known rows: run-scoped and source-scoped tables
  must carry an explicit id filter, and **every UUID literal in the query must be a known
  run/source id**. A run-bound conversation must reference its own run.

The scope check is intentionally conservative — when in doubt it rejects and lets the
agent regenerate. Conversations are private per user; the *data* scope is org-wide.

Streaming is SSE with typed events: `thinking · token · evidence · title · done · error`.

---

## 11. Closing the loop: realized outcomes

The most honest number in the system. Training metrics are measured on a holdout split
from the *same* upload. Realized outcomes measure what actually happened to real served
predictions.

`POST /outcome-backfill` (admin) → `python -m src.cli.backfill_outcomes`. For each
completed prediction run whose horizon has fully elapsed *and* for which newer predict
data covers that window, it:

1. Rebuilds the ACTUAL labels using the **exact same label builders** as training
   (`src/training/labels.py`, imported, never re-derived).
2. Joins them to the predictions that were actually served.
3. Computes metrics using the **same metric functions** as training — so a realized
   PR-AUC is directly comparable to that version's training-time test PR-AUC.
4. Writes `ml_model_evaluations` rows with `evaluation_type='production_holdout'`, keyed
   by `prediction_run_id`.

Read them back at `GET /prediction-runs/:id/realized-outcomes`.

Churn is graded at the **served** threshold (the model card's "high" line), not a
re-optimized one — the question is "how did the decision rule we actually used perform",
not "how good could it have looked".

---

## 12. Failure handling and operations

**Every run ends terminal.** Both runners wrap their body in try/except that writes
`status='failed'` + `error_message` + `progress={phase: failed, pct: 100}`.

**The stale-run reaper** (`apps/api/src/lib/run-reaper.ts`) runs on API startup and every
5 minutes, marking any run stuck non-terminal for longer than `STALE_RUN_TIMEOUT_MINUTES`
(default 120) as failed. This covers the case where the Python process is killed outright
and never gets to write its own failure.

**Import aborts** are handled the same way — `releaseStaleTrainImports()` /
`releaseStalePredict()` clear sources stuck in `importing`/`cleaning` on boot.

**Elysia → FastAPI calls are bounded** by an `AbortController` with
`ML_INTERNAL_TIMEOUT_MS` (default 30s). A hung ML service surfaces as a thrown error so
the caller can mark the run failed, rather than hanging the request.

**Testing.** There's no jest/vitest/pytest. ML correctness is checked by contract scripts
run against a populated DB:

```bash
cd apps/ml
python scripts/verify_clean_data_access.py     # loaders
python scripts/verify_feature_builder.py       # feature contracts + feature_code_hash
python scripts/verify_preprocessing.py         # fit-on-train-only
python scripts/verify_promotion_policy.py      # gate logic
python scripts/verify_realized_outcomes.py     # backfill
python scripts/profile_training_dataset.py     # label viability profiling
```

---

## 13. The through-line

If you remember one thing about this codebase, remember the **cutoff**.

Every design decision — separate train/predict tables, month-aligned dates, the
reconstructed credit balance, the leakage test suite, backtests at older cutoffs,
fit-preprocessor-on-train-only, the fact that the test split is touched exactly once —
exists to defend one property:

> **At the moment of prediction, the model may only know what was actually knowable then.**

A churn model that has accidentally seen the future scores a beautiful 0.98 AUC and is
worthless in production. Most of the complexity in this repo is the machinery that makes
that failure mode *loud* instead of silent.
