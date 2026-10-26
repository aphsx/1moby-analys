/**
 * Progress of an async train import: the background job publishes to a Redis Stream
 * (`train-import:{source_id}`), and GET /import/progress reads it back, with the
 * Data Source row's terminal status taking precedence.
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
import { getRedis } from "./redis";

const STREAM_TTL_SEC = 3600;

export function trainImportStreamKey(sourceId: string): string {
  return `train-import:${sourceId}`;
}

export async function publishTrainImportProgress(
  sourceId: string,
  event: ImportProgressEvent
): Promise<void> {
  const redis = getRedis();
  const fields: string[] = [
    "progress", String(event.progress),
    "step", event.step,
    "phase", event.phase,
  ];
  if (event.sheet) fields.push("sheet", event.sheet);
  if (event.rows != null) fields.push("rows", String(event.rows));
  await redis.xadd(trainImportStreamKey(sourceId), "*", ...fields);
  await redis.expire(trainImportStreamKey(sourceId), STREAM_TTL_SEC);
}

export async function publishTrainImportDone(
  sourceId: string,
  result: DataSourceImportResult
): Promise<void> {
  const redis = getRedis();
  await redis.xadd(
    trainImportStreamKey(sourceId),
    "*",
    "progress", "100",
    "step", READY_STEP,
    "status", "done",
    "payload", JSON.stringify(result)
  );
  await redis.expire(trainImportStreamKey(sourceId), STREAM_TTL_SEC);
}

export async function publishTrainImportError(
  sourceId: string,
  message: string,
  extra?: { code?: string; source_id?: string }
): Promise<void> {
  const redis = getRedis();
  const fields: string[] = ["progress", "0", "step", `failed: ${message}`, "status", "failed", "message", message];
  if (extra?.code) fields.push("code", extra.code);
  if (extra?.source_id) fields.push("source_id", extra.source_id);
  await redis.xadd(trainImportStreamKey(sourceId), "*", ...fields);
  await redis.expire(trainImportStreamKey(sourceId), STREAM_TTL_SEC);
}

function fieldsToMap(fields: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < fields.length; i += 2) {
    map.set(fields[i], fields[i + 1]);
  }
  return map;
}

type TrainImportStreamSnapshot =
  | { kind: "progress"; event: ImportProgressEvent }
  | { kind: "done"; result: DataSourceImportResult }
  | { kind: "failed"; message: string; code?: string; source_id?: string }
  | { kind: "empty" };

/** Latest Redis stream entry for one import. */
async function readLatestStreamEntry(
  sourceId: string
): Promise<TrainImportStreamSnapshot> {
  const redis = getRedis();
  const entries = (await redis.xrevrange(
    trainImportStreamKey(sourceId),
    "+",
    "-",
    "COUNT",
    1
  )) as [string, string[]][];

  if (entries.length === 0) return { kind: "empty" };

  const fieldMap = fieldsToMap(entries[0][1]);
  const status = fieldMap.get("status");

  if (status === "done") {
    const payloadRaw = fieldMap.get("payload");
    const result = payloadRaw
      ? (JSON.parse(payloadRaw) as DataSourceImportResult)
      : ({ source_id: sourceId, import_status: IMPORT_STATUS.READY, sheet_manifest: {} } as DataSourceImportResult);
    return { kind: "done", result };
  }

  if (status === "failed") {
    return {
      kind: "failed",
      message: fieldMap.get("message") ?? fieldMap.get("step") ?? "Import failed",
      code: fieldMap.get("code"),
      source_id: fieldMap.get("source_id"),
    };
  }

  const phaseRaw = fieldMap.get("phase");
  return {
    kind: "progress",
    event: {
      progress: Number(fieldMap.get("progress") ?? "0"),
      step: fieldMap.get("step") ?? "",
      phase: phaseRaw === "clean" ? "clean" : "raw",
      sheet: fieldMap.get("sheet"),
      rows: fieldMap.get("rows") ? Number(fieldMap.get("rows")) : undefined,
    },
  };
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
 * Where one train import stands. The Data Source row's terminal status wins over Redis,
 * because progress events are published fire-and-forget and can land after "done".
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

  const snap = await readLatestStreamEntry(sourceId);
  if (snap.kind === "failed") return failed(snap.message, { code: snap.code, source_id: snap.source_id });
  if (!row) return { status: "not_found", progress: 0, step: "", message: "Train data source not found" };
  if (snap.kind === "done") return ready(snap.result);
  if (snap.kind === "progress") return { status: "importing", ...snap.event };
  return { status: "importing", progress: 0, step: "Waiting for import to start…", phase: "raw" };
}
