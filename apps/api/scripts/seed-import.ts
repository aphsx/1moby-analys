/**
 * Dev seed: import a workbook as both a Train and a Predict Data Source, through the
 * same Import + Clean pipeline the API routes use. Usage:
 *
 *   DATABASE_URL=... bun run apps/api/scripts/seed-import.ts <path-to-xlsx>
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, sqlClient } from "../src/db/client";
import { runImportPipeline } from "../src/lib/data-import/import-pipeline";
import { createDataSource } from "../src/lib/data-import/raw-import";
import type { DataSourceKind } from "../src/lib/data-import/source-tables";

const DEV_USER_ID = "dev-user-local";

async function ensureDevUser(): Promise<void> {
  await db.execute(sql`
    INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    VALUES (${DEV_USER_ID}, 'Dev User', 'dev@local.test', true, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function seed(kind: DataSourceKind, buffer: Buffer): Promise<void> {
  console.log(`[seed] importing ${kind}…`);
  const sourceId = await createDataSource(kind, {
    buffer,
    filename: "seed.xlsx",
    name: `1Moby example (${kind})`,
    imported_by: DEV_USER_ID,
  });
  const result = await runImportPipeline(kind, sourceId, buffer);
  console.log(`[seed] ${kind} source ready:`, sourceId, JSON.stringify(result.clean_manifest?.clean));
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: bun run seed-import.ts <path-to-xlsx>");
  const buffer = readFileSync(path);

  await ensureDevUser();
  await seed("train", buffer);
  await seed("predict", buffer);
  await sqlClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
