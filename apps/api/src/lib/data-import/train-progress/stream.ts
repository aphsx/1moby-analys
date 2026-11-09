/**
 * Progress of an async train import: the background job updates in-memory progress,
 * and GET /import/progress reads it back, with the Data Source row's terminal status taking precedence.
 */
import {
  IMPORT_STATUS,
  type DataSourceImportResult,
  type ImportProgressEvent,
  type TrainImportStatus,
} from "@moby/types";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { trainDataSources } from "../../../db/schema";
import { READY_STEP } from "./progress";

const PROGRESS_TTL_MS = 3600 * 1000; // 1 hour

type TrainImportSnapshot =
  | { kind: "progress"; event: ImportProgressEvent; updatedAt: number }
  | { kind: "done"; result: DataSourceImportResult; updatedAt: number }
  | { kind: "failed"; message: string; code?: string; source_id?: string; updatedAt: number };

const progressStore = new Map<string, TrainImportSnapshot>();

export function getTrainImportSnapshot(sourceId: string): TrainImportSnapshot | undefined {
  return progressStore.get(sourceId);
}

export function clearProgressStoreForTest(): void {
  progressStore.clear();
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, snap] of progressStore.entries()) {
    if (now - snap.updatedAt > PROGRESS_TTL_MS) {
      progressStore.delete(id);
    }
  }
}

export async function publishTrainImportProgress(
  sourceId: string,
  event: ImportProgressEvent
): Promise<void> {
  pruneExpired();
  progressStore.set(sourceId, { kind: "progress", event, updatedAt: Date.now() });
}

export async function publishTrainImportDone(
  sourceId: string,
  result: DataSourceImportResult
): Promise<void> {
  pruneExpired();
  progressStore.set(sourceId, { kind: "done", result, updatedAt: Date.now() });
}

export async function publishTrainImportError(
  sourceId: string,
  message: string,
  extra?: { code?: string; source_id?: string }
): Promise<void> {
  pruneExpired();
  progressStore.set(sourceId, {
    kind: "failed",
    message,
    code: extra?.code,
    source_id: extra?.source_id,
    updatedAt: Date.now(),
  });
}

const failed = (message: string, extra: Partial<TrainImportStatus> = {}): TrainImportStatus => ({
  status: "failed",
  progress: 0,
  step: message,
  message,
  ...extra,
});

const ready = (result: DataSourceImportResult): TrainImportStatus => ({
  status: "ready",
  progress: 100,
  step: READY_STEP,
  phase: "clean",
  result,
});

/**
 * Where one train import stands. The Data Source row's terminal status wins over the
 * in-memory progress snapshot, because progress events are published fire-and-forget
 * and can land after "done".
 * A missing row means the import failed and was rolled back (or never existed).
 */
export async function trainImportStatus(sourceId: string): Promise<TrainImportStatus> {
  const [row] = await db
    .select({
      importStatus: trainDataSources.importStatus,
      errorMessage: trainDataSources.errorMessage,
      sheetManifest: trainDataSources.sheetManifest,
      cleanManifest: trainDataSources.cleanManifest,
      fileChecksumSha256: trainDataSources.fileChecksumSha256,
    })
    .from(trainDataSources)
    .where(eq(trainDataSources.id, sourceId))
    .limit(1);

  if (row?.importStatus === IMPORT_STATUS.READY) {
    return ready({
      source_id: sourceId,
      import_status: IMPORT_STATUS.READY,
      sheet_manifest: (row.sheetManifest ?? {}) as Record<string, number>,
      file_checksum_sha256: row.fileChecksumSha256,
      clean_manifest: (row.cleanManifest as DataSourceImportResult["clean_manifest"]) ?? undefined,
    });
  }
  if (row?.importStatus === IMPORT_STATUS.FAILED) {
    return failed(row.errorMessage ?? "Import failed");
  }

  const snap = progressStore.get(sourceId);
  if (snap?.kind === "failed") return failed(snap.message, { code: snap.code, source_id: snap.source_id });
  if (!row) return { status: "not_found", progress: 0, step: "", message: "Train data source not found" };
  if (snap?.kind === "done") return ready(snap.result);
  if (snap?.kind === "progress") return { status: "importing", ...snap.event };
  return { status: "importing", progress: 0, step: "Waiting for import to start…", phase: "raw" };
}
