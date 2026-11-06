-- Drop columns nothing reads or writes, and let the database reject status / level values
-- the code never produces. Allowed values match packages/types/src/enums.ts and
-- apps/ml/src/constants.py; the level columns allow NULL (no prediction for that model).

ALTER TABLE ml_model_versions DROP COLUMN IF EXISTS model_card_path;
ALTER TABLE ml_model_evaluations DROP COLUMN IF EXISTS error_analysis_json;
ALTER TABLE ml_model_evaluations DROP COLUMN IF EXISTS artifact_path;

ALTER TABLE ml_prediction_runs ADD CONSTRAINT ml_prediction_runs_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'));
ALTER TABLE ml_training_runs ADD CONSTRAINT ml_training_runs_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'));
ALTER TABLE ml_model_versions ADD CONSTRAINT ml_model_versions_status_check
    CHECK (status IN ('candidate', 'production', 'archived'));

ALTER TABLE ml_prediction_outputs ADD CONSTRAINT ml_prediction_outputs_output_status_check
    CHECK (output_status IN ('predicted', 'partial', 'insufficient_data'));
ALTER TABLE ml_prediction_outputs ADD CONSTRAINT ml_prediction_outputs_ai_status_check
    CHECK (ai_status IN ('not_requested', 'pending', 'completed', 'failed'));
ALTER TABLE ml_prediction_outputs ADD CONSTRAINT ml_prediction_outputs_churn_risk_level_check
    CHECK (churn_risk_level IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE ml_prediction_outputs ADD CONSTRAINT ml_prediction_outputs_credit_urgency_level_check
    CHECK (credit_urgency_level IN ('stable', 'monitor', 'warning', 'critical'));
ALTER TABLE ml_prediction_outputs ADD CONSTRAINT ml_prediction_outputs_customer_value_tier_check
    CHECK (customer_value_tier IN ('high', 'mid', 'low', 'none'));
