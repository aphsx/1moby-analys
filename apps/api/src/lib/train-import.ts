/**
 * [NEW] Train raw import logic — faithful row_payload per sheet.
 * Parallel to predict-import.ts and moby-data-prep/scripts/import_train_raw.py.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as XLSX from "xlsx";
import { db } from "../db/client";
import {
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
import {
  type CellJson,
  insertSheetRows as insertSheetRowsCore,
  parseSheetRows as parseSheetRowsCore,
  validateWorkbookSheets as validateWorkbookSheetsCore,
} from "./data-import/excel-core";
import type { TrainCleanManifest } from "./train-clean";
import {
  TRAIN_IMPORT_BATCH_SIZE,
  TRAIN_REQUIRED_SHEETS,
  TRAIN_SHEET_CONFIG,
  type TrainSheetName,
} from "./train-excel-contract";
import {
  progressAfterSheet,
  progressAfterValidate,
  progressBeforeSheet,
  progressFinalize,
  type TrainImportProgressEvent,
} from "./train-import-progress";

type TrainRawInsertTable = PgTable;

const TRAIN_RAW_TABLE_BY_NAME: Record<string, TrainRawInsertTable> = {
  train_raw_sheet_backend_payment: trainRawSheetBackendPayment,
  train_raw_sheet_email_usage_api: trainRawSheetEmailUsageApi,
  train_raw_sheet_email_usage_bc: trainRawSheetEmailUsageBc,
  train_raw_sheet_email_usage_otp: trainRawSheetEmailUsageOtp,
  train_raw_sheet_sms_usage_api: trainRawSheetSmsUsageApi,
  train_raw_sheet_sms_usage_bc: trainRawSheetSmsUsageBc,
  train_raw_sheet_sms_usage_otp: trainRawSheetSmsUsageOtp,
  train_raw_sheet_users_user_profile: trainRawSheetUsersUserProfile,
};

export interface TrainImportResult {
  clean_manifest?: TrainCleanManifest;
  file_checksum_sha256: string;
  import_status: string;
  sheet_manifest: Record<string, number>;
  source_id: string;
}

function validateWorkbookSheets(sheetNames: string[]): void {
  validateWorkbookSheetsCore(
    sheetNames,
    TRAIN_SHEET_CONFIG,
    TRAIN_REQUIRED_SHEETS
  );
}

function parseSheetRows(
  wb: XLSX.WorkBook,
  sheetName: TrainSheetName,
  skipEmpty: boolean
) {
  return parseSheetRowsCore(
    wb,
    sheetName,
    TRAIN_SHEET_CONFIG[sheetName].requiredHeaders,
    skipEmpty
  );
}

function insertSheetRows(
  table: TrainRawInsertTable,
  sourceId: string,
  rows: { excel_row: number; row_payload: Record<string, CellJson> }[]
) {
  return insertSheetRowsCore(table, sourceId, rows, TRAIN_IMPORT_BATCH_SIZE);
}

/** Create catalog row early so SSE can subscribe before sheet import (async upload). */
export async function prepareTrainDataSource(params: {
  buffer: Buffer;
  filename: string;
  name: string;
  client_label?: string | null;
  notes?: string | null;
  imported_by: string;
}): Promise<string> {
  const checksum = createHash("sha256").update(params.buffer).digest("hex");

  const wb = XLSX.read(params.buffer, { cellDates: true, type: "buffer" });
  validateWorkbookSheets(wb.SheetNames);

  const existing = await db
    .select({ id: trainDataSources.id })
    .from(trainDataSources)
    .where(eq(trainDataSources.fileChecksumSha256, checksum))
    .limit(1);

  if (existing.length > 0) {
    const err = new Error(
      "This file was already imported (checksum match)"
    ) as Error & {
      code: string;
      source_id: string;
    };
    err.code = "DUPLICATE_FILE";
    err.source_id = existing[0].id;
    throw err;
  }

  const [created] = await db
    .insert(trainDataSources)
    .values({
      clientLabel: params.client_label ?? null,
      fileChecksumSha256: checksum,
      fileSizeBytes: params.buffer.length,
      importedBy: params.imported_by,
      importStatus: "importing",
      name: params.name,
      notes: params.notes ?? null,
      originalFilename: params.filename,
    })
    .returning({ id: trainDataSources.id });

  return created.id;
}

export async function importTrainExcel(params: {
  buffer: Buffer;
  filename: string;
  name: string;
  client_label?: string | null;
  notes?: string | null;
  imported_by: string;
  /** When set, skip catalog insert (used after prepareTrainDataSource). */
  sourceId?: string;
  onProgress?: (event: TrainImportProgressEvent) => void;
  /** Fired as soon as train_data_sources row exists (for async import + SSE subscribe). */
  onSourceCreated?: (sourceId: string) => void;
  /** When true, leave status `importing` after raw (clean step sets `ready`). */
  deferReadyCatalog?: boolean;
}): Promise<TrainImportResult> {
  const emit = params.onProgress;
  const checksum = createHash("sha256").update(params.buffer).digest("hex");

  let sourceId: string;
  if (params.sourceId) {
    sourceId = params.sourceId;
    params.onSourceCreated?.(sourceId);
    emit?.({
      progress: progressAfterValidate(),
      step: "Catalog created — importing sheets…",
    });
  } else {
    emit?.({ progress: 0, step: "Reading workbook…" });

    const wb = XLSX.read(params.buffer, { cellDates: true, type: "buffer" });
    validateWorkbookSheets(wb.SheetNames);

    const existing = await db
      .select({ id: trainDataSources.id })
      .from(trainDataSources)
      .where(eq(trainDataSources.fileChecksumSha256, checksum))
      .limit(1);

    if (existing.length > 0) {
      const err = new Error(
        "This file was already imported (checksum match)"
      ) as Error & {
        code: string;
        source_id: string;
      };
      err.code = "DUPLICATE_FILE";
      err.source_id = existing[0].id;
      throw err;
    }

    const [created] = await db
      .insert(trainDataSources)
      .values({
        clientLabel: params.client_label ?? null,
        fileChecksumSha256: checksum,
        fileSizeBytes: params.buffer.length,
        importedBy: params.imported_by,
        importStatus: "importing",
        name: params.name,
        notes: params.notes ?? null,
        originalFilename: params.filename,
      })
      .returning({ id: trainDataSources.id });

    sourceId = created.id;
    params.onSourceCreated?.(sourceId);
    emit?.({
      progress: progressAfterValidate(),
      step: "Catalog created — importing sheets…",
    });
  }

  const manifest: Record<string, number> = {};
  const wb = XLSX.read(params.buffer, { cellDates: true, type: "buffer" });

  try {
    const sheetOrder = wb.SheetNames.filter(
      (n): n is TrainSheetName => n in TRAIN_SHEET_CONFIG
    );

    for (let i = 0; i < sheetOrder.length; i += 1) {
      const sheetName = sheetOrder[i];
      const cfg = TRAIN_SHEET_CONFIG[sheetName];
      const table = TRAIN_RAW_TABLE_BY_NAME[cfg.table];
      if (!table) {
        throw new Error(`No table mapping for ${cfg.table}`);
      }

      emit?.({
        progress: progressBeforeSheet(i, sheetOrder.length),
        sheet: sheetName,
        step: `Importing: ${sheetName}…`,
      });

      const rows = parseSheetRows(wb, sheetName, true);
      const rowCount = await insertSheetRows(table, sourceId, rows);
      manifest[sheetName] = rowCount;

      emit?.({
        progress: progressAfterSheet(i, sheetOrder.length),
        rows: rowCount,
        sheet: sheetName,
        step: `Imported: ${sheetName} (${rowCount.toLocaleString()} rows)`,
      });
    }

    if (params.deferReadyCatalog) {
      await db
        .update(trainDataSources)
        .set({
          importedAt: new Date(),
          sheetManifest: manifest,
        })
        .where(eq(trainDataSources.id, sourceId));
      emit?.({ progress: 97, step: "Raw complete — cleaning automatically…" });
    } else {
      emit?.({ progress: 97, step: "Finalizing…" });
      await db
        .update(trainDataSources)
        .set({
          importedAt: new Date(),
          importStatus: "ready",
          sheetManifest: manifest,
        })
        .where(eq(trainDataSources.id, sourceId));
      emit?.({ progress: progressFinalize(), step: "Import complete" });
    }

    return {
      file_checksum_sha256: checksum,
      import_status: params.deferReadyCatalog ? "importing" : "ready",
      sheet_manifest: manifest,
      source_id: sourceId,
    };
  } catch (e) {
    await db.delete(trainDataSources).where(eq(trainDataSources.id, sourceId));
    throw e;
  }
}
