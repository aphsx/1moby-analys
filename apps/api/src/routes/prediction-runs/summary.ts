import {
  type LifecycleStage,
  MODEL_ALIAS,
  type RunStatus,
  type RunSummary,
  TOP_PRIORITY_LIMIT,
  type ValueTier,
} from "@moby/types";
import Elysia, { t } from "elysia";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { mlModelAliases, mlModelVersions, mlPredictionOutputs, mlPredictionRuns, predictDataSources, user } from "../../db/schema";
import { requireUser } from "../../lib/http/auth-middleware";
import { notFound } from "../../lib/http/errors";
import {
  DEFAULT_RISK_THRESHOLDS,
  EMPTY_MODEL_VERSIONS,
  monthKeysBeforeCutoff,
  num,
} from "../../lib/ml-contract";
import { fetchRunAggregates } from "../../lib/ml/run-aggregates";
import { type RunRow, runSelect } from "../../lib/ml/prediction-runs";

async function churnThresholds(): Promise<{ medium: number; high: number; critical: number }> {
  const rows = await db
    .select({ modelCardJson: mlModelVersions.modelCardJson })
    .from(mlModelAliases)
    .innerJoin(mlModelVersions, eq(mlModelAliases.modelVersionId, mlModelVersions.id))
    .where(and(eq(mlModelAliases.alias, MODEL_ALIAS.PRODUCTION), eq(mlModelAliases.modelType, "churn")))
    .limit(1);
  const card = rows[0]?.modelCardJson as {
    thresholds?: { medium?: number; high?: number; critical?: number };
  } | null;
  return {
    medium: card?.thresholds?.medium ?? DEFAULT_RISK_THRESHOLDS.medium,
    high: card?.thresholds?.high ?? DEFAULT_RISK_THRESHOLDS.high,
    critical: card?.thresholds?.critical ?? DEFAULT_RISK_THRESHOLDS.critical,
  };
}

async function monthlyActual(
  predictSourceId: string,
  cutoffDate: string
): Promise<RunSummary["revenue"]["monthly_actual"]> {
  const rows = await db.execute<{ month: string; amount: number; n_payments: number }>(sql`
    SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
           COALESCE(SUM(amount), 0)::float8 AS amount,
           COUNT(*)::int AS n_payments
    FROM predict_clean_payments
    WHERE source_id = ${predictSourceId}
      AND payment_date >= date_trunc('month', ${cutoffDate}::date) - INTERVAL '12 months'
      AND payment_date < date_trunc('month', ${cutoffDate}::date)
    GROUP BY 1
  `);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return monthKeysBeforeCutoff(cutoffDate).map((month) => ({
    month,
    amount: byMonth.get(month)?.amount ?? 0,
    n_payments: byMonth.get(month)?.n_payments ?? 0,
  }));
}

async function buildSummary(run: RunRow & { modelVersionsJson: unknown }): Promise<RunSummary> {
  const o = mlPredictionOutputs;
  const inRun = eq(o.predictionRunId, run.id);

  const [agg, topRows, monthly, thresholds] = await Promise.all([
    fetchRunAggregates(run.id),
    db
      .select({
        accId: o.accId,
        lifecycleStage: o.lifecycleStage,
        churnProbability: o.churnProbability,
        predictedClv6m: o.predictedClv6m,
        priorityScore: o.priorityScore,
      })
      .from(o)
      .where(inRun)
      .orderBy(sql`${o.priorityScore} DESC NULLS LAST`, asc(o.accId))
      .limit(TOP_PRIORITY_LIMIT),
    monthlyActual(run.predictSourceId, run.cutoffDate),
    churnThresholds(),
  ]);

  return {
    run: {
      id: run.id,
      name: run.name,
      cutoff_date: run.cutoffDate,
      status: run.status as RunStatus,
      total_customers: agg.total_customers,
      finished_at: run.finishedAt?.toISOString() ?? null,
    },
    lifecycle: agg.lifecycle,
    churn: { eligible_count: agg.churn_eligible, by_risk: agg.churn_by_risk, thresholds },
    revenue: {
      expected_at_risk: agg.revenue_expected_at_risk,
      high_risk_exposure: agg.revenue_high_risk_exposure,
      monthly_actual: monthly,
    },
    value_risk_matrix: agg.value_risk_matrix.map((row) => ({
      value_tier: row.value_tier as ValueTier,
      risk_level: row.risk_level,
      count: row.count,
      clv_sum: row.clv_sum,
    })),
    credit: {
      demand_30d: agg.credit_demand_30d,
      by_urgency: agg.credit_by_urgency,
      topup_due_7d: agg.credit_topup_due_7d,
    },
    top_priority: topRows.map((row) => ({
      acc_id: row.accId,
      lifecycle_stage: (row.lifecycleStage ?? "Ghost") as LifecycleStage,
      churn_probability: num(row.churnProbability),
      predicted_clv_6m: num(row.predictedClv6m),
      priority_score: num(row.priorityScore) ?? 0,
    })),
    model_versions:
      (run.modelVersionsJson as RunSummary["model_versions"] | null) ?? EMPTY_MODEL_VERSIONS,
  };
}

export const summaryRoutes = new Elysia()
  .use(requireUser)
  .get(
    "/:id/summary",
    async ({ params }) => {
      const [row] = await db
        .select({
          ...runSelect,
          modelVersionsJson: mlPredictionRuns.modelVersionsJson,
        })
        .from(mlPredictionRuns)
        .leftJoin(predictDataSources, eq(mlPredictionRuns.predictSourceId, predictDataSources.id))
        .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
        .where(eq(mlPredictionRuns.id, params.id))
        .limit(1);
      if (!row) throw notFound("Prediction run not found");
      return buildSummary(row);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  );
