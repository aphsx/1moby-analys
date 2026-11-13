"""Dataset builders: join features + labels and produce temporal grouped splits.

TRAINING-PIPELINE §6 — within one cutoff, split by customer (each acc_id
appears exactly once per cutoff so a stratified row split is a group split),
60/20/20 train/validation/test, stratified on the label. Splits across
cutoffs (backtest) are produced by rebuilding the whole dataset at an older
cutoff — never by re-splitting the same rows.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from src.constants import RANDOM_SEED
from src.training.features import (
    MINIMUM_TIER_A_FEATURES,
    FeatureBuildResult,
    build_all_features,
    feature_names_for_model,
)
from src.training.labels import LabelConfig, build_label_set

logger = logging.getLogger(__name__)


# Split: train / validation / test = 60 / 20 / 20.
# First carve off the holdout (val+test), then halve it into val and test.
HOLDOUT_FRACTION = 0.40
TEST_WITHIN_HOLDOUT = 0.50

SPLIT_TRAIN = "train"
SPLIT_VALIDATION = "validation"
SPLIT_TEST = "test"


@dataclass(frozen=True)
class SplitFrame:
    """One model's dataset with assigned splits.

    `frame` columns: acc_id, the Tier A features (raw, pre-preprocessing),
    label columns, and `split` ∈ {train, validation, test}.
    """

    model_type: str
    frame: pd.DataFrame
    label_columns: list[str]
    feature_names: list[str] = field(default_factory=lambda: list(MINIMUM_TIER_A_FEATURES))

    def split(self, name: str) -> pd.DataFrame:
        return self.frame[self.frame["split"] == name].reset_index(drop=True)

    def features(self, name: str) -> pd.DataFrame:
        return self.split(name)[self.feature_names]

    def labels(self, name: str, column: str | None = None) -> pd.Series:
        return self.split(name)[column or self.label_columns[0]]


@dataclass(frozen=True)
class CutoffDatasets:
    cutoff_date: pd.Timestamp
    horizon_days: int
    feature_result: FeatureBuildResult
    churn: SplitFrame
    clv: SplitFrame
    credit: SplitFrame


def build_cutoff_datasets(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff_date: pd.Timestamp,
    horizon_days: int = 180,
    seed: int = RANDOM_SEED,
    active_window_days: int = 180,
) -> CutoffDatasets:
    """Build features + labels + splits for one cutoff (TRAINING §2 steps 4–7).

    ``active_window_days`` defines eligibility (who counts as "active" at the
    cutoff, and thus enters churn/CLV training). It is an explicit parameter
    rather than a buried LabelConfig default so it is visible and tunable in one
    place — but it is a GLOBAL knob, not per-run, because eligibility must mean
    the same thing across runs for value tiers / segments to be comparable.
    """

    cutoff = pd.Timestamp(cutoff_date)
    feature_result = build_all_features(customers, payments, usage, cutoff)
    label_config = LabelConfig(
        cutoff_date=cutoff, horizon_days=horizon_days, active_window_days=active_window_days
    )
    labels = build_label_set(customers, payments, usage, label_config)

    churn = _build_churn_frame(feature_result, labels["churn"], seed)
    clv = _build_clv_frame(feature_result, labels["clv"], seed)
    credit = _build_credit_frame(
        feature_result,
        labels["credit_usage"],
        labels["topup_timing"],
        seed,
    )

    return CutoffDatasets(
        cutoff_date=cutoff,
        horizon_days=horizon_days,
        feature_result=feature_result,
        churn=churn,
        clv=clv,
        credit=credit,
    )


def _build_churn_frame(
    feature_result: FeatureBuildResult,
    churn_labels: pd.DataFrame,
    seed: int,
) -> SplitFrame:
    frame = feature_result.feature_df.merge(churn_labels, on="acc_id", how="inner")
    frame = frame[frame["eligible_for_churn"]].reset_index(drop=True)
    frame = _assign_split(frame, stratify=frame["churn_label"], seed=seed)
    return SplitFrame(
        model_type="churn",
        frame=frame,
        label_columns=["churn_label"],
        feature_names=feature_names_for_model("churn"),
    )


def _build_clv_frame(
    feature_result: FeatureBuildResult,
    clv_labels: pd.DataFrame,
    seed: int,
) -> SplitFrame:
    frame = feature_result.feature_df.merge(clv_labels, on="acc_id", how="inner")
    frame = frame[frame["eligible_for_clv"]].reset_index(drop=True)
    frame = _assign_split(frame, stratify=frame["future_purchase_flag"].astype(int), seed=seed)
    return SplitFrame(
        model_type="clv",
        frame=frame,
        label_columns=["future_revenue_6m", "future_purchase_flag"],
        feature_names=feature_names_for_model("clv"),
    )


def _build_credit_frame(
    feature_result: FeatureBuildResult,
    credit_labels: pd.DataFrame,
    topup_labels: pd.DataFrame,
    seed: int,
) -> SplitFrame:
    eligibility = feature_result.eligibility_df
    eligible_ids = set(
        eligibility.loc[eligibility["eligible_for_credit"], "acc_id"].astype(int)
    )
    frame = feature_result.feature_df.merge(credit_labels, on="acc_id", how="inner")
    frame = frame.merge(topup_labels, on="acc_id", how="left")
    frame = frame[frame["acc_id"].astype(int).isin(eligible_ids)].reset_index(drop=True)
    frame = _assign_split(
        frame,
        stratify=(frame["future_credit_usage_30d"] > 0).astype(int),
        seed=seed,
    )
    return SplitFrame(
        model_type="credit",
        frame=frame,
        label_columns=[
            "future_credit_usage_30d",
            "future_credit_usage_90d",
            "days_until_next_topup",
            "topup_observed",
        ],
        feature_names=feature_names_for_model("credit"),
    )


def _assign_split(frame: pd.DataFrame, stratify: pd.Series, seed: int) -> pd.DataFrame:
    """60/20/20 stratified split by customer row (one row per acc_id)."""

    frame = frame.copy()
    if len(frame) < 25:
        # Degenerate dataset — Gate 4 should have failed before this point.
        frame["split"] = SPLIT_TRAIN
        return frame

    indices = np.arange(len(frame))
    stratify_values = np.asarray(stratify)
    train_idx, rest_idx = train_test_split(
        indices,
        test_size=HOLDOUT_FRACTION,
        random_state=seed,
        stratify=stratify_values,
    )
    validation_idx, test_idx = train_test_split(
        rest_idx,
        test_size=TEST_WITHIN_HOLDOUT,
        random_state=seed,
        stratify=stratify_values[rest_idx],
    )
    split = pd.Series(SPLIT_TRAIN, index=frame.index)
    split.iloc[validation_idx] = SPLIT_VALIDATION
    split.iloc[test_idx] = SPLIT_TEST
    frame["split"] = split.values
    return frame


def pool_train_rows(primary: SplitFrame, older: list[SplitFrame]) -> SplitFrame:
    """Pool older-cutoff rows into the primary train split (multi-cutoff training).

    Validation/test stay exclusively at the primary (latest) cutoff so holdout
    metrics keep their meaning. Older-cutoff rows are added as extra train rows
    only for acc_ids that are NOT held out in the primary validation/test
    splits — split contamination by acc_id therefore stays impossible, and
    `check_split_contamination` still passes on the pooled frame.
    """

    held_out = set(primary.split(SPLIT_VALIDATION)["acc_id"].astype(int)) | set(
        primary.split(SPLIT_TEST)["acc_id"].astype(int)
    )
    frames = [primary.frame]
    for older_set in older:
        extra = older_set.frame[
            ~older_set.frame["acc_id"].astype(int).isin(held_out)
        ].copy()
        extra["split"] = SPLIT_TRAIN
        frames.append(extra)
    pooled = pd.concat(frames, ignore_index=True)
    return SplitFrame(
        model_type=primary.model_type,
        frame=pooled,
        label_columns=list(primary.label_columns),
        feature_names=list(primary.feature_names),
    )


def check_split_contamination(split_frame: SplitFrame) -> dict[str, object]:
    """Leakage test: acc_id sets must be disjoint across splits (§5.2)."""

    ids = {
        name: set(split_frame.split(name)["acc_id"].astype(int))
        for name in (SPLIT_TRAIN, SPLIT_VALIDATION, SPLIT_TEST)
    }
    overlaps = {
        "train∩validation": len(ids[SPLIT_TRAIN] & ids[SPLIT_VALIDATION]),
        "train∩test": len(ids[SPLIT_TRAIN] & ids[SPLIT_TEST]),
        "validation∩test": len(ids[SPLIT_VALIDATION] & ids[SPLIT_TEST]),
    }
    return {
        "passed": all(count == 0 for count in overlaps.values()),
        "overlaps": overlaps,
        "sizes": {name: len(values) for name, values in ids.items()},
    }


def month_start(date: pd.Timestamp) -> pd.Timestamp:
    """Snap a date down to the first day of its month.

    Usage data has monthly granularity — a cutoff that is not month-aligned
    makes the 30d credit label window miss usage periods inconsistently and
    produces bogus zero labels, so every cutoff in the system is month-aligned.
    """

    return pd.Timestamp(date).to_period("M").to_timestamp()


def backtest_cutoffs(
    latest_cutoff: pd.Timestamp,
    step_months: int = 2,
    n_backtests: int = 2,
) -> list[pd.Timestamp]:
    """Older cutoffs C2, C3, … for multi-cutoff backtesting (§3).

    Steps are calendar months (not days) — see `month_start`.
    """

    latest = pd.Timestamp(latest_cutoff)
    return [
        (latest.to_period("M") - step_months * i).to_timestamp()
        for i in range(1, n_backtests + 1)
    ]


def adaptive_backtest_cutoffs(
    latest_cutoff: pd.Timestamp,
    min_activity: pd.Timestamp,
    max_activity: pd.Timestamp,
    label_window_days: int,
    step_months: int = 2,
    max_backtests: int = 6,
    min_history_days: int = 365,
) -> list[pd.Timestamp]:
    """Backtest cutoffs scaled to the uploaded data span (§3).

    Instead of a fixed count, walk back `step_months` at a time and keep every
    cutoff that still has `min_history_days` of history before it and a full
    `label_window_days` of data after it — a 2-year upload yields more
    backtests than a 1-year upload, capped at `max_backtests` for runtime.
    """

    candidates = backtest_cutoffs(latest_cutoff, step_months, max_backtests)
    return [
        cutoff
        for cutoff in candidates
        if (cutoff - pd.Timestamp(min_activity)).days >= min_history_days
        and cutoff + pd.Timedelta(days=label_window_days) <= pd.Timestamp(max_activity)
    ]


# ── The datasets one Training Run trains and backtests on ─────────

BACKTEST_STEP_MONTHS = 2
# Backtest count adapts to the uploaded data span (§3): every step-month
# cutoff with ≥MIN_BACKTEST_HISTORY_DAYS of history and a full label window
# is used, capped at MAX_BACKTESTS for runtime.
MAX_BACKTESTS = 6
MIN_BACKTEST_HISTORY_DAYS = 365
# Credit labels need only 30/90d of post-cutoff data, so credit trains at its
# own fresher month-aligned cutoff instead of wasting the newest months on the
# churn/CLV 180d horizon.
CREDIT_LABEL_WINDOW_DAYS = 90


def activity_range(payments: pd.DataFrame, usage: pd.DataFrame) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Min/max activity dates (payments + positive usage), matching the label
    definition of activity in labels.py."""

    dates = pd.concat(
        [
            payments.loc[payments["payment_date"].notna(), "payment_date"],
            usage.loc[(usage["usage"] > 0) & usage["period"].notna(), "period"],
        ],
        ignore_index=True,
    )
    if dates.empty:
        raise RuntimeError("No payment or usage activity found for this source")
    return pd.Timestamp(dates.min()), pd.Timestamp(dates.max())


@dataclass
class TrainingDatasets:
    """Churn/CLV datasets at the run's cutoff plus their backtests, and credit's own set."""

    primary: CutoffDatasets
    backtests: list[CutoffDatasets]
    credit: CutoffDatasets
    credit_backtests: list[CutoffDatasets]
    credit_cutoff: pd.Timestamp
    activity_min: pd.Timestamp
    activity_max: pd.Timestamp


def build_training_datasets(
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    usage: pd.DataFrame,
    cutoff: pd.Timestamp,
    horizon_days: int,
    progress: Callable[[str, int], None],
) -> TrainingDatasets:
    """Datasets at the cutoff (C1), at every feasible older cutoff (backtests), and at
    credit's fresher cutoff when the data allows one. An infeasible older cutoff shrinks
    the backtest instead of failing the run."""

    activity_min, activity_max = activity_range(payments, usage)
    datasets_c1 = build_cutoff_datasets(customers, payments, usage, cutoff, horizon_days)
    logger.info(
        f"C1={cutoff.date()} churn n={len(datasets_c1.churn.frame)} "
        f"clv n={len(datasets_c1.clv.frame)} credit n={len(datasets_c1.credit.frame)}"
    )

    progress("backtest datasets", 12)
    backtest_dates = adaptive_backtest_cutoffs(
        cutoff,
        activity_min,
        activity_max,
        label_window_days=horizon_days,
        step_months=BACKTEST_STEP_MONTHS,
        max_backtests=MAX_BACKTESTS,
        min_history_days=MIN_BACKTEST_HISTORY_DAYS,
    )
    if not backtest_dates:
        logger.warning(
            "data span supports no backtest cutoffs — model stability "
            "across time is unverified for this run."
        )
    backtest_sets: list[CutoffDatasets] = []
    for old_cutoff in backtest_dates:
        try:
            backtest_sets.append(
                build_cutoff_datasets(customers, payments, usage, old_cutoff, horizon_days)
            )
        except Exception as exc:  # noqa: BLE001 - an infeasible old cutoff shrinks the backtest.
            logger.warning(f"backtest cutoff {old_cutoff.date()} skipped: {exc}")

    # ── Credit datasets at credit's own fresher cutoff ────────────
    credit_cutoff = month_start(activity_max - pd.Timedelta(days=CREDIT_LABEL_WINDOW_DAYS))
    datasets_credit = datasets_c1
    credit_backtest_sets = backtest_sets
    if credit_cutoff > cutoff:
        try:
            datasets_credit = build_cutoff_datasets(
                customers, payments, usage, credit_cutoff, horizon_days
            )
            credit_backtest_sets = []
            for old_cutoff in adaptive_backtest_cutoffs(
                credit_cutoff,
                activity_min,
                activity_max,
                label_window_days=CREDIT_LABEL_WINDOW_DAYS,
                step_months=BACKTEST_STEP_MONTHS,
                max_backtests=MAX_BACKTESTS,
                min_history_days=MIN_BACKTEST_HISTORY_DAYS,
            ):
                try:
                    credit_backtest_sets.append(
                        build_cutoff_datasets(customers, payments, usage, old_cutoff, horizon_days)
                    )
                except Exception as exc:  # noqa: BLE001 - infeasible old cutoff shrinks the backtest.
                    logger.warning(f"credit backtest cutoff {old_cutoff.date()} skipped: {exc}")
            logger.info(f"credit C1={credit_cutoff.date()} n={len(datasets_credit.credit.frame)}")
        except Exception as exc:  # noqa: BLE001 - fall back to the shared cutoff.
            logger.warning(f"credit cutoff {credit_cutoff.date()} infeasible ({exc}); using shared C1")
            datasets_credit = datasets_c1
            credit_backtest_sets = backtest_sets
            credit_cutoff = cutoff
    else:
        credit_cutoff = cutoff

    return TrainingDatasets(
        primary=datasets_c1,
        backtests=backtest_sets,
        credit=datasets_credit,
        credit_backtests=credit_backtest_sets,
        credit_cutoff=credit_cutoff,
        activity_min=activity_min,
        activity_max=activity_max,
    )
