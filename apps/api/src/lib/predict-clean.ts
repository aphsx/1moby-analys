/**
 * [NEW] Predict clean — ETL from predict_raw_sheet_* → predict_clean_* per upload/run.
 * Same parse + lineage rules as train clean; ML semantics stay in Python.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  predictCleanCustomers,
  predictCleanPayments,
  predictCleanUsage,
  predictDataSources,
  predictRawSheetBackendPayment,
  predictRawSheetEmailUsageApi,
  predictRawSheetEmailUsageBc,
  predictRawSheetEmailUsageOtp,
  predictRawSheetSmsUsageApi,
  predictRawSheetSmsUsageBc,
  predictRawSheetSmsUsageOtp,
  predictRawSheetUsersUserProfile,
} from "../db/schema";
import { abortPredictDataSource } from "./abort-data-source";
import type { CleanManifest } from "./clean-manifest";
import { PREDICT_IMPORT_BATCH_SIZE } from "./predict-excel-contract";
import {
  type CleanSkipReason,
  emptySkippedCounts,
  mapPaymentRow,
  mapUsageRow,
  mapUserRow,
  type RawRowInput,
} from "./sheet-cleaners";
import { USAGE_SHEET_CHANNEL, USAGE_SHEET_NAMES } from "./train-clean-mapping";

export type { CleanManifest } from "./clean-manifest";

type MappedRow<T extends { ok: boolean }> =
  Extract<T, { ok: true }> extends { value: infer V } ? V : never;
type CustomerRow = MappedRow<ReturnType<typeof mapUserRow>>;
type PaymentRow = MappedRow<ReturnType<typeof mapPaymentRow>>;
type UsageRow = MappedRow<ReturnType<typeof mapUsageRow>>;

const USAGE_RAW_TABLES = {
  "Email_usage (API)": predictRawSheetEmailUsageApi,
  "Email_usage (BC)": predictRawSheetEmailUsageBc,
  "Email_usage (OTP)": predictRawSheetEmailUsageOtp,
  "SMS_usage (API)": predictRawSheetSmsUsageApi,
  "SMS_usage (BC)": predictRawSheetSmsUsageBc,
  "SMS_usage (OTP)": predictRawSheetSmsUsageOtp,
} as const;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function bumpSkip(
  skipped: Record<CleanSkipReason, number>,
  reason: CleanSkipReason
): void {
  skipped[reason] += 1;
}

function toRawInput(row: {
  id: number;
  excelRow: number;
  rowPayload: unknown;
}): RawRowInput {
  return {
    excelRow: row.excelRow,
    payload: row.rowPayload as Record<string, unknown>,
    rawRowId: row.id,
  };
}

export async function cleanPredictFromRaw(
  sourceId: string
): Promise<CleanManifest> {
  const [sourceRow] = await db
    .select({ sheetManifest: predictDataSources.sheetManifest })
    .from(predictDataSources)
    .where(eq(predictDataSources.id, sourceId))
    .limit(1);

  const rawManifest =
    (sourceRow?.sheetManifest as Record<string, number> | null) ?? {};

  await db
    .update(predictDataSources)
    .set({ errorMessage: null, importStatus: "cleaning" })
    .where(eq(predictDataSources.id, sourceId));

  const skipped = emptySkippedCounts();
  const warnings: string[] = [];
  let customers = 0;
  let payments = 0;
  let usage = 0;

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(predictCleanCustomers)
        .where(eq(predictCleanCustomers.sourceId, sourceId));
      await tx
        .delete(predictCleanPayments)
        .where(eq(predictCleanPayments.sourceId, sourceId));
      await tx
        .delete(predictCleanUsage)
        .where(eq(predictCleanUsage.sourceId, sourceId));

      const userRows = await tx
        .select({
          excelRow: predictRawSheetUsersUserProfile.excelRow,
          id: predictRawSheetUsersUserProfile.id,
          rowPayload: predictRawSheetUsersUserProfile.rowPayload,
        })
        .from(predictRawSheetUsersUserProfile)
        .where(eq(predictRawSheetUsersUserProfile.sourceId, sourceId));

      const customerValues: CustomerRow[] = [];
      for (const r of userRows) {
        const mapped = mapUserRow(toRawInput(r), sourceId);
        if (!mapped.ok) {
          bumpSkip(skipped, mapped.reason);
          continue;
        }
        customerValues.push(mapped.value);
      }

      for (const batch of chunk(customerValues, PREDICT_IMPORT_BATCH_SIZE)) {
        await tx.insert(predictCleanCustomers).values(batch);
        customers += batch.length;
      }

      const payRows = await tx
        .select({
          excelRow: predictRawSheetBackendPayment.excelRow,
          id: predictRawSheetBackendPayment.id,
          rowPayload: predictRawSheetBackendPayment.rowPayload,
        })
        .from(predictRawSheetBackendPayment)
        .where(eq(predictRawSheetBackendPayment.sourceId, sourceId));

      const paymentValues: PaymentRow[] = [];
      for (const r of payRows) {
        const mapped = mapPaymentRow(toRawInput(r), sourceId);
        if (!mapped.ok) {
          bumpSkip(skipped, mapped.reason);
          continue;
        }
        paymentValues.push(mapped.value);
      }

      for (const batch of chunk(paymentValues, PREDICT_IMPORT_BATCH_SIZE)) {
        await tx.insert(predictCleanPayments).values(batch);
        payments += batch.length;
      }

      for (const sheetName of USAGE_SHEET_NAMES) {
        const meta = USAGE_SHEET_CHANNEL[sheetName];
        const table =
          USAGE_RAW_TABLES[sheetName as keyof typeof USAGE_RAW_TABLES];

        const rawUsage = await tx
          .select({
            excelRow: table.excelRow,
            id: table.id,
            rowPayload: table.rowPayload,
          })
          .from(table)
          .where(eq(table.sourceId, sourceId));

        const usageValues: UsageRow[] = [];
        for (const r of rawUsage) {
          const mapped = mapUsageRow(
            toRawInput(r),
            sourceId,
            meta.channel,
            meta.usageSource
          );
          if (!mapped.ok) {
            bumpSkip(skipped, mapped.reason);
            continue;
          }
          if (mapped.warnings) {
            warnings.push(...mapped.warnings);
          }
          usageValues.push(mapped.value);
        }

        for (const batch of chunk(usageValues, PREDICT_IMPORT_BATCH_SIZE)) {
          await tx.insert(predictCleanUsage).values(batch);
          usage += batch.length;
        }
      }
    });

    const manifest: CleanManifest = {
      clean: { customers, payments, usage },
      raw: rawManifest,
      skipped: {
        customers_no_acc_id: skipped.customers_no_acc_id,
        payments_no_acc_id: skipped.payments_no_acc_id,
        payments_no_date: skipped.payments_no_date,
        usage_no_acc_id: skipped.usage_no_acc_id,
      },
      warnings,
    };

    await db
      .update(predictDataSources)
      .set({
        cleanedAt: new Date(),
        cleanManifest: manifest,
        errorMessage: null,
        importStatus: "ready",
      })
      .where(eq(predictDataSources.id, sourceId));

    return manifest;
  } catch (e) {
    await abortPredictDataSource(sourceId);
    throw e;
  }
}
