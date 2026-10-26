/** Shared row counts from the clean pipeline manifest. */
export interface CleanCounts {
  customers: number;
  payments: number;
  usage: number;
}

export interface DataSource {
  id: string;
  name: string;
  client_label: string | null;
  original_filename: string;
  file_checksum_sha256: string;
  file_size_bytes: number | null;
  import_status: string;
  imported_at: string | null;
  sheet_manifest: Record<string, number> | null;
  clean_manifest: Record<string, unknown> | null;
  cleaned_at: string | null;
  notes: string | null;
  error_message: string | null;
  imported_by: string | null;
  importer_name: string | null;
  importer_email: string | null;
  /** Creator's user id — same as imported_by (uniform creator contract). */
  created_by: string | null;
  /** Creator's display name, falling back to email. */
  created_by_name: string | null;
  created_at: string;
}

export type TrainDataSource = DataSource;
export type PredictDataSource = DataSource;

/** Rows the Clean step dropped, by reason. */
export interface CleanSkipped {
  customers_no_acc_id: number;
  payments_no_acc_id: number;
  payments_no_date: number;
  usage_no_acc_id: number;
}

/** What Clean produced for one Data Source (stored as `clean_manifest`). */
export interface CleanManifest {
  raw: Record<string, number>;
  clean: CleanCounts;
  skipped: CleanSkipped;
  warnings: string[];
}

/** The result of importing and cleaning one Data Source. */
export interface DataSourceImportResult {
  source_id: string;
  import_status: string;
  sheet_manifest: Record<string, number>;
  file_checksum_sha256: string;
  clean_manifest?: CleanManifest;
}

export type ImportPhase = "raw" | "clean";

/** One step of a train import, as the progress bar shows it (0–100). */
export interface ImportProgressEvent {
  progress: number;
  step: string;
  phase: ImportPhase;
  sheet?: string;
  rows?: number;
}

/** GET /train-data-sources/:id/import/progress. */
export interface TrainImportStatus {
  status: "importing" | "ready" | "failed" | "not_found";
  progress: number;
  step: string;
  phase?: ImportPhase;
  sheet?: string;
  rows?: number;
  message?: string;
  code?: string;
  source_id?: string;
  result?: DataSourceImportResult;
}
