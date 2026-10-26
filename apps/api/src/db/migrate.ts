/**
 * Schema migrations: applies db/migrations/NNN_*.sql in filename order, each exactly once,
 * and records them in schema_migrations (docs/adr/0001-plain-sql-migrations.md).
 *
 * Runs at API boot before the server listens, and as a script (`bun run db:migrate`).
 * Everything happens in one transaction behind an advisory lock, so two API instances
 * booting together can't both apply a file, and a failing migration applies nothing.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sqlClient } from "./client";

const MIGRATIONS_DIR = join(import.meta.dir, "../../../../db/migrations");
const BASELINE = "001_schema.sql";
// Any fixed number works; it only has to be the same for every instance.
const MIGRATION_LOCK_KEY = 1_004_224;

export async function runMigrations(): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  return sqlClient.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`;

    const applied = new Set((await tx`SELECT filename FROM schema_migrations`).map((r) => r.filename as string));

    // A database created before migrations existed already has the baseline tables.
    if (applied.size === 0) {
      const [{ exists }] = await tx`SELECT to_regclass('public.ml_prediction_runs') IS NOT NULL AS exists`;
      if (exists) {
        await tx`INSERT INTO schema_migrations (filename) VALUES (${BASELINE})`;
        applied.add(BASELINE);
      }
    }

    const pending = files.filter((f) => !applied.has(f));
    for (const file of pending) {
      await tx.unsafe(await readFile(join(MIGRATIONS_DIR, file), "utf8"));
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    }
    return pending;
  });
}

if (import.meta.main) {
  const applied = await runMigrations();
  console.log(applied.length ? `[migrate] applied ${applied.join(", ")}` : "[migrate] up to date");
  await sqlClient.end();
}
