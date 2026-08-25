/**
 * [NEW] Train clean — ETL from train_raw_sheet_* → train_clean_* for model training.
 * Parse + lineage only; ML rules (period, labels) stay in Python.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  trainCleanCustomers,
  trainCleanPayments,
  trainCleanUsage,
  trainDataSources,
  trainRawSheetBackendPayment,
  trainRawSheetEmailUsageApi,
  trainRawSheetEmailUsageBc,
  trainRawSheetEmailUsageOtp,
  trainRawSheetSmsUsageApi,
  trainRawSheetSmsUsageBc,
  trainRawSheetSmsUsageOtp,
  trainRawSheetUsersUserProfile,
} from "../db/schema";
import type { CleanManifest } from "./clean-manifest";
import {
  type CleanSkipReason,
  emptySkippedCounts,
  mapPaymentRow,
  mapUsageRow,
  mapUserRow,
  type RawRowInput,
} from "./sheet-cleaners";
import { USAGE_SHEET_CHANNEL, USAGE_SHEET_NAMES } from "./train-clean-mapping";
import { TRAIN_IMPORT_BATCH_SIZE } from "./train-excel-contract";

export type {
  CleanManifest,
  CleanSkipped,
  TrainCleanManifest,
  TrainCleanSkipped,
} from "./clean-manifest";

import { abortTrainDataSource } from "./abort-data-source";
import type { TrainPipelineProgressEvent } from "./train-pipeline-progress";
import {
  progressCleanCustomers,
  progressCleanPayments,
  progressCleanStart,
  progressCleanUsageSheet,
  progressPipelineDone,
} from "./train-pipeline-progress";

type MappedRow<T extends { ok: boolean }> =
  Extract<T, { ok: true }> extends { value: infer V } ? V : never;
type CustomerRow = MappedRow<ReturnType<typeof mapUserRow>>;
type PaymentRow = MappedRow<ReturnType<typeof mapPaymentRow>>;
type UsageRow = MappedRow<ReturnType<typeof mapUsageRow>>;

const USAGE_RAW_TABLES = {
  "Email_usage (API)": trainRawSheetEmailUsageApi,
  "Email_usage (BC)": trainRawSheetEmailUsageBc,
  "Email_usage (OTP)": trainRawSheetEmailUsageOtp,
  "SMS_usage (API)": trainRawSheetSmsUsageApi,
  "SMS_usage (BC)": trainRawSheetSmsUsageBc,
  "SMS_usage (OTP)": trainRawSheetSmsUsageOtp,
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

export async function cleanTrainFromRaw(
  sourceId: string,
  onProgress?: (event: TrainPipelineProgressEvent) => void
): Promise<CleanManifest> {
  const emit = onProgress;

  const [sourceRow] = await db
    .select({ sheetManifest: trainDataSources.sheetManifest })
    .from(trainDataSources)
    .where(eq(trainDataSources.id, sourceId))
    .limit(1);

  const rawManifest =
    (sourceRow?.sheetManifest as Record<string, number> | null) ?? {};

  await db
    .update(trainDataSources)
    .set({ errorMessage: null, importStatus: "cleaning" })
    .where(eq(trainDataSources.id, sourceId));

  emit?.(progressCleanStart());

  const skipped = emptySkippedCounts();
  const warnings: string[] = [];
  let customers = 0;
  let payments = 0;
  let usage = 0;

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(trainCleanCustomers)
        .where(eq(trainCleanCustomers.sourceId, sourceId));
      await tx
        .delete(trainCleanPayments)
        .where(eq(trainCleanPayments.sourceId, sourceId));
      await tx
        .delete(trainCleanUsage)
        .where(eq(trainCleanUsage.sourceId, sourceId));

      emit?.(progressCleanCustomers());
      const userRows = await tx
        .select({
          excelRow: trainRawSheetUsersUserProfile.excelRow,
          id: trainRawSheetUsersUserProfile.id,
          rowPayload: trainRawSheetUsersUserProfile.rowPayload,
        })
        .from(trainRawSheetUsersUserProfile)
        .where(eq(trainRawSheetUsersUserProfile.sourceId, sourceId));

      const customerValues: CustomerRow[] = [];
      for (const r of userRows) {
        const mapped = mapUserRow(toRawInput(r), sourceId);
        if (!mapped.ok) {
          bumpSkip(skipped, mapped.reason);
          continue;
        }
        customerValues.push(mapped.value);
      }

      for (const batch of chunk(customerValues, TRAIN_IMPORT_BATCH_SIZE)) {
        await tx.insert(trainCleanCustomers).values(batch);
        customers += batch.length;
      }

      emit?.(progressCleanPayments());
      const payRows = await tx
        .select({
          excelRow: trainRawSheetBackendPayment.excelRow,
          id: trainRawSheetBackendPayment.id,
          rowPayload: trainRawSheetBackendPayment.rowPayload,
        })
        .from(trainRawSheetBackendPayment)
        .where(eq(trainRawSheetBackendPayment.sourceId, sourceId));

      const paymentValues: PaymentRow[] = [];
      for (const r of payRows) {
        const mapped = mapPaymentRow(toRawInput(r), sourceId);
        if (!mapped.ok) {
          bumpSkip(skipped, mapped.reason);
          continue;
        }
        paymentValues.push(mapped.value);
      }

      for (const batch of chunk(paymentValues, TRAIN_IMPORT_BATCH_SIZE)) {
        await tx.insert(trainCleanPayments).values(batch);
        payments += batch.length;
      }

      const usageSheetCount = USAGE_SHEET_NAMES.length;
      for (let i = 0; i < usageSheetCount; i += 1) {
        const sheetName = USAGE_SHEET_NAMES[i];
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

        for (const batch of chunk(usageValues, TRAIN_IMPORT_BATCH_SIZE)) {
          await tx.insert(trainCleanUsage).values(batch);
          usage += batch.length;
        }

        emit?.(
          progressCleanUsageSheet(
            i,
            usageSheetCount,
            sheetName,
            usageValues.length
          )
        );
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
      .update(trainDataSources)
      .set({
        cleanedAt: new Date(),
        cleanManifest: manifest,
        errorMessage: null,
        importStatus: "ready",
      })
      .where(eq(trainDataSources.id, sourceId));

    emit?.(progressPipelineDone());

    return manifest;
  } catch (e) {
    await abortTrainDataSource(sourceId);
    throw e;
  }
}
