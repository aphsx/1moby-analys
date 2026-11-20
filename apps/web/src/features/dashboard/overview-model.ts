/**
 * Every number on the overview page, derived once from RunSummary (docs/ui/DESIGN.md §1.6,
 * DASHBOARD.md §11.3): a figure shown in two places reads the same field here, and totals are
 * summed from the rows shown.
 */
import { type LifecycleStage, type RiskLevel, type RunSummary, type ValueTier } from "@moby/types";
import { formatMonth, formatPercent } from "@/lib/format";

/** `none` = scored customers predicted to pay ฿0 (DASHBOARD.md R5), so columns sum to churn.by_risk. */
export const MAP_TIERS = ["high", "mid", "low", "none"] as const satisfies readonly ValueTier[];
export const MAP_RISKS = ["low", "medium", "high", "critical"] as const satisfies readonly RiskLevel[];

/**
 * ฿ at risk per heat-grid cell → fill bins 0..4. Fixed so runs compare (DASHBOARD.md D3).
 * ponytail: revisit if a real run puts every cell in one bin.
 */
export const HEAT_BREAKS = [500_000, 1_000_000, 2_000_000, 5_000_000];
export type HeatBin = 0 | 1 | 2 | 3 | 4;
export const heatBin = (v: number) => HEAT_BREAKS.filter((b) => v >= b).length as HeatBin;

/** The Call List head is named in the finding when this few rows hold this share of the money. */
const HEAD_MAX_ROWS = 10;
const HEAD_MIN_SHARE = 0.25;
/** The trend note leads with one account when it drives more than this share of the growth. */
const CONTRIBUTOR_SHARE = 0.5;
/** A half-year average needs this many months with data. */
const HALF_MIN_MONTHS = 3;

export type MapCell = { tier: ValueTier; risk: RiskLevel; count: number; revenueAtRisk: number; bin: HeatBin };

export type TrendMetric = "rev" | "pay" | "mau";
export type TrendSeries = {
  months: { month: string; label: string; value: number }[];
  /** Monthly means of each half; null when a half has fewer than 3 months with data. */
  h1: number | null;
  h2: number | null;
  growth: number | null;
  maxIndex: number;
  ticks: number[];
};

export type TopContributor = {
  accId: number;
  /** Its share of the second-half increase. */
  share: number;
  /** Revenue growth and revenue-per-payer growth without it. */
  growthEx: number | null;
  arppuGrowthEx: number | null;
  /** Its first paying month, when that falls in the second half. */
  firstMonth: string | null;
};

export type BaseState = { key: LifecycleStage; count: number; share: number };

export type TopupRow = { key: "d7" | "d14" | "d30" | "d90" | "later"; count: number; urgent: boolean };

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
  cells: MapCell[];
  colTotals: Record<RiskLevel, { count: number; revenueAtRisk: number }>;
  /** The cell with the most money at risk. */
  defaultCell: { tier: ValueTier; risk: RiskLevel };
  /** The fewest Call List rows holding ≥ 25% of the money at risk; null when 10 rows hold less. */
  callListHead: { count: number; share: number } | null;
  revenue12m: number;
  /** Last 12 months against the 12 before; null without a previous year. */
  revenueChange: number | null;
  /** Payments of the last 6 months, set against the 6-month CLV (DASHBOARD.md R11). */
  revenueLast6m: number;
  /** BE year label of the 12-month window, e.g. "2568" or "ก.พ. 68–ม.ค. 69". */
  yearLabel: string;
  trend: Record<TrendMetric, TrendSeries>;
  arppu: { h1: number; h2: number; growth: number } | null;
  topContributor: TopContributor | null;
  active: number;
  highRisk: { critical: number; high: number; eligible: number };
  base: BaseState[];
  totalCustomers: number;
  topup: TopupRow[];
};

/** "โต 6%" / "ลดลง 4%" */
export const grew = (x: number) => (x >= 0 ? `โต ${formatPercent(x)}` : `ลดลง ${formatPercent(-x)}`);

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b - 1 : null);

/** Smallest step from {1, 2, 2.5, 5} × 10ⁿ that covers `max` in at most 6 intervals. */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0];
  const steps = [1, 2, 2.5, 5];
  for (let exp = Math.floor(Math.log10(max)) - 1; ; exp++) {
    for (const s of steps) {
      const step = s * 10 ** exp;
      const n = Math.ceil(max / step);
      if (n <= 6) return Array.from({ length: n + 1 }, (_, i) => i * step);
    }
  }
}

function series(months: string[], values: number[], hasData: boolean[]): TrendSeries {
  const halves = [0, 6].map((from) => values.slice(from, from + 6).filter((_, i) => hasData[from + i]));
  const [h1, h2] = halves.map((h) => (h.length >= HALF_MIN_MONTHS ? mean(h) : null));
  const max = Math.max(0, ...values);
  return {
    months: months.map((month, i) => ({ month, label: formatMonth(month), value: values[i] })),
    h1,
    h2,
    growth: h1 != null && h2 != null ? ratio(h2, h1) : null,
    maxIndex: values.indexOf(max),
    ticks: niceTicks(max),
  };
}

/** Revenue per payer for each half; null when a half has no payers. */
function arppu(rev: number[], pay: number[]) {
  const [r1, r2] = [sum(rev.slice(0, 6)), sum(rev.slice(6))];
  const [p1, p2] = [sum(pay.slice(0, 6)), sum(pay.slice(6))];
  if (p1 <= 0 || p2 <= 0) return null;
  return { h1: r1 / p1, h2: r2 / p2, growth: r2 / p2 / (r1 / p1) - 1 };
}

function topContributor(s: RunSummary, months: string[], rev: number[], pay: number[]): TopContributor | null {
  const c = s.revenue.top_contributor;
  if (!c || c.monthly.length !== 12) return null;
  const halfSums = (xs: number[]) => [sum(xs.slice(0, 6)), sum(xs.slice(6))];
  const [a1, a2] = halfSums(rev);
  const [c1, c2] = halfSums(c.monthly);
  const net = a2 - a1;
  if (net <= 0) return null;
  const share = (c2 - c1) / net;
  if (share <= CONTRIBUTOR_SHARE) return null;
  const revEx = rev.map((v, i) => v - c.monthly[i]);
  const payEx = pay.map((v, i) => v - (c.monthly[i] > 0 ? 1 : 0));
  const [e1, e2] = halfSums(revEx);
  const first = c.monthly.findIndex((v) => v > 0);
  return {
    accId: c.acc_id,
    share,
    growthEx: ratio(e2, e1),
    arppuGrowthEx: arppu(revEx, payEx)?.growth ?? null,
    firstMonth: first >= 6 ? months[first] : null,
  };
}

function yearLabel(months: string[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return "";
  const year = (ym: string) => String(Number(ym.slice(0, 4)) + 543);
  return first.slice(0, 4) === last.slice(0, 4) ? year(last) : `${formatMonth(first, true)}–${formatMonth(last, true)}`;
}

export function overviewModel(s: RunSummary): OverviewModel {
  const cells: MapCell[] = MAP_TIERS.flatMap((tier) =>
    MAP_RISKS.map((risk) => {
      const row = s.value_risk_matrix.find((c) => c.value_tier === tier && c.risk_level === risk);
      const revenueAtRisk = row?.revenue_at_risk ?? 0;
      return { tier, risk, count: row?.count ?? 0, revenueAtRisk, bin: heatBin(revenueAtRisk) };
    })
  );
  const atRisk = sum(cells.map((c) => c.revenueAtRisk));
  const highCells = cells.filter((c) => c.tier === "high");
  const colTotals = Object.fromEntries(
    MAP_RISKS.map((risk) => {
      const col = cells.filter((c) => c.risk === risk);
      return [risk, { count: sum(col.map((c) => c.count)), revenueAtRisk: sum(col.map((c) => c.revenueAtRisk)) }];
    })
  ) as OverviewModel["colTotals"];
  const top = cells.reduce((best, c) => (c.revenueAtRisk > best.revenueAtRisk ? c : best), cells[0]);

  let callListHead: OverviewModel["callListHead"] = null;
  if (atRisk > 0) {
    let run = 0;
    for (const [i, row] of s.top_priority.slice(0, HEAD_MAX_ROWS).entries()) {
      run += row.revenue_at_risk ?? 0;
      if (run / atRisk >= HEAD_MIN_SHARE) {
        callListHead = { count: i + 1, share: run / atRisk };
        break;
      }
    }
  }

  // monthly_actual and usage_monthly_senders are the 24 months before the cutoff, oldest first
  const monthly = s.revenue.monthly_actual;
  const recent = monthly.slice(-12);
  const previous = monthly.slice(0, Math.max(0, monthly.length - 12));
  const months = recent.map((m) => m.month);
  const hasData = months.map((m) => s.run.data_start != null && m >= s.run.data_start);
  const rev = recent.map((m) => m.amount);
  const pay = recent.map((m) => m.n_payers);
  const sendersByMonth = new Map(s.usage_monthly_senders.map((u) => [u.month, u.senders]));
  const mau = months.map((m) => sendersByMonth.get(m) ?? 0);
  const revenue12m = sum(rev);
  const revenuePrev12m = sum(previous.map((m) => m.amount));

  const lc = s.lifecycle;
  const stages: [LifecycleStage, number][] = [
    ["Active Paid", lc.active_paid],
    ["Active Free", lc.active_free],
    ["Churned", lc.churned],
    ["Ghost", lc.ghost],
  ];
  const total = s.run.total_customers;

  const u = s.credit.by_urgency;
  return {
    atRisk,
    clvTotal: sum(s.value_risk_matrix.map((c) => c.clv_sum)),
    scored: s.churn.eligible_count,
    unscored: Math.max(0, lc.active_paid - s.churn.eligible_count),
    highTier: {
      count: sum(highCells.map((c) => c.count)),
      share: atRisk > 0 ? sum(highCells.map((c) => c.revenueAtRisk)) / atRisk : 0,
    },
    cells,
    colTotals,
    defaultCell: { tier: top.tier, risk: top.risk },
    callListHead,
    revenue12m,
    revenueChange: previous.length === 12 && revenuePrev12m > 0 ? revenue12m / revenuePrev12m - 1 : null,
    revenueLast6m: sum(rev.slice(6)),
    yearLabel: yearLabel(months),
    trend: { rev: series(months, rev, hasData), pay: series(months, pay, hasData), mau: series(months, mau, hasData) },
    arppu: arppu(rev, pay),
    topContributor: topContributor(s, months, rev, pay),
    active: lc.active_paid + lc.active_free,
    highRisk: { critical: s.churn.by_risk.critical, high: s.churn.by_risk.high, eligible: s.churn.eligible_count },
    base: stages.map(([key, count]) => ({ key, count, share: total > 0 ? count / total : 0 })),
    totalCustomers: total,
    topup: [
      { key: "d7", count: s.credit.topup_due_7d, urgent: true },
      { key: "d14", count: Math.max(0, u.critical - s.credit.topup_due_7d), urgent: true },
      { key: "d30", count: u.warning, urgent: false },
      { key: "d90", count: u.monitor, urgent: false },
      { key: "later", count: u.stable, urgent: false },
    ],
  };
}

/** Totals must equal what they summarise; a gap means the API scopes drifted apart. */
export function assertAtRiskMatches(model: OverviewModel, s: RunSummary): void {
  if (process.env.NODE_ENV === "production") return;
  const gap = Math.abs(model.atRisk - s.revenue.expected_at_risk);
  if (gap > 1) console.error(`overview: map sums to ${model.atRisk}, expected_at_risk is ${s.revenue.expected_at_risk}`);
  const base = sum(model.base.map((b) => b.count));
  if (base !== model.totalCustomers) console.error(`overview: lifecycle sums to ${base}, total_customers is ${model.totalCustomers}`);
}
