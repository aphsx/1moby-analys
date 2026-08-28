/**
 * Train import orchestration — glues the raw Excel import to the clean pipeline
 * and Redis progress streaming. Extracted from routes/train-data.ts so the route
 * file stays thin (HTTP concerns only).
 */
import { importTrainExcel, type TrainImportResult } from "./train-import";
import type { TrainImportProgressEvent } from "./train-import-progress";
import { abortTrainDataSource } from "./abort-data-source";
import { cleanTrainFromRaw } from "./train-clean";
import { mapRawImportProgress } from "./train-pipeline-progress";
import {
  publishTrainImportDone,
  publishTrainImportError,
  publishTrainPipelineProgress,
} from "./train-import-stream";
import { maxUploadBytes } from "./constants";
import {
  IMPORT_TIMEOUT_CODE,
  isImportTimeoutError,
  throwIfImportAborted,
  withImportTimeout,
} from "./import-timeout";

export interface TrainImportParams {
  buffer: Buffer;
  filename: string;
  name: string;
  client_label: string | null;
  notes: string | null;
  imported_by: string;
}

/** Reads an uploaded file into a Buffer, enforcing the upload size limit. */
export async function readImportBuffer(file: File): Promise<Buffer> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const limit = maxUploadBytes();
  if (buffer.length > limit) {
    throw new Error(`File exceeds ${Math.round(limit / (1024 * 1024))}MB limit`);
  }
  return buffer;
}

async function publishRawProgress(
  sourceId: string,
  event: TrainImportProgressEvent
): Promise<void> {
  await publishTrainPipelineProgress(sourceId, {
    progress: mapRawImportProgress(event.progress),
    step: event.step,
    phase: "raw",
    sheet: event.sheet,
    rows: event.rows,
  });
}

/** Runs raw import → clean pipeline for one source, publishing progress events. */
export async function runTrainImportPipeline(
  params: TrainImportParams & { sourceId: string }
): Promise<TrainImportResult> {
  const sourceId = params.sourceId;
  return withImportTimeout(async (signal) => {
    await publishRawProgress(sourceId, { progress: 0, step: "Reading workbook…" });
    const rawResult = await importTrainExcel({
      buffer: params.buffer,
      filename: params.filename,
      name: params.name,
      client_label: params.client_label,
      notes: params.notes,
      imported_by: params.imported_by,
      sourceId,
      deferReadyCatalog: true,
      signal,
      onProgress: (event) => {
        void publishRawProgress(sourceId, event);
      },
    });

    throwIfImportAborted(signal);
    const cleanManifest = await cleanTrainFromRaw(sourceId, (event) => {
      void publishTrainPipelineProgress(sourceId, event);
    });

    return {
      ...rawResult,
      import_status: "ready",
      clean_manifest: cleanManifest,
    };
  });
}

/** Fire-and-forget background variant for the async import endpoint. */
export function runTrainImportJob(sourceId: string, params: TrainImportParams): void {
  void (async () => {
    try {
      const result = await runTrainImportPipeline({ ...params, sourceId });
      await publishTrainImportDone(sourceId, result);
    } catch (e) {
      const err = e as Error;
      await publishTrainImportError(sourceId, err.message ?? "Import failed", {
        code: isImportTimeoutError(err) ? IMPORT_TIMEOUT_CODE : undefined,
      });
      await abortTrainDataSource(sourceId);
    }
  })();
}
