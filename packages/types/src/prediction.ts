import type {
  RunStatus,
  LifecycleStage,
  RiskLevel,
  ValueTier,
  UrgencyLevel,
} from "./enums";

export interface ChurnFactor {
  feature: string;
  value: number | string;
  direction: "up" | "down";
  impact: number;
}

export interface ModelEligibility {
  eligible: boolean;
  status: "predicted" | "not_eligible" | "insufficient_data" | "failed";
  reason: string | null;
}

export interface ProfileSnapshot {
  join_date: string;
  customer_age_days: number;
  status_sms: string | null;
  status_email: string | null;
  credit_sms: number;
  credit_email: number;
  expire_sms: string | null;
  expire_email: string | null;
  last_access: string | null;
  last_send: string | null;
  sms_usage_share: number;
  email_usage_share: number;
  bc_usage_share: number;
  api_usage_share: number;
  otp_usage_share: number;
  usage_total_180d: number;
}

export interface PredictionRun {
  id: string;
  name: string;
  status: RunStatus;
  predict_source_id: string;
  predict_source_name: string;
  cutoff_date: string;
  total_customers: number | null;
  /** Creator's user id (null when the creator's account was deleted). */
  created_by: string | null;
  /** Creator's display name, falling back to email. */
  created_by_name: string | null;
  created_at: string;
  finished_at: string | null;
  error_message: string | null;
  progress: { phase: string; pct: number } | null;
  /** Non-fatal problems in a completed run, e.g. churn explanations that could not be computed. */
  warnings: string[];
}

export interface PredictionOutput {
  prediction_run_id: string;
  acc_id: number;
  lifecycle_stage: LifecycleStage;
  sub_stage: string;
  days_since_last_activity: number | null;
  n_purchases: number;
  total_revenue: number;
  avg_transaction_value: number | null;
  ever_paid: boolean;
  usage_trend: "increasing" | "stable" | "declining" | "no_usage";
  profile_snapshot: ProfileSnapshot;
  churn_probability: number | null;
  churn_risk_level: RiskLevel | null;
  churn_factors: ChurnFactor[] | null;
  predicted_clv_6m: number | null;
  /** P(future_revenue_6m > 0) from two-part CLV — null when champion has no twopart bundle. */
  clv_pay_probability: number | null;
  /** THB value-if-pay range (p10/p50/p90) — null when two-part CLV not served. */
  clv_forecast_interval: { p10: number; p50: number; p90: number } | null;
  p_alive: number | null;
  customer_value_tier: ValueTier;
  predicted_credit_usage_30d: number | null;
  predicted_credit_usage_90d: number | null;
  credit_forecast_interval: { p10_30d: number; p90_30d: number; p10_90d: number; p90_90d: number } | null;
  estimated_days_until_topup: number | null;
  credit_urgency_level: UrgencyLevel | null;
  revenue_at_risk: number | null;
  priority_score: number;
  segment: string | null;
  priority_rank: number | null;
  needs_review: boolean;
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  ai_explanation: string | null;
  output_status: "predicted" | "partial" | "insufficient_data";
  model_eligibility: { churn: ModelEligibility; clv: ModelEligibility; credit: ModelEligibility };
  model_versions: { churn: string; clv: string; credit: string };
}

export interface RunSummary {
  run: {
    id: string;
    name: string;
    cutoff_date: string;
    status: RunStatus;
    total_customers: number;
    finished_at: string | null;
    /** First month (YYYY-MM) with any payment or usage in the run's Predict Data Source. */
    data_start: string | null;
  };
  lifecycle: { active_paid: number; active_free: number; churned: number; ghost: number };
  /** Churned customers who paid at some point (sub_stage "Churned Paid"). */
  lifecycle_detail: { churned_ever_paid: number };
  churn: {
    eligible_count: number;
    by_risk: Record<RiskLevel, number>;
    /** From the churn model version that scored this run. */
    thresholds: { medium: number; high: number; critical: number };
  };
  revenue: {
    expected_at_risk: number;
    high_risk_exposure: number;
    /**
     * The 24 months before the cutoff, oldest first, so this year can be drawn against last year.
     * `n_payers` counts Payers: accounts that paid more than ฿0 that month.
     */
    monthly_actual: { month: string; amount: number; n_payments: number; n_payers: number }[];
    /**
     * The account with the largest increase from the first to the second half of the last 12
     * months, with its 12 monthly amounts (oldest first). Null when revenue did not grow.
     */
    top_contributor: { acc_id: number; monthly: number[] } | null;
  };
  /** Accounts with usage > 0 per month, the same 24 months as `monthly_actual`. */
  usage_monthly_senders: { month: string; senders: number }[];
  /** Payers of the last 12 months ranked by what they paid; null when nobody paid. */
  revenue_concentration: {
    payers: number;
    revenue: number;
    tiers: { key: "top1" | "top5" | "top10" | "rest"; from_rank: number; to_rank: number; payers: number; revenue: number }[];
    avg_top1: number;
    /** The most lowest-paying payers whose summed revenue stays below `avg_top1`. */
    bottom_k_below_top1_avg: number;
  } | null;
  /**
   * Active Paid customers by the number of months they sent messages in the window before the
   * cutoff, with the Backtest churn rate per bucket at `backtest_date` (cutoff − 6 months).
   */
  sending_months: {
    window_months: number;
    /** YYYY-MM of the first month in the window. */
    window_start: string;
    /** YYYY-MM-DD; null when the data is too short for a Backtest. */
    backtest_date: string | null;
    buckets: { months: number; count: number; backtest_n: number | null; backtest_churn_rate: number | null }[];
  };
  /** Active Paid customers only, the same scope as `revenue.expected_at_risk`, so the cells sum to it. */
  value_risk_matrix: {
    value_tier: ValueTier;
    risk_level: RiskLevel;
    count: number;
    clv_sum: number;
    revenue_at_risk: number;
  }[];
  /**
   * Active Paid customers by usage trend. `declining` overcounts when the cutoff is a month start
   * (docs/ui/REFACTOR-PLAN.md §4.2); show `no_usage` only until the ML window fix lands.
   */
  usage_trend: Record<PredictionOutput["usage_trend"], number>;
  credit: {
    demand_30d: number;
    by_urgency: Record<UrgencyLevel, number>;
    topup_due_7d: number;
    /**
     * Share of customers predicted to top up within 14 days who did, in the latest backtest of the
     * credit model version that scored this run. Null when the model card has none.
     */
    urgent_topup_hit_rate: number | null;
  };
  /** The head of the Call List: scored Active Paid customers, largest revenue_at_risk first. */
  top_priority: {
    acc_id: number;
    lifecycle_stage: LifecycleStage;
    churn_probability: number | null;
    churn_risk_level: RiskLevel | null;
    customer_value_tier: ValueTier | null;
    predicted_clv_6m: number | null;
    revenue_at_risk: number | null;
    estimated_days_until_topup: number | null;
    priority_score: number;
    /** First of `churn_factors`, the main reason. */
    top_factor: ChurnFactor | null;
    /** One flag per month of `sending_months`' window, oldest first: true when messages were sent. */
    sending_month_flags: boolean[];
  }[];
  model_versions: { churn: string; clv: string; credit: string };
}

export interface OutputsQuery {
  page?: number;
  page_size?: number;
  sort?: string;
  search?: string;
  lifecycle_stage?: LifecycleStage | "";
  /** One level, or several joined with commas ("high,critical"). */
  churn_risk_level?: RiskLevel | `${RiskLevel},${RiskLevel}` | "";
  customer_value_tier?: ValueTier | "";
  credit_urgency_level?: UrgencyLevel | "";
  ever_paid?: "true" | "false" | "";
  segment?: string | "";
  needs_review?: "true" | "false" | "";
  /** At most this many months with messages sent in the window before the cutoff. */
  sending_months_max?: string | "";
}

export interface OutputsPage {
  total: number;
  /** Sum of revenue_at_risk over every row matching the filters, not just this page. */
  revenue_at_risk_sum: number;
  page: number;
  page_size: number;
  data: PredictionOutput[];
}

export interface MonthlyUsagePoint {
  month: string;
  sms: number;
  email: number;
  bc: number;
  api: number;
  otp: number;
  total: number;
}

export interface PaymentEvent {
  payment_date: string;
  amount: number;
  credit_add: number;
  credit_type: string;
}

export interface CustomerAiExplanationResult {
  acc_id: number;
  ai_status: PredictionOutput["ai_status"];
  ai_explanation: string | null;
  ai_model: string;
  ai_generated_at: string;
}

/** Run-level AI base summary of the whole customer base (cached per run). */
export interface RunInsight {
  run_id: string;
  ai_status: "not_requested" | "completed" | "failed";
  ai_summary: string | null;
  ai_model: string | null;
  ai_generated_at: string | null;
}
