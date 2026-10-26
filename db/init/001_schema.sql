-- Moby Analytics schema baseline (migration 001).
-- Applied once to an empty database. Later changes are new files in db/migrations/
-- (see docs/adr/0001-plain-sql-migrations.md). Tables are grouped with their
-- constraints and indexes; foreign keys come last so table order doesn't matter.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE account (
    id text NOT NULL,
    "userId" text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_pkey PRIMARY KEY (id),
    CONSTRAINT "account_providerId_accountId_key" UNIQUE ("providerId", "accountId")
);
CREATE INDEX idx_account_user ON account USING btree ("userId");

CREATE TABLE ai_conversations (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id text NOT NULL,
    run_id uuid,
    title text DEFAULT 'New chat'::text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_conversations_pkey PRIMARY KEY (id)
);
CREATE INDEX ai_conversations_user_idx ON ai_conversations USING btree (user_id, updated_at DESC);

CREATE TABLE ai_messages (
    id bigserial NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    evidence_json jsonb,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text]))),
    CONSTRAINT ai_messages_pkey PRIMARY KEY (id)
);
CREATE INDEX ai_messages_conv_idx ON ai_messages USING btree (conversation_id, id);

CREATE TABLE ml_data_validation_reports (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    source_id uuid,
    source_kind text NOT NULL,
    training_run_id uuid,
    prediction_run_id uuid,
    validation_type text NOT NULL,
    status text NOT NULL,
    row_count integer,
    stats_json jsonb,
    anomalies_json jsonb,
    drift_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_data_validation_reports_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_ml_validation_reports_prediction ON ml_data_validation_reports USING btree (prediction_run_id);
CREATE INDEX idx_ml_validation_reports_source ON ml_data_validation_reports USING btree (source_kind, source_id);
CREATE INDEX idx_ml_validation_reports_status ON ml_data_validation_reports USING btree (status);
CREATE INDEX idx_ml_validation_reports_training ON ml_data_validation_reports USING btree (training_run_id);

CREATE TABLE ml_feature_sets (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    version text NOT NULL,
    model_type text NOT NULL,
    feature_names_json jsonb NOT NULL,
    feature_schema_json jsonb NOT NULL,
    transform_config_json jsonb,
    feature_code_hash text,
    status text DEFAULT 'candidate'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_feature_sets_pkey PRIMARY KEY (id),
    CONSTRAINT uq_ml_feature_sets_name_version_type UNIQUE (name, version, model_type)
);
CREATE INDEX idx_ml_feature_sets_model_type ON ml_feature_sets USING btree (model_type);
CREATE INDEX idx_ml_feature_sets_status ON ml_feature_sets USING btree (status);

CREATE TABLE ml_model_activation_history (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    model_type text NOT NULL,
    previous_model_version_id uuid,
    new_model_version_id uuid,
    action text NOT NULL,
    reason text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_model_activation_history_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_ml_activation_history_new_version ON ml_model_activation_history USING btree (new_model_version_id);
CREATE INDEX idx_ml_activation_history_type ON ml_model_activation_history USING btree (model_type);

CREATE TABLE ml_model_aliases (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    model_type text NOT NULL,
    alias text NOT NULL,
    model_version_id uuid NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_model_aliases_pkey PRIMARY KEY (id),
    CONSTRAINT uq_ml_model_aliases_type_alias UNIQUE (model_type, alias)
);
CREATE INDEX idx_ml_model_aliases_version ON ml_model_aliases USING btree (model_version_id);

CREATE TABLE ml_model_evaluations (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    model_version_id uuid NOT NULL,
    training_run_id uuid NOT NULL,
    -- Realized-outcome loop (TRAINING-PIPELINE §15): production_holdout rows
    -- link the evaluation to the prediction run whose predictions were measured.
    prediction_run_id uuid,
    model_type text NOT NULL,
    evaluation_type text NOT NULL,
    dataset_split text NOT NULL,
    cutoff_date date,
    horizon_days integer,
    baseline_name text,
    feature_set_id uuid,
    metrics_json jsonb,
    confusion_matrix_json jsonb,
    calibration_json jsonb,
    lift_table_json jsonb,
    feature_importance_json jsonb,
    error_analysis_json jsonb,
    business_metrics_json jsonb,
    artifact_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_model_evaluations_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_ml_evaluations_model_version ON ml_model_evaluations USING btree (model_version_id);
CREATE INDEX idx_ml_evaluations_training_run ON ml_model_evaluations USING btree (training_run_id);
CREATE INDEX idx_ml_evaluations_prediction_run ON ml_model_evaluations USING btree (prediction_run_id);
CREATE INDEX idx_ml_evaluations_type_split ON ml_model_evaluations USING btree (model_type, evaluation_type, dataset_split);

CREATE TABLE ml_model_versions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    training_run_id uuid NOT NULL,
    feature_set_id uuid,
    model_type text NOT NULL,
    version text NOT NULL,
    status text DEFAULT 'candidate'::text NOT NULL,
    artifact_path text,
    artifact_checksum text,
    metrics_json jsonb,
    validation_metrics_json jsonb,
    test_metrics_json jsonb,
    feature_names_json jsonb,
    label_definition_json jsonb,
    training_data_snapshot_json jsonb,
    model_card_json jsonb,
    model_card_path text,
    is_active boolean DEFAULT false NOT NULL,
    activated_at timestamp with time zone,
    deactivated_at timestamp with time zone,
    trained_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_model_versions_pkey PRIMARY KEY (id),
    CONSTRAINT uq_ml_model_versions_type_version UNIQUE (model_type, version)
);
CREATE INDEX idx_ml_model_versions_active ON ml_model_versions USING btree (model_type, is_active);
CREATE INDEX idx_ml_model_versions_feature_set ON ml_model_versions USING btree (feature_set_id);
CREATE INDEX idx_ml_model_versions_training_run ON ml_model_versions USING btree (training_run_id);
CREATE INDEX idx_ml_model_versions_type_status ON ml_model_versions USING btree (model_type, status);
CREATE UNIQUE INDEX uq_ml_model_versions_one_active_per_type ON ml_model_versions USING btree (model_type) WHERE (is_active = true);

CREATE TABLE ml_prediction_outputs (
    id bigserial NOT NULL,
    prediction_run_id uuid NOT NULL,
    acc_id integer NOT NULL,
    lifecycle_stage text,
    sub_stage text,
    churn_probability numeric(5,4),
    churn_risk_level text,
    churn_factors_json jsonb,
    predicted_clv_6m numeric(14,2),
    clv_pay_probability numeric(5,4),
    clv_forecast_interval_json jsonb,
    p_alive numeric(5,4),
    customer_value_tier text,
    revenue_at_risk numeric(14,2),
    predicted_credit_usage_30d numeric(14,2),
    predicted_credit_usage_90d numeric(14,2),
    credit_forecast_interval_json jsonb,
    estimated_days_until_topup integer,
    credit_urgency_level text,
    usage_trend text,
    days_since_last_activity integer,
    n_purchases integer,
    total_revenue numeric(14,2),
    avg_transaction_value numeric(14,2),
    ever_paid boolean DEFAULT false NOT NULL,
    priority_score numeric(5,2),
    segment text,
    priority_rank integer,
    needs_review boolean DEFAULT false NOT NULL,
    ai_explanation text,
    ai_reasoning_json jsonb,
    ai_generated_at timestamp with time zone,
    ai_model text,
    ai_status text DEFAULT 'not_requested'::text NOT NULL,
    output_status text DEFAULT 'predicted'::text NOT NULL,
    output_notes text,
    model_eligibility_json jsonb,
    model_versions_json jsonb,
    profile_snapshot_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_prediction_outputs_pkey PRIMARY KEY (id),
    CONSTRAINT uq_ml_prediction_outputs_run_acc UNIQUE (prediction_run_id, acc_id)
);
CREATE INDEX idx_ml_prediction_outputs_acc ON ml_prediction_outputs USING btree (acc_id);
CREATE INDEX idx_ml_prediction_outputs_churn ON ml_prediction_outputs USING btree (churn_risk_level);
CREATE INDEX idx_ml_prediction_outputs_lifecycle ON ml_prediction_outputs USING btree (lifecycle_stage);
CREATE INDEX idx_ml_prediction_outputs_priority ON ml_prediction_outputs USING btree (priority_score);
CREATE INDEX idx_ml_prediction_outputs_run ON ml_prediction_outputs USING btree (prediction_run_id);
CREATE INDEX idx_ml_prediction_outputs_segment ON ml_prediction_outputs USING btree (segment);
CREATE INDEX idx_ml_prediction_outputs_value_tier ON ml_prediction_outputs USING btree (customer_value_tier);
CREATE INDEX idx_ml_prediction_outputs_urgency ON ml_prediction_outputs USING btree (credit_urgency_level);
CREATE INDEX idx_ml_prediction_outputs_needs_review ON ml_prediction_outputs USING btree (needs_review);

CREATE TABLE ml_prediction_runs (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name text DEFAULT 'Prediction run'::text NOT NULL,
    predict_source_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    cutoff_date date NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    total_customers integer,
    progress_json jsonb,
    model_versions_json jsonb,
    cohort_insight_json jsonb,
    -- Optional per-run model overrides: {"churn": "<version_id>", ...}. NULL or a
    -- missing key means "use the current production champion" for that model type.
    model_overrides_json jsonb,
    error_message text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_prediction_runs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_ml_prediction_runs_created_by ON ml_prediction_runs USING btree (created_by);
CREATE INDEX idx_ml_prediction_runs_source ON ml_prediction_runs USING btree (predict_source_id);
CREATE INDEX idx_ml_prediction_runs_status ON ml_prediction_runs USING btree (status);

CREATE TABLE ml_training_runs (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    source_id uuid NOT NULL,
    run_type text DEFAULT 'initial_train'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    cutoff_date date NOT NULL,
    horizon_days integer NOT NULL,
    training_config_json jsonb,
    progress_json jsonb,
    results_json jsonb,
    parent_training_run_id uuid,
    notes text,
    error_message text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ml_training_runs_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_ml_training_runs_created_by ON ml_training_runs USING btree (created_by);
CREATE INDEX idx_ml_training_runs_source ON ml_training_runs USING btree (source_id);
CREATE INDEX idx_ml_training_runs_status ON ml_training_runs USING btree (status);

CREATE TABLE predict_clean_customers (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    raw_row_id bigint NOT NULL,
    excel_row integer NOT NULL,
    acc_id integer NOT NULL,
    status_sms text,
    credit_sms numeric,
    credit_email numeric,
    expire_sms date,
    expire_email date,
    status_email text,
    join_date date,
    last_access timestamp with time zone,
    last_send timestamp with time zone,
    CONSTRAINT predict_clean_customers_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_clean_customers_acc ON predict_clean_customers USING btree (source_id, acc_id);
CREATE INDEX idx_predict_clean_customers_lineage ON predict_clean_customers USING btree (source_id, excel_row);
CREATE INDEX idx_predict_clean_customers_source ON predict_clean_customers USING btree (source_id);

CREATE TABLE predict_clean_payments (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    raw_row_id bigint NOT NULL,
    excel_row integer NOT NULL,
    acc_id integer NOT NULL,
    payment_uid bigint,
    payment_date timestamp with time zone NOT NULL,
    amount numeric,
    credit_add numeric,
    credit_type text,
    CONSTRAINT predict_clean_payments_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_clean_payments_acc ON predict_clean_payments USING btree (source_id, acc_id);
CREATE INDEX idx_predict_clean_payments_date ON predict_clean_payments USING btree (source_id, payment_date);
CREATE INDEX idx_predict_clean_payments_lineage ON predict_clean_payments USING btree (source_id, excel_row);
CREATE INDEX idx_predict_clean_payments_source ON predict_clean_payments USING btree (source_id);

CREATE TABLE predict_clean_usage (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    raw_row_id bigint NOT NULL,
    excel_row integer NOT NULL,
    acc_id integer NOT NULL,
    year integer,
    month integer,
    usage numeric,
    channel text NOT NULL,
    usage_source text NOT NULL,
    CONSTRAINT predict_clean_usage_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_clean_usage_acc ON predict_clean_usage USING btree (source_id, acc_id);
CREATE INDEX idx_predict_clean_usage_lineage ON predict_clean_usage USING btree (source_id, excel_row);
CREATE INDEX idx_predict_clean_usage_period ON predict_clean_usage USING btree (source_id, year, month);
CREATE INDEX idx_predict_clean_usage_source ON predict_clean_usage USING btree (source_id);

CREATE TABLE predict_data_sources (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    client_label text,
    original_filename text NOT NULL,
    file_checksum_sha256 text NOT NULL,
    file_size_bytes bigint,
    import_status text DEFAULT 'pending'::text NOT NULL,
    imported_at timestamp with time zone,
    sheet_manifest jsonb,
    notes text,
    error_message text,
    imported_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clean_manifest jsonb,
    cleaned_at timestamp with time zone,
    CONSTRAINT predict_data_sources_import_status_check CHECK ((import_status = ANY (ARRAY['pending'::text, 'importing'::text, 'cleaning'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT predict_data_sources_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_data_sources_client ON predict_data_sources USING btree (client_label);
CREATE INDEX idx_predict_data_sources_imported_by ON predict_data_sources USING btree (imported_by);
CREATE INDEX idx_predict_data_sources_status ON predict_data_sources USING btree (import_status);

CREATE TABLE predict_raw_sheet_backend_payment (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT predict_raw_sheet_backend_payment_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_raw_pay_source ON predict_raw_sheet_backend_payment USING btree (source_id);
CREATE INDEX idx_predict_raw_pay_source_row ON predict_raw_sheet_backend_payment USING btree (source_id, excel_row);

CREATE TABLE predict_raw_sheet_email_usage_api (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT predict_raw_sheet_email_usage_api_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_raw_email_api_source ON predict_raw_sheet_email_usage_api USING btree (source_id);

CREATE TABLE predict_raw_sheet_email_usage_bc (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT predict_raw_sheet_email_usage_bc_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_raw_email_bc_source ON predict_raw_sheet_email_usage_bc USING btree (source_id);

CREATE TABLE predict_raw_sheet_email_usage_otp (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT predict_raw_sheet_email_usage_otp_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_raw_email_otp_source ON predict_raw_sheet_email_usage_otp USING btree (source_id);

CREATE TABLE predict_raw_sheet_sms_usage_api (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT predict_raw_sheet_sms_usage_api_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_raw_sms_api_source ON predict_raw_sheet_sms_usage_api USING btree (source_id);

CREATE TABLE predict_raw_sheet_sms_usage_bc (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT predict_raw_sheet_sms_usage_bc_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_raw_sms_bc_source ON predict_raw_sheet_sms_usage_bc USING btree (source_id);

CREATE TABLE predict_raw_sheet_sms_usage_otp (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT predict_raw_sheet_sms_usage_otp_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_raw_sms_otp_source ON predict_raw_sheet_sms_usage_otp USING btree (source_id);

CREATE TABLE predict_raw_sheet_users_user_profile (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT predict_raw_sheet_users_user_profile_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_predict_raw_users_source ON predict_raw_sheet_users_user_profile USING btree (source_id);
CREATE INDEX idx_predict_raw_users_source_row ON predict_raw_sheet_users_user_profile USING btree (source_id, excel_row);

CREATE TABLE session (
    id text NOT NULL,
    "userId" text NOT NULL,
    token text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (id),
    CONSTRAINT session_token_key UNIQUE (token)
);
CREATE INDEX idx_session_token ON session USING btree (token);
CREATE INDEX idx_session_user ON session USING btree ("userId");

CREATE TABLE train_clean_customers (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    acc_id integer NOT NULL,
    status_sms text,
    credit_sms numeric,
    credit_email numeric,
    expire_sms date,
    expire_email date,
    status_email text,
    join_date date,
    last_access timestamp with time zone,
    last_send timestamp with time zone,
    excel_row integer NOT NULL,
    raw_row_id bigint NOT NULL,
    CONSTRAINT train_clean_customers_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_clean_customers_acc ON train_clean_customers USING btree (source_id, acc_id);
CREATE INDEX idx_train_clean_customers_lineage ON train_clean_customers USING btree (source_id, excel_row);
CREATE INDEX idx_train_clean_customers_source ON train_clean_customers USING btree (source_id);

CREATE TABLE train_clean_payments (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    acc_id integer NOT NULL,
    payment_uid bigint,
    payment_date timestamp with time zone NOT NULL,
    amount numeric,
    credit_add numeric,
    credit_type text,
    excel_row integer NOT NULL,
    raw_row_id bigint NOT NULL,
    CONSTRAINT train_clean_payments_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_clean_payments_acc ON train_clean_payments USING btree (source_id, acc_id);
CREATE INDEX idx_train_clean_payments_date ON train_clean_payments USING btree (source_id, payment_date);
CREATE INDEX idx_train_clean_payments_lineage ON train_clean_payments USING btree (source_id, excel_row);
CREATE INDEX idx_train_clean_payments_source ON train_clean_payments USING btree (source_id);

CREATE TABLE train_clean_usage (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    acc_id integer NOT NULL,
    year integer,
    month integer,
    usage numeric,
    channel text NOT NULL,
    usage_source text NOT NULL,
    excel_row integer NOT NULL,
    raw_row_id bigint NOT NULL,
    CONSTRAINT train_clean_usage_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_clean_usage_acc ON train_clean_usage USING btree (source_id, acc_id);
CREATE INDEX idx_train_clean_usage_lineage ON train_clean_usage USING btree (source_id, excel_row);
CREATE INDEX idx_train_clean_usage_period ON train_clean_usage USING btree (source_id, year, month);
CREATE INDEX idx_train_clean_usage_source ON train_clean_usage USING btree (source_id);

CREATE TABLE train_data_sources (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    client_label text,
    original_filename text NOT NULL,
    file_checksum_sha256 text NOT NULL,
    file_size_bytes bigint,
    import_status text DEFAULT 'pending'::text NOT NULL,
    imported_at timestamp with time zone,
    sheet_manifest jsonb,
    notes text,
    error_message text,
    imported_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clean_manifest jsonb,
    cleaned_at timestamp with time zone,
    CONSTRAINT train_data_sources_import_status_check CHECK ((import_status = ANY (ARRAY['pending'::text, 'importing'::text, 'cleaning'::text, 'ready'::text, 'failed'::text]))),
    CONSTRAINT train_data_sources_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_data_sources_client ON train_data_sources USING btree (client_label);
CREATE INDEX idx_train_data_sources_imported_by ON train_data_sources USING btree (imported_by);
CREATE INDEX idx_train_data_sources_status ON train_data_sources USING btree (import_status);

CREATE TABLE train_raw_sheet_backend_payment (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT train_raw_sheet_backend_payment_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_raw_pay_source ON train_raw_sheet_backend_payment USING btree (source_id);
CREATE INDEX idx_train_raw_pay_source_row ON train_raw_sheet_backend_payment USING btree (source_id, excel_row);

CREATE TABLE train_raw_sheet_email_usage_api (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT train_raw_sheet_email_usage_api_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_raw_email_api_source ON train_raw_sheet_email_usage_api USING btree (source_id);

CREATE TABLE train_raw_sheet_email_usage_bc (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT train_raw_sheet_email_usage_bc_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_raw_email_bc_source ON train_raw_sheet_email_usage_bc USING btree (source_id);

CREATE TABLE train_raw_sheet_email_usage_otp (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT train_raw_sheet_email_usage_otp_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_raw_email_otp_source ON train_raw_sheet_email_usage_otp USING btree (source_id);

CREATE TABLE train_raw_sheet_sms_usage_api (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT train_raw_sheet_sms_usage_api_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_raw_sms_api_source ON train_raw_sheet_sms_usage_api USING btree (source_id);

CREATE TABLE train_raw_sheet_sms_usage_bc (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT train_raw_sheet_sms_usage_bc_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_raw_sms_bc_source ON train_raw_sheet_sms_usage_bc USING btree (source_id);

CREATE TABLE train_raw_sheet_sms_usage_otp (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT train_raw_sheet_sms_usage_otp_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_raw_sms_otp_source ON train_raw_sheet_sms_usage_otp USING btree (source_id);

CREATE TABLE train_raw_sheet_users_user_profile (
    id bigserial NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT train_raw_sheet_users_user_profile_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_train_raw_users_source ON train_raw_sheet_users_user_profile USING btree (source_id);
CREATE INDEX idx_train_raw_users_source_row ON train_raw_sheet_users_user_profile USING btree (source_id, excel_row);

CREATE TABLE "user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean DEFAULT false NOT NULL,
    image text,
    "givenName" text,
    "familyName" text,
    locale text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_email_key UNIQUE (email),
    CONSTRAINT user_pkey PRIMARY KEY (id)
);

CREATE TABLE verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT verification_pkey PRIMARY KEY (id)
);

-- Foreign keys
ALTER TABLE account ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;
ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_run_id_fkey FOREIGN KEY (run_id) REFERENCES ml_prediction_runs(id) ON DELETE SET NULL;
ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
ALTER TABLE ai_messages ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE;
ALTER TABLE ml_data_validation_reports ADD CONSTRAINT ml_data_validation_reports_prediction_run_id_fkey FOREIGN KEY (prediction_run_id) REFERENCES ml_prediction_runs(id) ON DELETE CASCADE;
ALTER TABLE ml_data_validation_reports ADD CONSTRAINT ml_data_validation_reports_training_run_id_fkey FOREIGN KEY (training_run_id) REFERENCES ml_training_runs(id) ON DELETE CASCADE;
ALTER TABLE ml_model_activation_history ADD CONSTRAINT ml_model_activation_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE ml_model_activation_history ADD CONSTRAINT ml_model_activation_history_new_model_version_id_fkey FOREIGN KEY (new_model_version_id) REFERENCES ml_model_versions(id) ON DELETE SET NULL;
ALTER TABLE ml_model_activation_history ADD CONSTRAINT ml_model_activation_history_previous_model_version_id_fkey FOREIGN KEY (previous_model_version_id) REFERENCES ml_model_versions(id) ON DELETE SET NULL;
ALTER TABLE ml_model_aliases ADD CONSTRAINT ml_model_aliases_created_by_fkey FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE ml_model_aliases ADD CONSTRAINT ml_model_aliases_model_version_id_fkey FOREIGN KEY (model_version_id) REFERENCES ml_model_versions(id) ON DELETE CASCADE;
ALTER TABLE ml_model_evaluations ADD CONSTRAINT ml_model_evaluations_feature_set_id_fkey FOREIGN KEY (feature_set_id) REFERENCES ml_feature_sets(id) ON DELETE SET NULL;
ALTER TABLE ml_model_evaluations ADD CONSTRAINT ml_model_evaluations_model_version_id_fkey FOREIGN KEY (model_version_id) REFERENCES ml_model_versions(id) ON DELETE CASCADE;
ALTER TABLE ml_model_evaluations ADD CONSTRAINT ml_model_evaluations_training_run_id_fkey FOREIGN KEY (training_run_id) REFERENCES ml_training_runs(id) ON DELETE CASCADE;
ALTER TABLE ml_model_evaluations ADD CONSTRAINT ml_model_evaluations_prediction_run_id_fkey FOREIGN KEY (prediction_run_id) REFERENCES ml_prediction_runs(id) ON DELETE CASCADE;
ALTER TABLE ml_model_versions ADD CONSTRAINT ml_model_versions_feature_set_id_fkey FOREIGN KEY (feature_set_id) REFERENCES ml_feature_sets(id) ON DELETE SET NULL;
ALTER TABLE ml_model_versions ADD CONSTRAINT ml_model_versions_training_run_id_fkey FOREIGN KEY (training_run_id) REFERENCES ml_training_runs(id) ON DELETE CASCADE;
ALTER TABLE ml_prediction_outputs ADD CONSTRAINT ml_prediction_outputs_prediction_run_id_fkey FOREIGN KEY (prediction_run_id) REFERENCES ml_prediction_runs(id) ON DELETE CASCADE;
ALTER TABLE ml_prediction_runs ADD CONSTRAINT ml_prediction_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE ml_training_runs ADD CONSTRAINT ml_training_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE ml_training_runs ADD CONSTRAINT ml_training_runs_parent_training_run_id_fkey FOREIGN KEY (parent_training_run_id) REFERENCES ml_training_runs(id) ON DELETE SET NULL;
ALTER TABLE predict_clean_customers ADD CONSTRAINT predict_clean_customers_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_clean_payments ADD CONSTRAINT predict_clean_payments_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_clean_usage ADD CONSTRAINT predict_clean_usage_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_raw_sheet_backend_payment ADD CONSTRAINT predict_raw_sheet_backend_payment_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_raw_sheet_email_usage_api ADD CONSTRAINT predict_raw_sheet_email_usage_api_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_raw_sheet_email_usage_bc ADD CONSTRAINT predict_raw_sheet_email_usage_bc_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_raw_sheet_email_usage_otp ADD CONSTRAINT predict_raw_sheet_email_usage_otp_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_raw_sheet_sms_usage_api ADD CONSTRAINT predict_raw_sheet_sms_usage_api_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_raw_sheet_sms_usage_bc ADD CONSTRAINT predict_raw_sheet_sms_usage_bc_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_raw_sheet_sms_usage_otp ADD CONSTRAINT predict_raw_sheet_sms_usage_otp_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE predict_raw_sheet_users_user_profile ADD CONSTRAINT predict_raw_sheet_users_user_profile_source_id_fkey FOREIGN KEY (source_id) REFERENCES predict_data_sources(id) ON DELETE CASCADE;
ALTER TABLE session ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;
ALTER TABLE train_clean_customers ADD CONSTRAINT train_clean_customers_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_clean_payments ADD CONSTRAINT train_clean_payments_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_clean_usage ADD CONSTRAINT train_clean_usage_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_raw_sheet_backend_payment ADD CONSTRAINT train_raw_sheet_backend_payment_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_raw_sheet_email_usage_api ADD CONSTRAINT train_raw_sheet_email_usage_api_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_raw_sheet_email_usage_bc ADD CONSTRAINT train_raw_sheet_email_usage_bc_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_raw_sheet_email_usage_otp ADD CONSTRAINT train_raw_sheet_email_usage_otp_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_raw_sheet_sms_usage_api ADD CONSTRAINT train_raw_sheet_sms_usage_api_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_raw_sheet_sms_usage_bc ADD CONSTRAINT train_raw_sheet_sms_usage_bc_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_raw_sheet_sms_usage_otp ADD CONSTRAINT train_raw_sheet_sms_usage_otp_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
ALTER TABLE train_raw_sheet_users_user_profile ADD CONSTRAINT train_raw_sheet_users_user_profile_source_id_fkey FOREIGN KEY (source_id) REFERENCES train_data_sources(id) ON DELETE CASCADE;
