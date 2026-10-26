/**
 * Every number on the overview page, derived once from RunSummary (docs/ui/DESIGN.md §1.6): a
 * figure shown in two places reads the same field here, and totals are summed from the rows shown.
 */
import { type RiskLevel, type RunSummary, type ValueTier } from "@moby/types";
import { formatMonth } from "@/lib/format";

export const MAP_TIERS = ["high", "mid", "low"] as const satisfies readonly ValueTier[];
export const MAP_RISKS = ["low", "medium", "high", "critical"] as const satisfies readonly RiskLevel[];
const CALL_FIRST_RISKS: readonly RiskLevel[] = ["high", "critical"];

export type MapCell = { tier: ValueTier; risk: RiskLevel; count: number; revenueAtRisk: number };

export type MonthPoint = { month: string; label: string; recent: number; previous: number };

export type OverviewModel = {
  /** Revenue at risk, summed from the map cells (equals revenue.expected_at_risk). */
  atRisk: number;
  /** 6-month value of the scored customers. */
  clvTotal: number;
  scored: number;
  /** Active Paid customers with no churn score yet (under 90 days of tenure). */
  unscored: number;
  /** The high value tier across every risk level. */
  highTier: { count: number; share: number };
  /** High value × high/critical risk: the "ต้องโทรก่อน" group. */
  callFirst: { count: number; revenueAtRisk: number; share: number };
  cells: MapCell[];
  revenue12m: number;
  revenuePrev12m: number;
  /** Change of the last 12 months against the 12 before; null without a previous year. */
  revenueChange: number | null;
  months: MonthPoint[];
  paidCustomers: number;
  paidNoUsage: number;
};

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

export function overviewModel(s: RunSummary): OverviewModel {
  const cells: MapCell[] = MAP_TIERS.flatMap((tier) =>
    MAP_RISKS.map((risk) => {
      const row = s.value_risk_matrix.find((c) => c.value_tier === tier && c.risk_level === risk);
      return { tier, risk, count: row?.count ?? 0, revenueAtRisk: row?.revenue_at_risk ?? 0 };
    })
  );
  const atRisk = sum(cells.map((c) => c.revenueAtRisk));

  const highCells = cells.filter((c) => c.tier === "high");
  const callFirstCells = cells.filter((c) => c.tier === "high" && CALL_FIRST_RISKS.includes(c.risk));
  const callFirstRevenue = sum(callFirstCells.map((c) => c.revenueAtRisk));

  // monthly_actual is the 24 months before the cutoff, oldest first
  const monthly = s.revenue.monthly_actual;
  const previous = monthly.slice(0, Math.max(0, monthly.length - 12));
  const recent = monthly.slice(-12);
  const revenue12m = sum(recent.map((m) => m.amount));
  const revenuePrev12m = sum(previous.map((m) => m.amount));
  const months = recent.map((m, i) => ({
    month: m.month,
    label: formatMonth(m.month, i === 0 || m.month.endsWith("-01")),
    recent: m.amount,
    previous: previous[i - (recent.length - previous.length)]?.amount ?? 0,
  }));

  return {
    atRisk,
    clvTotal: sum(s.value_risk_matrix.map((c) => c.clv_sum)),
    scored: s.churn.eligible_count,
    unscored: Math.max(0, s.lifecycle.active_paid - s.churn.eligible_count),
    highTier: {
      count: sum(highCells.map((c) => c.count)),
      share: atRisk > 0 ? sum(highCells.map((c) => c.revenueAtRisk)) / atRisk : 0,
    },
    callFirst: {
      count: sum(callFirstCells.map((c) => c.count)),
      revenueAtRisk: callFirstRevenue,
      share: atRisk > 0 ? callFirstRevenue / atRisk : 0,
    },
    cells,
    revenue12m,
    revenuePrev12m,
    revenueChange: previous.length === 12 && revenuePrev12m > 0 ? revenue12m / revenuePrev12m - 1 : null,
    months,
    paidCustomers: s.lifecycle.active_paid,
    paidNoUsage: s.usage_trend.no_usage,
  };
}

/** The KPI must equal the map it summarises; a gap means the API scopes drifted apart. */
export function assertAtRiskMatches(model: OverviewModel, s: RunSummary): void {
  if (process.env.NODE_ENV === "production") return;
  const gap = Math.abs(model.atRisk - s.revenue.expected_at_risk);
  if (gap > 1) console.error(`overview: map sums to ${model.atRisk}, expected_at_risk is ${s.revenue.expected_at_risk}`);
}
