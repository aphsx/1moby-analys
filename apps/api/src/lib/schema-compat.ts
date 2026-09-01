/**
 * Idempotent schema tweaks for existing Docker volumes (001_schema.sql only
 * runs on a fresh postgres_data). Safe to re-run on every API boot.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";

export async function ensureImportSchemaCompat(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE train_data_sources DROP CONSTRAINT IF EXISTS train_data_sources_file_checksum_sha256_key`
  );
  await db.execute(sql`ALTER TABLE "user" DROP COLUMN IF EXISTS role`);
  // Data-grounded CLV: retention probability + value range (two-part model).
  await db.execute(
    sql`ALTER TABLE ml_prediction_outputs ADD COLUMN IF NOT EXISTS clv_pay_probability numeric(5,4)`
  );
  await db.execute(
    sql`ALTER TABLE ml_prediction_outputs ADD COLUMN IF NOT EXISTS clv_forecast_interval_json jsonb`
  );
}
