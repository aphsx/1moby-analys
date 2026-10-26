/**
 * API client for the Data Source routes (train + predict import, list, delete).
 * ML run routes live in ml-api.ts; chat lives in ai-chat-api.ts.
 */

import type {
  DataSourceImportResult,
  ImportProgressEvent,
  PredictDataSource,
  TrainDataSource,
  TrainImportStatus,
} from "@moby/types";
import { ApiError, importTimeoutError, redirectToLogin, requestJson, toApiError } from "./http";

/** Must stay in sync with apps/api DEFAULT_IMPORT_TIMEOUT_MS (10 minutes). */
export const IMPORT_TIMEOUT_MS = 10 * 60 * 1000;
const TRAIN_IMPORT_POLL_MS = 400;

/** Progress shown while a train import runs; `phase` is absent during the upload itself. */
export type TrainImportProgress = Omit<ImportProgressEvent, "phase"> & { phase?: ImportProgressEvent["phase"] };

// ── Train Data Sources ───────────────────────────────────────────────────────

export async function fetchTrainDataSources(): Promise<TrainDataSource[]> {
  return requestJson("/api/train-data-sources");
}

export async function deleteTrainDataSource(id: string): Promise<void> {
  await requestJson(`/api/train-data-sources/${id}`, { method: "DELETE" });
}

/** Never let the bar move backwards (several polls can land in one frame). */
function monotonic(onProgress: (event: TrainImportProgress) => void) {
  let last = 0;
  return (event: TrainImportProgress) => {
    last = Math.max(last, event.progress);
    onProgress({ ...event, progress: last });
  };
}

/** XHR rather than fetch, because only XHR reports upload progress. */
function postTrainImportAsync(
  fd: FormData,
  onUploadBytes: (loaded: number, total: number) => void,
  onServerProcessing: () => void
): Promise<{ source_id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/train-data-sources/import/async");
    xhr.withCredentials = true;
    xhr.timeout = IMPORT_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadBytes(e.loaded, e.total);
    };
    xhr.upload.onload = onServerProcessing;
    xhr.onload = () => {
      if (xhr.status === 401) {
        try {
          redirectToLogin();
        } catch (e) {
          reject(e);
        }
        return;
      }
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        reject(new ApiError(`Import failed (${xhr.status})`, xhr.status));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(toApiError(body, xhr.status));
        return;
      }
      const sourceId = (body as { source_id?: string } | null)?.source_id;
      if (sourceId) resolve({ source_id: sourceId });
      else reject(new ApiError("Import did not return source_id", xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Upload failed", 0));
    xhr.ontimeout = () => reject(importTimeoutError());
    xhr.send(fd);
  });
}

/** Poll the import's progress until it is ready, failed, or out of time. */
async function waitForTrainImport(
  sourceId: string,
  emit: (event: TrainImportProgress) => void
): Promise<DataSourceImportResult> {
  const deadline = Date.now() + IMPORT_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw importTimeoutError();
    const snap = await requestJson<TrainImportStatus>(`/api/train-data-sources/${sourceId}/import/progress`).catch(
      (e: unknown) => {
        // 404 carries a status body too: the import was rolled back or never existed.
        if (e instanceof ApiError && e.status === 404) throw new ApiError("Import source not found", 404);
        throw e;
      }
    );
    if (snap.status === "failed") {
      const timedOut = !snap.code && (snap.message ?? "").toLowerCase().includes("timed out");
      throw new ApiError(snap.message ?? "Import failed", 400, snap.code ?? (timedOut ? "IMPORT_TIMEOUT" : undefined));
    }
    if (snap.status === "ready") {
      emit({ progress: 100, step: snap.step || "Ready for model training", phase: "clean" });
      return snap.result ?? { source_id: sourceId, import_status: "ready", sheet_manifest: {}, file_checksum_sha256: "" };
    }
    emit({ progress: snap.progress, step: snap.step, phase: snap.phase, sheet: snap.sheet, rows: snap.rows });
    await new Promise((r) => setTimeout(r, TRAIN_IMPORT_POLL_MS));
  }
}

/** Upload a workbook as a Train Data Source and follow Import + Clean to the end. */
export async function uploadTrainDataFileWithProgress(
  file: File,
  name: string,
  onProgress: (event: TrainImportProgress) => void,
  client_label?: string
): Promise<DataSourceImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", name);
  if (client_label) fd.append("client_label", client_label);

  const emit = monotonic(onProgress);
  const { source_id: sourceId } = await postTrainImportAsync(
    fd,
    (loaded, total) =>
      emit({
        progress: Math.min(4, Math.max(1, total > 0 ? Math.round((loaded / total) * 4) : 0)),
        step: `กำลังอัปโหลดไฟล์… ${Math.round((loaded / total) * 100)}%`,
        phase: "raw",
      }),
    () => emit({ progress: 4, step: "กำลังตรวจสอบไฟล์บนเซิร์ฟ…", phase: "raw" })
  );
  return waitForTrainImport(sourceId, emit);
}

// ── Predict Data Sources ─────────────────────────────────────────────────────

export interface PredictImportDone extends DataSourceImportResult {
  /** Set when the import auto-created + triggered a prediction run (default on;
   *  opt out with auto_run=false). Null when auto-run failed or was skipped. */
  auto_prediction_run_id?: string | null;
}

export async function fetchPredictDataSources(): Promise<PredictDataSource[]> {
  return requestJson("/api/predict-data-sources");
}

export async function uploadPredictDataFile(
  file: File,
  name?: string,
  client_label?: string,
  notes?: string
): Promise<PredictImportDone> {
  const fd = new FormData();
  fd.append("file", file);
  if (name) fd.append("name", name);
  if (client_label) fd.append("client_label", client_label);
  if (notes) fd.append("notes", notes);

  try {
    return await requestJson("/api/predict-data-sources/import", {
      method: "POST",
      body: fd,
      signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
    });
  } catch (e) {
    if (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "TimeoutError") {
      throw importTimeoutError();
    }
    throw e;
  }
}
