-- Brings databases created before migrations existed up to date with 001.
-- Every statement is idempotent, so on a database built from 001 this does nothing.
-- (Formerly apps/api/src/lib/schema-compat.ts, which ran these on every API boot.)

ALTER TABLE train_data_sources DROP CONSTRAINT IF EXISTS train_data_sources_file_checksum_sha256_key;
ALTER TABLE "user" DROP COLUMN IF EXISTS role;
ALTER TABLE ml_prediction_outputs ADD COLUMN IF NOT EXISTS clv_pay_probability numeric(5,4);
ALTER TABLE ml_prediction_outputs ADD COLUMN IF NOT EXISTS clv_forecast_interval_json jsonb;
