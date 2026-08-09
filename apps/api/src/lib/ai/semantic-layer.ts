export type AiUserRole = "viewer" | "analyst" | "admin";

export type SemanticColumn = {
  name: string;
  type:
    | "uuid"
    | "text"
    | "integer"
    | "numeric"
    | "boolean"
    | "date"
    | "timestamp"
    | "json";
  description: string;
  sensitive?: boolean;
};

export type SemanticTable = {
  name: string;
  description: string;
  minimumRole: AiUserRole;
  columns: SemanticColumn[];
};

export const ROLE_RANK: Record<AiUserRole, number> = {
  admin: 3,
  analyst: 2,
  viewer: 1,
};

export const AI_SQL_DEFAULT_LIMIT = 50;
export const AI_SQL_MAX_LIMIT = 100;

export const SEMANTIC_TABLES: SemanticTable[] = [
  {
    columns: [
      { description: "Prediction data source id.", name: "id", type: "uuid" },
      {
        description: "Human-readable data source name.",
        name: "name",
        type: "text",
      },
      {
        description: "Optional client or portfolio label.",
        name: "client_label",
        type: "text",
      },
      {
        description: "Original uploaded Excel filename.",
        name: "original_filename",
        type: "text",
      },
      {
        description: "Import lifecycle status such as pending, ready, failed.",
        name: "import_status",
        type: "text",
      },
      {
        description: "When the raw import completed.",
        name: "imported_at",
        type: "timestamp",
      },
      {
        description: "When clean tables were generated.",
        name: "cleaned_at",
        type: "timestamp",
      },
      {
        description: "When the source record was created.",
        name: "created_at",
        type: "timestamp",
      },
    ],
    description: "Uploaded prediction datasets and import/clean status.",
    minimumRole: "viewer",
    name: "predict_data_sources",
  },
  {
    columns: [
      {
        description: "Prediction data source id.",
        name: "source_id",
        type: "uuid",
      },
      {
        description: "1Moby customer account id.",
        name: "acc_id",
        type: "integer",
      },
      { description: "SMS account status.", name: "status_sms", type: "text" },
      {
        description: "Email account status.",
        name: "status_email",
        type: "text",
      },
      {
        description: "Remaining SMS credits.",
        name: "credit_sms",
        type: "numeric",
      },
      {
        description: "Remaining Email credits.",
        name: "credit_email",
        type: "numeric",
      },
      {
        description: "SMS credit expiry date.",
        name: "expire_sms",
        type: "date",
      },
      {
        description: "Email credit expiry date.",
        name: "expire_email",
        type: "date",
      },
      { description: "Customer join date.", name: "join_date", type: "date" },
      {
        description: "Last account access timestamp.",
        name: "last_access",
        type: "timestamp",
      },
      {
        description: "Last message send timestamp.",
        name: "last_send",
        type: "timestamp",
      },
    ],
    description: "Clean customer profile rows for prediction datasets.",
    minimumRole: "analyst",
    name: "predict_clean_customers",
  },
  {
    columns: [
      {
        description: "Prediction data source id.",
        name: "source_id",
        type: "uuid",
      },
      {
        description: "1Moby customer account id.",
        name: "acc_id",
        type: "integer",
      },
      {
        description: "Payment transaction timestamp.",
        name: "payment_date",
        type: "timestamp",
      },
      { description: "Payment amount.", name: "amount", type: "numeric" },
      {
        description: "Credits added by this transaction.",
        name: "credit_add",
        type: "numeric",
      },
      {
        description: "Credit type such as SMS or Email.",
        name: "credit_type",
        type: "text",
      },
    ],
    description:
      "Clean customer payment and top-up transactions for prediction datasets.",
    minimumRole: "analyst",
    name: "predict_clean_payments",
  },
  {
    columns: [
      {
        description: "Prediction data source id.",
        name: "source_id",
        type: "uuid",
      },
      {
        description: "1Moby customer account id.",
        name: "acc_id",
        type: "integer",
      },
      { description: "Usage year.", name: "year", type: "integer" },
      { description: "Usage month.", name: "month", type: "integer" },
      { description: "Credit usage count.", name: "usage", type: "numeric" },
      {
        description: "Channel such as SMS or Email.",
        name: "channel",
        type: "text",
      },
      {
        description: "Usage product source such as BC, API, or OTP.",
        name: "usage_source",
        type: "text",
      },
    ],
    description:
      "Clean monthly usage rows by account, channel, and usage source.",
    minimumRole: "analyst",
    name: "predict_clean_usage",
  },
  {
    columns: [
      { description: "Prediction run id.", name: "id", type: "uuid" },
      {
        description: "Prediction data source id used for the run.",
        name: "predict_source_id",
        type: "uuid",
      },
      {
        description: "Run status such as pending, running, done, failed.",
        name: "status",
        type: "text",
      },
      {
        description: "Point-in-time cutoff date for predictions.",
        name: "cutoff_date",
        type: "date",
      },
      {
        description: "Run start timestamp.",
        name: "started_at",
        type: "timestamp",
      },
      {
        description: "Run completion timestamp.",
        name: "finished_at",
        type: "timestamp",
      },
      {
        description: "Number of customers in the run.",
        name: "total_customers",
        type: "integer",
      },
      {
        description: "When the run was created.",
        name: "created_at",
        type: "timestamp",
      },
    ],
    description: "ML prediction run catalog and run status.",
    minimumRole: "viewer",
    name: "ml_prediction_runs",
  },
  {
    columns: [
      {
        description: "Prediction run id.",
        name: "prediction_run_id",
        type: "uuid",
      },
      {
        description: "1Moby customer account id.",
        name: "acc_id",
        type: "integer",
      },
      {
        description: "Rule-based lifecycle stage.",
        name: "lifecycle_stage",
        type: "text",
      },
      {
        description: "Detailed lifecycle sub-stage.",
        name: "sub_stage",
        type: "text",
      },
      {
        description: "Predicted churn probability from 0 to 1.",
        name: "churn_probability",
        type: "numeric",
      },
      {
        description: "Risk bucket derived from churn probability.",
        name: "churn_risk_level",
        type: "text",
      },
      {
        description: "Predicted customer lifetime value over six months.",
        name: "predicted_clv_6m",
        type: "numeric",
      },
      {
        description: "Customer value segment.",
        name: "customer_value_tier",
        type: "text",
      },
      {
        description: "Estimated revenue at risk.",
        name: "revenue_at_risk",
        type: "numeric",
      },
      {
        description: "Forecasted credit usage over 30 days.",
        name: "predicted_credit_usage_30d",
        type: "numeric",
      },
      {
        description: "Forecasted credit usage over 90 days.",
        name: "predicted_credit_usage_90d",
        type: "numeric",
      },
      {
        description: "Estimated days until next top-up is needed.",
        name: "estimated_days_until_topup",
        type: "integer",
      },
      {
        description: "Urgency bucket for credit top-up.",
        name: "credit_urgency_level",
        type: "text",
      },
      { description: "Recent usage trend.", name: "usage_trend", type: "text" },
      {
        description: "Days since the last observed customer activity.",
        name: "days_since_last_activity",
        type: "integer",
      },
      {
        description: "Observed number of purchases.",
        name: "n_purchases",
        type: "integer",
      },
      {
        description: "Observed total revenue.",
        name: "total_revenue",
        type: "numeric",
      },
      {
        description: "Average transaction value.",
        name: "avg_transaction_value",
        type: "numeric",
      },
      {
        description: "Whether the customer has ever paid.",
        name: "ever_paid",
        type: "boolean",
      },
      {
        description:
          "Business priority score (0-100), a display rescale of revenue_at_risk; ranks customers by expected money at risk.",
        name: "priority_score",
        type: "numeric",
      },
      {
        description:
          "Descriptive customer segment (High-Value At-Risk, Mid-Value At-Risk, High-Value Stable, Emerging, Stable, Low-Value Watch, Low-Value At-Risk, Lapsed, Dormant, Ghost) derived from value tier × churn risk × lifecycle.",
        name: "segment",
        type: "text",
      },
      {
        description:
          "Global priority rank (1 = highest priority), ordered by segment priority then money within each segment.",
        name: "priority_rank",
        type: "integer",
      },
      {
        description:
          "Flagged for human review: high churn risk, or a valuable customer whose p_alive and usage have silently collapsed.",
        name: "needs_review",
        type: "boolean",
      },
      {
        description: "Prediction output status.",
        name: "output_status",
        type: "text",
      },
      {
        description: "When the prediction output was created.",
        name: "created_at",
        type: "timestamp",
      },
    ],
    description:
      "Per-customer ML prediction outputs: churn, lifecycle, CLV, credit forecast, and recommended action.",
    minimumRole: "analyst",
    name: "ml_prediction_outputs",
  },
];

export function getAiUserRole(): AiUserRole {
  const role = process.env.AI_CHAT_DEFAULT_ROLE?.trim().toLowerCase();
  if (role === "admin" || role === "analyst" || role === "viewer") {
    return role;
  }
  return "analyst";
}

export function getAllowedTables(role: AiUserRole): SemanticTable[] {
  return SEMANTIC_TABLES.filter(
    (table) => ROLE_RANK[role] >= ROLE_RANK[table.minimumRole]
  );
}

export function renderSemanticLayerForPrompt(role: AiUserRole): string {
  return getAllowedTables(role)
    .map((table) => {
      const columns = table.columns
        .filter((column) => !column.sensitive)
        .map(
          (column) => `- ${column.name} (${column.type}): ${column.description}`
        )
        .join("\n");
      return `Table: ${table.name}\nPurpose: ${table.description}\nColumns:\n${columns}`;
    })
    .join("\n\n");
}
