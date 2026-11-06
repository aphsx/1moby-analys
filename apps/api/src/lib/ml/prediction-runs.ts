/**
 * Shared helpers for prediction-runs sub-routes.
 * Not a route file — imported by runs.ts, outputs.ts, summary.ts, customer-360.ts.
 */
import {
  type ChurnFactor,
  type LifecycleStage,
  type ModelEligibility,
  type PredictionOutput,
  type PredictionRun,
  type ProfileSnapshot,
  type RiskLevel,
  type RunStatus,
  type UrgencyLevel,
  type ValueTier,
} from "@moby/types";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import {
  mlPredictionOutputs,
  mlPredictionRuns,
  predictDataSources,
  user,
} from "../../db/schema";
import { notFound } from "../http/errors";
import { EMPTY_MODEL_VERSIONS, num } from "../ml-contract";

// ── Run select + row mapping ───────────────────────────────────

export const runSelect = {
  id: mlPredictionRuns.id,
  name: mlPredictionRuns.name,
  status: mlPredictionRuns.status,
  predictSourceId: mlPredictionRuns.predictSourceId,
  predictSourceName: predictDataSources.name,
  cutoffDate: mlPredictionRuns.cutoffDate,
  totalCustomers: mlPredictionRuns.totalCustomers,
  createdBy: mlPredictionRuns.createdBy,
  creatorName: user.name,
  creatorEmail: user.email,
  createdAt: mlPredictionRuns.createdAt,
  finishedAt: mlPredictionRuns.finishedAt,
  errorMessage: mlPredictionRuns.errorMessage,
  progressJson: mlPredictionRuns.progressJson,
  modelVersionsJson: mlPredictionRuns.modelVersionsJson,
};

function selectRuns() {
  return db
    .select(runSelect)
    .from(mlPredictionRuns)
    .leftJoin(predictDataSources, eq(mlPredictionRuns.predictSourceId, predictDataSources.id))
    .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id));
}

export type RunRow = Awaited<ReturnType<typeof selectRuns>>[number];

export function mapRun(row: RunRow): PredictionRun {
  return {
    id: row.id,
    name: row.name,
    status: row.status as RunStatus,
    predict_source_id: row.predictSourceId,
    predict_source_name: row.predictSourceName ?? row.predictSourceId,
    cutoff_date: row.cutoffDate,
    total_customers: row.totalCustomers,
    created_by: row.createdBy,
    created_by_name: row.creatorName ?? row.creatorEmail ?? null,
    created_at: row.createdAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    error_message: row.errorMessage,
    progress:
      row.status === "in_progress"
        ? ((row.progressJson as { step: string; pct: number } | null) ?? null)
        : null,
    warnings: (row.progressJson as { warnings?: string[] } | null)?.warnings ?? [],
  };
}

export async function fetchRun(id: string): Promise<RunRow | null> {
  const [row] = await selectRuns().where(eq(mlPredictionRuns.id, id)).limit(1);
  return row ?? null;
}

/** Every Prediction Run, newest first (runs are visible org-wide). */
export async function listRuns(): Promise<RunRow[]> {
  return selectRuns().orderBy(desc(mlPredictionRuns.createdAt));
}

/** fetchRun, or a 404 when the run doesn't exist (runs are readable org-wide). */
export async function requireRun(id: string): Promise<RunRow> {
  const run = await fetchRun(id);
  if (!run) throw notFound("Prediction run not found");
  return run;
}

/** One customer's Prediction Output in a run, or a 404 (also for a non-integer acc_id). */
export async function requireOutput(runId: string, accIdParam: string) {
  const accId = Number(accIdParam);
  if (!Number.isInteger(accId)) throw notFound("Prediction output not found");
  const [row] = await db
    .select()
    .from(mlPredictionOutputs)
    .where(and(eq(mlPredictionOutputs.predictionRunId, runId), eq(mlPredictionOutputs.accId, accId)))
    .limit(1);
  if (!row) throw notFound("Prediction output not found");
  return row;
}

// ── Output row mapping ─────────────────────────────────────────

export const EMPTY_SNAPSHOT: ProfileSnapshot = {
  join_date: "",
  customer_age_days: 0,
  status_sms: null,
  status_email: null,
  credit_sms: 0,
  credit_email: 0,
  expire_sms: null,
  expire_email: null,
  last_access: null,
  last_send: null,
  sms_usage_share: 0,
  email_usage_share: 0,
  bc_usage_share: 0,
  api_usage_share: 0,
  otp_usage_share: 0,
  usage_total_180d: 0,
};

export const FALLBACK_ELIGIBILITY: ModelEligibility = {
  eligible: false,
  status: "not_eligible",
  reason: null,
};

export type OutputRow = typeof mlPredictionOutputs.$inferSelect;

export function mapOutput(row: OutputRow): PredictionOutput {
  const eligibility = row.modelEligibilityJson as {
    churn?: ModelEligibility;
    clv?: ModelEligibility;
    credit?: ModelEligibility;
  } | null;
  return {
    prediction_run_id: row.predictionRunId,
    acc_id: row.accId,
    lifecycle_stage: (row.lifecycleStage ?? "Ghost") as LifecycleStage,
    sub_stage: row.subStage ?? row.lifecycleStage ?? "Ghost",
    days_since_last_activity: row.daysSinceLastActivity,
    n_purchases: row.nPurchases ?? 0,
    total_revenue: num(row.totalRevenue) ?? 0,
    avg_transaction_value: num(row.avgTransactionValue),
    ever_paid: row.everPaid,
    usage_trend: (row.usageTrend ?? "no_usage") as PredictionOutput["usage_trend"],
    profile_snapshot: (row.profileSnapshotJson as ProfileSnapshot | null) ?? EMPTY_SNAPSHOT,
    churn_probability: num(row.churnProbability),
    churn_risk_level: (row.churnRiskLevel as RiskLevel | null) ?? null,
    churn_factors: (row.churnFactorsJson as ChurnFactor[] | null) ?? null,
    predicted_clv_6m: num(row.predictedClv6m),
    clv_pay_probability: num(row.clvPayProbability),
    clv_forecast_interval:
      (row.clvForecastIntervalJson as PredictionOutput["clv_forecast_interval"]) ?? null,
    p_alive: num(row.pAlive),
    customer_value_tier: (row.customerValueTier ?? "none") as ValueTier,
    predicted_credit_usage_30d: num(row.predictedCreditUsage30d),
    predicted_credit_usage_90d: num(row.predictedCreditUsage90d),
    credit_forecast_interval:
      (row.creditForecastIntervalJson as PredictionOutput["credit_forecast_interval"]) ?? null,
    estimated_days_until_topup: row.estimatedDaysUntilTopup,
    credit_urgency_level: (row.creditUrgencyLevel as UrgencyLevel | null) ?? null,
    revenue_at_risk: num(row.revenueAtRisk),
    priority_score: num(row.priorityScore) ?? 0,
    segment: row.segment ?? null,
    priority_rank: row.priorityRank ?? null,
    needs_review: row.needsReview ?? false,
    ai_status: row.aiStatus as PredictionOutput["ai_status"],
    ai_explanation: row.aiExplanation,
    output_status: row.outputStatus as PredictionOutput["output_status"],
    model_eligibility: {
      churn: eligibility?.churn ?? FALLBACK_ELIGIBILITY,
      clv: eligibility?.clv ?? FALLBACK_ELIGIBILITY,
      credit: eligibility?.credit ?? FALLBACK_ELIGIBILITY,
    },
    model_versions:
      (row.modelVersionsJson as PredictionOutput["model_versions"] | null) ?? EMPTY_MODEL_VERSIONS,
  };
}

// ── Outputs query helpers ──────────────────────────────────────

export const SORT_COLUMNS = {
  priority_score: mlPredictionOutputs.priorityScore,
  lifecycle_stage: mlPredictionOutputs.lifecycleStage,
  churn_probability: mlPredictionOutputs.churnProbability,
  predicted_clv_6m: mlPredictionOutputs.predictedClv6m,
  revenue_at_risk: mlPredictionOutputs.revenueAtRisk,
  total_revenue: mlPredictionOutputs.totalRevenue,
  days_since_last_activity: mlPredictionOutputs.daysSinceLastActivity,
  estimated_days_until_topup: mlPredictionOutputs.estimatedDaysUntilTopup,
  priority_rank: mlPredictionOutputs.priorityRank,
  ai_status: mlPredictionOutputs.aiStatus,
  acc_id: mlPredictionOutputs.accId,
} as const;

export interface OutputsQueryParams {
  page?: number;
  page_size?: number;
  sort?: string;
  search?: string;
  lifecycle_stage?: string;
  churn_risk_level?: string;
  customer_value_tier?: string;
  credit_urgency_level?: string;
  ever_paid?: string;
  segment?: string;
  needs_review?: string;
}

