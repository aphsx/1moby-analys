/**
 * Shared display formatters (rules in docs/ui/CONTENT.md §2). Single source of truth — do not
 * redefine per-page copies of these helpers.
 */

const LOCALE = "th-TH";
const TZ = "Asia/Bangkok";
const MINUS = "−"; // U+2212
const nf = (o?: Intl.NumberFormatOptions) => new Intl.NumberFormat(LOCALE, o);
const INT = nf({ maximumFractionDigits: 0 });
const ONE_DP = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 2572 → "2,572" */
export const formatCount = (n: number) => INT.format(n);

/** −18400 → "−฿18,400" */
export function formatBaht(v: number): string {
  const r = Math.round(v);
  return (r < 0 ? MINUS : "") + "฿" + INT.format(Math.abs(r));
}

function compact(a: number): string {
  // 999,999 rounds to 1,000K, so it belongs in M
  if (a >= 1_000_000 || Math.round(a / 1_000) >= 1_000) return `${ONE_DP.format(a / 1_000_000)}M`;
  if (a >= 1_000) return `${INT.format(a / 1_000)}K`;
  return INT.format(a);
}

/** 26_400_000 → "฿26.4M", 850_000 → "฿850K", below 1,000 → full baht. */
export function formatBahtCompact(v: number): string {
  if (Math.abs(v) < 1_000) return formatBaht(v);
  return (v < 0 ? MINUS : "") + "฿" + compact(Math.abs(v));
}

/** Counts and credits on chart axes: 1_240_000 → "1.2M", 850_000 → "850K". */
export function formatCountCompact(v: number): string {
  return (v < 0 ? MINUS : "") + compact(Math.abs(v));
}

/** 12400 → "12,400 เครดิต" */
export const formatCredits = (v: number) => `${INT.format(v)} เครดิต`;

/** Fraction → percent: 0.78 → "78%", (0.198, 1) → "19.8%". */
export const formatPercent = (p: number, digits = 0) =>
  nf({ style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(p);

/** 0.042 → "+4.2%", −0.042 → "−4.2%". Callers add the base ("จากปี 2567"). */
export function formatSignedPercent(p: number, digits = 1): string {
  const body = formatPercent(Math.abs(p), digits);
  if (body === formatPercent(0, digits)) return body;
  return p > 0 ? `+${body}` : `${MINUS}${body}`;
}

/** Days from the cutoff: 41 → "ใน 41 วัน", > 90 → "เกิน 90 วัน", null → "—". */
export function formatDaysAhead(days: number | null | undefined): string {
  if (days == null) return "—";
  const d = Math.round(days);
  if (d <= 0) return "วันนี้"; // ponytail: overdue shows as today; CONTENT.md has no wording for it yet
  return d > 90 ? "เกิน 90 วัน" : `ใน ${d} วัน`;
}

/** Days in the past: 0 → "วันนี้", 1 → "เมื่อวาน", 12 → "12 วันก่อน". */
export function formatDaysAgo(days: number | null | undefined): string {
  if (days == null) return "—";
  const d = Math.round(days);
  if (d <= 0) return "วันนี้";
  return d === 1 ? "เมื่อวาน" : `${INT.format(d)} วันก่อน`;
}

// th-TH uses the Buddhist calendar: 2026-01-01 → "1 ม.ค. 2569"
const DATE = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ,
});
const TIME = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: TZ });

const toDate = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));

/** ISO / epoch → "1 ม.ค. 2569"; null → "—". */
export function formatDate(v: string | number | Date | null | undefined): string {
  if (v == null || v === "") return "—";
  const d = toDate(v);
  return Number.isNaN(d.getTime()) ? "—" : DATE.format(d);
}

/** ISO / epoch → "1 ม.ค. 2569 14:05"; null → "—". */
export function formatDateTime(v: string | number | Date | null | undefined): string {
  if (v == null || v === "") return "—";
  const d = toDate(v);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d);
}

/** Epoch ms → "14:05" in Bangkok time. */
export const formatTime = (ts: number) => TIME.format(new Date(ts));

/** "2025-01" → "ม.ค.", or "ม.ค. 68" when withYear. */
export function formatMonth(ym: string, withYear = false): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat(LOCALE, { month: "short", ...(withYear ? { year: "2-digit" } : {}), timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}
