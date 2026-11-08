/**
 * Pure numbers behind the customer page. Everything is measured from the run's cutoff, not from
 * today: the data stops at the cutoff, so "today" would make every customer look idle.
 */
import type { MonthlyUsagePoint, PaymentEvent, PredictionOutput } from "@moby/types";
import { formatBaht, formatCredits, formatDate, formatPercent } from "@/lib/format";
import { RISK_LABEL } from "@/lib/labels";

const DAY_MS = 86_400_000;
/** The last top-up counts as overdue past this multiple of the usual cycle (CUSTOMER-PAGES.md §3.1). */
const OVERDUE_RATIO = 1.5;

/** 3.24 → "เลยรอบปกติ 3.2 เท่า"; from 10x up a decimal only adds noise. */
export const overdueLabel = (ratio: number) => `เลยรอบปกติ ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)} เท่า`;

export const daysBetween = (fromIso: string, toMs: number) => Math.round((toMs - Date.parse(fromIso)) / DAY_MS);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface TopupStats {
  /** days between consecutive top-up dates, oldest first; same-day payments count as one top-up */
  gaps: number[];
  usualCycle: number | null;
  lastDate: string | null;
  lastAmount: number | null;
  daysSinceLast: number | null;
  /** daysSinceLast / usualCycle, only once it is past OVERDUE_RATIO */
  overdueRatio: number | null;
}

export function topupStats(payments: PaymentEvent[], cutoffMs: number): TopupStats {
  const days = [...new Set(payments.map((p) => Math.floor(Date.parse(p.payment_date) / DAY_MS)))].sort((a, b) => a - b);
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const usualCycle = median(gaps);
  const last = payments.reduce<PaymentEvent | null>((a, p) => (!a || p.payment_date > a.payment_date ? p : a), null);
  const daysSinceLast = last ? daysBetween(last.payment_date, cutoffMs) : null;
  const ratio = daysSinceLast != null && usualCycle ? daysSinceLast / usualCycle : null;
  return {
    gaps,
    usualCycle,
    lastDate: last?.payment_date ?? null,
    lastAmount: last?.amount ?? null,
    daysSinceLast,
    overdueRatio: ratio != null && ratio > OVERDUE_RATIO ? ratio : null,
  };
}

/** Each payment with the days since the previous top-up date (null for the first); newest first. */
export function paymentHistory(payments: PaymentEvent[]): (PaymentEvent & { gap: number | null })[] {
  const sorted = [...payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  return sorted.map((p) => {
    const day = Math.floor(Date.parse(p.payment_date) / DAY_MS);
    const earlier = sorted.find((q) => Math.floor(Date.parse(q.payment_date) / DAY_MS) < day);
    return { ...p, gap: earlier ? day - Math.floor(Date.parse(earlier.payment_date) / DAY_MS) : null };
  });
}

/** Paid in the 12 months before the cutoff, and in the 12 before that. */
export function paidByYear(payments: PaymentEvent[], cutoffMs: number) {
  const back = (years: number) => {
    const d = new Date(cutoffMs);
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d.getTime();
  };
  const between = (from: number, to: number) =>
    payments.filter((p) => {
      const t = Date.parse(p.payment_date);
      return t >= from && t < to;
    });
  const recent = between(back(1), cutoffMs);
  const sum = (rows: PaymentEvent[]) => rows.reduce((s, p) => s + p.amount, 0);
  return { recent: sum(recent), recentCount: recent.length, previous: sum(between(back(2), back(1))) };
}

/** Months with no usage at the end of the series. */
export function trailingIdleMonths(usage: MonthlyUsagePoint[]): number {
  let n = 0;
  for (let i = usage.length - 1; i >= 0 && usage[i].total <= 0; i--) n++;
  return n;
}

export interface Finding {
  sentence: string;
  evidence: string | null;
  /** orange is reserved for risk, so a quiet account gets the neutral box */
  alert: boolean;
}

/** ข้อสังเกตและข้อมูลสำคัญสำหรับการตัดสินใจ: written from rules, not an LLM, so it never states what the data does not show. */
export function buildFinding(c: PredictionOutput, payments: PaymentEvent[], usage: MonthlyUsagePoint[], cutoffMs: number): Finding {
  // Orange is for accounts we could still lose; Churned and Ghost are not retention work
  const alert = c.lifecycle_stage === "Active Paid";
  const idle = trailingIdleMonths(usage);
  const neverUsed = usage.length > 0 && idle === usage.length;
  const t = topupStats(payments, cutoffMs);
  const credit = (c.profile_snapshot?.credit_sms ?? 0) + (c.profile_snapshot?.credit_email ?? 0);
  const lastTopup = t.lastDate && t.lastAmount != null ? `เติมล่าสุด ${formatBaht(t.lastAmount)} เมื่อ ${formatDate(t.lastDate)}` : null;
  const creditLeft = credit > 0 ? `เครดิตยังเหลือ ${formatCredits(credit)}` : null;

  const evidence = [
    c.churn_probability != null && c.churn_risk_level ? `โอกาสเลิกใช้ ${formatPercent(c.churn_probability)} (${RISK_LABEL[c.churn_risk_level]})` : null,
    t.usualCycle != null ? `รอบเติมปกติ ${Math.round(t.usualCycle)} วัน` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (neverUsed || idle >= 2) {
    const head = neverUsed ? `ไม่มีการส่งข้อความในรอบ ${usage.length} เดือน` : `ไม่มีการส่งข้อความมา ${idle} เดือน`;
    return { sentence: [head, lastTopup, creditLeft].filter(Boolean).join(" · "), evidence: evidence || null, alert };
  }
  if (t.overdueRatio != null && t.daysSinceLast != null) {
    return {
      sentence: `ไม่ได้เติมเงินมา ${t.daysSinceLast} วัน ${overdueLabel(t.overdueRatio)}`,
      evidence: [lastTopup, creditLeft].filter(Boolean).join(" · ") || null,
      alert,
    };
  }
  if (c.churn_risk_level === "critical" || c.churn_risk_level === "high") {
    return {
      sentence: `โมเดลให้ความเสี่ยงระดับ${RISK_LABEL[c.churn_risk_level]} แม้ยังใช้งานและเติมเงินตามรอบ`,
      evidence: evidence || null,
      alert: true,
    };
  }
  return { sentence: "ไม่พบสัญญาณเตือนจากการใช้งานและการเติมเงิน", evidence: [lastTopup, creditLeft].filter(Boolean).join(" · ") || null, alert: false };
}

export interface CustomerEvent {
  date: string;
  label: string;
}

/**
 * Newest first: the prediction, last login, last send, and recent top-ups. The profile snapshot can
 * hold dates after the cutoff; they are left out so the timeline agrees with the charts.
 */
export function recentEvents(c: PredictionOutput, payments: PaymentEvent[], cutoff: string, limit = 6): CustomerEvent[] {
  const s = c.profile_snapshot;
  const events: CustomerEvent[] = [];
  if (c.churn_probability != null) events.push({ date: cutoff, label: `ทำนายโอกาสเลิกใช้ ${formatPercent(c.churn_probability)}` });
  if (s?.last_access) events.push({ date: s.last_access, label: "เข้าระบบล่าสุด" });
  if (s?.last_send) events.push({ date: s.last_send, label: "ส่งข้อความล่าสุด" });
  for (const p of payments) events.push({ date: p.payment_date, label: `เติมเงิน ${formatBaht(p.amount)}` });
  return events.filter((e) => e.date.slice(0, 10) <= cutoff.slice(0, 10)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
