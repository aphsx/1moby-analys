/**
 * Train import orchestration — glues the raw Excel import to the clean pipeline
 * and Redis progress streaming. Extracted from routes/train-data.ts so the route
 * file stays thin (HTTP concerns only).
 */

import { abortTrainDataSource } from "./abort-data-source";
import { MAX_UPLOAD_BYTES } from "./constants";
import { cleanTrainFromRaw } from "./train-clean";
import { importTrainExcel, type TrainImportResult } from "./train-import";
import type { TrainImportProgressEvent } from "./train-import-progress";
import {
  publishTrainImportDone,
  publishTrainImportError,
  publishTrainPipelineProgress,
} from "./train-import-stream";
import { mapRawImportProgress } from "./train-pipeline-progress";

export interface TrainImportParams {
  buffer: Buffer;
  client_label: string | null;
  filename: string;
  imported_by: string;
  name: string;
  notes: string | null;
}

/** Reads an uploaded file into a Buffer, enforcing the upload size limit. */
export async function readImportBuffer(file: File): Promise<Buffer> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit`);
  }
  return buffer;
}

async function publishRawProgress(
  sourceId: string,
  event: TrainImportProgressEvent
): Promise<void> {
  await publishTrainPipelineProgress(sourceId, {
    phase: "raw",
    progress: mapRawImportProgress(event.progress),
    rows: event.rows,
    sheet: event.sheet,
    step: event.step,
  });
}

/** Runs raw import → clean pipeline for one source, publishing progress events. */
export async function runTrainImportPipeline(
  params: TrainImportParams & { sourceId: string }
): Promise<TrainImportResult> {
  const sourceId = params.sourceId;
  try {
    await publishRawProgress(sourceId, {
      progress: 0,
      step: "Reading workbook…",
    });
    const rawResult = await importTrainExcel({
      buffer: params.buffer,
      client_label: params.client_label,
      deferReadyCatalog: true,
      filename: params.filename,
      imported_by: params.imported_by,
      name: params.name,
      notes: params.notes,
      onProgress: (event) => {
        void publishRawProgress(sourceId, event);
      },
      sourceId,
    });

    const cleanManifest = await cleanTrainFromRaw(sourceId, (event) => {
      void publishTrainPipelineProgress(sourceId, event);
    });

    return {
      ...rawResult,
      clean_manifest: cleanManifest,
      import_status: "ready",
    };
  } catch (e) {
    const err = e as Error & { code?: string };
    if (sourceId && err.code !== "DUPLICATE_FILE") {
      await abortTrainDataSource(sourceId);
    }
    throw e;
  }
}

/** Fire-and-forget background variant for the async import endpoint. */
export function runTrainImportJob(
  sourceId: string,
  params: TrainImportParams
): void {
  void (async () => {
    try {
      const result = await runTrainImportPipeline({ ...params, sourceId });
      await publishTrainImportDone(sourceId, result);
    } catch (e) {
      const err = e as Error & { code?: string; source_id?: string };
      if (err.code === "DUPLICATE_FILE") {
        return;
      }
      await publishTrainImportError(sourceId, err.message ?? "Import failed");
      await abortTrainDataSource(sourceId);
    }
  })();
}
