import type { TrainDataSource } from "@/lib/api";
import { MOBY_BRAND } from "@/lib/login-brand-colors";

export const IMPORT_PROGRESS_BG = `linear-gradient(90deg, ${MOBY_BRAND.blueLight} 0%, ${MOBY_BRAND.blue} 100%)`;

export const PRIMARY_BUTTON_CLS =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[color:var(--moby-600)] px-4 text-[13px] font-semibold text-white shadow-[0_16px_34px_rgba(0,107,255,0.14)] hover:bg-[color:var(--moby-800)] disabled:opacity-50";

export type CleanCounts = {
  customers: number;
  payments: number;
  usage: number;
};

export function getCleanCounts(source: TrainDataSource | null): CleanCounts | null {
  const cleanManifest = source?.clean_manifest;
  if (!cleanManifest || typeof cleanManifest !== "object" || Array.isArray(cleanManifest)) return null;
  const clean = (cleanManifest as Record<string, unknown>).clean;
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) return null;
  const counts = clean as Record<string, unknown>;
  return {
    customers: Number(counts.customers ?? 0),
    payments: Number(counts.payments ?? 0),
    usage: Number(counts.usage ?? 0),
  };
}

export function statusLabel(status: string): string {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "cleaning") return "Cleaning";
  if (status === "importing") return "Importing";
  return "No dataset";
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
}

export function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
