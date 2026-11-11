import { describe, expect, test } from "bun:test";
import { type RiskLevel, type RunSummary, type ValueTier } from "@moby/types";
import { heatBin, niceTicks, overviewModel } from "./overview-model";

const monthKeys = (n: number, start: string) => {
  const [y, m] = start.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7));
};

// Real run 07fc9347… (cutoff 1 ม.ค. 2569), DASHBOARD.md §16
const REV_2568 = [27.59, 26.18, 28.98, 26.24, 34.42, 40.74, 41.17, 35.07, 38.47, 29.86, 39.79, 45.12].map((m) => m * 1e6);
const PAYERS_2568 = [382, 427, 426, 397, 456, 429, 472, 450, 478, 430, 443, 508];
const SENDERS_2568 = [1949, 1907, 2002, 1953, 2129, 2106, 2186, 2130, 2111, 2151, 2279, 2111];
const WHALE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 6_356_068, 11_164_650, 17_130_953];

const MATRIX: [ValueTier, RiskLevel, number, number][] = [
  ["high", "low", 154, 8_378_744], ["high", "medium", 24, 32_882_992], ["high", "high", 22, 5_554_995], ["high", "critical", 1, 302_323],
  ["mid", "low", 551, 1_387_991], ["mid", "medium", 71, 1_053_028], ["mid", "high", 153, 4_794_663], ["mid", "critical", 7, 150_871],
  ["low", "low", 385, 91_142], ["low", "medium", 84, 88_345], ["low", "high", 233, 348_267], ["low", "critical", 58, 120_969],
  ["none", "low", 90, 0], ["none", "medium", 24, 0], ["none", "high", 194, 0], ["none", "critical", 231, 0],
];
const AT_RISK = MATRIX.reduce((a, c) => a + c[3], 0);

function summary(over: Partial<RunSummary> = {}): RunSummary {
  const months = monthKeys(24, "2024-01");
  return {
    run: { id: "r", name: "r", cutoff_date: "2026-01-01", status: "completed", total_customers: 30_697, finished_at: null, data_start: "2024-01" },
    lifecycle: { active_paid: 2_572, active_free: 1_678, churned: 7_174, ghost: 19_273 },
    lifecycle_detail: { churned_ever_paid: 1_914 },
    churn: { eligible_count: 2_282, by_risk: { low: 1_180, medium: 203, high: 602, critical: 297 }, thresholds: { medium: 0.17, high: 0.35, critical: 0.74 } },
    revenue: {
      expected_at_risk: AT_RISK,
      high_risk_exposure: 0,
      monthly_actual: months.map((month, i) => ({
        month,
        amount: i < 12 ? 20e6 : REV_2568[i - 12],
        n_payments: 0,
        n_payers: i < 12 ? 400 : PAYERS_2568[i - 12],
      })),
      top_contributor: { acc_id: 296269, monthly: WHALE },
    },
    usage_monthly_senders: months.map((month, i) => ({ month, senders: i < 12 ? 1_800 : SENDERS_2568[i - 12] })),
    revenue_concentration: null,
    sending_months: { window_months: 5, window_start: "2025-08", backtest_date: "2025-07-01", buckets: [] },
    value_risk_matrix: MATRIX.map(([value_tier, risk_level, count, revenue_at_risk]) => ({ value_tier, risk_level, count, clv_sum: 0, revenue_at_risk })),
    usage_trend: { increasing: 0, stable: 0, declining: 0, no_usage: 457 },
    credit: { demand_30d: 0, by_urgency: { critical: 695, warning: 1_049, monitor: 1_974, stable: 532 }, topup_due_7d: 320, urgent_topup_hit_rate: 0.24 },
    top_priority: [
      { acc_id: 296269, lifecycle_stage: "Active Paid", churn_probability: 0.29, churn_risk_level: "medium", customer_value_tier: "high", predicted_clv_6m: 92.8e6, revenue_at_risk: 27_055_977, estimated_days_until_topup: 20, priority_score: 100, top_factor: null, sending_month_flags: [false, false, true, false, false] },
    ],
    model_versions: { churn: "", clv: "", credit: "" },
    ...over,
  };
}

describe("heat grid", () => {
  test("four tiers: columns sum to churn.by_risk and the grid to eligible_count", () => {
    const m = overviewModel(summary());
    expect(m.cells).toHaveLength(16);
    expect(m.atRisk).toBe(AT_RISK);
    expect(m.colTotals.high.count).toBe(602);
    expect(m.colTotals.critical.count).toBe(297);
    expect(Object.values(m.colTotals).reduce((a, c) => a + c.count, 0)).toBe(2_282);
    expect(m.highTier.count).toBe(201);
    expect(m.highTier.share).toBeCloseTo(0.854, 3);
    expect(m.defaultCell).toEqual({ tier: "high", risk: "medium" });
  });

  test("heat bins at the edges", () => {
    expect(heatBin(0)).toBe(0);
    expect(heatBin(499_999)).toBe(0);
    expect(heatBin(500_000)).toBe(1);
    expect(heatBin(1_000_000)).toBe(2);
    expect(heatBin(5_000_000)).toBe(4);
  });

  test("Call List head: one account holds 49%; none when 10 rows hold under 25%", () => {
    expect(overviewModel(summary()).callListHead).toEqual({ count: 1, share: 27_055_977 / AT_RISK });
    const small = summary();
    small.top_priority = small.top_priority.map((r) => ({ ...r, revenue_at_risk: 1_000 }));
    expect(overviewModel(small).callListHead).toBeNull();
  });
});

describe("trend", () => {
  test("half-year means and growth on the 2568 revenue", () => {
    const rev = overviewModel(summary()).trend.rev;
    expect(rev.h1! / 1e6).toBeCloseTo(30.69, 2);
    expect(rev.h2! / 1e6).toBeCloseTo(38.25, 2);
    expect(rev.growth!).toBeCloseTo(0.246, 3);
    expect(rev.maxIndex).toBe(11);
  });

  test("a half with under 3 months of data has no average", () => {
    const m = overviewModel(summary({ run: { ...summary().run, data_start: "2025-05" } }));
    expect(m.trend.rev.h1).toBeNull();
    expect(m.trend.rev.growth).toBeNull();
  });

  test("nice ticks", () => {
    expect(niceTicks(45.12e6)).toEqual([0, 10, 20, 30, 40, 50].map((v) => v * 1e6));
    expect(niceTicks(508)).toEqual([0, 100, 200, 300, 400, 500, 600]);
    expect(niceTicks(2_279)).toEqual([0, 500, 1_000, 1_500, 2_000, 2_500]);
    expect(niceTicks(0)).toEqual([0]);
  });

  test("top contributor: #296269 is 76% of the growth; without it revenue grows 6%", () => {
    const c = overviewModel(summary()).topContributor!;
    expect(c.accId).toBe(296269);
    expect(c.share).toBeCloseTo(0.764, 3);
    expect(c.growthEx!).toBeCloseTo(0.058, 3);
    expect(c.firstMonth).toBe("2025-10");
  });

  test("no contributor note at exactly half of the growth", () => {
    // revenue grows by 12 in H2; the account adds exactly 6 of it
    const flat = summary();
    flat.revenue.monthly_actual = flat.revenue.monthly_actual.map((m, i) => ({ ...m, amount: i < 18 ? 10 : 12 }));
    flat.revenue.top_contributor = { acc_id: 1, monthly: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1] };
    expect(overviewModel(flat).topContributor).toBeNull();
  });
});

describe("other blocks", () => {
  test("top-up: row 2 = critical − due_7d, never negative; five rows sum to Σ by_urgency", () => {
    const m = overviewModel(summary());
    expect(m.topup.map((r) => r.count)).toEqual([320, 375, 1_049, 1_974, 532]);
    expect(m.topup.reduce((a, r) => a + r.count, 0)).toBe(4_250);
    const odd = summary();
    odd.credit = { ...odd.credit, topup_due_7d: 900 };
    expect(overviewModel(odd).topup[1].count).toBe(0);
  });

  test("base shares sum to 100%", () => {
    const m = overviewModel(summary());
    expect(m.base.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 6);
    expect(m.active).toBe(4_250);
  });

  test("year label: one calendar year, or a span", () => {
    expect(overviewModel(summary()).yearLabel).toBe("2568");
    const s = summary();
    s.revenue.monthly_actual = s.revenue.monthly_actual.map((m, i) => ({ ...m, month: monthKeys(24, "2024-02")[i] }));
    expect(overviewModel(s).yearLabel).toBe("ก.พ. 68–ม.ค. 69");
  });
});
