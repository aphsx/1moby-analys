import { describe, expect, test } from "bun:test";
import { type RunSummary } from "@moby/types";
import { overviewModel } from "./overview-model";

const months = (n: number, start: string, amount: (i: number) => number) => {
  const [y, m] = start.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return { month: d.toISOString().slice(0, 7), amount: amount(i), n_payments: 1 };
  });
};

function summary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    run: { id: "r", name: "r", cutoff_date: "2026-01-01", status: "completed", total_customers: 100, finished_at: null },
    lifecycle: { active_paid: 50, active_free: 10, churned: 20, ghost: 20 },
    churn: { eligible_count: 45, by_risk: { low: 20, medium: 10, high: 10, critical: 5 }, thresholds: { medium: 0.17, high: 0.35, critical: 0.74 } },
    revenue: { expected_at_risk: 1_000, high_risk_exposure: 0, monthly_actual: months(24, "2024-01", (i) => (i < 12 ? 100 : 110)) },
    value_risk_matrix: [
      { value_tier: "high", risk_level: "critical", count: 3, clv_sum: 900, revenue_at_risk: 500 },
      { value_tier: "high", risk_level: "high", count: 2, clv_sum: 600, revenue_at_risk: 250 },
      { value_tier: "mid", risk_level: "high", count: 4, clv_sum: 400, revenue_at_risk: 200 },
      { value_tier: "low", risk_level: "low", count: 36, clv_sum: 100, revenue_at_risk: 50 },
    ],
    usage_trend: { increasing: 1, stable: 1, declining: 1, no_usage: 7 },
    credit: { demand_30d: 0, by_urgency: { critical: 1, warning: 2, monitor: 3, stable: 4 }, topup_due_7d: 1 },
    top_priority: [],
    model_versions: { churn: "", clv: "", credit: "" },
    ...over,
  };
}

describe("overviewModel", () => {
  test("map cells sum to revenue at risk; call-first is high value × high/critical", () => {
    const m = overviewModel(summary());
    expect(m.atRisk).toBe(1_000);
    expect(m.cells).toHaveLength(12);
    expect(m.callFirst).toEqual({ count: 5, revenueAtRisk: 750, share: 0.75 });
    expect(m.highTier).toEqual({ count: 5, share: 0.75 });
    expect(m.unscored).toBe(5);
    expect(m.clvTotal).toBe(2_000);
  });

  test("last 12 months against the 12 before, month by month", () => {
    const m = overviewModel(summary());
    expect(m.revenue12m).toBe(1_320);
    expect(m.revenuePrev12m).toBe(1_200);
    expect(m.revenueChange).toBeCloseTo(0.1);
    expect(m.months).toHaveLength(12);
    expect(m.months[0]).toMatchObject({ month: "2025-01", recent: 110, previous: 100, label: "ม.ค. 68" });
    expect(m.months[1].label).toBe("ก.พ.");
  });

  test("no previous year: no change and a zero comparison line", () => {
    const s = summary();
    s.revenue.monthly_actual = months(12, "2025-01", () => 10);
    const m = overviewModel(s);
    expect(m.revenueChange).toBeNull();
    expect(m.months[0].previous).toBe(0);
    expect(m.revenue12m).toBe(120);
  });
});
