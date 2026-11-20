import { describe, expect, test } from "bun:test";
import {
  backtestDate,
  canBacktest,
  latestHitRate,
  revenueConcentration,
  sendingWindow,
  topContributorId,
  type PayerTotal,
} from "./overview-math";

describe("sending months window", () => {
  test("a month-start cutoff holds 5 month stamps, not 6", () => {
    expect(sendingWindow("2026-01-01")).toEqual(["2025-08", "2025-09", "2025-10", "2025-11", "2025-12"]);
  });
  test("the Backtest date is six months back, on the first of a month", () => {
    expect(backtestDate("2026-01-01")).toBe("2025-07-01");
    expect(backtestDate("2026-03-01")).toBe("2025-09-01");
  });
  test("a Backtest needs 12 months of data before the cutoff", () => {
    expect(canBacktest("2026-01-01", "2024-01")).toBe(true);
    expect(canBacktest("2026-01-01", "2025-01")).toBe(true);
    expect(canBacktest("2026-01-01", "2025-02")).toBe(false);
    expect(canBacktest("2026-01-01", null)).toBe(false);
  });
});

const payers = (totals: number[]): PayerTotal[] => totals.map((total, i) => ({ acc_id: i + 1, total, h2: total / 2 }));

describe("revenueConcentration", () => {
  test("tiers by rank cover every payer and all revenue", () => {
    // 200 payers: top1 = 2, top5 = 10, top10 = 20
    const c = revenueConcentration(payers(Array.from({ length: 200 }, (_, i) => (i < 2 ? 1_000 : 10))))!;
    expect(c.tiers.map((t) => [t.from_rank, t.to_rank, t.payers])).toEqual([[1, 2, 2], [3, 10, 8], [11, 20, 10], [21, 200, 180]]);
    expect(c.tiers.reduce((a, t) => a + t.payers, 0)).toBe(200);
    expect(c.tiers.reduce((a, t) => a + t.revenue, 0)).toBe(c.revenue);
    expect(c.avg_top1).toBe(1_000);
    // the 99 lowest payers sum to 990 < 1,000; 100 would reach it
    expect(c.bottom_k_below_top1_avg).toBe(99);
  });
  test("no payers → null", () => {
    expect(revenueConcentration([])).toBeNull();
  });
});

describe("topContributorId", () => {
  test("the largest second-half increase wins when revenue grew", () => {
    const rows: PayerTotal[] = [
      { acc_id: 1, total: 100, h2: 50 },
      { acc_id: 2, total: 100, h2: 90 }, // +80
      { acc_id: 3, total: 100, h2: 60 }, // +20
    ];
    expect(topContributorId(rows)).toBe(2);
  });
  test("null when revenue did not grow", () => {
    expect(topContributorId([{ acc_id: 1, total: 100, h2: 40 }, { acc_id: 2, total: 100, h2: 55 }])).toBeNull();
  });
});

describe("latestHitRate", () => {
  test("reads the backtest with the latest cutoff", () => {
    const card = {
      backtests: [
        { cutoff_date: "2025-06-01", metrics: { urgent_topup_precision: 0.26 } },
        { cutoff_date: "2025-08-01", metrics: { urgent_topup_precision: 0.24 } },
        { cutoff_date: "2025-09-01", metrics: {} },
      ],
    };
    expect(latestHitRate(card)).toBe(0.24);
    expect(latestHitRate(null)).toBeNull();
  });
});
