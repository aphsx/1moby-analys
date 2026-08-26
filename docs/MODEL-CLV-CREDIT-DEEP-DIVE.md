# The CLV and Credit Models — Complete Walkthrough

Companion to [`MODEL-CHURN-DEEP-DIVE.md`](MODEL-CHURN-DEEP-DIVE.md). Same level of detail,
for the two models that answer *"how much is this customer worth"* and *"when do they need
more credit"*.

Both share the churn model's scaffolding — same 27 point-in-time features (credit gets 4
extras), same 60/20/20 split, same multi-cutoff pooling, same fit-on-train-only
preprocessing, same two-stage promotion policy. This doc covers what is **different**.

Source: `apps/ml/src/training/{clv_trainer,credit_trainer,labels,metrics}.py`,
`apps/ml/src/prediction/runner.py`.

---

# Part A — CLV (Customer Lifetime Value)

## A0. One paragraph

> Predict how much revenue a customer will generate in the next 180 days. Four candidates
> compete: **BG-NBD + Gamma-Gamma** (a classical buy-till-you-die probability model),
> **LightGBM Tweedie**, **XGBoost Tweedie** (opt-in), and a **Hurdle** model (binary ×
> Gamma). They're ranked by validation **Spearman rank correlation**. BG-NBD is *always*
> fitted regardless of who wins, because it produces `p_alive` — the probability a customer
> is still "alive" — which the segmentation logic needs. At serve time the winner's output
> gets a **whale-tail blend** with BG-NBD and an **OLS magnitude calibration**.

## A1. The label

```python
future_revenue_6m   = Σ payments.amount in [cutoff, cutoff + horizon_days)
future_purchase_flag = future_revenue_6m > 0
population           = any activity (payment or positive usage) in [cutoff − 180d, cutoff)
```

Note what's different from churn: **there is no `ever_paid` requirement**. `Active Free`
customers are in scope — the model is asked "will this free user start paying, and how
much". Their label is usually 0, which is a legitimate answer.

That produces a **zero-inflated, extremely right-skewed** target: most customers contribute
฿0, a handful contribute six figures. That single property drives every modelling choice
below.

Gate 4 guards viability: ≥500 eligible rows, ≥100 with non-zero future revenue, non-zero
variance, plus a *warning* if the top 1% of customers account for too much of total revenue
(a signal that the metric will be dominated by a few whales).

## A2. Candidate 1 — BG-NBD + Gamma-Gamma

The classical "buy-till-you-die" pair from the `lifetimes` library. It doesn't use the 27
features at all; it uses four RFM summary statistics per customer, built by
`build_rfm_summary()` from pre-cutoff payments (deduplicated to one transaction per day):

| Stat | Definition |
|---|---|
| `frequency` | number of **repeat** purchase days (count − 1) |
| `recency` | days between first and last purchase |
| `T` | days between first purchase and cutoff (observation window) |
| `monetary_value` | mean spend on repeat purchases |

**BG-NBD** models two latent processes per customer:
1. While alive, they purchase as a Poisson process with an individual rate λ.
2. After each purchase, they "die" (churn silently) with individual probability p.

λ and p are drawn from Gamma and Beta population priors, fitted by maximum likelihood. From
those you get two things analytically:

- `conditional_expected_number_of_purchases_up_to_time(180, f, r, T)` → expected purchases
  in the next 180 days.
- `conditional_probability_alive(f, r, T)` → **`p_alive`**.

**Gamma-Gamma** separately models spend-per-transaction (assumed independent of frequency)
and gives `conditional_expected_average_profit`. It's fitted only on customers with
`frequency > 0` and `monetary_value > 0`, and only when there are ≥50 such rows.

```
predicted_clv = expected_purchases × expected_average_value
```

The `penalizer_coef` is grid-searched over 9 log-spaced values from 1e-4 to 1.0, selected by
validation Spearman. A penalizer that diverges is caught and skipped rather than killing the
run.

**Why keep this at all when GBMs usually win the revenue forecast?** Two reasons:

1. **`p_alive` has no ML equivalent here.** It's an explicit probability of still being
   alive derived from purchase *timing*, and it catches a failure mode the churn model has
   by construction: a customer with years of payment history whose recent behaviour has
   collapsed. The churn model, leaning on that history, still says "low risk". BG-NBD's
   p_alive has already gone to near zero. That disagreement is exactly what `needs_review`
   flags.
2. **It scales with monetary value without a ceiling.** A tree cannot extrapolate beyond the
   largest value in its training leaves. BG-NBD can. This is what makes the tail blend
   (§A6) work.

## A3. Candidate 2 — LightGBM Tweedie

Gradient-boosted trees with `objective="tweedie"`.

**Why Tweedie?** The Tweedie distribution with power `p ∈ (1, 2)` is a compound
Poisson-Gamma: it puts a **point mass at exactly zero** and a continuous positive skewed
density above it. That's a literal description of this target — most customers spend
nothing; those who spend, spend a skewed amount. Squared-error loss would be dominated by
whales; a plain Gamma loss can't represent zeros at all.

`tweedie_variance_power` is itself an Optuna parameter (1.1 – 1.9): near 1.1 the target
behaves more Poisson-like (many small counts), near 1.9 more Gamma-like (fewer, larger
amounts). The optimizer finds where this dataset actually sits.

50 Optuna trials, early stopping on validation, objective = validation Spearman.

## A4. Candidate 3 — Hurdle (binary × Gamma)

Attacks zero-inflation directly by factoring the problem:

```
Stage 1: LGBMClassifier  → P(revenue > 0)              trained on ALL rows
Stage 2: LGBMRegressor(objective="gamma")
                         → E[revenue | revenue > 0]    trained on POSITIVE rows only
prediction = P(positive) × E[revenue | positive]
```

That's the law of total expectation. The advantage over Tweedie: each stage solves a clean,
well-posed problem. "Will they buy" is a normal classification task; "how much, given they
buy" is a strictly-positive right-skewed regression, which is exactly what a Gamma objective
is for. Neither stage has to represent both behaviours with one loss function.

30 Optuna trials over shared structural parameters.

## A5. Selection and magnitude calibration

Candidates are ranked by **validation Spearman rank correlation**.

**Why Spearman and not RMSE or MAE?** Because the business use is *ranking*: value tiers are
percentile cuts, the priority list is a sort, and `revenue_at_risk` is used comparatively.
Getting the absolute rupiah of a whale wrong by 30% barely matters; getting the *order*
wrong matters enormously. Spearman is also robust to the extreme tail that would let a
handful of customers dominate any squared-error metric.

Reported alongside: `rmsle` (log-space error, so a whale's absolute miss doesn't swamp it),
`smape`, `top_decile_capture` (what share of true revenue is captured by the predicted top
10%), plus bootstrap 95% CIs.

**Magnitude calibration.** Spearman is scale-invariant, so a candidate can rank perfectly
while being systematically 40% low. Since `revenue_at_risk` multiplies CLV by a probability,
scale matters. So an OLS line is fitted **on validation**:

```python
lr = LinearRegression().fit(val_predictions, val_actuals)
magnitude_slope, magnitude_intercept = lr.coef_[0], lr.intercept_
prediction = clip(slope × raw + intercept, 0, None)
```

Fitted on validation, so the test split never sees it. Being an increasing affine map it
preserves ranking exactly — Spearman is unchanged, RMSLE/MAE improve.

Two guards: if fewer than 2 finite `(pred, actual)` pairs exist, fall back to identity; and
if the fitted slope is ≤ 0.01 (predictions anti-correlated with actuals) it falls back to
identity **with a loud warning** — a negative slope signals validation/test drift or an
unstable champion, not a benign no-op.

## A6. The whale-tail blend (serve time)

The known weakness of the Tweedie tree: it cannot isolate the handful of very
high-frequency, high-revenue payers into pure leaves, so it pools them down with their
neighbours and **systematically under-predicts whales**. BG-NBD has the opposite profile —
it scales with monetary value without a ceiling, but over-predicts the body.

So at serve time, for the top decile only:

```python
tail = (payment_count_all ≥ q90(payment_count_all))  OR
       (total_revenue_all ≥ q90(total_revenue_all))

blended[tail] = max(tweedie_pred[tail], bgnbd_pred[tail])
```

Three deliberate constraints:
- **Relative, not absolute** — quantiles, so it adapts to any dataset scale.
- **Tight (top decile)** — BG-NBD over-predicts the body, so it's only allowed in the tail.
- **Skipped when unreliable** — populations under 50 rows, and single-payment customers
  (`frequency < 2`) are never blended.
- **Not applied to the Hurdle champion** — it already models zeros and the tail explicitly.

This is documented as a **P1 mitigation**, not the fix. The proper fix (in
`REMEDIATION-PLAN.md`) is a log-space retrain; the hybrid ships in the meantime.

## A7. `p_alive` thresholds

`p_alive` from BG-NBD is not guaranteed calibrated across cohorts — its scale slides with
purchase cadence and observation window `T`. A hardcoded "0.20 = at risk" therefore flags a
different fraction of the book every run.

So the cuts are derived from the **validation p_alive distribution**, at target flag rates:

```python
at_risk = clip(quantile(val_p_alive, 0.15), 0.10, 0.30)   # flag ~15%
watch   = clip(quantile(val_p_alive, 0.40), 0.35, 0.60)   # flag ~40%
watch   = max(watch, at_risk + 1e-6)                       # keep monotone
```

The flag *rate* stays stable across runs while the concrete p_alive value adapts to each
model. The clamps stop a degenerate cohort producing an absurd boundary. Below 50 finite
values it falls back to the fixed constants. These ship in `thresholds.json`, exactly as
churn's risk cuts do.

## A8. CLV promotion

Same two-stage policy, configured differently:

| Setting | Value |
|---|---|
| Primary metric | `spearman` |
| Champion margin | ≥ 1% relative on aggregate backtest |
| Stability | worst backtest ≥ median − 30% |
| Calibration gate | **none** — CLV is a point forecast with no probability to calibrate |

Baselines: `segment_mean` (mean future revenue of the customer's past-revenue quartile,
learned on train only) and `revenue_180d_carryover` ("assume the next 180 days repeat the
last 180 days"). The carryover baseline is genuinely strong — beating it is a real bar.

The artifact is a **bundle**, not a single estimator:

```python
{"kind": "clv_bundle", "champion": "lgbm_tweedie",
 "bgnbd": <BgNbdBundle>,          # always present — p_alive
 "tweedie": <model>, "xgb": <model>, "hurdle": <HurdleBundle>,
 "horizon_days": 180,
 "magnitude_slope": …, "magnitude_intercept": …}
```

## A9. What CLV feeds

```
predicted_clv_6m
  ├─► customer_value_tier   (percentile among active w/ CLV>0: ≥0.90 high, ≥0.50 mid, else low)
  ├─► revenue_at_risk = churn_probability × predicted_clv_6m
  │     └─► priority_score, priority_rank
  ├─► segment  (value axis)
  └─► dashboard value×risk matrix

p_alive
  ├─► segment  (health axis: at_risk if churn high/critical OR p_alive < at_risk cut)
  └─► needs_review (silent-decline detection)
```

> **A caveat the model card states explicitly:** CLV is a 180-day forecast and value tiers
> are *percentile* cuts within a run. Comparing tiers across runs directly is not
> meaningful — the boundary moves with the population.

---

# Part B — Credit Forecast

## B0. One paragraph

> Two questions: **how much** credit will this customer burn in the next 30 and 90 days,
> and **when** will they need to top up. The first is answered by **LightGBM quantile
> regression** — five separate models per horizon (p10, p25, p50, p75, p90) predicting a
> *correction to a carryover baseline in log space*, with the correction shrunk toward zero
> by a validated λ, and the outer interval widened by a **conformal (CQR)** margin so
> p10–p90 coverage actually lands at 80%. The second is an **XGBoost AFT survival model**
> that handles the ~70% of customers who never topped up inside the observation window.

## B1. The labels

```python
future_credit_usage_30d = Σ usage in [cutoff, cutoff + 30d)
future_credit_usage_90d = Σ usage in [cutoff, cutoff + 90d)
days_until_next_topup   = (first payment ≥ cutoff) − cutoff     # NaN if none
topup_observed          = days_until_next_topup is not NaN
```

Population: everyone with any activity history — the widest of the three models.

**Credit trains at its own, fresher cutoff.** Its labels only need 90 days of future data,
not 180. So the runner computes `month_start(max_activity − 90d)` and, when that is later
than the shared cutoff, rebuilds the credit datasets there. Otherwise the three newest
months of data would be wasted on churn's horizon for no reason.

## B2. Quantile regression, and why not a point forecast

The model doesn't predict one number. It predicts a **distribution**, via five separate
LightGBM models per horizon with `objective="quantile", alpha ∈ {0.10, 0.25, 0.50, 0.75, 0.90}`.

Quantile ("pinball") loss asymmetrically penalizes over- and under-prediction:

```
L_α(y, ŷ) = α·(y − ŷ)      if y ≥ ŷ
          = (1−α)·(ŷ − y)  if y < ŷ
```

At α=0.10, under-predicting costs 0.1× while over-predicting costs 0.9× — so the model
learns a line only 10% of actuals fall below.

**Why this matters operationally.** "You'll use 50,000 credits" is not actionable. "Most
likely 50,000, but plausibly anywhere from 12,000 to 140,000" tells sales whether to plan
capacity or wait. Usage here is genuinely high-variance — one campaign can 5× a month.

## B3. Anchoring on the carryover baseline

The single cleverest piece of this model.

Trees predict piecewise-constant values. Credit usage spans seven orders of magnitude
(hundreds to millions). A tree simply cannot track `y ≈ carryover` across that range — it
would need a leaf per magnitude band.

So the model isn't trained on `y` at all. It's trained on a **log-ratio against a baseline**:

```python
carryover  = usage_recent_90d / 3 × (horizon_days / 30)     # "next month looks like last month"
anchor_log = log1p(carryover)
target     = log1p(y) − anchor_log                          # ← what the model learns
```

Prediction inverts it:

```python
prediction = expm1(clip(correction, −1.5, +1.5) + anchor_log)
```

The model now learns *corrections* to a decent baseline instead of competing with it from
scratch — it starts at baseline accuracy. And in log space the problem is scale-free: "20%
higher than baseline" is one number whether the customer sends 1,000 or 1,000,000.

The `CORRECTION_CLIP = 1.5` bound (≈ ×0.22 to ×4.5 of the anchor) exists because uncapped
corrections extrapolate badly on whale customers at older backtest cutoffs and blow up MAE.

## B4. Shrinkage — a guaranteed floor

After fitting, λ ∈ [0, 1] is swept in 11 steps and chosen to minimize **validation MAE** of
the p50 forecast:

```python
prediction = expm1(clip(λ × correction_50, ±1.5) + anchor_log)
```

At λ = 0 this reproduces the carryover baseline **exactly**. So the point forecast can never
be worse than the baseline on the tuning split — mathematically, not by convention.

This is the regime-change guard: when the learned corrections stop helping (customer
behaviour has shifted since training), the next retrain shrinks them away rather than
betting on them. Degradation is graceful.

The shrinkage is applied as a uniform *location shift* in log space
(`(λ − 1) × correction_50` added to every quantile), so it moves all five quantiles together
and preserves both their order and the interval width.

## B5. Quantile crossing, and why not just sort

Five independently-fitted models can produce `p10 > p50` for some rows. The naive fix —
sort the five values — would silently swap a different value into the median slot. But p50
is the value shrinkage was calibrated on, so it must not move.

Instead, p50 is **pinned** and the outer quantiles are clamped monotonically around it:

```python
ordered[0.50] = raw[0.50]
bound = median; for α in (0.25, 0.10): bound = min(raw[α], bound); ordered[α] = bound
bound = median; for α in (0.75, 0.90): bound = max(raw[α], bound); ordered[α] = bound
```

## B6. CQR — making 80% actually mean 80%

A model trained on p10 and p90 loss does not automatically produce 80% empirical coverage —
quantile regression is only asymptotically calibrated, and on finite skewed data it's
usually too narrow.

**Conformalized Quantile Regression** fixes this with a distribution-free guarantee. On the
validation split, compute a conformity score per row:

```python
s_i   = max(p10_pred_i − y_i,  y_i − p90_pred_i)      # how far outside the interval
q_hat = quantile(s, (1 − α)(1 + 1/n))                 # α = 0.20
```

Then widen: `[p10 − q_hat, p90 + q_hat]`. Under exchangeability this guarantees
`P(y ∈ interval) ≥ 80%` regardless of the underlying distribution.

Middle quantiles are untouched — only the reported interval widens. `q_hat` ships in the
artifact per horizon.

## B7. Cross-horizon monotonicity

The 30d and 90d heads are independent, so ~3% of rows come back with 90d < 30d. Cumulative
usage over 90 days cannot be less than over 30. So per quantile:

```python
pred_90[q] = max(pred_90[q], pred_30[q])
```

Enforced identically in the trainer and in the prediction runner, so training metrics match
what's actually served.

## B8. Top-up timing — XGBoost AFT survival

**The censoring problem.** ~70% of customers never topped up inside the observation window.
Their true `days_until_next_topup` is unknown — you only know it's *greater than* the
window. Dropping them biases toward frequent buyers; coding them as a large number is a
fabrication.

**Accelerated Failure Time (AFT)** regression handles this natively. Each row gets a bounded
label:

- Observed top-up → `[days, days]` (an exact point)
- Censored → `[censor_days, +∞)` (a lower bound)

XGBoost's `survival:aft` objective maximizes the likelihood under both. A small grid —
distribution ∈ {normal, logistic} × scale ∈ {0.5, 1.0, 1.5} — is selected on validation
**urgent-F2**, because the model exists to power one alert: *"must top up within ≤14 days"*.
So that's what selection optimizes, not general MAE.

**The day-scale trick.** Censoring inflates the raw AFT estimate — a fixed "≤14 days" UI
rule barely fires against raw predictions. But AFT days are *monotone in risk*, so the
optimal decision rule is "flag below the F2-optimal validation threshold t*". Rather than
hide that threshold in the UI, it's baked into the shipped number:

```python
day_scale = 14 / t*
predicted_days = raw_prediction × day_scale
```

Ranking is preserved and the "≤14 days" rule now means what it says.

Serve-time output is `min(ceil(days), 365)`.

**The fallback.** For artifacts trained before the AFT model shipped, a heuristic fills in:
`credit_balance_total / (predicted_30d_usage / 30)`. Note it uses the *snapshot* balance
from the profile sheet — display-only Tier B data — so it's a fallback, not the primary path.

## B9. Credit metrics and promotion

**Primary metric: `coverage_p10_p90`** — the fraction of actuals inside the predicted
interval. Target 80%, acceptable band **(0.75, 0.90]**.

This is unusual as a primary metric, and deliberate: the credit model's job is to give sales
a *trustworthy range*. An interval that's right 40% of the time is worse than useless; one
that's right 99% of the time is so wide it says nothing.

The band is enforced through two different mechanisms:
- **Lower bound (0.75)** via `baseline_validation = 0.75` in the promotion `CandidateEval` —
  it has to "beat the baseline" of 75% coverage.
- **Upper bound (0.90)** encoded as `calibration_error = max(0, coverage − 0.90)` against a
  safety ceiling of 0.001. Coverage ≤ 0.90 → error 0 → passes; coverage > 0.90 → rejected.

Also reported: `mae_30d/90d`, `smape`, `pinball_composite`, `winkler_score` (interval score:
width + penalty for misses), urgent-top-up precision/recall/F2, and bootstrap CIs (30d and
90d resampled with the *same* indices per iteration, preserving per-customer correlation
between horizons so the CIs aren't overconfident).

**An extra gate outside the two-stage policy:** the credit MAE must be within
`1.10 ×` the best baseline MAE for *both* horizons. Baselines are point forecasts with no
interval, so they can't be compared on coverage — the MAE check is what stops a model with
beautiful coverage and terrible point accuracy from shipping. Baselines:
`last_30d_carryover` and `moving_avg_90d`.

## B10. Serving

```python
q30 = horizons[30].predict_quantiles(x, credit_anchor_log(features, 30))
q90 = horizons[90].predict_quantiles(x, credit_anchor_log(features, 90))

predicted_credit_usage_30d = q30[0.50]
predicted_credit_usage_90d = max(q90[0.50], q30[0.50])
credit_p10_30d / p90_30d   = q30[0.10] / q30[0.90]
credit_p10_90d / p90_90d   = max(q90[0.10], p10_30) / max(q90[0.90], p90_30)
estimated_days_until_topup = min(ceil(aft.predict_days(x)), 365)
```

Eligibility at serve: `lifecycle_stage ∈ {Active Paid, Active Free}`. (Note this is
*stricter* than the training-side `has_activity_history` flag — the output contract
deliberately excludes Churned and Ghost from credit forecasts.)

Urgency bands:

| `estimated_days_until_topup` | `credit_urgency_level` |
|---|---|
| ≤ 14 | critical |
| ≤ 30 | warning |
| ≤ 90 | monitor |
| > 90 or unknown | stable |

These day cutoffs are **operational SLA policy owned by ops**, not a statistical property —
which is why they're fixed constants while the churn and p_alive cuts are learned. An
absolute-days forecast is invariant to data scale in a way a probability isn't.

## B11. Where credit output goes

```
predicted_credit_usage_30d
  ├─► dashboard "30d credit demand" (summed across the book)
  └─► fallback days-until-topup heuristic

estimated_days_until_topup
  ├─► credit_urgency_level → dashboard urgency card, table filter
  └─► "top-ups due in 7 days" count

credit_forecast_interval_json (p10/p90 per horizon)
  └─► customer detail — the honest range, not a false-precision point
```

Credit is deliberately kept **out of `priority_score`**. Priority ranks by money at risk
(`churn × CLV`); credit urgency is a separate *timing* signal. A customer who needs credit
next week is a sales opportunity, not a retention risk, and collapsing both onto one score
would make the work list mean two different things at once.

---

# Part C — How the three fit together

| | Churn | CLV | Credit |
|---|---|---|---|
| **Question** | Will they leave? | What are they worth? | When/how much credit? |
| **Type** | Binary classification | Zero-inflated regression | Quantile regression + survival |
| **Population** | Active Paid | Active (Paid or Free) | Active (Paid or Free) |
| **Horizon** | 180d | 180d | 30d / 90d |
| **Algorithms** | LR / LightGBM / TabICL | BG-NBD+GG / LGBM Tweedie / XGB Tweedie / Hurdle | LightGBM quantile ×5 ×2 + XGBoost AFT |
| **Primary metric** | PR-AUC | Spearman | Coverage p10–p90 |
| **Post-processing** | Platt/isotonic calibration | OLS magnitude + tail blend | Shrinkage + CQR + monotonicity |
| **Calibration gate** | ECE ≤ 0.10 ceiling, 0.05 target | none | coverage ≤ 0.90 |
| **Explainability** | SHAP per customer | none (bundle) | none |
| **Feature set** | 27 (`tier_a_27`) | 27 (`tier_a_27`) | 31 (`tier_a_31`) |
| **Cutoff** | shared C1 | shared C1 | own fresher cutoff |

They compose into the two numbers the business actually acts on:

```
revenue_at_risk   = churn_probability × predicted_clv_6m
segment           = f(value_tier(CLV), health(churn, p_alive), lifecycle, momentum)
```

Churn supplies the probability, CLV supplies the money and the second opinion on health
(`p_alive`), credit supplies the sales-timing overlay. None of the three is useful alone:
a high churn probability on a ฿400 customer is noise, and a ฿400,000 CLV on a customer
who's already gone is a fantasy.
