/**
 * Canonical enum-like string constants shared across web, api, and ml.
 * These MUST stay in sync with apps/ml/src/constants.py
 * (apps/ml/scripts/verify_constants_sync.py checks it in CI).
 */

/** The three served ML models. Lifecycle is rule-based, not a model type. */
export const MODEL_TYPES = ["churn", "clv", "credit"] as const;
export type ModelType = (typeof MODEL_TYPES)[number];

/** A Data Source's import lifecycle (`*_data_sources.import_status`). */
export const IMPORT_STATUS = {
  PENDING: "pending",
  IMPORTING: "importing",
  CLEANING: "cleaning",
  READY: "ready",
  FAILED: "failed",
} as const;
export type ImportStatus = (typeof IMPORT_STATUS)[keyof typeof IMPORT_STATUS];

/** `ml_model_versions.status`. */
export const MODEL_VERSION_STATUS = {
  CANDIDATE: "candidate",
  PRODUCTION: "production",
  ARCHIVED: "archived",
} as const;
export type ModelVersionStatus = (typeof MODEL_VERSION_STATUS)[keyof typeof MODEL_VERSION_STATUS];

/** The `ml_model_aliases.alias` that marks a Model Type's Champion. */
export const MODEL_ALIAS = { PRODUCTION: "production" } as const;

/** `ml_model_evaluations.evaluation_type`. */
export const EVALUATION_TYPE = {
  HOLDOUT: "holdout",
  BACKTEST: "backtest",
  BASELINE: "baseline",
  PRODUCTION_HOLDOUT: "production_holdout",
} as const;
export type EvaluationType = (typeof EVALUATION_TYPE)[keyof typeof EVALUATION_TYPE];

export const RUN_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export const OUTPUT_STATUS = {
  PREDICTED: "predicted",
  PARTIAL: "partial",
  INSUFFICIENT_DATA: "insufficient_data",
} as const;
export type OutputStatus = (typeof OUTPUT_STATUS)[keyof typeof OUTPUT_STATUS];

export const LIFECYCLE_STAGE = {
  ACTIVE_PAID: "Active Paid",
  ACTIVE_FREE: "Active Free",
  CHURNED: "Churned",
  GHOST: "Ghost",
} as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGE)[keyof typeof LIFECYCLE_STAGE];

export const SUB_STAGE = {
  ACTIVE_PAID: "Active Paid",
  ACTIVE_FREE: "Active Free",
  CHURNED_PAID: "Churned Paid",
  CHURNED_FREE: "Churned Free",
  GHOST: "Ghost",
} as const;
export type SubStage = (typeof SUB_STAGE)[keyof typeof SUB_STAGE];

export const RISK_LEVEL = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;
export type RiskLevel = (typeof RISK_LEVEL)[keyof typeof RISK_LEVEL];

export const URGENCY_LEVEL = {
  STABLE: "stable",
  MONITOR: "monitor",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;
export type UrgencyLevel = (typeof URGENCY_LEVEL)[keyof typeof URGENCY_LEVEL];

export const VALUE_TIER = {
  HIGH: "high",
  MID: "mid",
  LOW: "low",
  NONE: "none",
} as const;
export type ValueTier = (typeof VALUE_TIER)[keyof typeof VALUE_TIER];

export const AI_STATUS = {
  NOT_REQUESTED: "not_requested",
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type AiStatus = (typeof AI_STATUS)[keyof typeof AI_STATUS];

export const SEGMENT = {
  PROTECT: "High-Value At-Risk",
  STABILIZE: "Mid-Value At-Risk",
  GROW: "High-Value Stable",
  DEVELOP: "Emerging",
  MAINTAIN: "Stable",
  WATCH_LOW: "Low-Value Watch",
  SALVAGE_LOW: "Low-Value At-Risk",
  REACTIVATE: "Lapsed",
  DORMANT: "Dormant",
  GHOST: "Ghost",
} as const;
export type Segment = (typeof SEGMENT)[keyof typeof SEGMENT];

export const SEGMENT_ORDER: readonly Segment[] = [
  SEGMENT.PROTECT, SEGMENT.STABILIZE, SEGMENT.GROW, SEGMENT.DEVELOP, SEGMENT.MAINTAIN,
  SEGMENT.WATCH_LOW, SEGMENT.SALVAGE_LOW, SEGMENT.REACTIVATE, SEGMENT.DORMANT, SEGMENT.GHOST,
];

/** Ordered arrays for filter dropdowns. */
export const LIFECYCLE_STAGES: LifecycleStage[] = ["Active Paid", "Active Free", "Churned", "Ghost"];
export const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"];
export const VALUE_TIERS: ValueTier[] = ["high", "mid", "low", "none"];
export const URGENCY_LEVELS: UrgencyLevel[] = ["critical", "warning", "monitor", "stable"];

/** Max customers shown in top-priority widget (dashboard spec: Top 10).
 *  Shared by web and api summary query. */
export const TOP_PRIORITY_LIMIT = 10;
