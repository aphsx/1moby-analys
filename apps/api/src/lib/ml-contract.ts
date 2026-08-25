/**
 * ML v2 response contract — server-side.
 * Types are now sourced from @moby/types (single source of truth shared with web).
 * This file re-exports them + provides server-only helpers.
 */

export type {
  AiStatus,
  CandidateResult,
  ChurnFactor,
  CleanCounts,
  CustomerAiExplanationResult,
  LifecycleStage,
  ModelEligibility,
  ModelPerfEntry,
  ModelVersionSummary,
  MonthlyUsagePoint,
  OutputsPage,
  PaymentEvent,
  PredictDataSource,
  PredictionOutput,
  PredictionRun,
  ProfileSnapshot,
  RiskLevel,
  RunStatus,
  RunSummary,
  SplitMetrics,
  TrainDataSource,
  TrainingRun,
  TrainingRunResult,
  UrgencyLevel,
  ValueTier,
} from "@moby/types";

// ── Server-only helpers ─────────────────────────────────────────

/** Drizzle `numeric` columns come back as strings — convert null-safely. */
export function num(v: string | number | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export const DEFAULT_RISK_THRESHOLDS = {
  critical: 0.85,
  high: 0.6,
  medium: 0.3,
};

export const EMPTY_MODEL_VERSIONS = { churn: "", clv: "", credit: "" };

export { TOP_PRIORITY_LIMIT } from "@moby/types";

/** Last 12 calendar months strictly before the cutoff month, as YYYY-MM keys. */
export function monthKeysBeforeCutoff(cutoffDate: string): string[] {
  const cutoff = new Date(`${cutoffDate}T00:00:00Z`);
  const keys: string[] = [];
  for (let i = 12; i >= 1; i -= 1) {
    const d = new Date(
      Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() - i, 1)
    );
    keys.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    );
  }
  return keys;
}
