"""Clean CLV Model Trainer — Two-Part Hurdle (LightGBM Classifier + CatBoost Log-Scale).

Rebuilt cleanly to mirror notebooks/02_clv_prediction.ipynb:
  1. Part 1 (Classifier): LightGBM predicting whether customer will pay in next 6 months.
  2. Part 2 (Regressor): CatBoost in log-space on payers only (learning package sizes, avoiding Tweedie whale explosion).
  3. Portfolio Magnitude Calibration: Multiplier calibrated on validation set to eliminate aggregate bias.
  4. Quantile uncertainty bands (p10, p50, p90).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from catboost import CatBoostRegressor
import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from src.training.baselines import ClvSegmentMeanBaseline, clv_carryover_scores
from src.training.datasets import SplitFrame
from src.training.metrics import (
    bootstrap_ci_regression,
    clv_composite_score,
    clv_metrics,
)
from src.training.preprocessing import PreprocessorConfig, transform_features

logger = logging.getLogger(__name__)

RANDOM_SEED = 42
CLV_CHAMPION = "twopart_quantile"
TWOPART_QUANTILES = [0.10, 0.50, 0.90]


@dataclass
class TwoPartQuantileBundle:
    """Data-grounded Hurdle CLV: retention × value-if-pay (log-space CatBoost)."""

    classifier: lgb.LGBMClassifier
    q_models: dict[float, lgb.LGBMRegressor]
    params: dict[str, Any]
    amt_reg: Any = None
    portfolio_multiplier: float = 1.0

    def p_pay(self, x: pd.DataFrame) -> np.ndarray:
        return np.clip(self.classifier.predict_proba(x)[:, 1], 0.0, 1.0)

    def value_quantile(self, x: pd.DataFrame, q: float) -> np.ndarray:
        if self.amt_reg is not None and q == 0.50:
            pred_log = np.clip(self.amt_reg.predict(x), 0.0, 16.0)
            return np.expm1(pred_log) * self.portfolio_multiplier
        if q in self.q_models:
            return np.expm1(np.clip(self.q_models[q].predict(x), 0.0, None)) * self.portfolio_multiplier
        if self.amt_reg is not None:
            pred_log = np.clip(self.amt_reg.predict(x), 0.0, 16.0)
            base = np.expm1(pred_log) * self.portfolio_multiplier
            if q == 0.10:
                return base * 0.5
            if q == 0.90:
                return base * 1.8
            return base
        return np.zeros(len(x))

    def predict(self, x: pd.DataFrame) -> np.ndarray:
        """Expected value = p_pay × median value-if-pay."""
        return self.p_pay(x) * self.value_quantile(x, 0.50)


@dataclass
class BgNbdBundle:
    """Lightweight RFM summary predictor for p_alive health cuts."""

    def predict_frame(self, rfm: pd.DataFrame) -> pd.DataFrame:
        out = rfm[["acc_id"]].copy()
        # Data-grounded health proxy from activity recency vs age
        recency = pd.to_numeric(rfm.get("recency", 0), errors="coerce").fillna(0.0)
        tenure = pd.to_numeric(rfm.get("T", 1), errors="coerce").fillna(1.0).clip(lower=1.0)
        out["p_alive"] = np.clip(1.0 - (tenure - recency) / tenure, 0.05, 0.99)
        out["predicted_clv"] = 0.0
        return out


@dataclass
class ClvTrainResult:
    bgnbd: BgNbdBundle
    twopart_bundle: TwoPartQuantileBundle
    validation_composite: float
    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]
    baseline_metrics: dict[str, dict[str, dict[str, float]]]
    preprocessor: PreprocessorConfig
    test_ci_json: dict[str, dict[str, float]] = field(default_factory=dict)
    magnitude_slope: float = 1.0
    magnitude_intercept: float = 0.0
    p_alive_thresholds: dict[str, float] = field(default_factory=dict)


def build_rfm_summary(payments: pd.DataFrame, acc_ids: pd.Series, cutoff: pd.Timestamp) -> pd.DataFrame:
    """RFM summary from pre-cutoff payments."""
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
    return rfm


def _fit_twopart_quantile(
    x_train: pd.DataFrame,
    y_train: pd.Series,
    x_val: pd.DataFrame,
    y_val: pd.Series,
) -> tuple[TwoPartQuantileBundle, dict[str, Any]]:
    """Fit retention classifier + log-space CatBoost value model + quantile heads."""
    y_tr = np.asarray(y_train, dtype=float)
    y_va = np.asarray(y_val, dtype=float)

    # 1. LightGBM Classifier on pay / no-pay
    clf = lgb.LGBMClassifier(
        n_estimators=100, learning_rate=0.04, max_depth=5,
        random_state=RANDOM_SEED, n_jobs=-1, verbose=-1
    )
    clf.fit(x_train, (y_tr > 0).astype(int))

    # 2. CatBoost Regressor on log1p(revenue) for positive payers only
    pos_tr = y_tr > 0
    amt_reg = CatBoostRegressor(
        iterations=250, learning_rate=0.04, depth=5,
        random_seed=RANDOM_SEED, verbose=0, thread_count=-1
    )
    if int(pos_tr.sum()) >= 20:
        amt_reg.fit(x_train[pos_tr], np.log1p(y_tr[pos_tr]))
    else:
        amt_reg.fit(x_train, np.log1p(np.maximum(y_tr, 0.0)))

    # 3. Quantile models for uncertainty intervals
    q_models: dict[float, lgb.LGBMRegressor] = {}
    for a in TWOPART_QUANTILES:
        m = lgb.LGBMRegressor(
            objective="quantile", alpha=a, n_estimators=100, learning_rate=0.05,
            max_depth=5, random_state=RANDOM_SEED, n_jobs=-1, verbose=-1
        )
        if int(pos_tr.sum()) >= 20:
            m.fit(x_train[pos_tr], np.log1p(y_tr[pos_tr]))
        else:
            m.fit(x_train, np.log1p(np.maximum(y_tr, 0.0)))
        q_models[a] = m

    # 4. Calibration multiplier on validation set to eliminate bias
    val_probs = np.clip(clf.predict_proba(x_val)[:, 1], 0.0, 1.0)
    val_amt = np.expm1(np.clip(amt_reg.predict(x_val), 0.0, 16.0))
    val_expected = val_probs * val_amt
    actual_val = float(y_va.sum())
    pred_val = float(val_expected.sum())
    portfolio_mult = float(np.clip(actual_val / max(1e-6, pred_val), 0.70, 1.40))

    bundle = TwoPartQuantileBundle(
        classifier=clf,
        q_models=q_models,
        params={"clf": "lgbm", "reg": "catboost_log1p"},
        amt_reg=amt_reg,
        portfolio_multiplier=portfolio_mult,
    )
    metrics = clv_metrics(y_va, bundle.predict(x_val))
    return bundle, metrics


def train_clv(
    dataset: SplitFrame,
    payments: pd.DataFrame,
    cutoff: pd.Timestamp,
    horizon_days: int,
    preprocessor: PreprocessorConfig,
    *,
    progress: Callable[[str], None] | None = None,
) -> ClvTrainResult:
    """Train Clean Two-Part Hurdle CLV model (Colab-matching)."""
    notify = progress or (lambda message: logger.info(message))

    y_train = pd.to_numeric(dataset.labels("train", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_val = pd.to_numeric(dataset.labels("validation", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_test = pd.to_numeric(dataset.labels("test", "future_revenue_6m"), errors="coerce").fillna(0.0)

    notify("clv: fitting Two-Part Hurdle (LightGBM Classifier + CatBoost Log-Scale)")
    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    x_test = transform_features(dataset.features("test"), preprocessor)

    twopart_bundle, validation_metrics = _fit_twopart_quantile(x_train, y_train, x_val, y_val)
    test_metrics = clv_metrics(y_test.to_numpy(), twopart_bundle.predict(x_test))
    test_ci_json = bootstrap_ci_regression(y_test.to_numpy(), twopart_bundle.predict(x_test))

    val_composite = clv_composite_score(
        spearman=validation_metrics.get("spearman", 0.0),
        top_decile_capture=validation_metrics.get("top_decile_capture", 0.0),
        revenue_bias_ratio=validation_metrics.get("revenue_bias_ratio", 0.0),
        range_coverage=validation_metrics.get("range_coverage", 0.8),
        p_pay_roc_auc=validation_metrics.get("p_pay_roc_auc", 0.8),
    )

    notify(
        f"clv: val composite={val_composite:.4f} spearman={validation_metrics.get('spearman'):.4f} "
        f"bias={validation_metrics.get('revenue_bias_ratio'):.4f}"
    )

    segment = ClvSegmentMeanBaseline().fit(dataset.features("train"), y_train)
    baseline_metrics = {
        "segment_mean": {
            "validation": clv_metrics(y_val.to_numpy(), segment.predict(dataset.features("validation"))),
            "test": clv_metrics(y_test.to_numpy(), segment.predict(dataset.features("test"))),
        },
        "revenue_180d_carryover": {
            "validation": clv_metrics(y_val.to_numpy(), clv_carryover_scores(dataset.features("validation"))),
            "test": clv_metrics(y_test.to_numpy(), clv_carryover_scores(dataset.features("test"))),
        },
    }

    bgnbd = BgNbdBundle()
    p_alive_thresholds = {"p_alive_at_risk": 0.20, "p_alive_watch": 0.50}

    return ClvTrainResult(
        bgnbd=bgnbd,
        twopart_bundle=twopart_bundle,
        validation_composite=val_composite,
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        baseline_metrics=baseline_metrics,
        preprocessor=preprocessor,
        test_ci_json=test_ci_json,
        magnitude_slope=1.0,
        magnitude_intercept=0.0,
        p_alive_thresholds=p_alive_thresholds,
    )


def backtest_clv(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    """Evaluate clean CLV model on backtest cutoff."""
    y_tr = pd.to_numeric(dataset.labels("train", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_va = pd.to_numeric(dataset.labels("validation", "future_revenue_6m"), errors="coerce").fillna(0.0)
    y_te = pd.to_numeric(dataset.labels("test", "future_revenue_6m"), errors="coerce").fillna(0.0)

    x_tr = transform_features(dataset.features("train"), preprocessor)
    x_va = transform_features(dataset.features("validation"), preprocessor)
    x_te = transform_features(dataset.features("test"), preprocessor)

    bundle, _ = _fit_twopart_quantile(x_tr, y_tr, x_va, y_va)
    champion_metrics = clv_metrics(y_te.to_numpy(), bundle.predict(x_te))

    segment = ClvSegmentMeanBaseline().fit(dataset.features("train"), y_tr)
    baseline_metrics = {
        "segment_mean": clv_metrics(y_te.to_numpy(), segment.predict(dataset.features("test"))),
        "revenue_180d_carryover": clv_metrics(y_te.to_numpy(), clv_carryover_scores(dataset.features("test"))),
    }
    return champion_metrics, baseline_metrics
