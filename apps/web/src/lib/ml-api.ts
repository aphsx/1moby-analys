/**
 * ML v2 API client — contract per docs/ML-V2-DASHBOARD-SPEC.md §4/§7 and
 * docs/ML-CALCULATIONS-TH.md §13 (output contract).
 *
 * The Elysia routes are mounted: /prediction-runs, /training-runs,
 * /model-performance, plus suggested-cutoff endpoints for train/predict data.
 */

// ── Re-export shared contract types from @moby/types ────────────────────────
export type {
  RunStatus,
  LifecycleStage,
  RiskLevel,
  ValueTier,
  UrgencyLevel,
} from "@moby/types";

export type {
  ChurnFactor,
  ModelEligibility,
  ProfileSnapshot,
  PredictionRun,
  PredictionOutput,
  RunSummary,
  OutputsQuery,
  OutputsPage,
  MonthlyUsagePoint,
  PaymentEvent,
  CustomerAiExplanationResult,
  RunInsight,
} from "@moby/types";

export type {
  SplitMetrics,
  ModelPerfEntry,
  CandidateResult,
  ModelVersionSummary,
} from "@moby/types";

export type {
  TrainingRunResult,
  TrainingRun,
} from "@moby/types";

export {
  LIFECYCLE_STAGES,
  RISK_LEVELS,
  VALUE_TIERS,
  URGENCY_LEVELS,
  TOP_PRIORITY_LIMIT,
} from "@moby/types";

// ── Local imports for internal use ──────────────────────────────────────────
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

// ── Plumbing ────────────────────────────────────────────────────────────────

import { isApiError, redirectingFetch } from "./http";

async function getJson<T>(url: string): Promise<T> {
  const res = await redirectingFetch(url);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Request failed (${res.status})`);
  }
  return body as T;
}

// Note: mutations intentionally do not redirect on 401 (preserves prior behavior).
async function sendJson<T>(url: string, method: string, payload?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(isApiError(body) ? body.message : `Request failed (${res.status})`);
  }
  return body as T;
}

// ── Client functions (spec §7) ──────────────────────────────────────────────

export async function fetchPredictionRuns(): Promise<PredictionRun[]> {
  return getJson("/api/prediction-runs");
}

export async function createPredictionRun(input: {
  predict_source_id: string;
  name: string;
  cutoff_date?: string;
  /** Optional per-run model overrides — version id per model type; omit a type to use its champion. */
  model_overrides?: { churn?: string; clv?: string; credit?: string };
}): Promise<PredictionRun> {
  return sendJson("/api/prediction-runs", "POST", input);
}

export async function deletePredictionRun(id: string): Promise<void> {
  await sendJson(`/api/prediction-runs/${id}`, "DELETE");
}

export async function retryPredictionRun(id: string): Promise<PredictionRun> {
  return sendJson(`/api/prediction-runs/${id}/retry`, "POST");
}

export async function fetchRunSummary(runId: string): Promise<RunSummary> {
  return getJson(`/api/prediction-runs/${runId}/summary`);
}

export async function fetchRunOutputs(runId: string, q: OutputsQuery = {}): Promise<OutputsPage> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return getJson(`/api/prediction-runs/${runId}/outputs?${params.toString()}`);
}

export async function fetchRunOutput(runId: string, accId: number | string): Promise<PredictionOutput> {
  return getJson(`/api/prediction-runs/${runId}/outputs/${accId}`);
}

export async function generateCustomerAiExplanation(
  runId: string,
  accId: number | string,
  options: { force?: boolean } = {}
): Promise<CustomerAiExplanationResult> {
  return sendJson(
    `/api/prediction-runs/${runId}/outputs/${accId}/ai-explanation`,
    "POST",
    options
  );
}

/** GET /prediction-runs/:id/insight — cached AI base summary of the whole base. */
export async function fetchRunInsight(runId: string): Promise<RunInsight> {
  return getJson(`/api/prediction-runs/${runId}/insight`);
}

/** POST /prediction-runs/:id/insight — generate or regenerate the base summary. */
export async function generateRunInsight(
  runId: string,
  options: { force?: boolean } = {}
): Promise<RunInsight> {
  return sendJson(`/api/prediction-runs/${runId}/insight`, "POST", options);
}

export async function fetchCustomerUsageMonthly(
  runId: string,
  accId: number | string
): Promise<MonthlyUsagePoint[]> {
  return getJson(`/api/prediction-runs/${runId}/customers/${accId}/usage-monthly`);
}

export async function fetchCustomerPayments(
  runId: string,
  accId: number | string
): Promise<PaymentEvent[]> {
  return getJson(`/api/prediction-runs/${runId}/customers/${accId}/payments`);
}

/** GET /predict-data-sources/:id/suggested-cutoff — day after latest observed activity. */
export async function fetchPredictSuggestedCutoff(
  sourceId: string
): Promise<{ suggested_cutoff: string; latest_data_date: string | null }> {
  return getJson(`/api/predict-data-sources/${sourceId}/suggested-cutoff`);
}

/** GET /train-data-sources/:id/suggested-cutoff — Gate 3 feasible cutoff. */
export async function fetchTrainSuggestedCutoff(
  sourceId: string
): Promise<{ suggested_cutoff: string; latest_data_date: string; horizon_days: number }> {
  return getJson(`/api/train-data-sources/${sourceId}/suggested-cutoff`);
}

export async function fetchModelPerformance(): Promise<ModelPerfEntry[]> {
  return getJson("/api/model-performance");
}

/** GET /model-performance/:modelType/versions — all trained versions. */
export async function fetchModelVersions(modelType: string): Promise<ModelVersionSummary[]> {
  return getJson(`/api/model-performance/${modelType}/versions`);
}

/** POST /model-performance/:modelType/activate — pin a version to production. */
export async function activateModelVersion(
  modelType: string,
  modelVersionId: string,
  reason?: string
): Promise<{ ok: boolean }> {
  return sendJson(`/api/model-performance/${modelType}/activate`, "POST", {
    modelVersionId,
    reason,
  });
}

/** DELETE /model-performance/:modelType/versions/:id — remove a non-production version. */
export async function deleteModelVersion(
  modelType: string,
  modelVersionId: string
): Promise<{ deleted: boolean }> {
  return sendJson(`/api/model-performance/${modelType}/versions/${modelVersionId}`, "DELETE");
}

export async function fetchTrainingRuns(): Promise<TrainingRun[]> {
  return getJson("/api/training-runs");
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
  return sendJson(`/api/training-runs/${id}`, "DELETE");
}

export async function createTrainingRun(input: {
  train_source_id: string;
  dataset_name: string;
  cutoff_date?: string;
  horizon_days?: number;
}): Promise<TrainingRun> {
  return sendJson("/api/training-runs", "POST", input);
}
