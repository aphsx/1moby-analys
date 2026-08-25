import type {
  LifecycleStage,
  RiskLevel,
  RunStatus,
  UrgencyLevel,
  ValueTier,
} from "./enums";

export interface ChurnFactor {
  direction: "up" | "down";
  feature: string;
  impact: number;
  value: number | string;
}

export interface ModelEligibility {
  eligible: boolean;
  reason: string | null;
  status: "predicted" | "not_eligible" | "insufficient_data" | "failed";
}

export interface ProfileSnapshot {
  api_usage_share: number;
  bc_usage_share: number;
  credit_email: number;
  credit_sms: number;
  customer_age_days: number;
  email_usage_share: number;
  expire_email: string | null;
  expire_sms: string | null;
  join_date: string;
  last_access: string | null;
  last_send: string | null;
  otp_usage_share: number;
  sms_usage_share: number;
  status_email: string | null;
  status_sms: string | null;
  usage_total_180d: number;
}

export interface PredictionRun {
  created_at: string;
  /** Creator's user id (null when the creator's account was deleted). */
  created_by: string | null;
  /** Creator's display name, falling back to email. */
  created_by_name: string | null;
  cutoff_date: string;
  error_message: string | null;
  finished_at: string | null;
  id: string;
  name: string;
  predict_source_id: string;
  predict_source_name: string;
  progress: { step: string; pct: number } | null;
  status: RunStatus;
  total_customers: number | null;
}

export interface PredictionOutput {
  acc_id: number;
  ai_explanation: string | null;
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  avg_transaction_value: number | null;
  churn_factors: ChurnFactor[] | null;
  churn_probability: number | null;
  churn_risk_level: RiskLevel | null;
  credit_forecast_interval: {
    p10_30d: number;
    p90_30d: number;
    p10_90d: number;
    p90_90d: number;
  } | null;
  credit_urgency_level: UrgencyLevel | null;
  customer_value_tier: ValueTier;
  days_since_last_activity: number | null;
  estimated_days_until_topup: number | null;
  ever_paid: boolean;
  lifecycle_stage: LifecycleStage;
  model_eligibility: {
    churn: ModelEligibility;
    clv: ModelEligibility;
    credit: ModelEligibility;
  };
  model_versions: { churn: string; clv: string; credit: string };
  n_purchases: number;
  needs_review: boolean;
  output_status: "predicted" | "partial" | "insufficient_data";
  p_alive: number | null;
  predicted_clv_6m: number | null;
  predicted_credit_usage_30d: number | null;
  predicted_credit_usage_90d: number | null;
  prediction_run_id: string;
  priority_rank: number | null;
  priority_score: number;
  profile_snapshot: ProfileSnapshot;
  revenue_at_risk: number | null;
  segment: string | null;
  sub_stage: string;
  total_revenue: number;
  usage_trend: "increasing" | "stable" | "declining" | "no_usage";
}

export interface RunSummary {
  churn: {
    eligible_count: number;
    by_risk: Record<RiskLevel, number>;
    thresholds: { medium: number; high: number; critical: number };
  };
  credit: {
    demand_30d: number;
    by_urgency: Record<UrgencyLevel, number>;
    topup_due_7d: number;
  };
  lifecycle: {
    active_paid: number;
    active_free: number;
    churned: number;
    ghost: number;
  };
  model_versions: { churn: string; clv: string; credit: string };
  revenue: {
    expected_at_risk: number;
    high_risk_exposure: number;
    monthly_actual: { month: string; amount: number; n_payments: number }[];
  };
  run: {
    id: string;
    name: string;
    cutoff_date: string;
    status: RunStatus;
    total_customers: number;
    finished_at: string | null;
  };
  top_priority: {
    acc_id: number;
    lifecycle_stage: LifecycleStage;
    churn_probability: number | null;
    predicted_clv_6m: number | null;
    priority_score: number;
  }[];
  value_risk_matrix: {
    value_tier: ValueTier;
    risk_level: RiskLevel;
    count: number;
    clv_sum: number;
  }[];
}

export interface OutputsQuery {
  churn_risk_level?: RiskLevel | "";
  credit_urgency_level?: UrgencyLevel | "";
  customer_value_tier?: ValueTier | "";
  ever_paid?: "true" | "false" | "";
  lifecycle_stage?: LifecycleStage | "";
  needs_review?: "true" | "false" | "";
  page?: number;
  page_size?: number;
  search?: string;
  segment?: string | "";
  sort?: string;
}

export interface OutputsPage {
  data: PredictionOutput[];
  page: number;
  page_size: number;
  total: number;
}

export interface MonthlyUsagePoint {
  api: number;
  bc: number;
  email: number;
  month: string;
  otp: number;
  sms: number;
  total: number;
}

export interface PaymentEvent {
  amount: number;
  credit_add: number;
  credit_type: string;
  payment_date: string;
}

export interface CustomerAiExplanationResult {
  acc_id: number;
  ai_explanation: string | null;
  ai_generated_at: string;
  ai_model: string;
  ai_status: PredictionOutput["ai_status"];
}

/** Run-level AI base summary of the whole customer base (cached per run). */
export interface RunInsight {
  ai_generated_at: string | null;
  ai_model: string | null;
  ai_status: "not_requested" | "completed" | "failed";
  ai_summary: string | null;
  run_id: string;
}
