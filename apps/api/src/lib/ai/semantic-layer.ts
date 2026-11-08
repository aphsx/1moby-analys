export type SemanticColumn = {
  name: string;
  type: "uuid" | "text" | "integer" | "numeric" | "boolean" | "date" | "timestamp" | "json";
  description: string;
  sensitive?: boolean;
};

export type SemanticTable = {
  name: string;
  description: string;
  columns: SemanticColumn[];
};

export const AI_SQL_DEFAULT_LIMIT = 50;
export const AI_SQL_MAX_LIMIT = 100;

export const SEMANTIC_TABLES: SemanticTable[] = [
  {
    name: "predict_data_sources",
    description: "Uploaded prediction datasets and import/clean status.",
    columns: [
      { name: "id", type: "uuid", description: "Prediction data source id." },
      { name: "name", type: "text", description: "Human-readable data source name." },
      { name: "client_label", type: "text", description: "Optional client or portfolio label." },
      { name: "original_filename", type: "text", description: "Original uploaded Excel filename." },
      { name: "import_status", type: "text", description: "Import status: one of pending, importing, cleaning, ready, failed." },
      { name: "imported_at", type: "timestamp", description: "When the raw import completed." },
      { name: "cleaned_at", type: "timestamp", description: "When clean tables were generated." },
      { name: "created_at", type: "timestamp", description: "When the source record was created." },
    ],
  },
  {
    name: "predict_clean_customers",
    description: "Clean customer profile rows for prediction datasets.",
    columns: [
      { name: "source_id", type: "uuid", description: "Prediction data source id." },
      { name: "acc_id", type: "integer", description: "1Moby customer account id." },
      { name: "status_sms", type: "text", description: "SMS account status." },
      { name: "status_email", type: "text", description: "Email account status." },
      { name: "credit_sms", type: "numeric", description: "Current remaining SMS credit balance (ยอดคงเหลือปัจจุบันในกระเป๋า ไม่ใช่ยอดที่ซื้อทั้งหมด). To find total credits purchased/added, use SUM(credit_add) from predict_clean_payments." },
      { name: "credit_email", type: "numeric", description: "Current remaining Email credit balance (ยอดคงเหลือปัจจุบันในกระเป๋า ไม่ใช่ยอดที่ซื้อทั้งหมด). To find total credits purchased/added, use SUM(credit_add) from predict_clean_payments." },
      { name: "expire_sms", type: "date", description: "SMS credit expiry date." },
      { name: "expire_email", type: "date", description: "Email credit expiry date." },
      { name: "join_date", type: "date", description: "Customer join date." },
      { name: "last_access", type: "timestamp", description: "Last account access timestamp." },
      { name: "last_send", type: "timestamp", description: "Last message send timestamp." },
    ],
  },
  {
    name: "predict_clean_payments",
    description: "Clean customer payment and top-up transactions for prediction datasets.",
    columns: [
      { name: "source_id", type: "uuid", description: "Prediction data source id." },
      { name: "acc_id", type: "integer", description: "1Moby customer account id." },
      { name: "payment_date", type: "timestamp", description: "Payment transaction timestamp." },
      { name: "amount", type: "numeric", description: "Payment amount in THB." },
      { name: "credit_add", type: "numeric", description: "Credits added/received in this transaction. To find total credits customer purchased or received, SUM(credit_add) from this table (typically 1 SMS ~ 0.14–0.20 THB)." },
      { name: "credit_type", type: "text", description: "Credit type such as SMS or Email." },
    ],
  },
  {
    name: "predict_clean_usage",
    description: "Clean monthly usage rows by account, channel, and usage source. To find total usage/credits spent by customer, SUM(usage) from this table.",
    columns: [
      { name: "source_id", type: "uuid", description: "Prediction data source id." },
      { name: "acc_id", type: "integer", description: "1Moby customer account id." },
      { name: "year", type: "integer", description: "Usage year." },
      { name: "month", type: "integer", description: "Usage month." },
      { name: "usage", type: "numeric", description: "Credit usage count consumed in that month." },
      { name: "channel", type: "text", description: "Channel such as SMS or Email." },
      { name: "usage_source", type: "text", description: "Usage product source such as BC, API, or OTP." },
    ],
  },
  {
    name: "ml_prediction_runs",
    description: "ML prediction run catalog and run status.",
    columns: [
      { name: "id", type: "uuid", description: "Prediction run id." },
      { name: "predict_source_id", type: "uuid", description: "Prediction data source id used for the run." },
      { name: "status", type: "text", description: "Run status: one of pending, in_progress, completed, failed." },
      { name: "cutoff_date", type: "date", description: "Point-in-time cutoff date for predictions." },
      { name: "started_at", type: "timestamp", description: "Run start timestamp." },
      { name: "finished_at", type: "timestamp", description: "Run completion timestamp." },
      { name: "total_customers", type: "integer", description: "Number of customers in the run." },
      { name: "created_at", type: "timestamp", description: "When the run was created." },
    ],
  },
  {
    name: "ml_prediction_outputs",
    description: "Per-customer ML prediction outputs: churn, lifecycle, CLV, credit forecast, and recommended action.",
    columns: [
      { name: "prediction_run_id", type: "uuid", description: "Prediction run id." },
      { name: "acc_id", type: "integer", description: "1Moby customer account id." },
      { name: "lifecycle_stage", type: "text", description: "Rule-based lifecycle stage." },
      { name: "sub_stage", type: "text", description: "Detailed lifecycle sub-stage." },
      { name: "churn_probability", type: "numeric", description: "Calibrated probability the customer has no payment/usage in the next 180 days (0 to 1, Dual-GBDT LightGBM + CatBoost + Isotonic calibration)." },
      { name: "churn_risk_level", type: "text", description: "Risk bucket derived from churn probability (low, medium, high, critical)." },
      { name: "predicted_clv_6m", type: "numeric", description: "Predicted amount (THB) the customer will pay in the next 6 months from Two-Part Hurdle CLV (LightGBM P(pay) × CatBoost log-scale value p50 × portfolio calibration multiplier)." },
      { name: "clv_pay_probability", type: "numeric", description: "Probability of any revenue in the next 6 months (Two-Part Hurdle CLV retention leg)." },
      { name: "clv_forecast_interval_json", type: "json", description: "JSON object with p10/p50/p90 THB value-if-pay range from Two-Part Hurdle CLV." },
      { name: "customer_value_tier", type: "text", description: "Customer value segment based on predicted 6m CLV: high (>= 10,000 THB), mid (1,000–10,000 THB), low (< 1,000 THB), or none." },
      { name: "revenue_at_risk", type: "numeric", description: "churn_probability × predicted_clv_6m — expected future 6-month revenue at risk." },
      { name: "predicted_credit_usage_30d", type: "numeric", description: "Forecasted SMS credit usage over 30 days (LightGBM Quantile p50 with 60:40 recent usage anchor blend)." },
      { name: "predicted_credit_usage_90d", type: "numeric", description: "Forecasted SMS credit usage over 90 days (LightGBM Quantile p50 with 60:40 recent usage anchor blend)." },
      { name: "estimated_days_until_topup", type: "integer", description: "Estimated days until SMS credit depletes (Depletion Runway = balance / (predicted_credit_usage_30d / 30))." },
      { name: "credit_urgency_level", type: "text", description: "Urgency bucket for credit top-up." },
      { name: "usage_trend", type: "text", description: "Recent usage trend." },
      { name: "days_since_last_activity", type: "integer", description: "Days since the last observed customer activity." },
      { name: "n_purchases", type: "integer", description: "Observed number of purchases." },
      { name: "total_revenue", type: "numeric", description: "Observed total revenue." },
      { name: "avg_transaction_value", type: "numeric", description: "Average transaction value." },
      { name: "ever_paid", type: "boolean", description: "Whether the customer has ever paid." },
      { name: "priority_score", type: "numeric", description: "Business priority score (0-100), a display rescale of revenue_at_risk; ranks customers by expected money at risk." },
      { name: "segment", type: "text", description: "Descriptive customer segment (High-Value At-Risk, Mid-Value At-Risk, High-Value Stable, Emerging, Stable, Low-Value Watch, Low-Value At-Risk, Lapsed, Dormant, Ghost) derived from value tier × churn risk × lifecycle." },
      { name: "priority_rank", type: "integer", description: "Global priority rank (1 = highest priority), ordered by segment priority then money within each segment." },
      { name: "needs_review", type: "boolean", description: "Flagged for human review: high churn risk, or a valuable customer whose usage has collapsed." },
      { name: "output_status", type: "text", description: "Prediction output status: one of predicted, partial, insufficient_data." },
      { name: "created_at", type: "timestamp", description: "When the prediction output was created." },
    ],
  },
];

/** Every modeled table; access is org-wide, so the AI may query all of them. */
export function getAllowedTables(): SemanticTable[] {
  return SEMANTIC_TABLES;
}

export function renderSemanticLayerForPrompt(): string {
  return getAllowedTables()
    .map((table) => {
      const columns = table.columns
        .filter((column) => !column.sensitive)
        .map((column) => `- ${column.name} (${column.type}): ${column.description}`)
        .join("\n");
      return `Table: ${table.name}\nPurpose: ${table.description}\nColumns:\n${columns}`;
    })
    .join("\n\n");
}
