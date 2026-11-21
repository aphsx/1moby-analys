"""Baseline scorers (TRAINING-PIPELINE §12).

Every baseline is evaluated with the exact same harness as the candidates and
persisted to `ml_model_evaluations` with `baseline_name`. A candidate that
cannot beat these on the primary metric is never promoted.
"""

from __future__ import annotations

import numpy as np
import pandas as pd



# ── Churn baselines (score = churn-likelihood ranking) ───────────


# ── CLV baselines ────────────────────────────────────────────────


class ClvSegmentMeanBaseline:
    """Predict the mean future revenue of the customer's past-revenue quartile.

    Segment statistics are learned on the train split only.
    """

    def __init__(self) -> None:
        self.bin_edges: np.ndarray | None = None
        self.segment_means: dict[int, float] = {}
        self.global_mean = 0.0

    def fit(self, features_train: pd.DataFrame, y_train: pd.Series) -> "ClvSegmentMeanBaseline":
        past = pd.to_numeric(features_train["total_revenue_180d"], errors="coerce").fillna(0.0)
        y = pd.to_numeric(y_train, errors="coerce").fillna(0.0)
        positive_edges = np.unique(np.quantile(past[past > 0], [0.25, 0.5, 0.75])) if (past > 0).any() else np.array([])
        self.bin_edges = positive_edges
        segments = self._segment(past)
        means = y.groupby(segments).mean()
        self.segment_means = {int(seg): float(mean) for seg, mean in means.items()}
        self.global_mean = float(y.mean())
        return self

    def predict(self, features: pd.DataFrame) -> np.ndarray:
        past = pd.to_numeric(features["total_revenue_180d"], errors="coerce").fillna(0.0)
        segments = self._segment(past)
        return segments.map(lambda seg: self.segment_means.get(int(seg), self.global_mean)).to_numpy()

    def _segment(self, past: pd.Series) -> pd.Series:
        if self.bin_edges is None or len(self.bin_edges) == 0:
            return pd.Series(np.zeros(len(past), dtype=int), index=past.index)
        segments = np.digitize(past, self.bin_edges) + 1
        segments[past <= 0] = 0
        return pd.Series(segments, index=past.index)


def clv_carryover_scores(features: pd.DataFrame) -> np.ndarray:
    """Assume the next 180 days repeat the last 180 days of revenue."""

    return pd.to_numeric(features["total_revenue_180d"], errors="coerce").fillna(0.0).to_numpy()


# ── Credit baselines (point forecast of future usage) ───────────


def credit_last_30d_carryover(features: pd.DataFrame, horizon_days: int) -> np.ndarray:
    """Use last-30d usage (anchor_30d / usage_recent_30d) scaled to the horizon."""

    if "anchor_30d" in features.columns:
        monthly = pd.to_numeric(features["anchor_30d"], errors="coerce").fillna(0.0)
    elif "usage_recent_30d" in features.columns:
        monthly = pd.to_numeric(features["usage_recent_30d"], errors="coerce").fillna(0.0)
    else:
        monthly = pd.to_numeric(features["usage_recent_90d"], errors="coerce").fillna(0.0) / 3.0
    return (monthly * (horizon_days / 30.0)).to_numpy()


def credit_moving_avg_90d(features: pd.DataFrame, horizon_days: int) -> np.ndarray:
    """Average monthly usage over the last 180 days, scaled to the horizon."""

    monthly = pd.to_numeric(features["usage_total_180d"], errors="coerce").fillna(0.0) / 6.0
    return (monthly * (horizon_days / 30.0)).to_numpy()


