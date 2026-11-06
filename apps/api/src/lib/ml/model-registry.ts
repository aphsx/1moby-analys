/**
 * Guards for deleting Model Versions: a version, or a Training Run's versions, can't be
 * deleted while a Prediction Run still records having used them (by version string in
 * model_versions_json, or by version id in model_overrides_json).
 */
import type { ModelType } from "@moby/types";
import { desc, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionRuns } from "../../db/schema";
import { conflict } from "../http/errors";

type PredictionRunRef = { id: string; name: string };
const MAX_REFS_SHOWN = 5;

function selectRefs(where: SQL): Promise<PredictionRunRef[]> {
  return db
    .select({ id: mlPredictionRuns.id, name: mlPredictionRuns.name })
    .from(mlPredictionRuns)
    .where(where)
    .orderBy(desc(mlPredictionRuns.createdAt))
    .limit(MAX_REFS_SHOWN);
}

/** Prediction Runs that served this Model Version. */
export function predictionRunsUsingVersion(
  modelType: ModelType,
  version: string,
  versionId: string
): Promise<PredictionRunRef[]> {
  return selectRefs(sql`(
    ${mlPredictionRuns.modelVersionsJson} ->> ${modelType} = ${version}
    OR ${mlPredictionRuns.modelOverridesJson} ->> ${modelType} = ${versionId}
  )`);
}

/** Prediction Runs that served any Model Version produced by this Training Run. */
export function predictionRunsUsingTrainingRun(trainingRunId: string): Promise<PredictionRunRef[]> {
  return selectRefs(sql`EXISTS (
    SELECT 1 FROM ml_model_versions mv
    WHERE mv.training_run_id = ${trainingRunId}::uuid
      AND (
        ${mlPredictionRuns.modelVersionsJson} ->> mv.model_type = mv.version
        OR ${mlPredictionRuns.modelOverridesJson} ->> mv.model_type = mv.id::text
      )
  )`);
}

/** 409 naming up to five Prediction Runs when `refs` is non-empty. `what` is the Thai object, e.g. "เวอร์ชันนี้". */
export function assertNotUsedByPredictions(refs: PredictionRunRef[], what: string, code: string): void {
  if (refs.length === 0) return;
  const names = refs.map((r) => r.name || r.id.slice(0, 8)).join(", ");
  const more = refs.length === MAX_REFS_SHOWN ? "…" : "";
  throw conflict(`ยังมี prediction run ที่ใช้${what}: ${names}${more} — ลบผล prediction เหล่านั้นก่อน`, code);
}
