/**
 * Redis Stream progress for async train import (polled via GET /import/progress).
 */

import { getRedis } from "./redis";
import type { TrainImportResult } from "./train-import";
import type { TrainPipelineProgressEvent } from "./train-pipeline-progress";

const STREAM_TTL_SEC = 3600;

export function trainImportStreamKey(sourceId: string): string {
  return `train-import:${sourceId}`;
}

export async function publishTrainPipelineProgress(
  sourceId: string,
  event: TrainPipelineProgressEvent
): Promise<void> {
  const redis = getRedis();
  const fields: string[] = [
    "progress",
    String(event.progress),
    "step",
    event.step,
    "phase",
    event.phase,
  ];
  if (event.sheet) {
    fields.push("sheet", event.sheet);
  }
  // biome-ignore lint/suspicious/noEqualsToNull: event.rows is `number | undefined`, not `| null`.
  if (event.rows != null) {
    fields.push("rows", String(event.rows));
  }
  await redis.xadd(trainImportStreamKey(sourceId), "*", ...fields);
  await redis.expire(trainImportStreamKey(sourceId), STREAM_TTL_SEC);
}

export async function publishTrainImportDone(
  sourceId: string,
  result: TrainImportResult
): Promise<void> {
  const redis = getRedis();
  await redis.xadd(
    trainImportStreamKey(sourceId),
    "*",
    "progress",
    "100",
    "step",
    "Ready for model training",
    "status",
    "done",
    "payload",
    JSON.stringify(result)
  );
  await redis.expire(trainImportStreamKey(sourceId), STREAM_TTL_SEC);
}

export async function publishTrainImportError(
  sourceId: string,
  message: string,
  extra?: { code?: string; source_id?: string }
): Promise<void> {
  const redis = getRedis();
  const fields: string[] = [
    "progress",
    "0",
    "step",
    `failed: ${message}`,
    "status",
    "failed",
    "message",
    message,
  ];
  if (extra?.code) {
    fields.push("code", extra.code);
  }
  if (extra?.source_id) {
    fields.push("source_id", extra.source_id);
  }
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

export type TrainImportStreamSnapshot =
  | { kind: "progress"; event: TrainPipelineProgressEvent }
  | { kind: "done"; result: TrainImportResult }
  | { kind: "failed"; message: string; code?: string; source_id?: string }
  | { kind: "empty" };

/** Latest Redis stream entry for GET /import/progress. */
export async function readLatestTrainImportStreamEntry(
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

  if (entries.length === 0) {
    return { kind: "empty" };
  }

  const fieldMap = fieldsToMap(entries[0][1]);
  const status = fieldMap.get("status");

  if (status === "done") {
    const payloadRaw = fieldMap.get("payload");
    const result = payloadRaw
      ? (JSON.parse(payloadRaw) as TrainImportResult)
      : ({
          import_status: "ready",
          sheet_manifest: {},
          source_id: sourceId,
        } as TrainImportResult);
    return { kind: "done", result };
  }

  if (status === "failed") {
    return {
      code: fieldMap.get("code"),
      kind: "failed",
      message:
        fieldMap.get("message") ?? fieldMap.get("step") ?? "Import failed",
      source_id: fieldMap.get("source_id"),
    };
  }

  const phaseRaw = fieldMap.get("phase");
  return {
    event: {
      phase: phaseRaw === "clean" ? "clean" : "raw",
      progress: Number(fieldMap.get("progress") ?? "0"),
      rows: fieldMap.get("rows") ? Number(fieldMap.get("rows")) : undefined,
      sheet: fieldMap.get("sheet"),
      step: fieldMap.get("step") ?? "",
    },
    kind: "progress",
  };
}
