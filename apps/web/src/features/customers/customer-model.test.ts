import { describe, expect, test } from "bun:test";
import type { MonthlyUsagePoint, PaymentEvent, PredictionOutput } from "@moby/types";
import { buildFinding, paidByYear, paymentHistory, recentEvents, topupStats, trailingIdleMonths } from "./customer-model";

const CUTOFF = Date.parse("2026-01-01T00:00:00Z");
const pay = (date: string, amount = 1000): PaymentEvent => ({ payment_date: `${date}T00:00:00.000Z`, amount, credit_add: 10, credit_type: "sms" });
const month = (total: number, i = 0): MonthlyUsagePoint => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, sms: total, email: 0, bc: total, api: 0, otp: 0, total });
const customer = (over: Partial<PredictionOutput> = {}) =>
  ({ lifecycle_stage: "Active Paid", churn_probability: null, churn_risk_level: null, profile_snapshot: { credit_sms: 0, credit_email: 0, last_access: null, last_send: null }, ...over }) as PredictionOutput;

describe("topupStats", () => {
  test("same-day payments are one top-up, and the usual cycle is the median gap", () => {
    const t = topupStats([pay("2025-12-01"), pay("2025-11-01"), pay("2025-11-01"), pay("2025-10-01")], CUTOFF);
    expect(t.gaps).toEqual([31, 30]);
    expect(t.usualCycle).toBe(30.5);
    expect(t.daysSinceLast).toBe(31);
    expect(t.overdueRatio).toBeNull();
  });

  test("overdue only past 1.5x the usual cycle", () => {
    const t = topupStats([pay("2025-06-02"), pay("2025-05-03"), pay("2025-04-03")], CUTOFF);
    expect(t.overdueRatio).toBeCloseTo(213 / 30, 5);
  });

  test("no payments and a single payment have no cycle", () => {
    expect(topupStats([], CUTOFF).usualCycle).toBeNull();
    const one = topupStats([pay("2025-12-01")], CUTOFF);
    expect(one.usualCycle).toBeNull();
    expect(one.overdueRatio).toBeNull();
  });
});

test("paymentHistory gives same-day payments the same gap, and the first none", () => {
  const rows = paymentHistory([pay("2025-10-01"), pay("2025-11-01"), pay("2025-11-01", 5)]);
  expect(rows.map((r) => r.gap)).toEqual([31, 31, null]);
});

test("paidByYear splits at the cutoff anniversary and leaves out later payments", () => {
  expect(paidByYear([pay("2025-06-01", 10), pay("2025-01-01", 20), pay("2024-06-01", 40), pay("2026-02-01", 80)], CUTOFF)).toEqual({
    recent: 30,
    recentCount: 2,
    previous: 40,
  });
});

test("trailingIdleMonths counts only the end of the series", () => {
  expect(trailingIdleMonths([month(0), month(5), month(0), month(0)])).toBe(2);
  expect(trailingIdleMonths([month(5)])).toBe(0);
  expect(trailingIdleMonths([])).toBe(0);
});

describe("buildFinding", () => {
  test("idle months lead, with the last top-up and credit left", () => {
    const f = buildFinding(customer({ profile_snapshot: { credit_sms: 500, credit_email: 0 } as PredictionOutput["profile_snapshot"] }), [pay("2025-08-12", 1260)], [month(9), month(0), month(0)], CUTOFF);
    expect(f.alert).toBe(true);
    expect(f.sentence).toContain("ไม่มีการส่งข้อความมา 2 เดือน");
    expect(f.sentence).toContain("฿1,260");
    expect(f.sentence).toContain("500 เครดิต");
  });

  test("a fully idle year says so instead of counting months", () => {
    expect(buildFinding(customer(), [], [month(0), month(0)], CUTOFF).sentence).toContain("ในรอบ 2 เดือน");
  });

  test("overdue top-up comes next", () => {
    const f = buildFinding(customer(), [pay("2025-06-02"), pay("2025-05-03"), pay("2025-04-03")], [month(1)], CUTOFF);
    expect(f.sentence).toContain("เลยรอบปกติ 7.1 เท่า");
  });

  test("high risk without other signals still alerts", () => {
    expect(buildFinding(customer({ churn_probability: 0.8, churn_risk_level: "critical" }), [], [month(1)], CUTOFF).alert).toBe(true);
  });

  test("idle Ghost accounts state the fact without the alert", () => {
    expect(buildFinding(customer({ lifecycle_stage: "Ghost" }), [], [month(0)], CUTOFF).alert).toBe(false);
  });

  test("a quiet account does not alert", () => {
    expect(buildFinding(customer({ churn_probability: 0.1, churn_risk_level: "low" }), [], [month(1)], CUTOFF).alert).toBe(false);
  });
});

test("recentEvents leave out dates after the cutoff", () => {
  const events = recentEvents(customer({ profile_snapshot: { last_send: "2026-02-23" } as PredictionOutput["profile_snapshot"] }), [], "2026-01-01");
  expect(events).toEqual([]);
});

test("recentEvents are newest first and leave out what is missing", () => {
  const events = recentEvents(customer({ profile_snapshot: { last_send: "2025-09-01" } as PredictionOutput["profile_snapshot"] }), [pay("2025-08-01")], "2026-01-01");
  expect(events.map((e) => e.label)).toEqual(["ส่งข้อความล่าสุด", "เติมเงิน ฿1,000"]);
});
