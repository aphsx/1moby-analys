export interface SplitMetrics {
  metrics: Record<string, number>;
  split: "validation" | "test" | "backtest_avg";
}

/**
 * One competing candidate from a training run's model competition. The champion
 * (is_champion) is the version currently promoted to the `production` alias;
 * the others were trained and ranked in the same run but not promoted.
 */
export interface CandidateResult {
  algorithm: string;
  cv_metric: string;
  cv_score: number | null;
  gate_passed?: boolean;
  is_champion: boolean;
  reason?: string;
  test_score?: number | null;
}

/** A trained model version, for the production-override version picker. */
export interface ModelVersionSummary {
  algorithm: string;
  id: string;
  is_active: boolean;
  model_type: string;
  primary_metric_name: string;
  primary_metric_value: number | null;
  status: string;
  trained_at: string | null;
  version: string;
}

export interface ModelPerfEntry {
  algorithm: string;
  baselines: { name: string; metrics: Record<string, number> }[];
  calibration?: { prob_pred: number[]; prob_true: number[]; ece: number };
  competition?: CandidateResult[];
  confusion?: {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    threshold: number;
  };
  cutoff_date: string | null;
  dataset_rows: number | null;
  feature_set: string | null;
  lift_table?: { decile: number; share_of_churners: number; lift: number }[];
  method: string;
  model_type: "lifecycle" | "churn" | "clv" | "credit";
  notes?: string;
  primary_metric: {
    name: string;
    value: number | string;
    baseline?: number;
    baseline_name?: string;
  };
  splits: SplitMetrics[];
  thresholds?: Record<string, number>;
  trained_at: string | null;
  version: string | null;
}
