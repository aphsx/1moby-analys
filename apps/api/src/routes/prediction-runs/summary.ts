import {
  type ChurnFactor,
  LIFECYCLE_STAGE,
  type LifecycleStage,
  type RiskLevel,
  type RunStatus,
  type RunSummary,
  TOP_PRIORITY_LIMIT,
  type ValueTier,
} from "@moby/types";
import Elysia, { t } from "elysia";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionOutputs } from "../../db/schema";
import { requireUser } from "../../lib/http/auth-middleware";
import {
  DEFAULT_RISK_THRESHOLDS,
  EMPTY_MODEL_VERSIONS,
  monthKeysBeforeCutoff,
  num,
} from "../../lib/ml-contract";
import { fetchRunAggregates } from "../../lib/ml/run-aggregates";
import { requireRun, type RunRow } from "../../lib/ml/prediction-runs";
import { latestHitRate, revenueConcentration, topContributorId } from "../../lib/ml/overview-math";
import {
  fetchDataStart,
  fetchMonthlyAmounts,
  fetchMonthlySenders,
  fetchPayerTotals,
  fetchSendingFlags,
  fetchSendingMonths,
  modelCard,
} from "../../lib/ml/summary-facts";

async function monthlyActual(
  predictSourceId: string,
  cutoffDate: string
): Promise<RunSummary["revenue"]["monthly_actual"]> {
  const rows = await db.execute<{ month: string; amount: number; n_payments: number; n_payers: number }>(sql`
    SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
           COALESCE(SUM(amount), 0)::float8 AS amount,
           COUNT(*)::int AS n_payments,
           COUNT(DISTINCT acc_id) FILTER (WHERE amount > 0)::int AS n_payers
    FROM predict_clean_payments
    WHERE source_id = ${predictSourceId}
      AND payment_date >= date_trunc('month', ${cutoffDate}::date) - INTERVAL '24 months'
      AND payment_date < date_trunc('month', ${cutoffDate}::date)
    GROUP BY 1
  `);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return monthKeysBeforeCutoff(cutoffDate, 24).map((month) => ({
    month,
    amount: byMonth.get(month)?.amount ?? 0,
    n_payments: byMonth.get(month)?.n_payments ?? 0,
    n_payers: byMonth.get(month)?.n_payers ?? 0,
  }));
}

async function buildSummary(run: RunRow): Promise<RunSummary> {
  const o = mlPredictionOutputs;
  const inRun = eq(o.predictionRunId, run.id);
  const versions = (run.modelVersionsJson as RunSummary["model_versions"] | null) ?? EMPTY_MODEL_VERSIONS;
  const src = run.predictSourceId;

  const [agg, topRows, monthly, churnCard, creditCard, payerTotals, senders, dataStart] = await Promise.all([
    fetchRunAggregates(run.id),
    // The head of the Call List: every scored Active Paid customer, largest revenue at risk first
    db
      .select({
        accId: o.accId,
        lifecycleStage: o.lifecycleStage,
        churnProbability: o.churnProbability,
        churnRiskLevel: o.churnRiskLevel,
        customerValueTier: o.customerValueTier,
        predictedClv6m: o.predictedClv6m,
        revenueAtRisk: o.revenueAtRisk,
        estimatedDaysUntilTopup: o.estimatedDaysUntilTopup,
        priorityScore: o.priorityScore,
        churnFactorsJson: o.churnFactorsJson,
      })
      .from(o)
      .where(and(inRun, eq(o.lifecycleStage, LIFECYCLE_STAGE.ACTIVE_PAID), isNotNull(o.churnProbability)))
      .orderBy(sql`${o.revenueAtRisk} DESC NULLS LAST`, asc(o.accId))
      .limit(TOP_PRIORITY_LIMIT),
    monthlyActual(src, run.cutoffDate),
    modelCard("churn", versions.churn || undefined),
    modelCard("credit", versions.credit || undefined),
    fetchPayerTotals(src, run.cutoffDate),
    fetchMonthlySenders(src, run.cutoffDate),
    fetchDataStart(src),
  ]);

  const contributorId = topContributorId(payerTotals);
  const [contributorMonthly, sendingMonths, flags] = await Promise.all([
    contributorId == null ? null : fetchMonthlyAmounts(src, run.cutoffDate, contributorId),
    fetchSendingMonths(run.id, src, run.cutoffDate, dataStart),
    fetchSendingFlags(src, run.cutoffDate, topRows.map((r) => r.accId)),
  ]);
  const th = churnCard?.thresholds;

  return {
    run: {
      id: run.id,
      name: run.name,
      cutoff_date: run.cutoffDate,
      status: run.status as RunStatus,
      total_customers: agg.total_customers,
      finished_at: run.finishedAt?.toISOString() ?? null,
      data_start: dataStart,
    },
    lifecycle: agg.lifecycle,
    lifecycle_detail: { churned_ever_paid: agg.churned_ever_paid },
    churn: {
      eligible_count: agg.churn_eligible,
      by_risk: agg.churn_by_risk,
      thresholds: {
        medium: th?.medium ?? DEFAULT_RISK_THRESHOLDS.medium,
        high: th?.high ?? DEFAULT_RISK_THRESHOLDS.high,
        critical: th?.critical ?? DEFAULT_RISK_THRESHOLDS.critical,
      },
    },
    revenue: {
      expected_at_risk: agg.revenue_expected_at_risk,
      high_risk_exposure: agg.revenue_high_risk_exposure,
      monthly_actual: monthly,
      top_contributor:
        contributorId == null || contributorMonthly == null ? null : { acc_id: contributorId, monthly: contributorMonthly },
    },
    usage_monthly_senders: senders,
    revenue_concentration: revenueConcentration(payerTotals),
    sending_months: sendingMonths,
    value_risk_matrix: agg.value_risk_matrix.map((row) => ({
      value_tier: row.value_tier as ValueTier,
      risk_level: row.risk_level,
      count: row.count,
      clv_sum: row.clv_sum,
      revenue_at_risk: row.revenue_at_risk,
    })),
    usage_trend: agg.paid_usage_trend,
    credit: {
      demand_30d: agg.credit_demand_30d,
      by_urgency: agg.credit_by_urgency,
      topup_due_7d: agg.credit_topup_due_7d,
      urgent_topup_hit_rate: latestHitRate(creditCard),
    },
    top_priority: topRows.map((row) => ({
      acc_id: row.accId,
      lifecycle_stage: (row.lifecycleStage ?? "Ghost") as LifecycleStage,
      churn_probability: num(row.churnProbability),
      churn_risk_level: (row.churnRiskLevel as RiskLevel | null) ?? null,
      customer_value_tier: (row.customerValueTier as ValueTier | null) ?? null,
      predicted_clv_6m: num(row.predictedClv6m),
      revenue_at_risk: num(row.revenueAtRisk),
      estimated_days_until_topup: row.estimatedDaysUntilTopup,
      priority_score: num(row.priorityScore) ?? 0,
      top_factor: (row.churnFactorsJson as ChurnFactor[] | null)?.[0] ?? null,
      sending_month_flags: flags.get(row.accId) ?? [],
    })),
    model_versions: versions,
  };
}

export const summaryRoutes = new Elysia()
  .use(requireUser)
  .get(
    "/:id/summary",
    async ({ params }) => {
      return buildSummary(await requireRun(params.id));
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  );
