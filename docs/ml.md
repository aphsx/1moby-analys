# ML reference

How the ML service (`apps/ml`) turns a Data Source into Prediction Outputs: lifecycle rules, labels,
the three Model Types, derived fields, the promotion policy and the output contract. Written from the
code; each section names the files to read for detail. Terms (Customer, Cutoff Date, Horizon, Champion,
Value Tier, …) are defined in [`GLOSSARY.md`](../GLOSSARY.md).

## Pipeline

```
Training Run   src/training/runner.py
  clean data (once) → gates 1–5 → datasets at the cutoff + backtest cutoffs
  → per Model Type: baselines + candidates → evaluation → promotion policy
  → artifacts + ml_model_versions + ml_model_evaluations → production alias

Prediction Run src/prediction/runner.py
  clean data (once) → gates → features → lifecycle + eligibility → drift checks
  → scoring.py (Champions) → derived.py (derived fields, Segments)
  → persistence.py (one ml_prediction_outputs row per Customer, post-check)

Realized Outcomes src/outcomes/runner.py
  after a run's Horizon has passed and newer data exists: rebuild the actual labels with the
  training label builders, store per-run metrics as evaluation_type = production_holdout
```

Database access goes through `src/db.py`; shared enum strings and ML-internal settings live in
`src/constants.py`.

## Lifecycle and eligibility

`src/training/features.py` (`build_lifecycle_outputs`). Rule-based, never predicted. Activity means a
payment, or usage above 0, before the Cutoff Date.

| Lifecycle Stage | Rule | Sub-stages |
|---|---|---|
| Ghost | no activity ever | Ghost |
| Churned | activity, but none in the 180 days before the cutoff | Churned Paid / Churned Free (ever paid or not) |
| Active Paid | active in the 180 days, has paid at some point | Active Paid |
| Active Free | active in the 180 days, never paid | Active Free |

| Model Type | Eligible Customers |
|---|---|
| churn | Active Paid. Below 90 days of tenure the run abstains: no probability or risk level (`DerivedThresholds.CHURN_ABSTAIN_MIN_TENURE_DAYS`) |
| CLV | Active Paid and Active Free |
| credit | Active Paid and Active Free |

## Labels and splits

`src/training/labels.py` (bug-fix-only), `src/training/datasets.py`.

| Label | Definition |
|---|---|
| churn | Among Customers with activity in the 180 days before the cutoff who paid before it: 1 when there is no payment and no usage in the 180 days after |
| CLV | Revenue paid in the 6 months after the cutoff, for Customers active before it |
| credit usage | Usage summed over the 30 and 90 days after the cutoff |
| top-up timing | Days until the next payment after the cutoff, right-censored at the label window |

- **Splits:** 60 / 20 / 20 train / validation / test per cutoff, stratified on the label; one row per
  Customer per cutoff, so a row split is a Customer split. Seed: `RANDOM_SEED` (42).
- **Backtests:** older cutoffs every 2 months with at least 365 days of history and a full label window,
  at most 6 (`BACKTEST_STEP_MONTHS`, `MIN_BACKTEST_HISTORY_DAYS`, `MAX_BACKTESTS` in `datasets.py`).
  Older-cutoff rows join only the train split (`pool_train_rows`); validation and test stay at the
  latest cutoff.
- **Credit's own cutoff:** credit labels need only 90 days after the cutoff, so credit trains at the
  newest month start that leaves 90 days of data (`CREDIT_LABEL_WINDOW_DAYS`), falling back to the
  shared cutoff when that is infeasible.

## Features

`src/training/features.py` (bug-fix-only). Churn and CLV use the 27-feature contract (`tier_a_27`),
credit the extended 31-feature one (`tier_a_31`). Usage features are month-bucketed: a month-start
cutoff gives a 180-day window of 5 month stamps. Every Model Version records its feature contract and a
`feature_code_hash`; at prediction time `scoring.feature_contract_guard` refuses an artifact whose
required columns are missing.

## Gates

`src/training/validation.py`. A Training Run runs gates 1–5 on the train source (readiness, schema
quality, cutoff feasibility, label viability, point-in-time leakage); a Prediction Run runs readiness,
schema quality and leakage on the predict source. Any failed gate fails the run. Reports are stored in
`ml_data_validation_reports`.

Drift (`src/training/drift.py`): each feature's PSI against the Champion's training baseline. Below 0.10
is stable, 0.10–0.25 minor, 0.25 and above major. A Model Type with major drift on at least 2 features
marks its Customers' outputs `partial`.

## Churn

`src/training/churn_trainer.py` (bug-fix-only).

- **Candidates:** `logistic_regression`, `lightgbm`, `tabicl` by default (`CHURN_CANDIDATES` overrides;
  `xgboost` and `random_forest` are opt-in). LightGBM is tuned with Optuna (40 trials). TabICL is a
  pretrained tabular foundation model with no tuning.
- **Ranking:** 5-fold CV PR-AUC on train + validation. The test split is used once, for reporting.
- **Calibration:** Platt or isotonic, fitted on out-of-fold predictions; isotonic only when it clearly
  improves ECE or Brier.
- **Risk levels:** the `high` threshold is the max-F2 point on the calibrated out-of-fold scores, clipped
  to 0.35–0.85. Then `medium` = 0.5 × high and `critical` = high + 0.6 × (1 − high)
  (`metrics.risk_thresholds_from_high`). They are stored in the Model Version's model card and read by
  every run it scores.
- **Reasons:** per-Customer `churn_factors` come from SHAP for logistic regression and LightGBM. TabICL is
  opaque, so a TabICL Champion produces no factors.
- **Baselines:** `recency_rule_90d`, `rfm_quartile`, `logistic_regression`.

## CLV

`src/training/clv_trainer.py` (bug-fix-only), `src/prediction/scoring.py`.

- **Model:** two-part, the probability of paying in the 6 months times the value if paying, with a
  magnitude calibration. BG-NBD + Gamma-Gamma are fitted only for `p_alive` and its health cuts, not for
  revenue ranking.
- **Whale tail:** trees cannot extrapolate past their leaves, so at serve time the top decile of
  Customers (by the base forecast, only with at least 50 Customers and 2+ purchases each) takes the
  higher of the two-part and BG-NBD forecasts (`CLV_TAIL_*` in `scoring.py`).
- **p_alive cuts:** derived per model from the validation `p_alive` quantiles and shipped in the artifact;
  `DerivedThresholds.P_ALIVE_*_FALLBACK` (0.20 / 0.50) only for older artifacts.
- **Promotion metric:** `clv_composite` = 0.35 × Spearman + 0.25 × top-decile capture + 0.20 × revenue
  bias score + 0.10 × range coverage + 0.10 × (1 − p_pay ECE) (`metrics.clv_composite_score`).
- **Baselines:** `segment_mean`, `revenue_180d_carryover`.

## Credit

`src/training/credit_trainer.py` (bug-fix-only), `src/prediction/scoring.py`.

- **Usage forecast:** LightGBM quantile models per horizon (30 and 90 days) × 5 quantiles (p10, p25, p50,
  p75, p90), trained on the log-ratio against the carryover baseline. The median correction is shrunk
  toward 0 by a factor fitted on validation MAE, so a regime change falls back to the baseline instead of
  below it. A conformal (CQR) margin calibrated on validation targets 80% p10–p90 coverage. XGBoost
  quantile competes unless `ENABLE_XGB_CREDIT=0`. At serve time 90-day quantiles are forced ≥ 30-day.
- **Next top-up:** a right-censored accelerated-failure-time model of days until the next payment
  (XGBoost `survival:aft`; distribution and scale picked on validation from a small grid). Customers who never topped up in the window
  are censored at it. Predictions are capped at 365 days. Only for older artifacts without this model,
  a balance ÷ daily burn heuristic fills the days.
- **Credit Urgency:** critical ≤ 14 days, warning ≤ 30, monitor ≤ 90, stable after that
  (`DerivedThresholds.URGENCY_*`). It is a predicted payment date, not the day credit runs out.
- **Baselines:** `last_30d_carryover`, `moving_avg_90d`, `runway_depletion`.

## Derived fields

`src/prediction/derived.py`.

| Field | Rule |
|---|---|
| `customer_value_tier` | Percentile of CLV among the run's Active Customers with CLV > 0: high ≥ 0.90, mid ≥ 0.50, low below; `none` for CLV ≤ 0 or a non-Active stage |
| `revenue_at_risk` | `churn_probability × predicted_clv_6m` (null without either) |
| `priority_score` | `revenue_at_risk` log1p-rescaled to 0–100 (same order; display only) |
| `usage_trend` | `no_usage` without usage in 180 days; `increasing` / `declining` when the 90-day change is beyond ±10% (`MOMENTUM_BAND`); else `stable` |
| `needs_review` | Active and (high/critical churn risk, or high/mid tier with `p_alive` below the at-risk cut and usage declining) |
| `segment` | First match of: Ghost, Lapsed (Churned Paid), Dormant (Churned), High-Value At-Risk, Mid-Value At-Risk, High-Value Stable, Low-Value At-Risk, Low-Value Watch, Emerging, else Stable. "Valuable" is high or mid tier; at-risk is high/critical churn or `p_alive` below the at-risk cut |
| `priority_rank` | By Segment order (`Segment.ORDER`), then by revenue at risk (retention Segments) or CLV (the rest) |

The overview and customer pages act on the **Playbook** (Value Tier × Churn Risk Level), not on Segment;
see `GLOSSARY.md`.

## Promotion policy

`src/training/promotion.py` (bug-fix-only), configs in `src/training/runner.py`.

1. **Safety (binary).** A candidate is eligible only with no leakage, beating the rule baselines on every
   split and backtest cutoff, beating the incumbent Champion on the aggregate backtest metric by a
   relative margin, no backtest cutoff collapsing, and calibration within a loose ceiling.
2. **Quality (relative).** Among eligible candidates, the best primary metric minus a soft penalty for
   calibration error above target wins. With none eligible, the incumbent stays.
3. **Artifact gate.** The winner is promoted only if its saved artifact reloads and predicts.

| | Primary metric | Margin over incumbent | Max backtest drop | Calibration |
|---|---|---|---|---|
| churn | PR-AUC | 1% relative | 30% | ECE ceiling 0.10, target 0.05, penalty 1.0 |
| CLV | `clv_composite` | 1% relative | 30% | p_pay ECE ceiling 0.10, target 0.05, penalty 0.5 |
| credit | p10–p90 coverage, which must sit in (0.75, 0.90] | 0.5% relative | 25% | coverage above 0.90 is rejected |

Credit also requires MAE within 1.10 × the best baseline (`CREDIT_MAE_TOLERANCE`).

## Output contract: `ml_prediction_outputs`

One row per Customer per Prediction Run (`persistence.OUTPUT_COLUMNS`, written in batches of 1,000).

| Group | Columns |
|---|---|
| Identity | `prediction_run_id`, `acc_id`, `lifecycle_stage`, `sub_stage`, `ever_paid` |
| Churn | `churn_probability`, `churn_risk_level`, `churn_factors_json` |
| CLV | `predicted_clv_6m`, `clv_pay_probability`, `clv_forecast_interval_json`, `p_alive`, `customer_value_tier`, `revenue_at_risk` |
| Credit | `predicted_credit_usage_30d`, `predicted_credit_usage_90d`, `credit_forecast_interval_json`, `estimated_days_until_topup`, `credit_urgency_level` |
| Descriptive | `usage_trend`, `days_since_last_activity`, `n_purchases`, `total_revenue`, `avg_transaction_value`, `profile_snapshot_json` |
| Acting on it | `priority_score`, `segment`, `priority_rank`, `needs_review` |
| Status | `output_status`, `output_notes`, `model_eligibility_json`, `model_versions_json` |

`output_status`: `insufficient_data` when no model scored the Customer; `partial` when an eligible model
did not, or one of its models had major drift; otherwise `predicted`. After writing, `run_post_check`
requires one row per Customer, scores within [0, 1], and at most 1% missing churn scores among the
Customers churn should score; a failed post-check fails the run.

## Changing this code

- The maths files are bug-fix-only: `features.py`, `churn_trainer.py`, `clv_trainer.py`,
  `credit_trainer.py`, `metrics.py`, `labels.py`, `leakage.py`, `preprocessing.py`, `promotion.py`,
  `drift.py`. They take bug fixes, deletion of uncalled code, and literals swapped for constants of the
  same value.
- Any change under `apps/ml/` or the import pipeline must leave the golden run unchanged
  (`apps/ml/scripts/golden_run.sh`, see `apps/ml/AGENTS.md`). A change meant to alter model output
  records a new baseline and says so.
