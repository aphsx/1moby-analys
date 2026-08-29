# Model Deep Dive (EN) — Churn, CLV & Credit

> เอกสารรวม (ภาษาอังกฤษ) ที่อธิบาย "เหตุผลเชิงลึก" และ worked example ของโมเดลทั้งสาม
> รวมจาก `MODEL-CHURN-DEEP-DIVE.md` + `MODEL-CLV-CREDIT-DEEP-DIVE.md` เดิม
> สำหรับ **ตัวเลข/สูตร/threshold ที่เป็นทางการ** ให้ยึด [`ML-CALCULATIONS-TH.md`](ML-CALCULATIONS-TH.md) (ถ้าขัดกัน ให้เชื่อโค้ด)
>
> เนื้อหา: **ตอนที่ 1 — Churn** (ด้านล่าง) · **ตอนที่ 2 — CLV & Credit** (ครึ่งหลังของไฟล์)

---

# ตอนที่ 1 — The Churn Model (Complete Walkthrough)

Everything that happens between "an Excel file exists" and "this customer shows 71%
churn risk with three reasons attached". In order, in plain English.

Source files: `apps/ml/src/training/{labels,features,datasets,preprocessing,churn_trainer,metrics,leakage,baselines,promotion,runner}.py`
and `apps/ml/src/prediction/runner.py`.

---

## 0. The one-paragraph answer

> Churn is a **binary classification** problem. The default candidate pool is
> **Logistic Regression**, **LightGBM** (gradient-boosted trees, Optuna-tuned), and
> **TabICLv2** (a pretrained tabular foundation model). All three are trained on 27
> point-in-time behavioural features, ranked by 5-fold grouped cross-validated
> **PR-AUC**, and the winner's raw scores are **calibrated** (Platt or isotonic) into
> honest probabilities. A decision threshold is picked by maximizing **F2** (recall
> weighted 2× over precision), and three risk bands are derived from it. The model only
> ships if it beats trivial baselines on every split *and* every historical backtest,
> passes a five-test leakage suite, and beats the incumbent champion by ≥1% relative.
> At serve time each customer gets a calibrated probability, a risk level, and the top-5
> **SHAP** feature contributions that produced it.

---

## 1. What "churn" even means here

There is no cancel button. Customers pre-pay for credit and burn it down. So churn has to
be defined by *behaviour*, and the definition is a business choice encoded in
`build_churn_labels()`:

```python
cutoff       = the run's cutoff date (always the 1st of a month)
horizon_end  = cutoff + horizon_days          # default 180
active_start = cutoff - active_window_days    # default 180

activity = payments ∪ (usage rows where usage > 0)

pre_active_ids        = accounts with activity in [active_start, cutoff)
future_active_ids     = accounts with activity in [cutoff, horizon_end)
ever_paid_before_ids  = accounts with any payment before cutoff

eligible     = pre_active_ids ∩ ever_paid_before_ids
churn_label  = 1 if acc_id NOT IN future_active_ids else 0
```

In English:

- **Who gets a label?** Customers who were *doing something* in the 180 days before the
  cutoff (paying or actually sending messages) **and** who have paid at least once ever.
  That's exactly the `Active Paid` lifecycle stage.
- **What is a positive?** Complete silence for the next 180 days — no payment *and* no
  message sent. Not "didn't pay". A customer sitting on prepaid balance and still sending
  is very much alive.

### Three consequences worth internalizing

**Activity is defined by observation, not by the customer sheet.** The population comes
from payment/usage events. Uploaded profile sheets are not guaranteed to cover every
account that pays or sends, and those "orphan" accounts carry full behavioural signal.

**"Only paid once" is not a churn signal here.** In a seat-based SaaS it would be. In a
prepaid business, one big top-up can cover six months of healthy usage. This is why the
abstention rule later keys on *tenure*, not on payment count.

**The label is only knowable in the past.** You need 180 days of data *after* the cutoff
to know whether someone went silent. Gate 3 (`check_train_cutoff_feasibility`) hard-fails
a run where `max_activity_date < cutoff + horizon_days`. This is also why the training
cutoff is deliberately *old* (`latest_activity − horizon`) while the prediction cutoff is
as fresh as possible.

---

## 2. The features the model sees

27 numbers per customer, all computed strictly from `date < cutoff`. Full list and
formulas in [`HOW-IT-WORKS.md` §5](HOW-IT-WORKS.md#5-the-feature-layer-shared-by-all-three-models).
The churn-relevant intuition:

| Group | Signals | Why churn cares |
|---|---|---|
| Recency | `days_since_last_activity`, `days_since_last_payment`, `days_since_last_usage` | The single strongest churn signal in any subscription-adjacent business |
| Payment rhythm | `payment_interval_mean_days`, `payment_overdue_ratio`, `payment_amount_cv` | "Is this customer overdue *relative to their own habit*" beats an absolute day count |
| Volume | `usage_total_180d`, `usage_recent_90d`, `usage_prev_90d`, `total_revenue_*` | Scale — big customers churn differently from small ones |
| Momentum | `usage_change_90d_pct`, `usage_decay_ratio`, `usage_slope_6m`, `credit_usage_decel` | The *derivative*. A customer at 80% of last quarter is a different animal from one at 20% |
| Consistency | `usage_active_months_180d`, `usage_consistency_ratio` | Steady monthly senders vs one-burst campaigners |
| Product mix | 5 channel shares, `channel_hhi`, `multichannel_flag` | Multi-channel customers are stickier — more integration to unwind |
| Tenure | `customer_age_days` | Also the abstention key |

**Deliberately absent:** the customer sheet's `credit_sms` / `credit_email` / `expire_*`
snapshot columns. They reflect Excel *export* time, not the cutoff, so using them leaks
the future. The point-in-time balance is reconstructed instead
(`credit_balance_proxy = Σ credit_add − Σ usage`, both before cutoff) — and even that is
excluded from churn's feature set (credit-only extras).

**`payment_overdue_ratio` deserves a callout.** It's `days_since_last_payment ÷ payment_interval_mean_days`.
A customer who buys every 30 days and last bought 90 days ago scores 3.0. A customer who
buys every 180 days and last bought 90 days ago scores 0.5. Same raw recency, opposite
meaning. Absolute recency alone can't express that.

---

## 3. Building the dataset

### 3.1 Join and filter

```python
frame = feature_df ⨝ churn_labels  on acc_id   (inner)
frame = frame[frame.eligible_for_churn]
```

### 3.2 Split 60 / 20 / 20

```python
train, rest = train_test_split(test_size=0.40, stratify=churn_label, seed=42)
val,   test = train_test_split(rest, test_size=0.50, stratify=…, seed=42)
```

Stratified so the positive rate is identical in all three splits. Because there is exactly
one row per `acc_id` per cutoff, a stratified *row* split is automatically a *group* split
— no customer appears in two splits. (Below 25 rows everything becomes train; Gate 4
should have failed the run long before that.)

### 3.3 Multi-cutoff pooling — the biggest quality lever

At one cutoff you get roughly 1,500–2,000 active-paid rows. That's thin for a
27-dimensional problem.

So `pool_train_rows()` rebuilds the *entire* dataset at each backtest cutoff (2-month
steps back) and adds those rows to the **train split only**:

```
C1 (primary, e.g. 2025-10-01):  train + validation + test
C2 (2025-08-01):                train only
C3 (2025-06-01):                train only
…up to 6 older cutoffs
```

Two safeguards make this leak-proof:

1. **Validation and test stay purely at C1.** Holdout metrics keep meaning exactly one
   thing: "how does this do on unseen customers at the newest cutoff".
2. **Any `acc_id` held out at C1 is excluded from every older-cutoff row.** So customer
   #4711 cannot appear in test at C1 *and* in train at C2. `check_split_contamination`
   still passes on the pooled frame.

The same customer now appears several times in train, at different points in their life —
healthy in 2025-06, wobbling in 2025-08. The model learns *behavioural patterns* instead
of memorizing a static snapshot.

The cost: rows are no longer independent. That's handled in cross-validation (§5).

### 3.4 Preprocessing — fit on train, only ever transform elsewhere

`fit_preprocessor(train_features, schema)` learns and freezes three dictionaries:

1. **Imputation** — `0.0` for declared zero-default features; the **train median** for
   nullable ones.
2. **Center** — per-feature mean, computed *after* imputation, on train.
3. **Scale** — per-feature std (`ddof=0`), clamped so a constant feature can't divide by zero.

`transform_features()` then applies `(x − center) / scale` and never refits. The whole
config serializes to `preprocessor.json` and ships in the artifact — so serve time uses
the identical numbers.

Why this matters: if you fit the scaler on all the data, the test split's own mean and
variance leak into training. The effect is small but it's exactly the kind of quiet
optimism that makes an offline model look better than it is.
`check_preprocessing_safety()` asserts the fitted row count matches the train split.

---

## 4. The candidates

Configured by `DEFAULT_CANDIDATES` / `CHURN_CANDIDATES` env var. Default pool:

### 4.1 Logistic Regression

```python
LogisticRegression(max_iter=2000, class_weight="balanced", C=1.0, random_state=42)
```

A weighted sum of standardized features through a sigmoid. It is in the pool as a real
contender, not a formality — on ~2k rows with 27 features, a linear model with the right
regularization can genuinely beat trees, and if it does, that's an important finding.
`class_weight="balanced"` re-weights the minority class so a 15%-positive dataset doesn't
collapse into "predict everyone survives".

Fully explainable: SHAP on a linear model over standardized features is exactly
`coef_j × x_ij`, so no approximation is needed at serve time.

### 4.2 LightGBM — the usual winner

Gradient-boosted decision trees. Builds hundreds of shallow trees, each correcting the
residual error of the ensemble so far. Naturally captures interactions ("high recency
*and* declining usage *and* low tenure") and non-linear thresholds ("risk jumps sharply
past 60 days idle") that a linear model can only approximate.

Tuned with **Optuna**, 40 TPE trials (Tree-structured Parzen Estimator: a Bayesian
optimizer that models where good hyperparameters live and samples there), with a
`MedianPruner` to kill hopeless trials early:

| Hyperparameter | Range | Controls |
|---|---|---|
| `num_leaves` | 16 – 256 | Tree capacity |
| `learning_rate` | 0.01 – 0.2 (log) | Step size per tree |
| `min_child_samples` | 10 – 200 | Minimum rows per leaf (anti-overfit) |
| `feature_fraction` | 0.5 – 1.0 | Feature subsample per tree |
| `bagging_fraction` | 0.5 – 1.0 | Row subsample per tree |
| `lambda_l1` / `lambda_l2` | 1e-8 – 10 (log) | Regularization |
| `scale_pos_weight` | fixed = `n_neg / n_pos` | Class imbalance |

`n_estimators` is set to 2000 with **early stopping at 50 rounds** on validation
`average_precision`, so the actual tree count is learned, not tuned. Optuna's objective is
validation PR-AUC.

> **Why 40 trials, not 100?** The comment in the source is explicit: at ~1.5–2k labelled
> rows a 100-trial search overfits the validation slice for negligible CV gain. The
> promotion gate is the real arbiter of quality, not search depth.

### 4.3 TabICLv2 — the foundation model

A pretrained **in-context learner** for tabular data. It is *training-free*: there is no
gradient descent and no hyperparameter search. You hand it the training rows and the rows
to predict, and it produces calibrated probabilities in a single forward pass, using
patterns learned by pretraining on a large corpus of synthetic tabular tasks. It runs on
CUDA, Apple MPS, or CPU (auto-detected; override with `TABICL_DEVICE`).

Two engineering wrinkles the code handles:

- **Runtime scales with the rows it ingests.** Multi-cutoff pooling can multiply the train
  set several-fold, which is what once made a working run hang. `_CappedTabICLClassifier`
  stratified-subsamples to `TABICL_MAX_ROWS` (default 2000) before fitting, preserving class
  balance. Tree models still use the full pooled set.
- **It is opaque.** No `coef_`, no tree structure. `TreeExplainer` doesn't apply and
  `KernelExplainer` is far too slow per-customer at serve scale. So if TabICL wins, its
  probabilities are served normally and **`churn_factors` is `null`** — with a warning
  logged, and global permutation importance still available in the model card.
  The code will not fabricate directions it can't compute.

### 4.4 Opt-in candidates

- **XGBoost** — add `xgboost` to `CHURN_CANDIDATES`. Redundant with LightGBM on
  all-numeric features; kept as a switch, not a default.
- **Random Forest** — available but excluded: slow, and has never beaten a tuned LightGBM
  on this dataset in backtests.

---

## 5. Ranking the candidates: 5-fold grouped CV

A single 20% validation slice is ~300–400 rows here. Far too noisy to pick a champion.

So candidates are ranked by **5-fold cross-validated PR-AUC over `train ∪ validation`**:

```python
StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
  .split(x_trval, y_trval, groups=acc_id)
```

For each fold: clone the candidate's config, fit on 4 folds, predict the 5th. Collect all
five held-out predictions into a full-length **out-of-fold (OOF)** vector.

**Why `StratifiedGroupKFold`, grouped by `acc_id`?** Because of pooling. Customer #4711
may have three train rows from three cutoffs. A plain `StratifiedKFold` could put two in
the fit folds and one in the held-out fold. The model would then be scored on a customer
it has already seen, and both the ranking metric *and* the OOF-fitted calibrator would be
optimistically biased. Grouping keeps every customer entirely inside one fold.

**Why PR-AUC and not ROC-AUC or accuracy?** Churn is imbalanced — typically 10–25%
positive. Accuracy is useless (predict "nobody churns" and score 85%). ROC-AUC counts true
negatives, of which there are many, so it looks flattering. **PR-AUC** (average precision)
only looks at precision and recall on the positive class. It answers the question that
actually matters: *if I work down this ranked list, how many of the people I contact are
genuinely at risk?*

Per-fold scores are kept so a proper confidence interval can be computed
(`t_{4, 0.975} × std / √5`).

The OOF vector is reused for two more things — calibration and thresholding — which is
the whole reason it's collected rather than thrown away.

Candidates are sorted by mean CV PR-AUC. **The runner then finalizes and evaluates
*every* candidate, not just the winner** — no early break — because the promotion policy
picks the best *eligible* model, not the first one past a threshold.

---

## 6. Calibration: from "score" to "probability"

A LightGBM score of 0.8 does not mean "80% of these customers churn". Boosted trees are
systematically over-confident. That's fine for ranking and fatal for anything downstream
that does arithmetic on the number — and `revenue_at_risk = churn_probability × CLV` is
exactly such arithmetic.

`_fit_calibrator(oof, y_trval)` fits a one-dimensional map `raw score → true probability`,
**on the out-of-fold predictions** (never on scores the model has already fit, which would
just re-learn the overfit).

Two methods compete:

- **Platt scaling** — a logistic regression on the single raw score. Smooth, monotonic,
  keeps scores continuous.
- **Isotonic regression** — a monotonic step function. More flexible, but it quantizes
  scores into plateaus: everyone in a block gets an identical probability, destroying
  within-tier ranking.

Selection is deliberately biased toward Platt:

```
Isotonic is only considered when ≥200 positives, AND must either
  • beat Platt on ECE by ≥ 0.005, or
  • tie on ECE (within 0.005) while beating Brier by ≥ 2% relative
Otherwise → Platt.
```

The reasoning in the source: a hair of Brier gain does not justify collapsing thousands of
customers onto ~100 distinct probability values. Both methods are monotonic, so ranking
AUC is identical either way — the choice is purely about probability quality vs. granularity.

**ECE (Expected Calibration Error)** is the target metric: bucket predictions into 10
equal-width bins, and average `|mean predicted − actual rate|` weighted by bin population.
ECE = 0.03 means "on average, predicted probability is off by 3 percentage points".
It's the metric the promotion gate enforces, so it's the metric calibration optimizes.

The calibrator is pickled to `calibrator.pkl` and travels with the model.

---

## 7. The decision threshold and the four risk bands

A probability isn't a decision. Someone has to answer "at what number do we call this
customer at-risk?"

```python
f2 = select_threshold_max_fbeta(y_trval, calibrated_oof, beta=2.0)
high = clip(f2, 0.35, 0.85)
thresholds = {
    "medium":   round(high * 0.5, 2),
    "high":     round(high, 2),
    "critical": round(high + 0.6 * (1 - high), 2),
}
```

**F2, not F1.** F-beta weights recall `beta²` times as heavily as precision. At β=2, recall
counts 4× — meaning *missing a churner is four times worse than bothering a healthy
customer*. That is the correct business trade here: a wasted retention call costs a few
minutes; a missed churner costs six months of revenue.

The sweep evaluates 97 candidate thresholds drawn from quantiles of the calibrated OOF
scores (so candidates land where the data actually is) and picks the argmax.

**The `[0.35, 0.85]` clip** is a sanity rail. On an unusual cohort the F2 optimum can drift
to something like 0.08 — technically optimal, operationally useless because it flags 90% of
the book. The clip keeps the threshold in a band a human would act on.

**The bands.** If `high = 0.55`:

| Level | Range | Meaning |
|---|---|---|
| low | < 0.275 | Fine |
| medium | 0.275 – 0.55 | Watch |
| high | 0.55 – 0.82 | Act |
| critical | ≥ 0.82 | Act now |

`medium = high × 0.5` and `critical = high + 0.6 × (1 − high)`. Both are relative to the
learned `high`, so the bands adapt with the model instead of being hardcoded. They ship in
`thresholds.json`.

> **This is enforced at serve time.** If a churn artifact has no `thresholds.json`, the
> prediction runner **raises** rather than falling back to defaults. Guessing would
> silently mislabel every customer's risk level.

---

## 8. Final fit and the one look at the test set

```python
final_model = clone_candidate_model(candidate, y_trval)   # same hyperparameters, fresh
final_model.fit(x_trval, y_trval)                          # train ∪ validation
```

`_resolved_params()` first freezes any early-stopping-dependent parameter — LightGBM's
learned `best_iteration_` becomes a literal `n_estimators` — so the clone trains
standalone without needing an eval set.

Then, and only then, the test split is scored. Once.

```python
raw_test        = final_model.predict_proba(x_test)[:, 1]
calibrated_test = calibrator.transform(raw_test)
test_metrics    = churn_metrics(y_test, calibrated_test,
                                threshold=thresholds["high"],
                                ranking_scores=raw_test)
```

**Note the two score vectors.** Ranking metrics (PR-AUC, ROC-AUC, lift) use the **raw**
scores; probability metrics (Brier, ECE, log loss) and threshold metrics use the
**calibrated** ones. Why: isotonic calibration flattens scores into plateaus, creating
massive ties. Ties artificially depress PR-AUC and lift — which would make the calibrated
candidate look worse than the *uncalibrated* baselines it's gated against. Splitting the
two keeps that comparison honest.

---

## 9. What gets measured

### Ranking
| Metric | Meaning |
|---|---|
| **`pr_auc`** | **Primary.** Area under precision-recall. Robust to imbalance |
| `roc_auc` | Probability a random churner outranks a random survivor |
| `recall_at_top{5,10,20}pct` | Of all real churners, what share is in the top N% of the list |
| `lift_at_top{5,10,20}pct` | Churner density in the top N% ÷ base rate. "3.0" = 3× better than random |

### At the operating threshold
`precision`, `recall`, `f1`, plus a full confusion matrix (tp/fp/fn/tn).

### Probability quality
| Metric | Meaning |
|---|---|
| `brier` | Mean squared error of probabilities. Lower better |
| `bss` | Brier Skill Score: `1 − brier/brier_ref` vs base-rate climatology. >0 beats trivial |
| `ece` | Average calibration gap across 10 bins |
| `mce` | *Worst* bin's gap — surfaces a dangerous region a small ECE can hide |
| `log_loss` | Cross-entropy; punishes confident mistakes hard |

### Statistical honesty
- **Bootstrap 95% CI** on every test metric — 1,000 resamples with replacement, degenerate
  single-class samples discarded, percentile bounds reported.
- **CV confidence interval** from the 5 per-fold scores via a t-interval.
- **Hosmer-Lemeshow test** — chi-squared goodness-of-fit for calibration. `p > 0.05` means
  "no detectable miscalibration". The docstring warns honestly: above n≈10,000 the test has
  so much power it rejects trivial deviations, so read the p-value as a continuous
  diagnostic, not a gate.
- **Decile lift table** — top 5 deciles, for the Model Performance page.

### Feature importance
- Tree champion → **SHAP TreeExplainer** on a 1,500-row sample, global mean `|SHAP|`.
- Linear champion → `|coef_|`.
- Opaque champion (TabICL) → **permutation importance** (shuffle each feature, measure the
  average-precision drop) on a 2,000-row sample. Slower, but works for any `predict_proba`.

---

## 10. The leakage suite — five tests that try to break the model

`run_leakage_suite()`. Any hard failure blocks promotion. Results persist to
`ml_data_validation_reports` with `validation_type='leakage'`.

**1. Single-feature AUC scan** *(fail if > 0.90)*
Fit a depth-2 decision stump on each feature alone and score validation AUC. If any single
feature reaches 0.90+, it almost certainly encodes the answer — a column that is really a
post-cutoff artifact in disguise.

**2. Target shuffle** *(fail if lower confidence bound > 0.07)*
Randomly permute the training labels and refit. A clean pipeline should now score AUC ≈ 0.5
— you've destroyed the signal. If it still ranks well, the leak is in the *pipeline*, not
the features.

The subtlety, spelled out in the source: a single shuffled fit is still a smooth function
of features that genuinely correlate with the real label, so one draw's AUC has a wide null
(up to ~0.66 observed on this data). Thresholding a single draw would produce constant
false alarms. So it runs **5 shuffles** and tests the **lower confidence bound** of the mean
deviation from 0.5 — a genuine leak survives *every* permutation, chance alignment flips
direction per draw. Validation labels are shuffled too, so early stopping can't cheat by
picking the round that happens to fit the real ones.

**3. Suspect-drop audit** *(fail if AUC drops > 0.30)*
Refit without the four recency features (`days_since_last_activity`, `days_since_last_usage`,
`days_since_last_payment`, `payment_overdue_ratio`) and measure the damage. Recency is
legitimately the strongest churn signal — but if the model *collapses* without it, it isn't
modelling behaviour, it's reading a near-tautology ("hasn't done anything → will do nothing").

**4. Split contamination** *(fail on any overlap)*
`acc_id` sets across train/validation/test must be disjoint. Especially important after
pooling.

**5. Score sanity** *(warn if validation ROC-AUC > 0.97)*
Not a blocker — a flag. Churn is a genuinely hard problem. A 0.98 usually means something
is wrong, and a human should look.

---

## 11. Backtesting across time

Holdout says "does this generalize to unseen customers". Backtesting asks the harder
question: **"would this have worked in a different month?"**

For each older cutoff (2-month steps back, ≥365 days of history before, a full label window
after, capped at 6), `refit_for_backtest()` reruns the *entire* protocol at that cutoff:

```
rebuild features + labels at C_k
  → fit a fresh preprocessor on that cutoff's train split
  → clone the champion's hyperparameters, run 5-fold OOF CV
  → fit a fresh calibrator on those OOF predictions
  → re-derive the F2 threshold
  → refit on train ∪ validation, score that cutoff's test split
  → score all three baselines on the same split
```

Nothing is carried over except the *hyperparameters*. Anything else would be a leak from
the future into the past.

The output is a per-cutoff PR-AUC series stored in the model card. It's what makes
comparison against the previous champion apples-to-apples: the incumbent's card holds *its*
backtest series under the identical protocol.

---

## 12. Baselines: what "good" is measured against

A model isn't good because its PR-AUC is 0.61. It's good because 0.61 beats what you'd get
without ML. Three baselines, evaluated through the **exact same harness** (same splits,
same threshold, same metric functions) and persisted to `ml_model_evaluations`:

| Baseline | Rule | Represents |
|---|---|---|
| `recency_rule_90d` | `clip(days_since_last_activity / 180, 0, 1)` | "Just sort by who's been quiet longest" |
| `rfm_quartile` | `(rank(recency) + rank(−frequency) + rank(−monetary)) / 3` | Classic RFM segmentation |
| `logistic_regression` | Plain LR on the same 27 features | "Would a simple model do?" |

**One important detail:** when the LR *candidate* wins, it is compared against baselines
**excluding** the LR baseline. Requiring a model to strictly beat itself is nonsense, and
the headline "model vs baseline" number would read as a loss when it's the same algorithm.

---

## 13. The promotion decision

Every candidate's evaluation is packaged into a `CandidateEval` and run through
`promotion.decide()` with `CHURN_PROMOTION_CONFIG`.

**Stage 1 — SAFETY.** Eligible only if *all* hold:

| Check | Rule |
|---|---|
| Leakage | Suite passed |
| Artifact | Loads and predicts (verified post-write, for the winner) |
| Beats baselines | Strictly better PR-AUC on validation, on test, **and on every backtest cutoff** |
| Beats incumbent | Aggregate backtest PR-AUC ahead by ≥ `max(0, 1% × |incumbent|)` |
| Stable | Worst backtest cutoff ≥ median − 30% |
| Calibration safety | Test ECE ≤ **0.10** (a loose ceiling, not the target) |

**Stage 2 — QUALITY.** Among eligible candidates, maximize:

```
composite = mean(test_pr_auc, backtest_pr_auc…) − 1.0 × max(0, ece − 0.05)
```

Highest composite wins. If nothing is eligible, **the incumbent stays** and the new
versions are still written and browsable — just not promoted.

### Why the two stages exist

The original gate collapsed two very different questions into one boolean with hairline
thresholds. The result: the best-ranking model could be *vetoed* by a noise-sized, and
crucially **recoverable**, calibration miss — ECE 0.061 against a 0.05 line — while a
clearly weaker ranker got promoted. That is the wrong trade. Ranking who is at risk is
churn's primary job; calibration is fixed by post-hoc recalibration. So calibration became
a loose safety ceiling plus a soft penalty, not a veto.

### Why the 1% relative margin

Without it, a retrain that happens to score +0.0002 rotates the production champion. The
result is a champion that changes every run for no real reason, so no one trusts version
numbers and no one can attribute a change in dashboard numbers to anything. A gap smaller
than 1% relative is treated as a tie-on-noise and the incumbent is kept.

### The CI overlap advisory

If the winner's bootstrap CI overlaps the runner-up's, the summary appends a warning that
the difference may be sampling noise. It's **advisory** — it does not change the selection.
It exists so a human reviewing the model card knows the gap wasn't decisive.

---

## 14. What ships

`models/churn/{version}/`:

| File | Why it exists |
|---|---|
| `model.pkl` | The fitted estimator (`dill`) |
| `calibrator.pkl` | Raw score → probability map |
| `preprocessor.json` | Feature order + imputation + center + scale, frozen from train |
| `feature_names.json` | The exact contract |
| `thresholds.json` | medium / high / critical cuts |
| `feature_baseline.json` | Quantile bin edges + proportions, for PSI drift at serve |
| `metrics.json` | validation / test / backtests / baselines |
| `model_card.json` | Everything above plus params, candidate competition, selection log, leakage results, limitations, `trained_by` |

Plus a SHA-256 of `model.pkl`, an `ml_model_versions` row, and a fan of
`ml_model_evaluations` rows (validation holdout, test holdout, one per backtest, one per
baseline per split). If promoted, the `production` alias moves and the change is journalled.

**The final safety gate is a load test.** `verify_artifact_load()` reloads the artifact
from disk and predicts 5 sample rows. A model that can't reload is not promoted, no matter
how good its metrics — the incumbent stays.

---

## 15. Serving: what happens per customer

Inside `prediction/runner.py`, at 35–45% progress:

### Step 1 — Eligibility
```python
el_churn = (lifecycle_stage == "Active Paid")
```
Everyone else gets `churn_probability = NaN` and a reason in `model_eligibility_json`:
- `Active Free` → *"never_paid — ไม่เคยจ่ายเงิน ไม่เข้านิยาม churn"*
- `Churned` → *"already_churned — churn ไปแล้ว ไม่ต้องทำนาย"*
- `Ghost` → *"no_history — ไม่มีประวัติพอจะทำนาย"*

### Step 2 — Contract guard
Every column the artifact's preprocessor needs must exist, or the run fails loudly. Then
the feature hash is compared, distinguishing "old narrower contract, safe" from "same
features, different computation → train/serve skew, retrain recommended".

### Step 3 — Drift (PSI)
Live features are binned against `feature_baseline.json` edges. ≥2 features over PSI 0.25
marks the *model* as majorly drifted, which downgrades every customer that model scored to
`output_status = 'partial'` with a note. Drift never blocks — it flags.

### Step 4 — Score
```python
x     = transform_features(features[el_churn], preprocessor)   # frozen train stats
raw   = model.predict_proba(x)[:, 1]
prob  = calibrator.transform(raw)
frame["churn_probability"] = clip(prob, 0, 1)
frame["churn_risk_level"]  = [risk_level(p, thresholds) for p in prob]
```

### Step 5 — SHAP factors

The "why". Per customer, top 5 features by `|SHAP value|`:

```json
[{"feature": "days_since_last_activity", "value": 87, "direction": "up",   "impact": 0.412},
 {"feature": "usage_change_90d_pct",     "value": -0.63,"direction": "down","impact": 0.238},
 {"feature": "payment_overdue_ratio",    "value": 2.4, "direction": "up",   "impact": 0.187}]
```

`direction: "up"` = pushed risk higher; `impact` = magnitude of the contribution.

How they're computed depends on the champion:
- **Tree** (LightGBM/XGB/RF) → `shap.TreeExplainer` — exact, and fast enough to run on the
  full eligible population.
- **Linear** (LR) → `x_standardized × coef_`. For a linear model on standardized features
  this *is* the SHAP value, exactly. No approximation.
- **Opaque** (TabICL) → `null`, with a warning. Global permutation importance stays in the
  model card for population-level explanation.

SHAP failure is caught and never blocks a run — you lose the explanation, not the prediction.

### Step 6 — Abstention (this one matters)

```python
abstain = el_churn & (customer_age_days < 90)
→ churn_probability = NaN, churn_risk_level = None, churn_factors = None
→ model_eligibility.churn.status = "insufficient_data"
   reason: "insufficient_history — อายุลูกค้าสั้นกว่า 90 วัน … งดประเมิน churn (abstain)"
```

A customer whose tenure is shorter than the feature windows has most of them zero-filled:
no prior-90d usage, no 6-month slope, no payment interval. The model still returns a
confident-looking number — but it's driven by *defaults*, not by that customer's behaviour.

So the system refuses. Better to tell an account manager "not enough history" than to hand
them a fabricated 0.62.

**Why 90 days of tenure and not "≥2 payments"?** Because this is a prepaid business. A
single-payment customer can still have six months of rich usage signal — `n_purchases` is
not what zero-fills the features. Tenure is. (~11% of active-paid customers fall under this
line on the reference dataset.)

Abstention runs **first** in `_apply_derived`, so `revenue_at_risk`, segments and
`needs_review` all correctly see the null. And the post-check explicitly excludes
abstained customers from the "unexpected nulls" gate — these nulls are intentional.

---

## 16. Where the churn number goes

```
churn_probability
  ├─► churn_risk_level                    → dashboard risk buckets, table filter
  ├─► revenue_at_risk = churn × CLV       → the money number leadership sees
  │     └─► priority_score (log rescale)  → default sort on the customer table
  │     └─► priority_rank                 → global work-list order within segments
  ├─► needs_review  (high/critical risk, OR silent-decline)
  ├─► segment       (with value tier + p_alive)
  ├─► value×risk matrix on the dashboard
  ├─► AI explanation (LLM verbalizes the SHAP factors — never invents new ones)
  └─► realized-outcome backfill → measured against what actually happened
```

The key composition: **`revenue_at_risk = churn_probability × predicted_clv_6m`**. This is
also precisely why calibration is non-negotiable. If probabilities were systematically
inflated by 20%, every revenue-at-risk figure — and every prioritization decision built on
it — would be inflated by 20% too.

---

## 17. Worked example

Customer **#4711**, run cutoff **2026-04-01**.

**Their history**
- Joined 2023-06-14 → `customer_age_days = 1,022` (well past the 90-day abstention line)
- 14 payments, ฿186,000 lifetime, last payment 2026-01-08
- Usual gap between payments ≈ 31 days
- Usage: ~40k SMS/month through 2025, then 12k in Jan, 4k in Feb, 0 in Mar

**Lifecycle** → activity within 180d ✓, ever paid ✓ → **Active Paid** → churn-eligible.

**Selected features**
| Feature | Value | Reading |
|---|---|---|
| `days_since_last_activity` | 31 | Quiet for a month |
| `days_since_last_payment` | 83 | Overdue |
| `payment_interval_mean_days` | 31.2 | Buys monthly |
| `payment_overdue_ratio` | **2.66** | **2.7 cycles late** — the strong one |
| `usage_recent_90d` | 16,000 | |
| `usage_prev_90d` | 118,000 | |
| `usage_change_90d_pct` | −0.86 → `signed_log1p` → **−0.62** | Down 86% |
| `usage_slope_6m` | −7,400 | Steep monthly decline |
| `usage_consistency_ratio` | 0.67 | Missed months |
| `total_revenue_180d` | 42,000 | Still meaningful |
| `channel_hhi` | 1.0 | SMS only — nothing else anchoring them |

**Scoring**
1. Transform with the frozen train stats → 27 standardized values.
2. LightGBM champion `predict_proba` → raw **0.79**.
3. Platt calibrator → **0.71**.
4. Thresholds `{medium: 0.28, high: 0.55, critical: 0.82}` → 0.71 ≥ 0.55, < 0.82 → **`high`**.
5. SHAP top 3 → `payment_overdue_ratio` (up, 0.34), `usage_change_90d_pct` (up, 0.29),
   `usage_slope_6m` (up, 0.21).

**Downstream**
- CLV model: `predicted_clv_6m = ฿54,000` → percentile 0.93 → `customer_value_tier = high`
- `revenue_at_risk = 0.71 × 54,000 = ฿38,340`
- `priority_score ≈ 91` (log rescale)
- `needs_review = true` (high risk)
- `segment = High-Value At-Risk` (valuable ∧ at-risk) → top of the retention list
- Credit: `estimated_days_until_topup = 118` → `credit_urgency_level = stable`
  (they aren't going to top up — that's the point)

**What the account manager sees**

> **#4711 — High-Value At-Risk · Priority 91**
> 71% churn risk (high) · ฿38,340 at risk over 6 months
> Drivers: overdue on top-up (2.7× their usual cycle) · usage down 86% vs previous quarter ·
> six-month usage trend steeply negative

Six months later, the outcome backfill rebuilds the actual label for this run's customers
and grades the 0.71 against what really happened — at the threshold that was actually
served.


---

# ตอนที่ 2 — The CLV and Credit Models (Complete Walkthrough)

Continues from **ตอนที่ 1 (Churn)** above, at the same level of detail,
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

This is a **P1 mitigation**, not the fix. The proper fix is a log-space CLV retrain
(see the future-work note in `PROJECT-REPORT-TH.md` §5.4); the hybrid ships in the meantime.

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
