/**
 * [NEW] Train raw import logic — faithful row_payload per sheet.
 * Parallel to predict-import.ts and moby-data-prep/scripts/import_train_raw.py.
 * Each upload is a new snapshot (no merge with prior sources). No checksum dedupe.
 */
import { createHash } from "node:crypto";
import type { PgTable } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
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
  TRAIN_IMPORT_BATCH_SIZE,
  TRAIN_REQUIRED_SHEETS,
  TRAIN_SHEET_CONFIG,
  type TrainSheetName,
} from "./train-excel-contract";
import {
  type TrainImportProgressEvent,
  progressAfterSheet,
  progressAfterValidate,
  progressBeforeSheet,
  progressFinalize,
} from "./train-import-progress";
import type { CleanManifest } from "./train-clean";
import {
  validateWorkbookSheets as validateWorkbookSheetsCore,
  parseSheetRows as parseSheetRowsCore,
  insertSheetRows as insertSheetRowsCore,
  type CellJson,
} from "./data-import/excel-core";
import { throwIfImportAborted } from "./import-timeout";

type TrainRawInsertTable = PgTable;

const TRAIN_RAW_TABLE_BY_NAME: Record<string, TrainRawInsertTable> = {
  train_raw_sheet_users_user_profile: trainRawSheetUsersUserProfile,
  train_raw_sheet_backend_payment: trainRawSheetBackendPayment,
  train_raw_sheet_sms_usage_bc: trainRawSheetSmsUsageBc,
  train_raw_sheet_sms_usage_api: trainRawSheetSmsUsageApi,
  train_raw_sheet_sms_usage_otp: trainRawSheetSmsUsageOtp,
  train_raw_sheet_email_usage_bc: trainRawSheetEmailUsageBc,
  train_raw_sheet_email_usage_api: trainRawSheetEmailUsageApi,
  train_raw_sheet_email_usage_otp: trainRawSheetEmailUsageOtp,
};

export interface TrainImportResult {
  source_id: string;
  import_status: string;
  sheet_manifest: Record<string, number>;
  file_checksum_sha256: string;
  clean_manifest?: CleanManifest;
}

function validateWorkbookSheets(sheetNames: string[]): void {
  validateWorkbookSheetsCore(sheetNames, TRAIN_SHEET_CONFIG, TRAIN_REQUIRED_SHEETS);
}

function parseSheetRows(wb: XLSX.WorkBook, sheetName: TrainSheetName, skipEmpty: boolean) {
  return parseSheetRowsCore(wb, sheetName, TRAIN_SHEET_CONFIG[sheetName].requiredHeaders, skipEmpty);
}

async function insertSheetRows(
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

  const [created] = await db
    .insert(trainDataSources)
    .values({
      name: params.name,
      clientLabel: params.client_label ?? null,
      originalFilename: params.filename,
      fileChecksumSha256: checksum,
      fileSizeBytes: params.buffer.length,
      importStatus: "importing",
      importedBy: params.imported_by,
      notes: params.notes ?? null,
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
  signal?: AbortSignal;
}): Promise<TrainImportResult> {
  const emit = params.onProgress;
  const checksum = createHash("sha256").update(params.buffer).digest("hex");
  throwIfImportAborted(params.signal);

  emit?.({ progress: 0, step: "Reading workbook…" });
  const wb = XLSX.read(params.buffer, { type: "buffer", cellDates: true });
  throwIfImportAborted(params.signal);
  validateWorkbookSheets(wb.SheetNames);

  let sourceId: string;
  if (params.sourceId) {
    sourceId = params.sourceId;
  } else {
    const [created] = await db
      .insert(trainDataSources)
      .values({
        name: params.name,
        clientLabel: params.client_label ?? null,
        originalFilename: params.filename,
        fileChecksumSha256: checksum,
        fileSizeBytes: params.buffer.length,
        importStatus: "importing",
        importedBy: params.imported_by,
        notes: params.notes ?? null,
      })
      .returning({ id: trainDataSources.id });

    sourceId = created.id;
  }

  params.onSourceCreated?.(sourceId);
  emit?.({
    progress: progressAfterValidate(),
    step: "Catalog created — importing sheets…",
  });

  const manifest: Record<string, number> = {};

  try {
    const sheetOrder = wb.SheetNames.filter(
      (n): n is TrainSheetName => n in TRAIN_SHEET_CONFIG
    );

    for (let i = 0; i < sheetOrder.length; i++) {
      throwIfImportAborted(params.signal);
      const sheetName = sheetOrder[i];
      const cfg = TRAIN_SHEET_CONFIG[sheetName];
      const table = TRAIN_RAW_TABLE_BY_NAME[cfg.table];
      if (!table) throw new Error(`No table mapping for ${cfg.table}`);

      emit?.({
        progress: progressBeforeSheet(i, sheetOrder.length),
        step: `Importing: ${sheetName}…`,
        sheet: sheetName,
      });

      const rows = parseSheetRows(wb, sheetName, true);
      const rowCount = await insertSheetRows(table, sourceId, rows);
      manifest[sheetName] = rowCount;

      emit?.({
        progress: progressAfterSheet(i, sheetOrder.length),
        step: `Imported: ${sheetName} (${rowCount.toLocaleString()} rows)`,
        sheet: sheetName,
        rows: rowCount,
      });
    }

    throwIfImportAborted(params.signal);

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
          importStatus: "ready",
          importedAt: new Date(),
          sheetManifest: manifest,
        })
        .where(eq(trainDataSources.id, sourceId));
      emit?.({ progress: progressFinalize(), step: "Import complete" });
    }

    return {
      source_id: sourceId,
      import_status: params.deferReadyCatalog ? "importing" : "ready",
      sheet_manifest: manifest,
      file_checksum_sha256: checksum,
    };
  } catch (e) {
    if (!params.sourceId) {
      await db.delete(trainDataSources).where(eq(trainDataSources.id, sourceId));
    }
    throw e;
  }
}
