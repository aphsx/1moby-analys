/**
 * Canonical enum-like string constants shared across services.
 *
 * These MUST stay in sync with apps/ml/src/constants.py — the ML pipeline writes
 * these exact strings and the API/web read them. Centralizing avoids scattered
 * string literals (a typo here vs. there is a silent contract break the compiler
 * cannot catch).
 */

export const RUN_STATUS = {
  COMPLETED: "completed",
  FAILED: "failed",
  IN_PROGRESS: "in_progress",
  PENDING: "pending",
} as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export const OUTPUT_STATUS = {
  INSUFFICIENT_DATA: "insufficient_data",
  PARTIAL: "partial",
  PREDICTED: "predicted",
} as const;
export type OutputStatus = (typeof OUTPUT_STATUS)[keyof typeof OUTPUT_STATUS];

export const LIFECYCLE_STAGE = {
  ACTIVE_FREE: "Active Free",
  ACTIVE_PAID: "Active Paid",
  CHURNED: "Churned",
  GHOST: "Ghost",
} as const;
export type LifecycleStage =
  (typeof LIFECYCLE_STAGE)[keyof typeof LIFECYCLE_STAGE];

export const SUB_STAGE = {
  ACTIVE_FREE: "Active Free",
  ACTIVE_PAID: "Active Paid",
  CHURNED_FREE: "Churned Free",
  CHURNED_PAID: "Churned Paid",
  GHOST: "Ghost",
} as const;
export type SubStage = (typeof SUB_STAGE)[keyof typeof SUB_STAGE];

export const RISK_LEVEL = {
  CRITICAL: "critical",
  HIGH: "high",
  LOW: "low",
  MEDIUM: "medium",
} as const;
export type RiskLevel = (typeof RISK_LEVEL)[keyof typeof RISK_LEVEL];

export const URGENCY_LEVEL = {
  CRITICAL: "critical",
  MONITOR: "monitor",
  STABLE: "stable",
  WARNING: "warning",
} as const;
export type UrgencyLevel = (typeof URGENCY_LEVEL)[keyof typeof URGENCY_LEVEL];

export const VALUE_TIER = {
  HIGH: "high",
  LOW: "low",
  MID: "mid",
  NONE: "none",
} as const;
export type ValueTier = (typeof VALUE_TIER)[keyof typeof VALUE_TIER];

export const AI_STATUS = {
  COMPLETED: "completed",
  FAILED: "failed",
  NOT_REQUESTED: "not_requested",
  PENDING: "pending",
} as const;
export type AiStatus = (typeof AI_STATUS)[keyof typeof AI_STATUS];

export const SEGMENT = {
  DEVELOP: "Emerging",
  DORMANT: "Dormant",
  GHOST: "Ghost",
  GROW: "High-Value Stable",
  MAINTAIN: "Stable",
  PROTECT: "High-Value At-Risk",
  REACTIVATE: "Lapsed",
  SALVAGE_LOW: "Low-Value At-Risk",
  STABILIZE: "Mid-Value At-Risk",
  WATCH_LOW: "Low-Value Watch",
} as const;
export type Segment = (typeof SEGMENT)[keyof typeof SEGMENT];

/** Work-list priority order (top first). */
export const SEGMENT_ORDER: readonly Segment[] = [
  SEGMENT.PROTECT,
  SEGMENT.STABILIZE,
  SEGMENT.GROW,
  SEGMENT.DEVELOP,
  SEGMENT.MAINTAIN,
  SEGMENT.WATCH_LOW,
  SEGMENT.SALVAGE_LOW,
  SEGMENT.REACTIVATE,
  SEGMENT.DORMANT,
  SEGMENT.GHOST,
];

// ── Shared validation patterns ──────────────────────────────────

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
