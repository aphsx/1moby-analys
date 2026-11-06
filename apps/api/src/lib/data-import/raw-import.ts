/**
 * Import: copy a workbook's sheets into a Data Source's raw tables as-is, one row_payload
 * per Excel row. Every upload is a new Data Source; there is no merge and no checksum dedupe.
 */
import { IMPORT_STATUS } from "@moby/types";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "../../db/client";
import { insertSheetRows, parseSheetRows, validateWorkbookSheets } from "./excel-core";
import { throwIfImportAborted } from "./import-timeout";
import { IMPORT_BATCH_SIZE, isSheetName, REQUIRED_SHEETS, SHEET_REQUIRED_HEADERS } from "./sheet-contract";
import { SOURCE_TABLES, type DataSourceKind } from "./source-tables";
import { importProgress, type OnImportProgress } from "./train-progress/progress";

export interface NewDataSource {
  buffer: Buffer;
  filename: string;
  name: string;
  client_label?: string | null;
  notes?: string | null;
  imported_by: string;
}

export const sha256 = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

/** Create the Data Source row (status `importing`) before any sheet is read. */
export async function createDataSource(kind: DataSourceKind, params: NewDataSource): Promise<string> {
  const { sources } = SOURCE_TABLES[kind];
  const [created] = await db
    .insert(sources)
    .values({
      name: params.name,
      clientLabel: params.client_label ?? null,
      originalFilename: params.filename,
      fileChecksumSha256: sha256(params.buffer),
      fileSizeBytes: params.buffer.length,
      importStatus: IMPORT_STATUS.IMPORTING,
      importedBy: params.imported_by,
      notes: params.notes ?? null,
    })
    .returning({ id: sources.id });
  return created.id;
}

/**
 * Import every contract sheet into the raw tables and record the row counts. The source
 * stays `importing`; Clean sets it `ready`. Throws on a missing sheet or header.
 */
export async function importRawSheets(
  kind: DataSourceKind,
  sourceId: string,
  buffer: Buffer,
  opts: { signal?: AbortSignal; onProgress?: OnImportProgress } = {}
): Promise<Record<string, number>> {
  const { signal, onProgress: emit } = opts;
  const tables = SOURCE_TABLES[kind];

  throwIfImportAborted(signal);
  emit?.(importProgress.readingWorkbook());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  throwIfImportAborted(signal);
  validateWorkbookSheets(workbook.SheetNames, REQUIRED_SHEETS);

  const sheets = workbook.SheetNames.filter(isSheetName);
  const manifest: Record<string, number> = {};
  for (const [i, sheet] of sheets.entries()) {
    throwIfImportAborted(signal);
    emit?.(importProgress.sheetStarted(i, sheets.length, sheet));
    const rows = parseSheetRows(workbook, sheet, [...SHEET_REQUIRED_HEADERS[sheet]], true);
    manifest[sheet] = await insertSheetRows(tables.raw[sheet], sourceId, rows, IMPORT_BATCH_SIZE);
    emit?.(importProgress.sheetImported(i, sheets.length, sheet, manifest[sheet]));
  }

  throwIfImportAborted(signal);
  await db
    .update(tables.sources)
    .set({ importedAt: new Date(), sheetManifest: manifest })
    .where(eq(tables.sources.id, sourceId));
  emit?.(importProgress.rawDone());
  return manifest;
}
