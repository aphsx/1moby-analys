"""Clean Credit Usage Forecast Trainer — LightGBM Quantile Regression + Depletion Runway.

Rebuilt cleanly to mirror notebooks/03_credit_forecast.ipynb:
  1. LightGBM Quantile models (p10, p50, p90) trained in log-space on future usage.
  2. Monotonic constraint (p10 <= p50 <= p90) to prevent quantile crossing.
  3. 20% Blend of median p50 with 30-day carryover anchor.
  4. Depletion Runway & Urgent Alert (days_left <= 14 days).
All legacy Optuna multi-trial searches, XGBoost AFT grids, and CQR margin loops are pruned.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import f1_score, mean_absolute_error, precision_score, recall_score

from src.training.baselines import (
    credit_last_30d_carryover,
    credit_moving_avg_90d,
    credit_runway_depletion,
)
from src.training.datasets import SplitFrame
from src.training.labels import CREDIT_HORIZONS
from src.training.metrics import bootstrap_ci_credit, credit_metrics, pinball_loss
from src.training.preprocessing import PreprocessorConfig, transform_features

logger = logging.getLogger(__name__)

RANDOM_SEED = 42
QUANTILES = [0.10, 0.50, 0.90]
HORIZONS = CREDIT_HORIZONS  # {30: "future_usage_30d", 90: "future_usage_90d"}
URGENT_TOPUP_DAYS = 14


def credit_anchor_log(features_raw: pd.DataFrame, horizon_days: int) -> np.ndarray:
    """log1p of the carryover baseline forecast (anchor_30d for 30d, usage_recent_90d for 90d)."""
    if horizon_days == 30 and "anchor_30d" in features_raw.columns:
        raw_anchor = pd.to_numeric(features_raw["anchor_30d"], errors="coerce").fillna(0.0).to_numpy()
    elif horizon_days == 90 and "usage_recent_90d" in features_raw.columns:
        raw_anchor = pd.to_numeric(features_raw["usage_recent_90d"], errors="coerce").fillna(0.0).to_numpy()
    else:
        raw_anchor = credit_last_30d_carryover(features_raw, horizon_days)
    return np.log1p(np.clip(raw_anchor, 0.0, None))


MIN_ACTIVE_USAGE_30D = 10.0


@dataclass
class CreditHorizonModels:
    """Quantile models per horizon (p10, p50, p90)."""

    horizon_days: int
    params: dict[str, Any]
    models: dict[float, lgb.LGBMRegressor]
    cqr_q_hat: float = 0.0
    model_family: str = "lgbm"
    correction_shrinkage: float = 1.0

    def predict_quantiles(
        self,
        x: pd.DataFrame,
        anchor_log: np.ndarray,
    ) -> dict[float, np.ndarray]:
        preds: dict[float, np.ndarray] = {}
        for q in [0.10, 0.50, 0.90]:
            if q in self.models:
                pred_log = self.models[q].predict(x)
                preds[q] = np.expm1(np.maximum(pred_log, 0.0))
            else:
                preds[q] = np.zeros(len(x))

        # Monotonic constraint: p10 <= p50 <= p90
        preds[0.50] = np.maximum(preds[0.50], preds[0.10])
        preds[0.90] = np.maximum(preds[0.90], preds[0.50])

        # 60:40 Blend with carryover anchor for p50 + micro-noise gating (< 10 SMS/30d)
        anchor_val = np.expm1(anchor_log)
        min_active = MIN_ACTIVE_USAGE_30D * (self.horizon_days / 30.0)
        blended_p50 = 0.60 * preds[0.50] + 0.40 * anchor_val
        preds[0.50] = np.where(blended_p50 >= min_active, blended_p50, 0.0)
        preds[0.10] = np.minimum(preds[0.10], preds[0.50])
        preds[0.90] = np.maximum(preds[0.90], preds[0.50])

        # Fill p25 and p75 if requested by legacy callers
        preds[0.25] = 0.5 * (preds[0.10] + preds[0.50])
        preds[0.75] = 0.5 * (preds[0.50] + preds[0.90])
        return preds


def calculate_runway(
    balances: np.ndarray,
    predicted_usage_30d: np.ndarray,
    max_days: float = 999.0,
) -> np.ndarray:
    """Calculate Days Until Depletion = Current Balance / Predicted Daily Burn (Colab 03).

    Treats micro-noise usage (< 10 SMS per 30 days, i.e. < 0.33 SMS/day) as zero burn
    so inactive zero-balance accounts are not falsely flagged as Urgent Top-up.
    """
    usage_30d = np.asarray(predicted_usage_30d, dtype=float)
    clean_usage = np.where(usage_30d >= MIN_ACTIVE_USAGE_30D, usage_30d, 0.0)
    daily_burn = clean_usage / 30.0
    bal = np.maximum(np.asarray(balances, dtype=float), 0.0)
    with np.errstate(divide="ignore", invalid="ignore"):
        days_left = np.where(daily_burn > 0, np.ceil(bal / daily_burn), max_days)
    return np.clip(days_left, 0.0, max_days)


@dataclass
class TopupDepletionModel:
    """Data-grounded depletion runway model: balance / daily burn (Colab 03)."""

    censor_days: float = 999.0
    algorithm: str = "runway_depletion"
    distribution: str = "deterministic"
    scale: float = 1.0
    day_scale: float = 1.0
    urgent_day_threshold_raw: float = 14.0

    def predict_days(
        self,
        x: pd.DataFrame,
        predicted_usage_30d: np.ndarray | None = None,
    ) -> np.ndarray:
        balance = pd.to_numeric(x.get("current_sms_balance", 0.0), errors="coerce").fillna(0.0).to_numpy()
        if predicted_usage_30d is not None:
            usage_30d = np.asarray(predicted_usage_30d, dtype=float)
        else:
            usage_30d = pd.to_numeric(x.get("anchor_30d", 0.0), errors="coerce").fillna(0.0).to_numpy()
        return calculate_runway(balance, usage_30d, max_days=self.censor_days)


def _urgent_topup_metrics(
    balances: np.ndarray,
    pred_usage_30d: np.ndarray,
    actual_usage_30d: np.ndarray,
) -> dict[str, float]:
    """Urgent top-up alert metrics (days_left <= 14) matching Colab 03 Cell 13."""
    pred_days = calculate_runway(balances, pred_usage_30d)
    actual_days = calculate_runway(balances, actual_usage_30d)
    pred_urgent = (pred_days <= URGENT_TOPUP_DAYS).astype(int)
    actual_urgent = (actual_days <= URGENT_TOPUP_DAYS).astype(int)
    prec = round(float(precision_score(actual_urgent, pred_urgent, zero_division=0)), 4)
    rec = round(float(recall_score(actual_urgent, pred_urgent, zero_division=0)), 4)
    f1 = round(float(f1_score(actual_urgent, pred_urgent, zero_division=0)), 4)
    return {
        "urgent_topup_precision": prec,
        "urgent_topup_recall": rec,
        "urgent_topup_f1": f1,
        "urgent_precision": prec,
        "urgent_recall": rec,
    }


@dataclass
class CreditTrainResult:
    horizons: dict[int, CreditHorizonModels]
    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]
    baseline_metrics: dict[str, dict[str, dict[str, float]]]
    preprocessor: PreprocessorConfig
    params_by_horizon: dict[int, dict[str, Any]] = field(default_factory=dict)
    topup_model: TopupDepletionModel | None = None
    test_ci_json: dict[str, dict[str, float]] = field(default_factory=dict)


def _train_horizon_quantiles(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    horizon_days: int,
) -> CreditHorizonModels:
    """Fit LightGBM quantile regression models on log1p(y_train)."""
    models: dict[float, lgb.LGBMRegressor] = {}
    params = {
        "n_estimators": 100,
        "learning_rate": 0.05,
        "max_depth": 5,
        "random_state": RANDOM_SEED,
        "verbose": -1,
        "n_jobs": -1,
    }
    for q in [0.10, 0.50, 0.90]:
        m = lgb.LGBMRegressor(objective="quantile", alpha=q, **params)
        m.fit(x_train, np.log1p(np.maximum(y_train, 0.0)))
        models[q] = m

    return CreditHorizonModels(
        horizon_days=horizon_days,
        params=params,
        models=models,
        cqr_q_hat=0.0,
        model_family="lgbm",
    )


def train_credit(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    *,
    topup_censor_days: float = 180.0,
    progress: Callable[[str], None] | None = None,
    **kwargs,
) -> CreditTrainResult:
    """Train clean LightGBM quantile models per horizon (Colab-matching)."""
    notify = progress or (lambda message: logger.info(message))

    x = {
        split: transform_features(dataset.features(split), preprocessor)
        for split in ("train", "validation", "test")
    }
    y = {
        horizon: {
            split: pd.to_numeric(dataset.labels(split, column), errors="coerce").fillna(0.0).to_numpy()
            for split in ("train", "validation", "test")
        }
        for horizon, column in HORIZONS.items()
    }
    anchors = {
        horizon: {
            split: credit_anchor_log(dataset.features(split), horizon)
            for split in ("train", "validation", "test")
        }
        for horizon in HORIZONS
    }

    horizons: dict[int, CreditHorizonModels] = {}
    for horizon_days in HORIZONS:
        notify(f"credit: training clean LightGBM quantile models for {horizon_days}d horizon (p10, p50, p90)")
        horizons[horizon_days] = _train_horizon_quantiles(
            x["train"], y[horizon_days]["train"], horizon_days=horizon_days
        )

    predictions = {
        split: {
            horizon: horizons[horizon].predict_quantiles(x[split], anchors[horizon][split])
            for horizon in HORIZONS
        }
        for split in ("validation", "test")
    }

    # Cross-horizon monotonicity: 90d usage >= 30d usage
    for split in ("validation", "test"):
        for q in [0.10, 0.50, 0.90]:
            predictions[split][90][q] = np.maximum(
                predictions[split][90][q], predictions[split][30][q]
            )

    validation_metrics = credit_metrics(
        y[30]["validation"], predictions["validation"][30],
        y[90]["validation"], predictions["validation"][90],
    )
    val_bal = pd.to_numeric(dataset.features("validation").get("current_sms_balance", 0.0), errors="coerce").fillna(0.0).to_numpy()
    validation_metrics.update(
        _urgent_topup_metrics(val_bal, predictions["validation"][30][0.50], y[30]["validation"])
    )

    test_metrics = credit_metrics(
        y[30]["test"], predictions["test"][30],
        y[90]["test"], predictions["test"][90],
    )
    test_bal = pd.to_numeric(dataset.features("test").get("current_sms_balance", 0.0), errors="coerce").fillna(0.0).to_numpy()
    test_metrics.update(
        _urgent_topup_metrics(test_bal, predictions["test"][30][0.50], y[30]["test"])
    )

    notify(
        f"credit: val cov_p10_p90_30d={validation_metrics.get('coverage_p10_p90_30d'):.4f} "
        f"mae_30d={validation_metrics.get('mae_30d'):.1f} "
        f"test cov={test_metrics.get('coverage_p10_p90_30d'):.4f}"
    )

    baseline_metrics = {
        "moving_avg_90d": {
            "validation": {
                "mae_30d": float(mean_absolute_error(y[30]["validation"], credit_moving_avg_90d(dataset.features("validation"), 30))),
                "mae_90d": float(mean_absolute_error(y[90]["validation"], credit_moving_avg_90d(dataset.features("validation"), 90))),
            },
            "test": {
                "mae_30d": float(mean_absolute_error(y[30]["test"], credit_moving_avg_90d(dataset.features("test"), 30))),
                "mae_90d": float(mean_absolute_error(y[90]["test"], credit_moving_avg_90d(dataset.features("test"), 90))),
            },
        },
        "last_30d_carryover": {
            "validation": {
                "mae_30d": float(mean_absolute_error(y[30]["validation"], credit_last_30d_carryover(dataset.features("validation"), 30))),
                "mae_90d": float(mean_absolute_error(y[90]["validation"], credit_last_30d_carryover(dataset.features("validation"), 90))),
            },
            "test": {
                "mae_30d": float(mean_absolute_error(y[30]["test"], credit_last_30d_carryover(dataset.features("test"), 30))),
                "mae_90d": float(mean_absolute_error(y[90]["test"], credit_last_30d_carryover(dataset.features("test"), 90))),
            },
        },
    }

    topup_model = TopupDepletionModel(censor_days=topup_censor_days)

    return CreditTrainResult(
        horizons=horizons,
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        baseline_metrics=baseline_metrics,
        preprocessor=preprocessor,
        params_by_horizon={h: horizons[h].params for h in HORIZONS},
        topup_model=topup_model,
        test_ci_json={},
    )


def backtest_credit(
    result: CreditTrainResult,
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    """Evaluate clean credit models on backtest cutoff."""
    x_test = transform_features(dataset.features("test"), preprocessor)
    y_30 = pd.to_numeric(dataset.labels("test", "future_usage_30d"), errors="coerce").fillna(0.0).to_numpy()
    y_90 = pd.to_numeric(dataset.labels("test", "future_usage_90d"), errors="coerce").fillna(0.0).to_numpy()
    anchor_30 = credit_anchor_log(dataset.features("test"), 30)
    anchor_90 = credit_anchor_log(dataset.features("test"), 90)

    q30 = result.horizons[30].predict_quantiles(x_test, anchor_30)
    q90 = result.horizons[90].predict_quantiles(x_test, anchor_90)
    for q in [0.10, 0.50, 0.90]:
        q90[q] = np.maximum(q90[q], q30[q])

    champion_metrics = credit_metrics(y_30, q30, y_90, q90)
    test_bal = pd.to_numeric(dataset.features("test").get("current_sms_balance", 0.0), errors="coerce").fillna(0.0).to_numpy()
    champion_metrics.update(_urgent_topup_metrics(test_bal, q30[0.50], y_30))
    baseline_metrics = {
        "moving_avg_90d": {
            "mae_30d": float(mean_absolute_error(y_30, credit_moving_avg_90d(dataset.features("test"), 30))),
            "mae_90d": float(mean_absolute_error(y_90, credit_moving_avg_90d(dataset.features("test"), 90))),
        },
        "last_30d_carryover": {
            "mae_30d": float(mean_absolute_error(y_30, credit_last_30d_carryover(dataset.features("test"), 30))),
            "mae_90d": float(mean_absolute_error(y_90, credit_last_30d_carryover(dataset.features("test"), 90))),
        },
    }
    return champion_metrics, baseline_metrics
