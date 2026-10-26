/**
 * Clean: turn a Data Source's raw rows into typed customers, payments and usage, then mark
 * it `ready`. Parsing and lineage only; ML rules (periods, labels) stay in Python.
 */
import { IMPORT_STATUS, type CleanManifest } from "@moby/types";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { chunk } from "./excel-core";
import {
  emptySkippedCounts,
  mapPaymentRow,
  mapUsageRow,
  mapUserRow,
  type CleanSkipReason,
  type MapResult,
  type RawRowInput,
} from "./sheet-cleaners";
import { IMPORT_BATCH_SIZE, USAGE_SHEET_CHANNEL, USAGE_SHEET_NAMES } from "./sheet-contract";
import { SOURCE_TABLES, type DataSourceKind } from "./source-tables";
import { importProgress, type OnImportProgress } from "./train-progress/progress";

type RawRow = { id: number; excelRow: number; rowPayload: unknown };

const toRawInput = (row: RawRow): RawRowInput => ({
  excelRow: row.excelRow,
  rawRowId: row.id,
  payload: row.rowPayload as Record<string, unknown>,
});

/** Map raw rows, counting skips and collecting warnings. */
function mapRows<T>(
  rows: RawRow[],
  map: (raw: RawRowInput) => MapResult<T>,
  skipped: Record<CleanSkipReason, number>,
  warnings: string[]
): T[] {
  const values: T[] = [];
  for (const row of rows) {
    const mapped = map(toRawInput(row));
    if (!mapped.ok) {
      skipped[mapped.reason] += 1;
      continue;
    }
    if (mapped.warnings) warnings.push(...mapped.warnings);
    values.push(mapped.value);
  }
  return values;
}

/** Replace the source's clean rows with a fresh Clean of its raw rows. Callers roll back on failure. */
export async function cleanFromRaw(
  kind: DataSourceKind,
  sourceId: string,
  onProgress?: OnImportProgress
): Promise<CleanManifest> {
  const emit = onProgress;
  const { sources, raw, clean } = SOURCE_TABLES[kind];

  const [sourceRow] = await db
    .select({ sheetManifest: sources.sheetManifest })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1);
  const rawManifest = (sourceRow?.sheetManifest as Record<string, number> | null) ?? {};

  await db
    .update(sources)
    .set({ importStatus: IMPORT_STATUS.CLEANING, errorMessage: null })
    .where(eq(sources.id, sourceId));
  emit?.(importProgress.cleanStarted());

  const skipped = emptySkippedCounts();
  const warnings: string[] = [];
  const counts = { customers: 0, payments: 0, usage: 0 };

  await db.transaction(async (tx) => {
    await tx.delete(clean.customers).where(eq(clean.customers.sourceId, sourceId));
    await tx.delete(clean.payments).where(eq(clean.payments.sourceId, sourceId));
    await tx.delete(clean.usage).where(eq(clean.usage.sourceId, sourceId));

    const readRaw = (table: (typeof raw)[keyof typeof raw]) =>
      tx
        .select({ id: table.id, excelRow: table.excelRow, rowPayload: table.rowPayload })
        .from(table)
        .where(eq(table.sourceId, sourceId));

    emit?.(importProgress.cleanCustomers());
    const customers = mapRows(
      await readRaw(raw["Users+User_profile"]),
      (r) => mapUserRow(r, sourceId),
      skipped,
      warnings
    );
    for (const batch of chunk(customers, IMPORT_BATCH_SIZE)) {
      await tx.insert(clean.customers).values(batch);
      counts.customers += batch.length;
    }

    emit?.(importProgress.cleanPayments());
    const payments = mapRows(
      await readRaw(raw["Backend_payment"]),
      (r) => mapPaymentRow(r, sourceId),
      skipped,
      warnings
    );
    for (const batch of chunk(payments, IMPORT_BATCH_SIZE)) {
      await tx.insert(clean.payments).values(batch);
      counts.payments += batch.length;
    }

    for (const [i, sheet] of USAGE_SHEET_NAMES.entries()) {
      const { channel, usageSource } = USAGE_SHEET_CHANNEL[sheet];
      const usage = mapRows(
        await readRaw(raw[sheet]),
        (r) => mapUsageRow(r, sourceId, channel, usageSource),
        skipped,
        warnings
      );
      for (const batch of chunk(usage, IMPORT_BATCH_SIZE)) {
        await tx.insert(clean.usage).values(batch);
        counts.usage += batch.length;
      }
      emit?.(importProgress.cleanUsageSheet(i, USAGE_SHEET_NAMES.length, sheet, usage.length));
    }
  });

  const manifest: CleanManifest = { raw: rawManifest, clean: counts, skipped, warnings };
  await db
    .update(sources)
    .set({ importStatus: IMPORT_STATUS.READY, cleanManifest: manifest, cleanedAt: new Date(), errorMessage: null })
    .where(eq(sources.id, sourceId));
  emit?.(importProgress.done());
  return manifest;
}
