/** Shared row counts from the clean pipeline manifest. */
export interface CleanCounts {
  customers: number;
  payments: number;
  usage: number;
}

export interface DataSource {
  clean_manifest: Record<string, unknown> | null;
  cleaned_at: string | null;
  client_label: string | null;
  created_at: string;
  /** Creator's user id — same as imported_by (uniform creator contract). */
  created_by: string | null;
  /** Creator's display name, falling back to email. */
  created_by_name: string | null;
  error_message: string | null;
  file_checksum_sha256: string;
  file_size_bytes: number | null;
  id: string;
  import_status: string;
  imported_at: string | null;
  imported_by: string | null;
  importer_email: string | null;
  importer_name: string | null;
  name: string;
  notes: string | null;
  original_filename: string;
  sheet_manifest: Record<string, number> | null;
}

export type TrainDataSource = DataSource;
export type PredictDataSource = DataSource;
