/**
 * Pure calculations behind the overview facts (DASHBOARD.md §7–8), kept apart from the SQL in
 * summary-facts.ts so they can be tested without a database.
 */
import { type RunSummary } from "@moby/types";

const DAY_MS = 86_400_000;
/** The scoring window of the churn features (features.py › usage_active_months_180d). */
export const WINDOW_DAYS = 180;

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

/** Month stamps (YYYY-MM) inside [date − 180 d, date): 5 of them for a month-start date. */
export function sendingWindow(date: string): string[] {
  const end = utc(date);
  const start = new Date(end.getTime() - WINDOW_DAYS * DAY_MS);
  const months: string[] = [];
  for (let d = addMonths(start, 0); d < end; d = addMonths(d, 1)) {
    if (d >= start) months.push(ymd(d).slice(0, 7));
  }
  return months;
}

/** The Backtest date: six months before the cutoff, always the first of a month. */
export const backtestDate = (cutoffDate: string) => ymd(addMonths(utc(cutoffDate), -6));

/** A Backtest needs 180 days of history before its date, i.e. 12 months before the cutoff. */
export const canBacktest = (cutoffDate: string, dataStart: string | null) =>
  dataStart != null && dataStart <= ymd(addMonths(utc(cutoffDate), -12)).slice(0, 7);

export type PayerTotal = { acc_id: number; total: number; h2: number };

export function revenueConcentration(rows: PayerTotal[]): RunSummary["revenue_concentration"] {
  const ranked = [...rows].sort((a, b) => b.total - a.total || a.acc_id - b.acc_id);
  const n = ranked.length;
  if (n === 0) return null;
  const cuts = [Math.ceil(0.01 * n), Math.ceil(0.05 * n), Math.ceil(0.1 * n), n];
  const keys = ["top1", "top5", "top10", "rest"] as const;
  let from = 0;
  const tiers = keys.map((key, i) => {
    const slice = ranked.slice(from, cuts[i]);
    const tier = { key, from_rank: from + 1, to_rank: cuts[i], payers: slice.length, revenue: sum(slice.map((r) => r.total)) };
    from = Math.max(from, cuts[i]);
    return tier;
  });
  const avgTop1 = tiers[0].revenue / tiers[0].payers;
  let k = 0;
  for (let i = n - 1, run = 0; i >= 0 && run + ranked[i].total < avgTop1; i--, k++) run += ranked[i].total;
  return {
    payers: n,
    revenue: sum(ranked.map((r) => r.total)),
    tiers,
    avg_top1: avgTop1,
    bottom_k_below_top1_avg: k,
  };
}

/** The account whose second-half revenue grew the most over its first half; null when revenue fell. */
export function topContributorId(rows: PayerTotal[]): number | null {
  let net = 0;
  let best: { acc_id: number; inc: number } | null = null;
  for (const r of rows) {
    const inc = 2 * r.h2 - r.total; // h2 − h1
    net += inc;
    if (!best || inc > best.inc || (inc === best.inc && r.acc_id < best.acc_id)) best = { acc_id: r.acc_id, inc };
  }
  return net > 0 && best && best.inc > 0 ? best.acc_id : null;
}

export type ModelCard = {
  thresholds?: { medium?: number; high?: number; critical?: number };
  backtests?: { cutoff_date?: string; metrics?: { urgent_topup_precision?: number | null } }[];
} | null;

/** `urgent_topup_precision` of the latest backtest in a credit model card. */
export function latestHitRate(card: ModelCard): number | null {
  const withRate = (card?.backtests ?? []).filter(
    (b) => b.cutoff_date && typeof b.metrics?.urgent_topup_precision === "number"
  );
  withRate.sort((a, b) => b.cutoff_date!.localeCompare(a.cutoff_date!));
  return withRate[0]?.metrics?.urgent_topup_precision ?? null;
}
