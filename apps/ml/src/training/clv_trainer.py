"""CLV model training — two-part (p_pay × value range) + BG-NBD for p_alive.

CLV revenue forecast uses a data-grounded two-part model (retention × value-if-pay).
BG-NBD + Gamma-Gamma is fitted only for p_alive health cuts, not for revenue ranking.
Promotion uses clv_composite_score (Spearman + top-decile + portfolio bias + coverage + p_pay ECE).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

import lightgbm as lgb
import numpy as np
import pandas as pd
from lifetimes import BetaGeoFitter, GammaGammaFitter

from src.constants import DerivedThresholds
from src.training.baselines import ClvSegmentMeanBaseline, clv_carryover_scores
from src.training.datasets import SplitFrame
from src.training.metrics import (
    bootstrap_ci_regression,
    clv_composite_score,
    clv_metrics,
    clv_p_pay_metrics,
    total_sum_calibration_slope,
)
from src.training.preprocessing import PreprocessorConfig, transform_features

logger = logging.getLogger(__name__)


def derive_p_alive_thresholds(p_alive_values: np.ndarray) -> dict[str, float]:
    """Per-model at-risk / watch p_alive health cuts from validation p_alive.

    p_alive from BG/NBD is not guaranteed calibrated across cohorts — its scale
    slides with purchase cadence and observation window (T). A fixed 0.20 line
    therefore flags a different fraction of customers each run. Deriving the cut
    from the validation p_alive QUANTILE at a target flag-rate keeps the flag-rate
    stable while the concrete p_alive value adapts to the model. The cuts are
    clamped so a degenerate distribution can never produce an absurd boundary,
    and the pipeline falls back to the fixed constants when there aren't enough
    finite values to estimate a quantile. Mirrors how churn risk thresholds are
    derived at training and shipped in the artifact.
    """

    finite = np.asarray(p_alive_values, dtype=float)
    finite = finite[np.isfinite(finite) & (finite > 0.0)]
    lo_a, hi_a = DerivedThresholds.P_ALIVE_ATRISK_CLAMP
    lo_w, hi_w = DerivedThresholds.P_ALIVE_WATCH_CLAMP
    if finite.size < 50:
        return {
            "p_alive_at_risk": DerivedThresholds.P_ALIVE_ATRISK_FALLBACK,
            "p_alive_watch": DerivedThresholds.P_ALIVE_WATCH_FALLBACK,
        }
    at_risk = float(np.clip(np.quantile(finite, DerivedThresholds.P_ALIVE_ATRISK_RATE), lo_a, hi_a))
    watch = float(np.clip(np.quantile(finite, DerivedThresholds.P_ALIVE_WATCH_RATE), lo_w, hi_w))
    # Health is monotone (at-risk is stricter than watch): keep at_risk < watch.
    watch = max(watch, at_risk + 1e-6)
    return {"p_alive_at_risk": round(at_risk, 4), "p_alive_watch": round(watch, 4)}

RANDOM_SEED = 42
BGNBD_PENALIZERS = [float(v) for v in np.logspace(-4, 0, 9)]
EARLY_STOPPING_ROUNDS = 50


@dataclass
class BgNbdBundle:
    """BG-NBD + Gamma-Gamma fitted on pre-cutoff payments."""

    bgf: BetaGeoFitter
    ggf: GammaGammaFitter | None
    penalizer: float
    horizon_days: int

    def predict_frame(self, rfm: pd.DataFrame) -> pd.DataFrame:
        """Predict expected revenue + p_alive for an RFM summary frame."""

        out = pd.DataFrame({"acc_id": rfm["acc_id"].astype(int)})
        n_purchases = self.bgf.conditional_expected_number_of_purchases_up_to_time(
            self.horizon_days, rfm["frequency"], rfm["recency"], rfm["T"]
        )
        p_alive = self.bgf.conditional_probability_alive(
            rfm["frequency"], rfm["recency"], rfm["T"]
        )
        if self.ggf is not None:
            expected_value = np.where(
                rfm["frequency"] > 0,
                self.ggf.conditional_expected_average_profit(
                    rfm["frequency"], rfm["monetary_value"]
                ),
                rfm["monetary_value"].mean() if len(rfm) else 0.0,
            )
        else:
            expected_value = np.full(len(rfm), float(rfm["monetary_value"].mean() or 0.0))
        out["predicted_clv"] = np.clip(np.asarray(n_purchases) * np.asarray(expected_value), 0, None)
        out["p_alive"] = np.clip(np.asarray(p_alive, dtype=float), 0.0, 1.0)
        return out


@dataclass
class HurdleBundle:
    """2-stage zero-inflated model: LightGBM binary × LightGBM Gamma.

    Stage 1 (classifier): P(revenue > 0) — trained on all rows.
    Stage 2 (regressor):  E[revenue | revenue > 0] — trained on positive-only rows,
                          Gamma objective appropriate for strictly positive right-skewed targets.
    Final prediction: prob_positive × conditional_revenue (expectation by law of total expectation).
    """

    classifier: lgb.LGBMClassifier
    regressor: lgb.LGBMRegressor
    params: dict[str, Any]  # shared structural params (objective field excluded)

    def predict(self, x: "pd.DataFrame") -> np.ndarray:
        prob_positive = np.clip(self.classifier.predict_proba(x)[:, 1], 0.0, 1.0)
        conditional = np.clip(self.regressor.predict(x), 0.0, None)
        return prob_positive * conditional


TWOPART_QUANTILES = (0.10, 0.50, 0.90)


@dataclass
class TwoPartQuantileBundle:
    """Data-grounded CLV representation: retention × value-if-pay (log-space).

    The bundled data is extreme: ~77% of active customers generate zero future
    6-month revenue and the top 1% drive ~63% of it (Gini ≈ 0.96). A single
    point THB forecast is therefore meaningless for most customers. This bundle
    splits CLV into the two questions the data can actually answer:

      p_pay        = P(future_revenue_6m > 0)                 (LightGBM binary)
      value | pay  = quantile regression on log1p(revenue)     (LightGBM, positive rows)
                     at q10/q50/q90 → back-transform expm1

    Outputs per customer:
      p_pay                 calibrated probability of paying
      value_p10/p50/p90     THB range if they pay (uncertainty band)
      expected_value        = p_pay × value_p50   (feeds the portfolio total / ranking)
    """

    classifier: lgb.LGBMClassifier
    q_models: dict[float, lgb.LGBMRegressor]
    params: dict[str, Any]

    def p_pay(self, x: "pd.DataFrame") -> np.ndarray:
        return np.clip(self.classifier.predict_proba(x)[:, 1], 0.0, 1.0)

    def value_quantile(self, x: "pd.DataFrame", q: float) -> np.ndarray:
        return np.expm1(np.clip(self.q_models[q].predict(x), 0.0, None))

    def predict(self, x: "pd.DataFrame") -> np.ndarray:
        """Expected value = p_pay × median value-if-pay (point estimate for ranking/total)."""
        return self.p_pay(x) * self.value_quantile(x, 0.50)


@dataclass
class ClvTrainResult:
    champion_name: str  # always "twopart" for new runs; legacy artifacts may differ
    bgnbd: BgNbdBundle
    tweedie_model: lgb.LGBMRegressor | None
    tweedie_params: dict[str, Any]
    xgb_model: Any | None
    xgb_params: dict[str, Any]
    hurdle_bundle: "HurdleBundle | None"
    competition: dict[str, float]
    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]
    baseline_metrics: dict[str, dict[str, dict[str, float]]]
    preprocessor: PreprocessorConfig
    test_ci_json: dict[str, dict[str, float]] = field(default_factory=dict)
    magnitude_slope: float = 1.0
    magnitude_intercept: float = 0.0
    p_alive_thresholds: dict[str, float] = field(default_factory=dict)
    twopart_bundle: "TwoPartQuantileBundle | None" = None
    twopart_metrics: dict[str, Any] = field(default_factory=dict)


def build_rfm_summary(payments: pd.DataFrame, acc_ids: pd.Series, cutoff: pd.Timestamp) -> pd.DataFrame:
    """RFM summary (frequency/recency/T/monetary) from pre-cutoff payments."""

    history = payments[
        payments["acc_id"].notna()
        & payments["payment_date"].notna()
        & (payments["payment_date"] < cutoff)
    ].copy()
    history["acc_id"] = history["acc_id"].astype(int)
    history["amount"] = pd.to_numeric(history["amount"], errors="coerce").fillna(0.0)
    history["day"] = history["payment_date"].dt.normalize()

    daily = history.groupby(["acc_id", "day"], as_index=False)["amount"].sum()
    grouped = daily.groupby("acc_id")
    first = grouped["day"].min()
    last = grouped["day"].max()
    counts = grouped["day"].count()

    rfm = pd.DataFrame({"acc_id": pd.Series(sorted(set(acc_ids.astype(int))))})
    rfm["frequency"] = rfm["acc_id"].map(counts - 1).fillna(0.0).clip(lower=0)
    rfm["recency"] = rfm["acc_id"].map((last - first).dt.days).fillna(0.0)
    rfm["T"] = rfm["acc_id"].map((cutoff.normalize() - first).dt.days).fillna(0.0).clip(lower=0)

    repeat = daily.merge(first.rename("first_day"), on="acc_id")
    repeat = repeat[repeat["day"] > repeat["first_day"]]
    monetary = repeat.groupby("acc_id")["amount"].mean()
    rfm["monetary_value"] = rfm["acc_id"].map(monetary).fillna(0.0).clip(lower=0)
    return rfm


def fit_bgnbd(
    payments: pd.DataFrame,
    train_acc_ids: pd.Series,
    cutoff: pd.Timestamp,
    horizon_days: int,
    penalizer: float,
) -> BgNbdBundle:
    rfm_train = build_rfm_summary(payments, train_acc_ids, cutoff)
    fit_rows = rfm_train[rfm_train["T"] > 0]

    bgf = BetaGeoFitter(penalizer_coef=penalizer)
    bgf.fit(fit_rows["frequency"], fit_rows["recency"], fit_rows["T"])

    gg_rows = fit_rows[(fit_rows["frequency"] > 0) & (fit_rows["monetary_value"] > 0)]
    ggf: GammaGammaFitter | None = None
    if len(gg_rows) >= 50:
        ggf = GammaGammaFitter(penalizer_coef=max(penalizer, 0.001))
        ggf.fit(gg_rows["frequency"], gg_rows["monetary_value"])
    return BgNbdBundle(bgf=bgf, ggf=ggf, penalizer=penalizer, horizon_days=horizon_days)


def train_clv(
    dataset: SplitFrame,
    payments: pd.DataFrame,
    cutoff: pd.Timestamp,
    horizon_days: int,
    preprocessor: PreprocessorConfig,
    *,
    tweedie_trials: int = 0,  # legacy kwarg — ignored
    xgb_trials: int = 0,
    hurdle_trials: int = 0,
    progress: Callable[[str], None] | None = None,
) -> ClvTrainResult:
    notify = progress or (lambda message: logger.info(message))

    y_train = pd.to_numeric(dataset.labels("train", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_val = pd.to_numeric(dataset.labels("validation", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_test = pd.to_numeric(dataset.labels("test", "future_revenue_6m"), errors="coerce").fillna(0.0)

    # BG-NBD + Gamma-Gamma — p_alive only (not the revenue forecast).
    notify("clv: fitting BG-NBD + Gamma-Gamma (p_alive)")
    best_bundle: BgNbdBundle | None = None
    best_bgnbd_score = -2.0
    val_acc = dataset.split("validation")["acc_id"]
    for penalizer in BGNBD_PENALIZERS:
        try:
            bundle = fit_bgnbd(payments, dataset.split("train")["acc_id"], cutoff, horizon_days, penalizer)
            predicted = bundle.predict_frame(build_rfm_summary(payments, val_acc, cutoff))
            from scipy.stats import spearmanr

            corr = spearmanr(y_val.to_numpy(), predicted["predicted_clv"].to_numpy()).statistic
            corr = 0.0 if np.isnan(corr) else float(corr)
            if corr > best_bgnbd_score:
                best_bgnbd_score, best_bundle = corr, bundle
        except Exception as exc:  # noqa: BLE001
            logger.warning("BG-NBD penalizer=%s failed: %s", penalizer, exc)
    if best_bundle is None:
        raise RuntimeError("BG-NBD failed to fit for all penalizer values.")

    val_p_alive = best_bundle.predict_frame(
        build_rfm_summary(payments, val_acc, cutoff)
    )["p_alive"].to_numpy()
    p_alive_thresholds = derive_p_alive_thresholds(val_p_alive)
    notify(f"clv: p_alive health cuts (derived) = {p_alive_thresholds}")

    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    x_test = transform_features(dataset.features("test"), preprocessor)

    notify("clv: fitting two-part (retention × value-if-pay)")
    twopart_bundle, _ = _fit_twopart_quantile(x_train, y_train, x_val, y_val)

    val_preds_raw = twopart_bundle.predict(x_val)
    magnitude_slope = total_sum_calibration_slope(val_preds_raw, y_val.to_numpy())
    notify(f"clv: total-sum calibration scale={magnitude_slope:.3f}")

    validation_metrics = _eval_twopart_metrics(
        twopart_bundle, x_val, y_val.to_numpy(), magnitude_slope
    )
    test_preds = np.clip(magnitude_slope * twopart_bundle.predict(x_test), 0.0, None)
    test_metrics = _eval_twopart_metrics(
        twopart_bundle, x_test, y_test.to_numpy(), magnitude_slope
    )
    test_ci_json = bootstrap_ci_regression(y_test.to_numpy(), test_preds)

    notify(
        f"clv: val composite={validation_metrics.get('clv_composite')} "
        f"spearman={validation_metrics.get('spearman')} "
        f"top10={validation_metrics.get('top_decile_capture')} "
        f"bias={validation_metrics.get('revenue_bias_ratio')} "
        f"p_pay_auc={validation_metrics.get('p_pay_roc_auc')}"
    )

    segment = ClvSegmentMeanBaseline().fit(dataset.features("train"), y_train)
    baseline_metrics: dict[str, dict[str, dict[str, float]]] = {
        "segment_mean": {
            "validation": _with_composite(
                clv_metrics(y_val.to_numpy(), segment.predict(dataset.features("validation")))
            ),
            "test": _with_composite(
                clv_metrics(y_test.to_numpy(), segment.predict(dataset.features("test")))
            ),
        },
        "revenue_180d_carryover": {
            "validation": _with_composite(
                clv_metrics(
                    y_val.to_numpy(), clv_carryover_scores(dataset.features("validation"))
                )
            ),
            "test": _with_composite(
                clv_metrics(y_test.to_numpy(), clv_carryover_scores(dataset.features("test")))
            ),
        },
    }

    return ClvTrainResult(
        champion_name="twopart",
        bgnbd=best_bundle,
        tweedie_model=None,
        tweedie_params={},
        xgb_model=None,
        xgb_params={},
        hurdle_bundle=None,
        competition={"twopart": float(validation_metrics.get("clv_composite", 0.0))},
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        baseline_metrics=baseline_metrics,
        preprocessor=preprocessor,
        test_ci_json=test_ci_json,
        magnitude_slope=magnitude_slope,
        magnitude_intercept=0.0,
        p_alive_thresholds=p_alive_thresholds,
        twopart_bundle=twopart_bundle,
        twopart_metrics=validation_metrics,
    )


def _with_composite(metrics: dict[str, float]) -> dict[str, float]:
    out = dict(metrics)
    out["clv_composite"] = clv_composite_score(out)
    return out


def _eval_twopart_metrics(
    bundle: TwoPartQuantileBundle,
    x: pd.DataFrame,
    y_true: np.ndarray,
    magnitude_slope: float,
) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    preds = np.clip(magnitude_slope * bundle.predict(x), 0.0, None)
    metrics = clv_metrics(y_true, preds)
    metrics.update(clv_p_pay_metrics(y_true, bundle.p_pay(x)))
    pos = y_true > 0
    if int(pos.sum()) > 0:
        lo = bundle.value_quantile(x, 0.10)[pos]
        hi = bundle.value_quantile(x, 0.90)[pos]
        metrics["range_coverage"] = round(float(((y_true[pos] >= lo) & (y_true[pos] <= hi)).mean()), 4)
    metrics["clv_composite"] = clv_composite_score(metrics)
    return metrics


def backtest_clv(
    result: ClvTrainResult,
    dataset: SplitFrame,
    payments: pd.DataFrame,
    cutoff: pd.Timestamp,
    horizon_days: int,
    preprocessor: PreprocessorConfig,
) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    """Refit two-part CLV at an older cutoff; return test metrics + baselines."""

    y_train = pd.to_numeric(dataset.labels("train", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_val = pd.to_numeric(dataset.labels("validation", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_test = pd.to_numeric(dataset.labels("test", "future_revenue_6m"), errors="coerce").fillna(0.0)

    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    x_test = transform_features(dataset.features("test"), preprocessor)

    bundle, _ = _fit_twopart_quantile(x_train, y_train, x_val, y_val)
    slope = total_sum_calibration_slope(bundle.predict(x_val), y_val.to_numpy())
    champion_metrics = _eval_twopart_metrics(bundle, x_test, y_test.to_numpy(), slope)

    segment = ClvSegmentMeanBaseline().fit(dataset.features("train"), y_train)
    baseline_metrics = {
        "segment_mean": _with_composite(
            clv_metrics(y_test.to_numpy(), segment.predict(dataset.features("test")))
        ),
        "revenue_180d_carryover": _with_composite(
            clv_metrics(y_test.to_numpy(), clv_carryover_scores(dataset.features("test")))
        ),
    }
    return champion_metrics, baseline_metrics


def _fit_twopart_quantile(
    x_train: pd.DataFrame,
    y_train: pd.Series,
    x_val: pd.DataFrame,
    y_val: pd.Series,
) -> tuple[TwoPartQuantileBundle, dict[str, Any]]:
    """Fit retention classifier + log-space quantile value model.

    Returns (bundle, validation_metrics). Fixed, sensible LightGBM params (no
    Optuna): the two-part structure — not fine tuning — is what fits this
    zero-inflated, whale-heavy target, and it keeps training fast + reproducible.
    """
    from src.training.metrics import clv_metrics

    y_tr = np.asarray(y_train, dtype=float)
    y_va = np.asarray(y_val, dtype=float)
    params = dict(
        n_estimators=1500, num_leaves=64, learning_rate=0.05, min_child_samples=50,
        feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1,
        random_state=RANDOM_SEED, n_jobs=-1, verbosity=-1,
    )
    clf = lgb.LGBMClassifier(objective="binary", **params)
    clf.fit(
        x_train, (y_tr > 0).astype(float),
        eval_set=[(x_val, (y_va > 0).astype(float))],
        callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
    )
    pos = y_tr > 0
    pos_va = y_va > 0
    log_pos = np.log1p(np.maximum(y_tr[pos], 0.0))
    log_va = np.log1p(np.maximum(y_va[pos_va], 0.0))
    q_models: dict[float, lgb.LGBMRegressor] = {}
    for a in TWOPART_QUANTILES:
        m = lgb.LGBMRegressor(objective="quantile", alpha=a, **params)
        if int(pos_va.sum()) >= 20:
            m.fit(
                x_train[pos], log_pos,
                eval_set=[(x_val[pos_va], log_va)],
                callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False), lgb.log_evaluation(0)],
            )
        else:
            m.fit(x_train[pos], log_pos)
        q_models[a] = m

    bundle = TwoPartQuantileBundle(classifier=clf, q_models=q_models, params=params)
    metrics = clv_metrics(y_va, bundle.predict(x_val))
    if int(pos_va.sum()) > 0:
        lo = bundle.value_quantile(x_val, 0.10)[pos_va]
        hi = bundle.value_quantile(x_val, 0.90)[pos_va]
        metrics["range_coverage"] = round(
            float(((y_va[pos_va] >= lo) & (y_va[pos_va] <= hi)).mean()), 4
        )
    return bundle, metrics
