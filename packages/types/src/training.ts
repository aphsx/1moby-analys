import type { RunStatus } from "./enums";

export interface TrainingRunResult {
  baseline_name: string;
  baseline_value: number;
  calibration_ece: number | null;
  leakage_passed: boolean;
  model_type: "churn" | "clv" | "credit";
  new_version: string | null;
  primary_metric_name: string;
  primary_metric_value: number;
  promote_reason: string;
  promoted: boolean;
}

export interface TrainingRun {
  /** Creator's user id (null when the creator's account was deleted). */
  created_by: string | null;
  /** Creator's display name, falling back to email. */
  created_by_name: string | null;
  cutoff_date: string;
  dataset_name: string;
  error_message: string | null;
  finished_at: string | null;
  horizon_days: number;
  id: string;
  progress: { phase: string; pct: number } | null;
  results: TrainingRunResult[] | null;
  started_at: string;
  status: RunStatus;
}
