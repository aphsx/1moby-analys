import { type PredictDataSource, type TrainDataSource } from "@moby/types";
import { formatDate } from "@/lib/format";
/**
 * Local helpers for the Prediction Runs page (spec §2.5 + §5).
 * Display-only mapping/formatting — no business logic.
 */



// ── clean_manifest.clean row counts (shape-guarded) ─────────────

export interface CleanCounts {
  customers: number;
  payments: number;
  usage: number;
}

/** Row counts Clean produced for a train or predict Data Source; null when there is no manifest. */
export function getCleanCounts(source: PredictDataSource | TrainDataSource): CleanCounts | null {
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

/** Text input / select styling shared by the create-run card and the import form. */
export const FIELD_CLASS =
  "mt-1.5 h-11 w-full rounded-card border border-border bg-surface px-3.5 text-small text-text shadow-[var(--shadow-1)] outline-none transition-colors focus:border-accent disabled:opacity-50";
