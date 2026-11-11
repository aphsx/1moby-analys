import { type TrainingRunResult } from "@moby/types";

export const DEFAULT_HORIZON_DAYS = 180;

export const MODEL_TYPE_LABELS: Record<TrainingRunResult["model_type"], string> = {
  churn: "Churn",
  clv: "CLV",
  credit: "Credit",
};

/** 0.712 → "0.712", 0.5700 → "0.57" */
export function formatMetric(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function beatsBaseline(result: TrainingRunResult): boolean {
  return result.primary_metric_value > result.baseline_value;
}

/** Compact summary for the history table, e.g. "churn PR-AUC 0.712 ✓" */
export function primaryResultSummary(results: TrainingRunResult[] | null): string | null {
  if (!results || results.length === 0) return null;
  const primary = results.find((r) => r.model_type === "churn") ?? results[0];
  return `${primary.model_type} ${primary.primary_metric_name} ${formatMetric(primary.primary_metric_value)} ${
    beatsBaseline(primary) ? "ดีกว่า baseline" : "ไม่ดีกว่า baseline"
  }`;
}

/** "3/3 promoted" */
export function promotedSummary(results: TrainingRunResult[] | null): string | null {
  if (!results || results.length === 0) return null;
  const promoted = results.filter((r) => r.promoted).length;
  return `${promoted}/${results.length} promoted`;
}

// ── Train Data Sources ──

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
