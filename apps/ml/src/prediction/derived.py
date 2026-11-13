"""Fields derived from the scores and the raw data: descriptive customer fields, revenue at risk,
value tier, credit urgency, priority score, needs_review, and Segments.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from src.constants import (
    DerivedThresholds,
    LifecycleStage,
    RiskLevel,
    Segment,
    SubStage,
    UrgencyLevel,
    ValueTier,
)
from src.prediction.persistence import date_or_none, float_or_zero, int_or_none, str_or_none
from src.prediction.scoring import TOPUP_CAP_DAYS


def load_p_alive_cuts(clv_thresholds: dict[str, float] | None) -> tuple[float, float]:
    """(at_risk_cut, watch_cut) from the CLV artifact, else fixed fallbacks."""

    thr = clv_thresholds or {}
    at_risk = float(thr.get("p_alive_at_risk", DerivedThresholds.P_ALIVE_ATRISK_FALLBACK))
    watch = float(thr.get("p_alive_watch", DerivedThresholds.P_ALIVE_WATCH_FALLBACK))
    return at_risk, watch


def apply_descriptive(
    frame: pd.DataFrame,
    customers: pd.DataFrame,
    payments: pd.DataFrame,
    cutoff: pd.Timestamp,
) -> pd.DataFrame:
    history = payments[
        payments["acc_id"].notna()
        & payments["payment_date"].notna()
        & (payments["payment_date"] < cutoff)
    ].copy()
    history["acc_id"] = history["acc_id"].astype(int)
    history["amount"] = pd.to_numeric(history["amount"], errors="coerce").fillna(0.0)
    grouped = history.groupby("acc_id")
    n_purchases = grouped.size()
    total_revenue = grouped["amount"].sum()

    frame["n_purchases"] = frame["acc_id"].map(n_purchases).fillna(0).astype(int)
    frame["total_revenue"] = frame["acc_id"].map(total_revenue).fillna(0.0)
    frame["avg_transaction_value"] = np.where(
        frame["n_purchases"] > 0,
        frame["total_revenue"] / frame["n_purchases"].clip(lower=1),
        np.nan,
    )

    # usage_trend (§3.3) from usage_change_90d_pct
    change = pd.to_numeric(frame["usage_change_90d_pct"], errors="coerce").fillna(0.0)
    total_180 = pd.to_numeric(frame["usage_total_180d"], errors="coerce").fillna(0.0)
    frame["usage_trend"] = np.select(
        [total_180 <= 0, change > DerivedThresholds.MOMENTUM_BAND, change < -DerivedThresholds.MOMENTUM_BAND],
        ["no_usage", "increasing", "declining"],
        default="stable",
    )

    # profile snapshot (§3.3) — snapshot fields are display-only Tier B data.
    snapshot_source = customers.sort_values("acc_id").drop_duplicates(
        "acc_id", keep="last"
    )
    snapshot_source = snapshot_source.set_index(snapshot_source["acc_id"].astype(int))
    share_columns = [
        "sms_usage_share",
        "email_usage_share",
        "bc_usage_share",
        "api_usage_share",
        "otp_usage_share",
    ]

    # Dict lookup + records iteration instead of iterrows()/.loc per row (perf).
    snap_map = snapshot_source.to_dict("index")
    snapshot_cols = ["acc_id", "customer_age_days", "usage_total_180d", *share_columns]
    snapshots: list[dict[str, Any]] = []
    for row in frame[snapshot_cols].to_dict("records"):
        customer = snap_map.get(int(row["acc_id"]))
        snapshots.append(
            {
                "join_date": date_or_none(customer["join_date"])
                if customer is not None
                else None,
                "customer_age_days": int_or_none(row.get("customer_age_days")),
                "status_sms": str_or_none(customer["status_sms"])
                if customer is not None
                else None,
                "status_email": str_or_none(customer["status_email"])
                if customer is not None
                else None,
                "credit_sms": float_or_zero(customer["credit_sms"])
                if customer is not None
                else 0.0,
                "credit_email": float_or_zero(customer["credit_email"])
                if customer is not None
                else 0.0,
                "expire_sms": date_or_none(customer["expire_sms"])
                if customer is not None
                else None,
                "expire_email": date_or_none(customer["expire_email"])
                if customer is not None
                else None,
                "last_access": date_or_none(customer["last_access"])
                if customer is not None
                else None,
                "last_send": date_or_none(customer["last_send"])
                if customer is not None
                else None,
                **{
                    column: round(float_or_zero(row.get(column)), 4)
                    for column in share_columns
                },
                "usage_total_180d": float_or_zero(row.get("usage_total_180d")),
            }
        )
    frame["profile_snapshot"] = snapshots
    frame["credit_balance_total"] = [
        (snapshot["credit_sms"] or 0.0) + (snapshot["credit_email"] or 0.0)
        for snapshot in snapshots
    ]
    return frame


def apply_derived(
    frame: pd.DataFrame,
    cutoff: pd.Timestamp,
    p_alive_cuts: tuple[float, float],
) -> pd.DataFrame:
    at_risk_cut, watch_cut = p_alive_cuts

    # ── Churn abstention (§3.4) ───────────────────────────────────
    # Active-Paid customers with too little history get a churn score driven by
    # zero-filled features, not real signal. Abstain: null the churn outputs and
    # mark churn eligibility insufficient_data (via churn_abstained → eligibility
    # JSON) so no one acts on a guess. Done first so revenue_at_risk / segments /
    # needs_review all see the abstained (null) churn downstream.
    age_days = pd.to_numeric(frame.get("customer_age_days"), errors="coerce")
    abstain = (
        frame["el_churn"].to_numpy()
        & (age_days < DerivedThresholds.CHURN_ABSTAIN_MIN_TENURE_DAYS).to_numpy()
    )
    frame["churn_abstained"] = abstain
    if abstain.any():
        frame.loc[abstain, "churn_probability"] = np.nan
        frame.loc[abstain, "churn_risk_level"] = None
        # object column of SHAP lists — rebuild elementwise (no .loc array-set).
        frame["churn_factors"] = [
            None if ab else factors
            for ab, factors in zip(abstain, frame["churn_factors"])
        ]

    # value tier (§3.5): percentile of CLV among active customers of the run
    active_mask = frame["lifecycle_stage"].isin(list(LifecycleStage.ACTIVE))
    clv = pd.to_numeric(frame["predicted_clv_6m"], errors="coerce")
    tier = pd.Series(ValueTier.NONE, index=frame.index, dtype="object")
    pool = active_mask & clv.notna() & (clv > 0)
    if pool.any():
        rank = clv[pool].rank(pct=True)
        tier.loc[pool] = np.select(
            [rank >= DerivedThresholds.VALUE_TIER_HIGH_PCT, rank >= DerivedThresholds.VALUE_TIER_MID_PCT],
            [ValueTier.HIGH, ValueTier.MID],
            default=ValueTier.LOW,
        )
    frame["customer_value_tier"] = tier

    # revenue at risk (§5.1)
    churn_prob = pd.to_numeric(frame["churn_probability"], errors="coerce")
    frame["revenue_at_risk"] = np.where(
        churn_prob.notna() & clv.notna(), (churn_prob * clv).round(2), np.nan
    )

    # estimated days until top-up (§3.6) — primary source is the AFT model
    # (set in apply_credit); the balance/burn heuristic only fills rows the
    # model left empty (older artifacts without a topup_model).
    p50_30 = pd.to_numeric(frame["predicted_credit_usage_30d"], errors="coerce")
    daily_burn = p50_30 / 30.0
    credit_balance = pd.to_numeric(
        frame["credit_balance_total"], errors="coerce"
    ).fillna(0.0)
    heuristic_days = np.where(
        daily_burn > 0,
        np.minimum(np.ceil(credit_balance / daily_burn), TOPUP_CAP_DAYS),
        np.nan,
    )
    model_days = pd.to_numeric(frame["estimated_days_until_topup"], errors="coerce")
    days = np.where(model_days.notna(), model_days, heuristic_days)
    frame["estimated_days_until_topup"] = days

    urgency = pd.Series([None] * len(frame), index=frame.index, dtype="object")
    credit_eligible = frame["el_credit"]
    urgency.loc[credit_eligible] = UrgencyLevel.STABLE
    with_days = credit_eligible & pd.Series(days, index=frame.index).notna()
    days_series = pd.Series(days, index=frame.index)
    urgency.loc[with_days & (days_series <= DerivedThresholds.URGENCY_MONITOR_DAYS)] = UrgencyLevel.MONITOR
    urgency.loc[with_days & (days_series <= DerivedThresholds.URGENCY_WARNING_DAYS)] = UrgencyLevel.WARNING
    urgency.loc[with_days & (days_series <= DerivedThresholds.URGENCY_CRITICAL_DAYS)] = UrgencyLevel.CRITICAL
    frame["credit_urgency_level"] = urgency

    # priority score (§5.2) — rank by expected money at risk. revenue_at_risk
    # (= churn × CLV) is the ranking key; the 0..100 priority_score is just a
    # log rescale of it for display, so sorting by priority_score equals sorting
    # by revenue_at_risk. No text reason is generated here — the numeric score is
    # the only priority signal; any human-readable "why" is produced by the AI
    # explanation from the underlying numbers/SHAP factors.
    var = (
        pd.to_numeric(frame["revenue_at_risk"], errors="coerce")
        .fillna(0.0)
        .clip(lower=0.0)
    )
    frame["priority_score"] = _display_score(var)

    # needs_review (§5.3) — surface the churn/p_alive disagreement. A valuable
    # customer whose recent usage has collapsed and whose p_alive is near zero
    # is at risk even when the churn score is low (it leans on long payment
    # history). Flag = high churn risk OR (valuable AND p_alive low AND usage
    # declining), so a human looks before we treat the low churn score as safe.
    risk_level = frame["churn_risk_level"].astype("object")
    p_alive = pd.to_numeric(frame["p_alive"], errors="coerce")
    usage_change = pd.to_numeric(frame.get("usage_change_90d_pct"), errors="coerce")
    valuable = frame["customer_value_tier"].isin([ValueTier.HIGH, ValueTier.MID])
    churn_at_risk = risk_level.isin([RiskLevel.HIGH, RiskLevel.CRITICAL])
    silent_decline = (
        valuable & (p_alive < at_risk_cut) & (usage_change < -DerivedThresholds.MOMENTUM_BAND)
    )
    needs_review = (churn_at_risk | silent_decline) & active_mask
    frame["needs_review"] = needs_review.fillna(False).astype(bool)

    frame = _apply_segments(frame, p_alive_cuts)
    return frame


# Prioritization segments — value × health + sales-timing, see
# Segment spec (historical: docs/CUSTOMER-SEGMENTS.md, removed). Names/order are the single source in src/constants.


def _apply_segments(frame: pd.DataFrame, p_alive_cuts: tuple[float, float]) -> pd.DataFrame:
    """Assign a descriptive segment + a global priority_rank per customer (§5.4)."""

    at_risk_cut, watch_cut = p_alive_cuts
    tier = frame["customer_value_tier"]
    risk = frame["churn_risk_level"].astype("object")
    p_alive = pd.to_numeric(frame["p_alive"], errors="coerce")
    change = pd.to_numeric(frame.get("usage_change_90d_pct"), errors="coerce").fillna(
        0.0
    )

    stage = frame["lifecycle_stage"]
    sub_stage = frame["sub_stage"]
    valuable = tier.isin([ValueTier.HIGH, ValueTier.MID])
    at_risk = risk.isin([RiskLevel.HIGH, RiskLevel.CRITICAL]) | (p_alive < at_risk_cut)
    watch = ~at_risk & (risk.eq(RiskLevel.MEDIUM) | (p_alive < watch_cut))
    growing = change > DerivedThresholds.MOMENTUM_BAND

    is_churned = stage.eq(LifecycleStage.CHURNED)
    # Conditions are evaluated in priority order (first match wins). The
    # lifecycle checks come first, so churned/ghost rows never fall through to
    # the active value/health tiers below.
    conditions = [
        stage.eq(LifecycleStage.GHOST),
        is_churned & sub_stage.eq(SubStage.CHURNED_PAID),
        is_churned,
        valuable & at_risk,
        valuable & watch,
        valuable,
        at_risk,
        watch,
        growing,
    ]
    choices = [
        Segment.GHOST,
        Segment.REACTIVATE,
        Segment.DORMANT,
        Segment.PROTECT,
        Segment.STABILIZE,
        Segment.GROW,
        Segment.SALVAGE_LOW,
        Segment.WATCH_LOW,
        Segment.DEVELOP,
    ]
    frame["segment"] = np.select(conditions, choices, default=Segment.MAINTAIN)

    # Global priority_rank: by segment priority, then by money inside each segment
    # (revenue-at-risk for at-risk segments, forward CLV for stable/growth segments).
    seg_rank = frame["segment"].map({s: i for i, s in enumerate(Segment.ORDER)})
    rar = pd.to_numeric(frame["revenue_at_risk"], errors="coerce").fillna(0.0)
    clv = pd.to_numeric(frame["predicted_clv_6m"], errors="coerce").fillna(0.0)
    money = np.where(frame["segment"].isin(Segment.RETENTION), rar, clv)
    order = pd.DataFrame(
        {"seg": seg_rank.to_numpy(), "money": -money}, index=frame.index
    )
    ranked = order.sort_values(["seg", "money"]).index
    frame["priority_rank"] = pd.Series(range(1, len(frame) + 1), index=ranked).reindex(
        frame.index
    )
    return frame


# Priority score weights (OUTPUT-CONTRACT §5.2) — single source of truth.
# Priority ranking key. priority_score ranks by expected money at risk
# (revenue_at_risk = churn_probability × predicted_clv_6m), log-rescaled to
# 0..100 for display. Credit urgency stays a separate timing signal
# (credit_urgency_level), not part of this score. No text reason is produced —
# explanation text is the AI layer's job.
def _display_score(value_at_risk: pd.Series) -> pd.Series:
    """Map revenue-at-risk (THB, heavy right tail) to a 0..100 display score.

    Ordering is preserved (log1p is monotonic), so ranking by priority_score is
    identical to ranking by revenue_at_risk. Cosmetic only.
    """
    logged = np.log1p(value_at_risk.clip(lower=0.0))
    low, high = float(logged.min()), float(logged.max())
    if high - low < 1e-9:
        return pd.Series(0.0, index=value_at_risk.index)
    return (100.0 * (logged - low) / (high - low)).round(2)
