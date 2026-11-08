"""Canonical enum-like string constants shared across the ML pipeline.

These values are part of the cross-service contract: the API and web (TypeScript)
read the exact same strings the ML writer produces (packages/types/src/enums.ts must
stay in sync; scripts/verify_constants_sync.py checks it). Centralizing them here removes the scattered string
literals (CLAUDE.md code style: magic strings -> constants) so a typo cannot
silently drift between the writer and the reader.
"""

from __future__ import annotations

from typing import Final


class ModelType:
    CHURN: Final = "churn"
    CLV: Final = "clv"
    CREDIT: Final = "credit"


class ImportStatus:
    PENDING: Final = "pending"
    IMPORTING: Final = "importing"
    CLEANING: Final = "cleaning"
    READY: Final = "ready"
    FAILED: Final = "failed"


class ModelVersionStatus:
    CANDIDATE: Final = "candidate"
    PRODUCTION: Final = "production"
    ARCHIVED: Final = "archived"


class ModelAlias:
    PRODUCTION: Final = "production"


class EvaluationType:
    HOLDOUT: Final = "holdout"
    BACKTEST: Final = "backtest"
    BASELINE: Final = "baseline"
    PRODUCTION_HOLDOUT: Final = "production_holdout"


class RunStatus:
    PENDING: Final = "pending"  # initial state set by the API before the runner starts
    IN_PROGRESS: Final = "in_progress"
    COMPLETED: Final = "completed"
    FAILED: Final = "failed"


class OutputStatus:
    PREDICTED: Final = "predicted"
    PARTIAL: Final = "partial"
    INSUFFICIENT_DATA: Final = "insufficient_data"


class LifecycleStage:
    ACTIVE_PAID: Final = "Active Paid"
    ACTIVE_FREE: Final = "Active Free"
    CHURNED: Final = "Churned"
    GHOST: Final = "Ghost"

    ACTIVE: Final = ("Active Paid", "Active Free")


class SubStage:
    ACTIVE_PAID: Final = "Active Paid"
    ACTIVE_FREE: Final = "Active Free"
    CHURNED_PAID: Final = "Churned Paid"
    CHURNED_FREE: Final = "Churned Free"
    GHOST: Final = "Ghost"


class RiskLevel:
    LOW: Final = "low"
    MEDIUM: Final = "medium"
    HIGH: Final = "high"
    CRITICAL: Final = "critical"


class UrgencyLevel:
    STABLE: Final = "stable"
    MONITOR: Final = "monitor"
    WARNING: Final = "warning"
    CRITICAL: Final = "critical"


class ValueTier:
    HIGH: Final = "high"
    MID: Final = "mid"
    LOW: Final = "low"
    NONE: Final = "none"


class AiStatus:
    NOT_REQUESTED: Final = "not_requested"
    PENDING: Final = "pending"
    COMPLETED: Final = "completed"
    FAILED: Final = "failed"


class Segment:
    PROTECT: Final = "High-Value At-Risk"
    STABILIZE: Final = "Mid-Value At-Risk"
    GROW: Final = "High-Value Stable"
    DEVELOP: Final = "Emerging"
    MAINTAIN: Final = "Stable"
    WATCH_LOW: Final = "Low-Value Watch"
    SALVAGE_LOW: Final = "Low-Value At-Risk"
    REACTIVATE: Final = "Lapsed"
    DORMANT: Final = "Dormant"
    GHOST: Final = "Ghost"

    # Work-list priority order (top first) + retention subset (ranked by money).
    ORDER: Final = (
        "High-Value At-Risk", "Mid-Value At-Risk", "High-Value Stable", "Emerging", "Stable",
        "Low-Value Watch", "Low-Value At-Risk", "Lapsed", "Dormant", "Ghost",
    )
    RETENTION: Final = ("High-Value At-Risk", "Mid-Value At-Risk", "Low-Value At-Risk", "Low-Value Watch")


class DerivedThresholds:
    """Numeric cutoffs used at prediction time to bucket customers.

    ML-INTERNAL — these are NOT part of the string contract mirrored in
    apps/api/src/lib/constants.ts; they never cross the service boundary as
    values, only the resulting labels do. Centralized here (instead of scattered
    literals in prediction/runner.py) so a cut cannot silently drift between the
    two places that read it (usage_trend vs segment `growing`, at-risk health vs
    needs_review), per CLAUDE.md "magic numbers -> constants".
    """

    # Value tier — concrete monetary THB cutoffs matching Colab 02:
    # high >= ฿10,000 (Whale & Core), mid ฿1,000–10,000 (Standard), low < ฿1,000.
    VALUE_TIER_HIGH_THB: Final = 10_000.0
    VALUE_TIER_MID_THB: Final = 1_000.0

    # Usage momentum band. usage_change_90d_pct is already a normalized ratio,
    # so ±10% is scale-free and does not drift under absolute-volume shift.
    MOMENTUM_BAND: Final = 0.10

    # Credit urgency day cutoffs — operational SLA policy owned by ops, not a
    # statistical property of the data (an absolute-days forecast is invariant).
    URGENCY_CRITICAL_DAYS: Final = 14
    URGENCY_WARNING_DAYS: Final = 30
    URGENCY_MONITOR_DAYS: Final = 90

    # Churn ABSTENTION. A customer whose tenure is shorter than the churn
    # feature windows has them mostly zero-filled — no prior-90d usage, no
    # 6-month slope — so the churn score is driven by defaults, not real
    # behaviour: a confident-looking number the model has no basis for. Below
    # this tenure we abstain (churn eligibility → insufficient_data, no risk
    # level emitted) rather than hand an account manager a guess.
    #
    # Keyed on TENURE, not payment count: this is a prepaid business (buy credit
    # once, use it for months), so a single-payment customer still has rich
    # usage signal — n_purchases is not what zero-fills the features. 90 days =
    # under one recent-90d window; ~11% of active-paid on the reference data.
    CHURN_ABSTAIN_MIN_TENURE_DAYS: Final = 90
