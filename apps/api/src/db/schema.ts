/**
 * Drizzle schema reflects the single PostgreSQL bootstrap:
 *   db/init/001_schema.sql creates auth, train/predict, and ml_* tables.
 *
 * DO NOT run drizzle-kit generate or push — edit the bootstrap schema deliberately.
 * This file is for the query builder only.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── Better Auth tables (camelCase column names — created with quoted identifiers) ──

export const user = pgTable("user", {
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  familyName: text("familyName"),
  givenName: text("givenName"),
  id: text("id").primaryKey(),
  image: text("image"),
  locale: text("locale"),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export const session = pgTable(
  "session",
  {
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    ipAddress: text("ipAddress"),
    token: text("token").notNull().unique(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("idx_session_user").on(t.userId),
    index("idx_session_token").on(t.token),
  ]
);

export const account = pgTable(
  "account",
  {
    accessToken: text("accessToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    accountId: text("accountId").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    id: text("id").primaryKey(),
    idToken: text("idToken"),
    password: text("password"),
    providerId: text("providerId").notNull(),
    refreshToken: text("refreshToken"),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    scope: text("scope"),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("idx_account_user").on(t.userId),
    uniqueIndex("account_provider_accountid_idx").on(t.providerId, t.accountId),
  ]
);

export const verification = pgTable("verification", {
  createdAt: timestamp("createdAt", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
  value: text("value").notNull(),
});

// ── ML output/runtime tables now live in the ml_* schema below. ───────────────
// Auth and train/predict import-clean tables stay intact.

// ── Train raw data — 8 fixed Excel sheet tables + catalog ─────────────────────

export const trainDataSources = pgTable(
  "train_data_sources",
  {
    cleanedAt: timestamp("cleaned_at", { withTimezone: true }),
    cleanManifest: jsonb("clean_manifest"),
    clientLabel: text("client_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    errorMessage: text("error_message"),
    fileChecksumSha256: text("file_checksum_sha256").notNull().unique(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    importedBy: text("imported_by").references(() => user.id, {
      onDelete: "set null",
    }),
    importStatus: text("import_status").notNull().default("pending"),
    name: text("name").notNull(),
    notes: text("notes"),
    originalFilename: text("original_filename").notNull(),
    sheetManifest: jsonb("sheet_manifest"),
  },
  (t) => [
    index("idx_train_data_sources_status").on(t.importStatus),
    index("idx_train_data_sources_client").on(t.clientLabel),
    index("idx_train_data_sources_imported_by").on(t.importedBy),
  ]
);

function trainRawSheet(tableName: string) {
  return pgTable(
    tableName,
    {
      excelRow: integer("excel_row").notNull(),
      id: bigserial("id", { mode: "number" }).primaryKey(),
      importedAt: timestamp("imported_at", { withTimezone: true })
        .notNull()
        .default(sql`NOW()`),
      rowPayload: jsonb("row_payload").notNull(),
      sourceId: uuid("source_id")
        .notNull()
        .references(() => trainDataSources.id, { onDelete: "cascade" }),
    },
    (t) => [index(`idx_${tableName}_source`).on(t.sourceId)]
  );
}

export const trainRawSheetUsersUserProfile = trainRawSheet(
  "train_raw_sheet_users_user_profile"
);
export const trainRawSheetBackendPayment = trainRawSheet(
  "train_raw_sheet_backend_payment"
);
export const trainRawSheetSmsUsageBc = trainRawSheet(
  "train_raw_sheet_sms_usage_bc"
);
export const trainRawSheetSmsUsageApi = trainRawSheet(
  "train_raw_sheet_sms_usage_api"
);
export const trainRawSheetSmsUsageOtp = trainRawSheet(
  "train_raw_sheet_sms_usage_otp"
);
export const trainRawSheetEmailUsageBc = trainRawSheet(
  "train_raw_sheet_email_usage_bc"
);
export const trainRawSheetEmailUsageApi = trainRawSheet(
  "train_raw_sheet_email_usage_api"
);
export const trainRawSheetEmailUsageOtp = trainRawSheet(
  "train_raw_sheet_email_usage_otp"
);

// ── Train clean — typed rows for model training ───────────────────────────────

export const trainCleanCustomers = pgTable(
  "train_clean_customers",
  {
    accId: integer("acc_id").notNull(),
    creditEmail: numeric("credit_email"),
    creditSms: numeric("credit_sms"),
    excelRow: integer("excel_row").notNull(),
    expireEmail: date("expire_email"),
    expireSms: date("expire_sms"),
    id: bigserial("id", { mode: "number" }).primaryKey(),
    joinDate: date("join_date"),
    lastAccess: timestamp("last_access", { withTimezone: true }),
    lastSend: timestamp("last_send", { withTimezone: true }),
    rawRowId: bigint("raw_row_id", { mode: "number" }).notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => trainDataSources.id, { onDelete: "cascade" }),
    statusEmail: text("status_email"),
    statusSms: text("status_sms"),
  },
  (t) => [
    index("idx_train_clean_customers_source").on(t.sourceId),
    index("idx_train_clean_customers_acc").on(t.sourceId, t.accId),
  ]
);

export const trainCleanPayments = pgTable(
  "train_clean_payments",
  {
    accId: integer("acc_id").notNull(),
    amount: numeric("amount"),
    creditAdd: numeric("credit_add"),
    creditType: text("credit_type"),
    excelRow: integer("excel_row").notNull(),
    id: bigserial("id", { mode: "number" }).primaryKey(),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    paymentUid: bigint("payment_uid", { mode: "number" }),
    rawRowId: bigint("raw_row_id", { mode: "number" }).notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => trainDataSources.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("idx_train_clean_payments_source").on(t.sourceId),
    index("idx_train_clean_payments_acc").on(t.sourceId, t.accId),
  ]
);

export const trainCleanUsage = pgTable(
  "train_clean_usage",
  {
    accId: integer("acc_id").notNull(),
    channel: text("channel").notNull(),
    excelRow: integer("excel_row").notNull(),
    id: bigserial("id", { mode: "number" }).primaryKey(),
    month: integer("month"),
    rawRowId: bigint("raw_row_id", { mode: "number" }).notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => trainDataSources.id, { onDelete: "cascade" }),
    usage: numeric("usage"),
    usageSource: text("usage_source").notNull(),
    year: integer("year"),
  },
  (t) => [
    index("idx_train_clean_usage_source").on(t.sourceId),
    index("idx_train_clean_usage_acc").on(t.sourceId, t.accId),
  ]
);

// ── Predict raw data — independent prediction upload source ───────────────────

export const predictDataSources = pgTable(
  "predict_data_sources",
  {
    cleanedAt: timestamp("cleaned_at", { withTimezone: true }),
    cleanManifest: jsonb("clean_manifest"),
    clientLabel: text("client_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    errorMessage: text("error_message"),
    fileChecksumSha256: text("file_checksum_sha256").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    importedBy: text("imported_by").references(() => user.id, {
      onDelete: "set null",
    }),
    importStatus: text("import_status").notNull().default("pending"),
    name: text("name").notNull(),
    notes: text("notes"),
    originalFilename: text("original_filename").notNull(),
    sheetManifest: jsonb("sheet_manifest"),
  },
  (t) => [
    index("idx_predict_data_sources_status").on(t.importStatus),
    index("idx_predict_data_sources_client").on(t.clientLabel),
    index("idx_predict_data_sources_imported_by").on(t.importedBy),
  ]
);

function predictRawSheet(tableName: string) {
  return pgTable(
    tableName,
    {
      excelRow: integer("excel_row").notNull(),
      id: bigserial("id", { mode: "number" }).primaryKey(),
      importedAt: timestamp("imported_at", { withTimezone: true })
        .notNull()
        .default(sql`NOW()`),
      rowPayload: jsonb("row_payload").notNull(),
      sourceId: uuid("source_id")
        .notNull()
        .references(() => predictDataSources.id, { onDelete: "cascade" }),
    },
    (t) => [index(`idx_${tableName}_source`).on(t.sourceId)]
  );
}

export const predictRawSheetUsersUserProfile = predictRawSheet(
  "predict_raw_sheet_users_user_profile"
);
export const predictRawSheetBackendPayment = predictRawSheet(
  "predict_raw_sheet_backend_payment"
);
export const predictRawSheetSmsUsageBc = predictRawSheet(
  "predict_raw_sheet_sms_usage_bc"
);
export const predictRawSheetSmsUsageApi = predictRawSheet(
  "predict_raw_sheet_sms_usage_api"
);
export const predictRawSheetSmsUsageOtp = predictRawSheet(
  "predict_raw_sheet_sms_usage_otp"
);
export const predictRawSheetEmailUsageBc = predictRawSheet(
  "predict_raw_sheet_email_usage_bc"
);
export const predictRawSheetEmailUsageApi = predictRawSheet(
  "predict_raw_sheet_email_usage_api"
);
export const predictRawSheetEmailUsageOtp = predictRawSheet(
  "predict_raw_sheet_email_usage_otp"
);

// ── Predict clean — typed rows for prediction runs ────────────────────────────

export const predictCleanCustomers = pgTable(
  "predict_clean_customers",
  {
    accId: integer("acc_id").notNull(),
    creditEmail: numeric("credit_email"),
    creditSms: numeric("credit_sms"),
    excelRow: integer("excel_row").notNull(),
    expireEmail: date("expire_email"),
    expireSms: date("expire_sms"),
    id: bigserial("id", { mode: "number" }).primaryKey(),
    joinDate: date("join_date"),
    lastAccess: timestamp("last_access", { withTimezone: true }),
    lastSend: timestamp("last_send", { withTimezone: true }),
    rawRowId: bigint("raw_row_id", { mode: "number" }).notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => predictDataSources.id, { onDelete: "cascade" }),
    statusEmail: text("status_email"),
    statusSms: text("status_sms"),
  },
  (t) => [
    index("idx_predict_clean_customers_source").on(t.sourceId),
    index("idx_predict_clean_customers_acc").on(t.sourceId, t.accId),
  ]
);

export const predictCleanPayments = pgTable(
  "predict_clean_payments",
  {
    accId: integer("acc_id").notNull(),
    amount: numeric("amount"),
    creditAdd: numeric("credit_add"),
    creditType: text("credit_type"),
    excelRow: integer("excel_row").notNull(),
    id: bigserial("id", { mode: "number" }).primaryKey(),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
    paymentUid: bigint("payment_uid", { mode: "number" }),
    rawRowId: bigint("raw_row_id", { mode: "number" }).notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => predictDataSources.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("idx_predict_clean_payments_source").on(t.sourceId),
    index("idx_predict_clean_payments_acc").on(t.sourceId, t.accId),
  ]
);

export const predictCleanUsage = pgTable(
  "predict_clean_usage",
  {
    accId: integer("acc_id").notNull(),
    channel: text("channel").notNull(),
    excelRow: integer("excel_row").notNull(),
    id: bigserial("id", { mode: "number" }).primaryKey(),
    month: integer("month"),
    rawRowId: bigint("raw_row_id", { mode: "number" }).notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => predictDataSources.id, { onDelete: "cascade" }),
    usage: numeric("usage"),
    usageSource: text("usage_source").notNull(),
    year: integer("year"),
  },
  (t) => [
    index("idx_predict_clean_usage_source").on(t.sourceId),
    index("idx_predict_clean_usage_acc").on(t.sourceId, t.accId),
  ]
);

// ── [NEW] ML v2 — training, model registry, evaluation, prediction outputs ──

export const mlTrainingRuns = pgTable(
  "ml_training_runs",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    cutoffDate: date("cutoff_date").notNull(),
    errorMessage: text("error_message"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    horizonDays: integer("horizon_days").notNull(),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    notes: text("notes"),
    parentTrainingRunId: uuid("parent_training_run_id"),
    progressJson: jsonb("progress_json"),
    resultsJson: jsonb("results_json"),
    runType: text("run_type").notNull().default("initial_train"),
    sourceId: uuid("source_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    trainingConfigJson: jsonb("training_config_json"),
  },
  (t) => [
    index("idx_ml_training_runs_source").on(t.sourceId),
    index("idx_ml_training_runs_status").on(t.status),
    index("idx_ml_training_runs_created_by").on(t.createdBy),
  ]
);

export const mlFeatureSets = pgTable(
  "ml_feature_sets",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    featureCodeHash: text("feature_code_hash"),
    featureNamesJson: jsonb("feature_names_json").notNull(),
    featureSchemaJson: jsonb("feature_schema_json").notNull(),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    modelType: text("model_type").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("candidate"),
    transformConfigJson: jsonb("transform_config_json"),
    version: text("version").notNull(),
  },
  (t) => [
    uniqueIndex("uq_ml_feature_sets_name_version_type").on(
      t.name,
      t.version,
      t.modelType
    ),
    index("idx_ml_feature_sets_model_type").on(t.modelType),
    index("idx_ml_feature_sets_status").on(t.status),
  ]
);

export const mlModelVersions = pgTable(
  "ml_model_versions",
  {
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    artifactChecksum: text("artifact_checksum"),
    artifactPath: text("artifact_path"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    featureNamesJson: jsonb("feature_names_json"),
    featureSetId: uuid("feature_set_id").references(() => mlFeatureSets.id, {
      onDelete: "set null",
    }),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    isActive: boolean("is_active").notNull().default(false),
    labelDefinitionJson: jsonb("label_definition_json"),
    metricsJson: jsonb("metrics_json"),
    modelCardJson: jsonb("model_card_json"),
    modelCardPath: text("model_card_path"),
    modelType: text("model_type").notNull(),
    status: text("status").notNull().default("candidate"),
    testMetricsJson: jsonb("test_metrics_json"),
    trainedAt: timestamp("trained_at", { withTimezone: true }).default(
      sql`NOW()`
    ),
    trainingDataSnapshotJson: jsonb("training_data_snapshot_json"),
    trainingRunId: uuid("training_run_id")
      .notNull()
      .references(() => mlTrainingRuns.id, {
        onDelete: "cascade",
      }),
    validationMetricsJson: jsonb("validation_metrics_json"),
    version: text("version").notNull(),
  },
  (t) => [
    uniqueIndex("uq_ml_model_versions_type_version").on(t.modelType, t.version),
    index("idx_ml_model_versions_training_run").on(t.trainingRunId),
    index("idx_ml_model_versions_feature_set").on(t.featureSetId),
    index("idx_ml_model_versions_type_status").on(t.modelType, t.status),
    index("idx_ml_model_versions_active").on(t.modelType, t.isActive),
    uniqueIndex("uq_ml_model_versions_one_active_per_type")
      .on(t.modelType)
      .where(sql`${t.isActive} = TRUE`),
  ]
);

export const mlModelAliases = pgTable(
  "ml_model_aliases",
  {
    alias: text("alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    modelType: text("model_type").notNull(),
    modelVersionId: uuid("model_version_id")
      .notNull()
      .references(() => mlModelVersions.id, {
        onDelete: "cascade",
      }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
  },
  (t) => [
    uniqueIndex("uq_ml_model_aliases_type_alias").on(t.modelType, t.alias),
    index("idx_ml_model_aliases_version").on(t.modelVersionId),
  ]
);

export const mlModelActivationHistory = pgTable(
  "ml_model_activation_history",
  {
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    modelType: text("model_type").notNull(),
    newModelVersionId: uuid("new_model_version_id").references(
      () => mlModelVersions.id,
      {
        onDelete: "set null",
      }
    ),
    previousModelVersionId: uuid("previous_model_version_id").references(
      () => mlModelVersions.id,
      {
        onDelete: "set null",
      }
    ),
    reason: text("reason"),
  },
  (t) => [
    index("idx_ml_activation_history_type").on(t.modelType),
    index("idx_ml_activation_history_new_version").on(t.newModelVersionId),
  ]
);

export const mlPredictionRuns = pgTable(
  "ml_prediction_runs",
  {
    cohortInsightJson: jsonb("cohort_insight_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    cutoffDate: date("cutoff_date").notNull(),
    errorMessage: text("error_message"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    modelOverridesJson: jsonb("model_overrides_json"),
    modelVersionsJson: jsonb("model_versions_json"),
    name: text("name").notNull().default("Prediction run"),
    predictSourceId: uuid("predict_source_id").notNull(),
    progressJson: jsonb("progress_json"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    totalCustomers: integer("total_customers"),
  },
  (t) => [
    index("idx_ml_prediction_runs_source").on(t.predictSourceId),
    index("idx_ml_prediction_runs_status").on(t.status),
    index("idx_ml_prediction_runs_created_by").on(t.createdBy),
  ]
);

export const mlDataValidationReports = pgTable(
  "ml_data_validation_reports",
  {
    anomaliesJson: jsonb("anomalies_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    driftJson: jsonb("drift_json"),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    predictionRunId: uuid("prediction_run_id").references(
      () => mlPredictionRuns.id,
      {
        onDelete: "cascade",
      }
    ),
    rowCount: integer("row_count"),
    sourceId: uuid("source_id"),
    sourceKind: text("source_kind").notNull(),
    statsJson: jsonb("stats_json"),
    status: text("status").notNull(),
    trainingRunId: uuid("training_run_id").references(() => mlTrainingRuns.id, {
      onDelete: "cascade",
    }),
    validationType: text("validation_type").notNull(),
  },
  (t) => [
    index("idx_ml_validation_reports_source").on(t.sourceKind, t.sourceId),
    index("idx_ml_validation_reports_training").on(t.trainingRunId),
    index("idx_ml_validation_reports_prediction").on(t.predictionRunId),
    index("idx_ml_validation_reports_status").on(t.status),
  ]
);

export const mlModelEvaluations = pgTable(
  "ml_model_evaluations",
  {
    artifactPath: text("artifact_path"),
    baselineName: text("baseline_name"),
    businessMetricsJson: jsonb("business_metrics_json"),
    calibrationJson: jsonb("calibration_json"),
    confusionMatrixJson: jsonb("confusion_matrix_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    cutoffDate: date("cutoff_date"),
    datasetSplit: text("dataset_split").notNull(),
    errorAnalysisJson: jsonb("error_analysis_json"),
    evaluationType: text("evaluation_type").notNull(),
    featureImportanceJson: jsonb("feature_importance_json"),
    featureSetId: uuid("feature_set_id").references(() => mlFeatureSets.id, {
      onDelete: "set null",
    }),
    horizonDays: integer("horizon_days"),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    liftTableJson: jsonb("lift_table_json"),
    metricsJson: jsonb("metrics_json"),
    modelType: text("model_type").notNull(),
    modelVersionId: uuid("model_version_id")
      .notNull()
      .references(() => mlModelVersions.id, {
        onDelete: "cascade",
      }),
    // Realized-outcome loop (TRAINING-PIPELINE §15): set on production_holdout rows.
    predictionRunId: uuid("prediction_run_id").references(
      () => mlPredictionRuns.id,
      {
        onDelete: "cascade",
      }
    ),
    trainingRunId: uuid("training_run_id")
      .notNull()
      .references(() => mlTrainingRuns.id, {
        onDelete: "cascade",
      }),
  },
  (t) => [
    index("idx_ml_evaluations_model_version").on(t.modelVersionId),
    index("idx_ml_evaluations_training_run").on(t.trainingRunId),
    index("idx_ml_evaluations_prediction_run").on(t.predictionRunId),
    index("idx_ml_evaluations_type_split").on(
      t.modelType,
      t.evaluationType,
      t.datasetSplit
    ),
  ]
);

export const mlPredictionOutputs = pgTable(
  "ml_prediction_outputs",
  {
    accId: integer("acc_id").notNull(),
    aiExplanation: text("ai_explanation"),
    aiGeneratedAt: timestamp("ai_generated_at", { withTimezone: true }),
    aiModel: text("ai_model"),
    aiReasoningJson: jsonb("ai_reasoning_json"),
    aiStatus: text("ai_status").notNull().default("not_requested"),
    avgTransactionValue: numeric("avg_transaction_value", {
      precision: 14,
      scale: 2,
    }),
    churnFactorsJson: jsonb("churn_factors_json"),
    churnProbability: numeric("churn_probability", { precision: 5, scale: 4 }),
    churnRiskLevel: text("churn_risk_level"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    creditForecastIntervalJson: jsonb("credit_forecast_interval_json"),
    creditUrgencyLevel: text("credit_urgency_level"),
    customerValueTier: text("customer_value_tier"),
    daysSinceLastActivity: integer("days_since_last_activity"),
    estimatedDaysUntilTopup: integer("estimated_days_until_topup"),
    everPaid: boolean("ever_paid").notNull().default(false),
    id: bigserial("id", { mode: "number" }).primaryKey(),
    lifecycleStage: text("lifecycle_stage"),
    modelEligibilityJson: jsonb("model_eligibility_json"),
    modelVersionsJson: jsonb("model_versions_json"),
    needsReview: boolean("needs_review").notNull().default(false),
    nPurchases: integer("n_purchases"),
    outputNotes: text("output_notes"),
    outputStatus: text("output_status").notNull().default("predicted"),
    pAlive: numeric("p_alive", { precision: 5, scale: 4 }),
    predictedClv6m: numeric("predicted_clv_6m", { precision: 14, scale: 2 }),
    predictedCreditUsage30d: numeric("predicted_credit_usage_30d", {
      precision: 14,
      scale: 2,
    }),
    predictedCreditUsage90d: numeric("predicted_credit_usage_90d", {
      precision: 14,
      scale: 2,
    }),
    predictionRunId: uuid("prediction_run_id")
      .notNull()
      .references(() => mlPredictionRuns.id, {
        onDelete: "cascade",
      }),
    priorityRank: integer("priority_rank"),
    priorityScore: numeric("priority_score", { precision: 5, scale: 2 }),
    profileSnapshotJson: jsonb("profile_snapshot_json"),
    revenueAtRisk: numeric("revenue_at_risk", { precision: 14, scale: 2 }),
    segment: text("segment"),
    subStage: text("sub_stage"),
    totalRevenue: numeric("total_revenue", { precision: 14, scale: 2 }),
    usageTrend: text("usage_trend"),
  },
  (t) => [
    uniqueIndex("uq_ml_prediction_outputs_run_acc").on(
      t.predictionRunId,
      t.accId
    ),
    index("idx_ml_prediction_outputs_run").on(t.predictionRunId),
    index("idx_ml_prediction_outputs_acc").on(t.accId),
    index("idx_ml_prediction_outputs_lifecycle").on(t.lifecycleStage),
    index("idx_ml_prediction_outputs_churn").on(t.churnRiskLevel),
    index("idx_ml_prediction_outputs_priority").on(t.priorityScore),
    index("idx_ml_prediction_outputs_segment").on(t.segment),
    index("idx_ml_prediction_outputs_value_tier").on(t.customerValueTier),
    index("idx_ml_prediction_outputs_urgency").on(t.creditUrgencyLevel),
    index("idx_ml_prediction_outputs_needs_review").on(t.needsReview),
  ]
);

// ── AI Chat v2 (reflects db/init/001_schema.sql) ──────────────────────────────
export const aiConversations = pgTable(
  "ai_conversations",
  {
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    runId: uuid("run_id").references(() => mlPredictionRuns.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull().default("New chat"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("ai_conversations_user_idx").on(t.userId, t.updatedAt)]
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    content: text("content").notNull(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    evidenceJson: jsonb("evidence_json"),
    id: bigserial("id", { mode: "number" }).primaryKey(),
    model: text("model"),
    role: text("role").notNull(),
  },
  (t) => [index("ai_messages_conv_idx").on(t.conversationId, t.id)]
);

// ── Convenience type exports ───────────────────────────────────────────────────

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type MlTrainingRun = typeof mlTrainingRuns.$inferSelect;
export type MlModelVersion = typeof mlModelVersions.$inferSelect;
export type MlPredictionRun = typeof mlPredictionRuns.$inferSelect;
export type MlPredictionOutput = typeof mlPredictionOutputs.$inferSelect;
export type AiConversation = typeof aiConversations.$inferSelect;
export type AiMessage = typeof aiMessages.$inferSelect;
