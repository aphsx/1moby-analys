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
}
