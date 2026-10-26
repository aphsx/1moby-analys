import { type TrainDataSource } from "@moby/types";

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
