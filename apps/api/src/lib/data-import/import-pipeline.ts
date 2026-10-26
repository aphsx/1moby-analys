/**
 * Import then Clean one Data Source within the import time budget. Whoever created the
 * Data Source owns rollback: on failure they call deleteDataSource (abort-data-source.ts).
 */
import { IMPORT_STATUS, type DataSourceImportResult } from "@moby/types";
import { maxUploadBytes } from "../constants";
import { HttpError } from "../http/errors";
import { cleanFromRaw } from "./clean";
import { throwIfImportAborted, withImportTimeout } from "./import-timeout";
import { importRawSheets, sha256 } from "./raw-import";
import type { DataSourceKind } from "./source-tables";
import type { OnImportProgress } from "./train-progress/progress";

/** An uploaded file as a Buffer; 413 when it exceeds IMPORT_MAX_UPLOAD_BYTES. */
export async function readImportBuffer(file: File): Promise<Buffer> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const limit = maxUploadBytes();
  if (buffer.length > limit) {
    throw new HttpError(413, `File exceeds ${Math.round(limit / (1024 * 1024))}MB limit`);
  }
  return buffer;
}

export async function runImportPipeline(
  kind: DataSourceKind,
  sourceId: string,
  buffer: Buffer,
  onProgress?: OnImportProgress
): Promise<DataSourceImportResult> {
  return withImportTimeout(async (signal) => {
    const sheetManifest = await importRawSheets(kind, sourceId, buffer, { signal, onProgress });
    throwIfImportAborted(signal);
    const cleanManifest = await cleanFromRaw(kind, sourceId, onProgress);
    return {
      source_id: sourceId,
      import_status: IMPORT_STATUS.READY,
      sheet_manifest: sheetManifest,
      file_checksum_sha256: sha256(buffer),
      clean_manifest: cleanManifest,
    };
  });
}
