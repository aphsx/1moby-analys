# ML reference

How the ML service (`apps/ml`) turns a Data Source into Prediction Outputs: lifecycle rules, labels,
the three Model Types, derived fields and the output contract. Written from the code; each section names
the files to read for detail. The models mirror the Colab notebooks in [`notebooks/`](../notebooks/).
Terms (Customer, Cutoff Date, Horizon, Champion, Value Tier, …) are defined in
[`GLOSSARY.md`](../GLOSSARY.md).

## Pipeline

```
Training Run   src/training/runner.py
  clean data → features + labels at the cutoff (month start) → 60/20/20 splits
  → churn, then CLV, then credit: train → evaluate → artifact + ml_model_versions
    + ml_model_evaluations → promote to the production alias (always)

Prediction Run src/prediction/runner.py
  clean data → readiness / schema / leakage checks → features → lifecycle + eligibility
  → drift checks → Champions score → derived fields, Segments
  → one ml_prediction_outputs row per Customer → post-check

Realized Outcomes src/outcomes/runner.py
  after a run's Horizon has passed and newer data exists: rebuild the actual labels with the
  training label builders, store per-run metrics as evaluation_type = production_holdout
```

Shared enum strings and ML-internal thresholds live in `src/constants.py`; the model registry
(versions, the `production` alias, activation history) in `src/training/registry.py`.

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
| churn | Among Customers with activity in the 180 days before the cutoff who paid before it: 1 when there is no payment and no usage in the Horizon after |
| CLV | Revenue paid in the 6 months after the cutoff, for Customers active before it |
| credit usage | Usage summed over the 30 and 90 days after the cutoff |

- **Cutoff:** must be a month start (usage is monthly); the runner refuses any other date.
- **Splits:** 60 / 20 / 20 train / validation / test, stratified on the label; one row per Customer, so a
  row split is a Customer split. Seed 42.
- **No backtests.** Training evaluates at the one cutoff only.

## Features and drift

`src/training/features.py`, `src/training/preprocessing.py`, `src/training/drift.py` (all bug-fix-only).
Every Model Version records its feature contract and a `feature_code_hash`; at prediction time
`_feature_contract_guard` refuses an artifact whose required columns are missing.

Drift: each feature's PSI against the Champion's training baseline. Below 0.10 is stable, 0.10–0.25
minor, 0.25 and above major. A Model Type with major drift on at least 2 features marks its Customers'
outputs `partial`.

## Churn

`src/training/churn_trainer.py` (bug-fix-only).

- **Candidates:** `dual_gbdt` (a 50:50 blend of LightGBM and CatBoost), `lightgbm`, `catboost`,
  `logistic_regression`; `CHURN_CANDIDATES` narrows the list. Fixed hyperparameters, no tuning.
- **Ranking:** 5-fold CV PR-AUC on train + validation; the best one becomes the Model Version. The test
  split is used once, for reporting.
- **Calibration:** isotonic, fitted on the out-of-fold predictions.
- **Risk levels:** the `high` threshold is the max-F2 point on the calibrated out-of-fold scores, clipped
  to 0.35–0.85; `medium` and `critical` follow from it (`metrics.risk_thresholds_from_high`). They are
  stored in the model card and read by every run it scores.
- **Reasons:** per-Customer `churn_factors` are the top 5 SHAP values (TreeExplainer).
- **Baseline reported:** a logistic regression on the train split.

## CLV

`src/training/clv_trainer.py` (bug-fix-only).

- **Model:** two-part hurdle (`twopart_quantile`). A LightGBM classifier gives the probability of paying
  in the 6 months; a CatBoost regressor in log space, fitted on payers only, gives the value if paying,
  with p10 / p50 / p90 heads. A portfolio multiplier fitted on validation removes aggregate bias.
- **Served:** `predicted_clv_6m` = P(pay) × p50; the interval is p10–p90 of the value if paying.
- **Baselines reported:** `segment_mean`, `revenue_180d_carryover`.

## Credit

`src/training/credit_trainer.py` (bug-fix-only).

- **Usage forecast:** LightGBM quantile models (p10, p50, p90) per horizon (30 and 90 days), trained in
  log space, with quantiles forced monotonic. The p50 is blended 60:40 with the carryover anchor. At serve
  time the 90-day quantiles are forced ≥ the 30-day ones.
- **Days until top-up:** a depletion runway, credit balance ÷ predicted daily burn (the 30-day p50 ÷ 30),
  rounded up and capped at 365 days. A Customer burning under 10 SMS a month gets no date.
- **Credit Urgency:** critical ≤ 14 days, warning ≤ 30, monitor ≤ 90, stable after that
  (`DerivedThresholds.URGENCY_*`). It is the day credit runs out at the forecast usage.
- **Baselines reported:** `last_30d_carryover`, `moving_avg_90d`.

## Derived fields

`_apply_derived` and `_apply_segments` in `src/prediction/runner.py`.

| Field | Rule |
|---|---|
| `p_alive` | 1 − churn probability; for Customers churn did not score, the CLV pay probability |
| `customer_value_tier` | By predicted CLV among Active Customers with CLV > 0: high ≥ ฿10,000, mid ≥ ฿1,000, low below; `none` otherwise (`DerivedThresholds.VALUE_TIER_*`) |
| `revenue_at_risk` | `churn_probability × predicted_clv_6m` (null without either) |
| `priority_score` | `revenue_at_risk` log1p-rescaled to 0–100 (same order; display only) |
| `needs_review` | Active and (high/critical churn risk, or high/mid tier with the 90-day usage change below −10%) |
| `segment` | First match of: Ghost, Lapsed (Churned Paid), Dormant (Churned), High-Value At-Risk, Mid-Value At-Risk, High-Value Stable, Low-Value At-Risk, Low-Value Watch, Emerging (usage up > 10%), else Stable. "Valuable" is high or mid tier; at-risk is high/critical churn, watch is medium |
| `priority_rank` | By Segment order (`Segment.ORDER`), then by revenue at risk (retention Segments) or CLV (the rest) |

The overview and customer pages act on the **Playbook** (Value Tier × Churn Risk Level), not on Segment;
see `GLOSSARY.md`.

## Promotion

`promote_model_version` in `src/training/registry.py`. Every Training Run promotes its new churn, CLV and
credit versions to the `production` alias and archives the previous Champion; there is no comparison with
the incumbent. A User can pin another version from the UI (`/internal/model-activate`, recorded as
`manual_override` in `ml_model_activation_history`).

## Output contract: `ml_prediction_outputs`

One row per Customer per Prediction Run (`OUTPUT_COLUMNS` in `src/prediction/runner.py`, written in
batches of 1,000).

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
did not, or one of its models had major drift; otherwise `predicted`. After writing, `_post_check`
requires one row per Customer, scores within [0, 1], and at most 1% missing churn scores among the
Customers churn should score; a failed post-check fails the run.

## Changing this code

- The maths files are bug-fix-only: `features.py`, `churn_trainer.py`, `clv_trainer.py`,
  `credit_trainer.py`, `metrics.py`, `labels.py`, `preprocessing.py`, `drift.py`. They take bug fixes,
  deletion of uncalled code, and literals swapped for constants of the same value.
- Any change under `apps/ml/` or the import pipeline must leave the golden run unchanged
  (`apps/ml/scripts/golden_run.sh`, see `apps/ml/AGENTS.md`). A change meant to alter model output
  records a new baseline and says so.
