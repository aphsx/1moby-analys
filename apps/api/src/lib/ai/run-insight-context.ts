/**
 * Run-insight context — maps shared RunAggregates to the RunInsightSignals
 * shape expected by the AI base-summary prompt.
 *
 * Uses fetchRunAggregates (apps/api/src/lib/run-aggregates.ts) so the
 * insight service and the summary route never drift on aggregation logic.
 */

import type { RiskLevel, UrgencyLevel, ValueTier } from "../ml-contract";
import { fetchRunAggregates } from "../run-aggregates";

export type RunInsightCohort = {
  value_tier: ValueTier;
  risk_level: RiskLevel;
  count: number;
  clv_sum: number;
  revenue_at_risk: number;
};

export type RunInsightSignals = {
  total_customers: number;
  lifecycle: {
    active_paid: number;
    active_free: number;
    churned: number;
    ghost: number;
  };
  churn: {
    eligible: number;
    by_risk: Record<RiskLevel, number>;
    high_plus_critical: number;
  };
  usage_trend: {
    increasing: number;
    stable: number;
    declining: number;
    no_usage: number;
  };
  credit: {
    demand_30d: number;
    by_urgency: Record<UrgencyLevel, number>;
    topup_due_7d: number;
  };
  revenue: { expected_at_risk: number; high_risk_exposure: number };
  /** Active-paid value×risk cells sorted by revenue at risk (largest exposure first). */
  notable_cohorts: RunInsightCohort[];
};

export async function buildRunInsightSignals(
  runId: string
): Promise<RunInsightSignals> {
  const agg = await fetchRunAggregates(runId);

  const notable = agg.value_risk_matrix
    .sort((a, b) => b.revenue_at_risk - a.revenue_at_risk)
    .slice(0, 6);

  return {
    churn: {
      by_risk: agg.churn_by_risk,
      eligible: agg.churn_eligible,
      high_plus_critical: agg.churn_by_risk.high + agg.churn_by_risk.critical,
    },
    credit: {
      by_urgency: agg.credit_by_urgency,
      demand_30d: agg.credit_demand_30d,
      topup_due_7d: agg.credit_topup_due_7d,
    },
    lifecycle: agg.lifecycle,
    notable_cohorts: notable,
    revenue: {
      expected_at_risk: agg.revenue_expected_at_risk,
      high_risk_exposure: agg.revenue_high_risk_exposure,
    },
    total_customers: agg.total_customers,
    usage_trend: agg.usage_trend,
  };
}
