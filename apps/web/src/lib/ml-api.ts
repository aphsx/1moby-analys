/**
 * ML v2 API client.
 *
 * The Elysia routes are mounted: /prediction-runs, /training-runs,
 * /model-performance, plus suggested-cutoff endpoints for train/predict data.
 */

import type {
  PredictionRun,
  PredictionOutput,
  RunSummary,
  OutputsQuery,
  OutputsPage,
  MonthlyUsagePoint,
  PaymentEvent,
  ModelPerfEntry,
  ModelVersionSummary,
  TrainingRun,
  CustomerAiExplanationResult,
  RunInsight,
} from "@moby/types";

import { requestJson } from "./http";

// ── Client functions (spec §7) ──────────────────────────────────────────────

export async function fetchPredictionRuns(): Promise<PredictionRun[]> {
  return requestJson("/api/prediction-runs");
}

export async function createPredictionRun(input: {
  predict_source_id: string;
  name: string;
  cutoff_date?: string;
  /** Optional per-run model overrides — version id per model type; omit a type to use its champion. */
  model_overrides?: { churn?: string; clv?: string; credit?: string };
}): Promise<PredictionRun> {
  return requestJson("/api/prediction-runs", { method: "POST", body: input });
}

export async function deletePredictionRun(id: string): Promise<void> {
  await requestJson(`/api/prediction-runs/${id}`, { method: "DELETE" });
}

export async function retryPredictionRun(id: string): Promise<PredictionRun> {
  return requestJson(`/api/prediction-runs/${id}/retry`, { method: "POST" });
}

export async function fetchRunSummary(runId: string): Promise<RunSummary> {
  return requestJson(`/api/prediction-runs/${runId}/summary`);
}

export async function fetchRunOutputs(runId: string, q: OutputsQuery = {}): Promise<OutputsPage> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return requestJson(`/api/prediction-runs/${runId}/outputs?${params.toString()}`);
}

export async function fetchRunOutput(runId: string, accId: number | string): Promise<PredictionOutput> {
  return requestJson(`/api/prediction-runs/${runId}/outputs/${accId}`);
}

export async function generateCustomerAiExplanation(
  runId: string,
  accId: number | string,
  options: { force?: boolean } = {}
): Promise<CustomerAiExplanationResult> {
  return requestJson(`/api/prediction-runs/${runId}/outputs/${accId}/ai-explanation`, {
    method: "POST",
    body: options,
  });
}

/** GET /prediction-runs/:id/insight — cached AI base summary of the whole base. */
export async function fetchRunInsight(runId: string): Promise<RunInsight> {
  return requestJson(`/api/prediction-runs/${runId}/insight`);
}

/** POST /prediction-runs/:id/insight — generate or regenerate the base summary. */
export async function generateRunInsight(
  runId: string,
  options: { force?: boolean } = {}
): Promise<RunInsight> {
  return requestJson(`/api/prediction-runs/${runId}/insight`, { method: "POST", body: options });
}

export async function fetchCustomerUsageMonthly(
  runId: string,
  accId: number | string
): Promise<MonthlyUsagePoint[]> {
  return requestJson(`/api/prediction-runs/${runId}/customers/${accId}/usage-monthly`);
}

export async function fetchCustomerPayments(
  runId: string,
  accId: number | string
): Promise<PaymentEvent[]> {
  return requestJson(`/api/prediction-runs/${runId}/customers/${accId}/payments`);
}

/** GET /predict-data-sources/:id/suggested-cutoff — day after latest observed activity. */
export async function fetchPredictSuggestedCutoff(
  sourceId: string
): Promise<{ suggested_cutoff: string; latest_data_date: string | null }> {
  return requestJson(`/api/predict-data-sources/${sourceId}/suggested-cutoff`);
}

/** GET /train-data-sources/:id/suggested-cutoff — Gate 3 feasible cutoff. */
export async function fetchTrainSuggestedCutoff(
  sourceId: string
): Promise<{ suggested_cutoff: string; latest_data_date: string; horizon_days: number }> {
  return requestJson(`/api/train-data-sources/${sourceId}/suggested-cutoff`);
}

export async function fetchModelPerformance(): Promise<ModelPerfEntry[]> {
  return requestJson("/api/model-performance");
}

/** GET /model-performance/:modelType/versions — all trained versions. */
export async function fetchModelVersions(modelType: string): Promise<ModelVersionSummary[]> {
  return requestJson(`/api/model-performance/${modelType}/versions`);
}

/** POST /model-performance/:modelType/activate — pin a version to production. */
export async function activateModelVersion(
  modelType: string,
  modelVersionId: string,
  reason?: string
): Promise<{ ok: boolean }> {
  return requestJson(`/api/model-performance/${modelType}/activate`, {
    method: "POST",
    body: { model_version_id: modelVersionId, reason },
  });
}

/** DELETE /model-performance/:modelType/versions/:id — remove a non-production version. */
export async function deleteModelVersion(
  modelType: string,
  modelVersionId: string
): Promise<{ deleted: boolean }> {
  return requestJson(`/api/model-performance/${modelType}/versions/${modelVersionId}`, { method: "DELETE" });
}

export async function fetchTrainingRuns(): Promise<TrainingRun[]> {
  return requestJson("/api/training-runs");
}

interface DeleteTrainingRunResult {
  deleted: boolean;
  production_repointed?: Array<{
    model_type: string;
    from_version: string;
    to_version: string;
  }>;
  production_cleared?: Array<{
    model_type: string;
    from_version: string;
  }>;
}

/** DELETE /training-runs/:id — remove a finished training run (+ its model versions). */
export async function deleteTrainingRun(id: string): Promise<DeleteTrainingRunResult> {
  return requestJson(`/api/training-runs/${id}`, { method: "DELETE" });
}

export async function createTrainingRun(input: {
  train_source_id: string;
  dataset_name: string;
  cutoff_date?: string;
  horizon_days?: number;
}): Promise<TrainingRun> {
  return requestJson("/api/training-runs", { method: "POST", body: input });
}
