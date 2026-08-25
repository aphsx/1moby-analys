/**
 * Shared helpers for prediction-runs sub-routes.
 * Not a route file — imported by runs.ts, outputs.ts, summary.ts, customer-360.ts.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import {
  mlPredictionOutputs,
  mlPredictionRuns,
  predictDataSources,
  user,
} from "../../db/schema";
import { requireFoundForRead } from "../../lib/access-control";
import { UUID_RE } from "../../lib/constants";
import {
  type ChurnFactor,
  EMPTY_MODEL_VERSIONS,
  type LifecycleStage,
  type ModelEligibility,
  num,
  type PredictionOutput,
  type PredictionRun,
  type ProfileSnapshot,
  type RiskLevel,
  type RunStatus,
  type UrgencyLevel,
  type ValueTier,
} from "../../lib/ml-contract";

// ── Run select + row mapping ───────────────────────────────────

export const runSelect = {
  createdAt: mlPredictionRuns.createdAt,
  createdBy: mlPredictionRuns.createdBy,
  creatorEmail: user.email,
  creatorName: user.name,
  cutoffDate: mlPredictionRuns.cutoffDate,
  errorMessage: mlPredictionRuns.errorMessage,
  finishedAt: mlPredictionRuns.finishedAt,
  id: mlPredictionRuns.id,
  name: mlPredictionRuns.name,
  predictSourceId: mlPredictionRuns.predictSourceId,
  predictSourceName: predictDataSources.name,
  progressJson: mlPredictionRuns.progressJson,
  status: mlPredictionRuns.status,
  totalCustomers: mlPredictionRuns.totalCustomers,
};

export interface RunRow {
  createdAt: Date;
  createdBy: string | null;
  creatorEmail: string | null;
  creatorName: string | null;
  cutoffDate: string;
  errorMessage: string | null;
  finishedAt: Date | null;
  id: string;
  name: string;
  predictSourceId: string;
  predictSourceName: string | null;
  progressJson: unknown;
  status: string;
  totalCustomers: number | null;
}

export function mapRun(row: RunRow): PredictionRun {
  return {
    created_at: row.createdAt.toISOString(),
    created_by: row.createdBy,
    created_by_name: row.creatorName ?? row.creatorEmail ?? null,
    cutoff_date: row.cutoffDate,
    error_message: row.errorMessage,
    finished_at: row.finishedAt?.toISOString() ?? null,
    id: row.id,
    name: row.name,
    predict_source_id: row.predictSourceId,
    predict_source_name: row.predictSourceName ?? row.predictSourceId,
    progress:
      row.status === "in_progress"
        ? ((row.progressJson as { step: string; pct: number } | null) ?? null)
        : null,
    status: row.status as RunStatus,
    total_customers: row.totalCustomers,
  };
}

export async function fetchRun(id: string): Promise<RunRow | null> {
  if (!UUID_RE.test(id)) {
    return null;
  }
  const rows = await db
    .select(runSelect)
    .from(mlPredictionRuns)
    .leftJoin(
      predictDataSources,
      eq(mlPredictionRuns.predictSourceId, predictDataSources.id)
    )
    .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
    .where(eq(mlPredictionRuns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Org-wide read guard — 404 only when the run does not exist. */
export function requireRunFound(
  run: RunRow | null,
  set: { status?: number | string }
) {
  return requireFoundForRead(run, set, "Prediction run not found");
}

// ── Output row mapping ─────────────────────────────────────────

export const EMPTY_SNAPSHOT: ProfileSnapshot = {
  api_usage_share: 0,
  bc_usage_share: 0,
  credit_email: 0,
  credit_sms: 0,
  customer_age_days: 0,
  email_usage_share: 0,
  expire_email: null,
  expire_sms: null,
  join_date: "",
  last_access: null,
  last_send: null,
  otp_usage_share: 0,
  sms_usage_share: 0,
  status_email: null,
  status_sms: null,
  usage_total_180d: 0,
};

export const FALLBACK_ELIGIBILITY: ModelEligibility = {
  eligible: false,
  reason: null,
  status: "not_eligible",
};

export type OutputRow = typeof mlPredictionOutputs.$inferSelect;

export function mapOutput(row: OutputRow): PredictionOutput {
  const eligibility = row.modelEligibilityJson as {
    churn?: ModelEligibility;
    clv?: ModelEligibility;
    credit?: ModelEligibility;
  } | null;
  return {
    acc_id: row.accId,
    ai_explanation: row.aiExplanation,
    ai_status: row.aiStatus as PredictionOutput["ai_status"],
    avg_transaction_value: num(row.avgTransactionValue),
    churn_factors: (row.churnFactorsJson as ChurnFactor[] | null) ?? null,
    churn_probability: num(row.churnProbability),
    churn_risk_level: (row.churnRiskLevel as RiskLevel | null) ?? null,
    credit_forecast_interval:
      (row.creditForecastIntervalJson as PredictionOutput["credit_forecast_interval"]) ??
      null,
    credit_urgency_level:
      (row.creditUrgencyLevel as UrgencyLevel | null) ?? null,
    customer_value_tier: (row.customerValueTier ?? "none") as ValueTier,
    days_since_last_activity: row.daysSinceLastActivity,
    estimated_days_until_topup: row.estimatedDaysUntilTopup,
    ever_paid: row.everPaid,
    lifecycle_stage: (row.lifecycleStage ?? "Ghost") as LifecycleStage,
    model_eligibility: {
      churn: eligibility?.churn ?? FALLBACK_ELIGIBILITY,
      clv: eligibility?.clv ?? FALLBACK_ELIGIBILITY,
      credit: eligibility?.credit ?? FALLBACK_ELIGIBILITY,
    },
    model_versions:
      (row.modelVersionsJson as PredictionOutput["model_versions"] | null) ??
      EMPTY_MODEL_VERSIONS,
    n_purchases: row.nPurchases ?? 0,
    needs_review: row.needsReview ?? false,
    output_status: row.outputStatus as PredictionOutput["output_status"],
    p_alive: num(row.pAlive),
    predicted_clv_6m: num(row.predictedClv6m),
    predicted_credit_usage_30d: num(row.predictedCreditUsage30d),
    predicted_credit_usage_90d: num(row.predictedCreditUsage90d),
    prediction_run_id: row.predictionRunId,
    priority_rank: row.priorityRank ?? null,
    priority_score: num(row.priorityScore) ?? 0,
    profile_snapshot:
      (row.profileSnapshotJson as ProfileSnapshot | null) ?? EMPTY_SNAPSHOT,
    revenue_at_risk: num(row.revenueAtRisk),
    segment: row.segment ?? null,
    sub_stage: row.subStage ?? row.lifecycleStage ?? "Ghost",
    total_revenue: num(row.totalRevenue) ?? 0,
    usage_trend: (row.usageTrend ??
      "no_usage") as PredictionOutput["usage_trend"],
  };
}

// ── Outputs query helpers ──────────────────────────────────────

export const SORT_COLUMNS = {
  acc_id: mlPredictionOutputs.accId,
  ai_status: mlPredictionOutputs.aiStatus,
  churn_probability: mlPredictionOutputs.churnProbability,
  days_since_last_activity: mlPredictionOutputs.daysSinceLastActivity,
  estimated_days_until_topup: mlPredictionOutputs.estimatedDaysUntilTopup,
  lifecycle_stage: mlPredictionOutputs.lifecycleStage,
  predicted_clv_6m: mlPredictionOutputs.predictedClv6m,
  priority_rank: mlPredictionOutputs.priorityRank,
  priority_score: mlPredictionOutputs.priorityScore,
  revenue_at_risk: mlPredictionOutputs.revenueAtRisk,
  total_revenue: mlPredictionOutputs.totalRevenue,
} as const;

export interface OutputsQueryParams {
  churn_risk_level?: string;
  credit_urgency_level?: string;
  customer_value_tier?: string;
  ever_paid?: string;
  lifecycle_stage?: string;
  needs_review?: string;
  page?: number;
  page_size?: number;
  search?: string;
  segment?: string;
  sort?: string;
}
