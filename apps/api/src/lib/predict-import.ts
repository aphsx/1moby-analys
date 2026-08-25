/**
 * [NEW] Predict raw import — faithful row_payload per sheet into predict_* tables.
 * Each upload is a new snapshot (no merge with prior sources). No global checksum dedupe.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as XLSX from "xlsx";
import { db } from "../db/client";
import {
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
import type { CleanManifest } from "./clean-manifest";
import {
  type CellJson,
  insertSheetRows as insertSheetRowsCore,
  parseSheetRows as parseSheetRowsCore,
  validateWorkbookSheets as validateWorkbookSheetsCore,
} from "./data-import/excel-core";
import {
  PREDICT_IMPORT_BATCH_SIZE,
  PREDICT_REQUIRED_SHEETS,
  PREDICT_SHEET_CONFIG,
  type PredictSheetName,
} from "./predict-excel-contract";

type RawInsertTable = PgTable;

const PREDICT_RAW_TABLE_BY_NAME: Record<string, RawInsertTable> = {
  predict_raw_sheet_backend_payment: predictRawSheetBackendPayment,
  predict_raw_sheet_email_usage_api: predictRawSheetEmailUsageApi,
  predict_raw_sheet_email_usage_bc: predictRawSheetEmailUsageBc,
  predict_raw_sheet_email_usage_otp: predictRawSheetEmailUsageOtp,
  predict_raw_sheet_sms_usage_api: predictRawSheetSmsUsageApi,
  predict_raw_sheet_sms_usage_bc: predictRawSheetSmsUsageBc,
  predict_raw_sheet_sms_usage_otp: predictRawSheetSmsUsageOtp,
  predict_raw_sheet_users_user_profile: predictRawSheetUsersUserProfile,
};

export interface PredictImportResult {
  clean_manifest?: CleanManifest;
  file_checksum_sha256: string;
  import_status: string;
  sheet_manifest: Record<string, number>;
  source_id: string;
}

function validateWorkbookSheets(sheetNames: string[]): void {
  validateWorkbookSheetsCore(
    sheetNames,
    PREDICT_SHEET_CONFIG,
    PREDICT_REQUIRED_SHEETS
  );
}

function parseSheetRows(
  wb: XLSX.WorkBook,
  sheetName: PredictSheetName,
  skipEmpty: boolean
) {
  return parseSheetRowsCore(
    wb,
    sheetName,
    PREDICT_SHEET_CONFIG[sheetName].requiredHeaders,
    skipEmpty
  );
}

function insertSheetRows(
  table: RawInsertTable,
  sourceId: string,
  rows: { excel_row: number; row_payload: Record<string, CellJson> }[]
) {
  return insertSheetRowsCore(table, sourceId, rows, PREDICT_IMPORT_BATCH_SIZE);
}

export async function importPredictExcel(params: {
  buffer: Buffer;
  filename: string;
  name: string;
  imported_by: string;
  client_label?: string | null;
  notes?: string | null;
  /** When true, leave status `importing` after raw (clean step sets `ready`). */
  deferReadyCatalog?: boolean;
}): Promise<PredictImportResult> {
  const checksum = createHash("sha256").update(params.buffer).digest("hex");

  const wb = XLSX.read(params.buffer, { cellDates: true, type: "buffer" });
  validateWorkbookSheets(wb.SheetNames);

  const [created] = await db
    .insert(predictDataSources)
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
    .returning({ id: predictDataSources.id });

  const sourceId = created.id;
  const manifest: Record<string, number> = {};

  try {
    const sheetOrder = wb.SheetNames.filter(
      (n): n is PredictSheetName => n in PREDICT_SHEET_CONFIG
    );

    for (const sheetName of sheetOrder) {
      const cfg = PREDICT_SHEET_CONFIG[sheetName];
      const table = PREDICT_RAW_TABLE_BY_NAME[cfg.table];
      if (!table) {
        throw new Error(`No table mapping for ${cfg.table}`);
      }

      const rows = parseSheetRows(wb, sheetName, true);
      manifest[sheetName] = await insertSheetRows(table, sourceId, rows);
    }

    if (params.deferReadyCatalog) {
      await db
        .update(predictDataSources)
        .set({
          importedAt: new Date(),
          sheetManifest: manifest,
        })
        .where(eq(predictDataSources.id, sourceId));
    } else {
      await db
        .update(predictDataSources)
        .set({
          importedAt: new Date(),
          importStatus: "ready",
          sheetManifest: manifest,
        })
        .where(eq(predictDataSources.id, sourceId));
    }

    return {
      file_checksum_sha256: checksum,
      import_status: params.deferReadyCatalog ? "importing" : "ready",
      sheet_manifest: manifest,
      source_id: sourceId,
    };
  } catch (e) {
    await db
      .delete(predictDataSources)
      .where(eq(predictDataSources.id, sourceId));
    throw e;
  }
}
