/**
 * Shared data-source DTO mapping used by both train-data and predict-data routes.
 * The train_data_sources and predict_data_sources tables have identical columns,
 * so the DB-row → API-response shape is the same for both.
 */

/** Raw Drizzle row shape selected by both `train-data` and `predict-data` routes. */
export interface DataSourceRow {
  cleanedAt: Date | null;
  cleanManifest: unknown;
  clientLabel: string | null;
  createdAt: Date;
  errorMessage: string | null;
  fileChecksumSha256: string;
  fileSizeBytes: number | null;
  id: string;
  importedAt: Date | null;
  importedBy: string | null;
  importerEmail?: string | null;
  importerName?: string | null;
  importStatus: string;
  name: string;
  notes: string | null;
  originalFilename: string;
  sheetManifest: unknown;
}

/** Maps a data-source DB row to the snake_case API response shape. */
export function mapDataSourceRow(row: DataSourceRow) {
  return {
    clean_manifest: row.cleanManifest,
    cleaned_at: row.cleanedAt?.toISOString() ?? null,
    client_label: row.clientLabel,
    created_at: row.createdAt.toISOString(),
    // Uniform creator contract (matches prediction/training runs).
    created_by: row.importedBy,
    created_by_name: row.importerName ?? row.importerEmail ?? null,
    error_message: row.errorMessage,
    file_checksum_sha256: row.fileChecksumSha256,
    file_size_bytes: row.fileSizeBytes,
    id: row.id,
    import_status: row.importStatus,
    imported_at: row.importedAt?.toISOString() ?? null,
    imported_by: row.importedBy,
    importer_email: row.importerEmail ?? null,
    importer_name: row.importerName ?? null,
    name: row.name,
    notes: row.notes,
    original_filename: row.originalFilename,
    sheet_manifest: row.sheetManifest,
  };
}

/** Whether an uploaded filename is an .xlsx workbook (case-insensitive). */
export function isXlsxFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".xlsx");
}
