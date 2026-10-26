/**
 * Local helpers for the Prediction Runs page (spec §2.5 + §5).
 * Display-only mapping/formatting — no business logic.
 */

import type { PredictDataSource } from "@/lib/api";

// Run status tone/label live in the shared module (single source for runs + training).
export { runStatusTone, runStatusLabel } from "@/lib/run-status";

/** Poll cadence while a prediction run is in_progress. */
export const RUN_POLL_MS = 3000;

// ── clean_manifest.clean row counts (shape-guarded) ─────────────

export interface CleanCounts {
  customers: number;
  payments: number;
  usage: number;
}

export function getCleanCounts(source: PredictDataSource): CleanCounts | null {
  const manifest: unknown = source.clean_manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return null;
  const clean = (manifest as Record<string, unknown>).clean;
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) return null;
  const counts = clean as Record<string, unknown>;
  const asCount = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  return {
    customers: asCount(counts.customers),
    payments: asCount(counts.payments),
    usage: asCount(counts.usage),
  };
}

// ── Dates (DD MMM YYYY, Asia/Bangkok — spec §5) ─────────────────

const BKK = "Asia/Bangkok";

const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: BKK,
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", DATE_FMT);
}

/** Compact relative time in Thai, e.g. "เพิ่งเริ่ม", "5 นาทีก่อน", "2 ชม. ก่อน", "เมื่อวาน". */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "เพิ่งเริ่ม";
  if (min < 60) return `${min} นาทีก่อน`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม. ก่อน`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "เมื่อวาน";
  if (day < 7) return `${day} วันก่อน`;
  return formatDate(value);
}

/** Today as YYYY-MM-DD in Asia/Bangkok (for <input type="date"> defaults). */
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BKK });
}

/** Default run name per spec: `{source name} — {วันนี้}`. */
export function defaultRunName(sourceName: string): string {
  return `${sourceName} — ${formatDate(todayISO())}`;
}
