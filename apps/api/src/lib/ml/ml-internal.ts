/**
 * Elysia → FastAPI internal job trigger (ML v2).
 *
 * The ML service authenticates internal calls with the shared
 * INTERNAL_SERVICE_TOKEN (see apps/ml/api/main.py).
 *
 * Every call is bounded by an AbortController timeout (ML_INTERNAL_TIMEOUT_MS,
 * default 30s) — a hung ML service must surface as a thrown error so callers
 * can mark the run 'failed' instead of leaving it stuck.
 */
import { RUN_STATUS } from "@moby/types";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionRuns, mlTrainingRuns } from "../../db/schema";
import { positiveNumberEnv } from "../env";
import { HttpError } from "../http/errors";

const DEFAULT_ML_INTERNAL_TIMEOUT_MS = 30_000;

function mlInternalTimeoutMs(): number {
  return positiveNumberEnv("ML_INTERNAL_TIMEOUT_MS", DEFAULT_ML_INTERNAL_TIMEOUT_MS);
}

async function postMlInternal(path: string, payload: object): Promise<Response> {
  const token = process.env.INTERNAL_SERVICE_TOKEN?.trim();
  if (!token) throw new Error("INTERNAL_SERVICE_TOKEN environment variable is not set");

  const base = process.env.ML_INTERNAL_URL ?? "http://localhost:8000";
  const timeoutMs = mlInternalTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`ML job trigger ${path} timed out after ${timeoutMs}ms`);
    }
    const why = e instanceof Error ? e.message : String(e);
    throw new Error(`ML job trigger ${path} could not reach ${base}${path}: ${why}`);
  } finally {
    clearTimeout(timeout);
  }

  return res;
}

function throwMlInternalError(path: string, res: Response, detail: string): never {
  throw Object.assign(
    new Error(
      `ML job trigger ${path} failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`
    ),
    { upstreamStatus: res.status }
  );
}

/**
 * The ML service rejects state errors (a production or in-use version) with 400, which
 * the API answers as 409 Conflict; anything else is a 502 from the gateway.
 */
export function mlErrorToHttp(error: unknown, fallback: string): HttpError {
  const upstream = (error as { upstreamStatus?: number }).upstreamStatus;
  return new HttpError(upstream === 400 ? 409 : 502, error instanceof Error ? error.message : fallback);
}

/**
 * Start a run's ML job. If the trigger itself fails the job never started, so the run is
 * marked failed right away instead of waiting for the stale-run reaper.
 */
export async function triggerRunOrFail(
  table: typeof mlPredictionRuns | typeof mlTrainingRuns,
  runId: string,
  path: string,
  payload: object
): Promise<void> {
  try {
    await triggerMlJob(path, payload);
  } catch (e) {
    await db
      .update(table)
      .set({ status: RUN_STATUS.FAILED, errorMessage: (e as Error).message, finishedAt: new Date() })
      .where(eq(table.id, runId));
  }
}

export async function triggerMlJob(path: string, payload: object): Promise<void> {
  const res = await postMlInternal(path, payload);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throwMlInternalError(path, res, detail);
  }
}

/** Like triggerMlJob, for internal routes whose JSON answer the caller needs (e.g. repoint). */
export async function callMlInternalJson<T>(path: string, payload: object): Promise<T> {
  const res = await postMlInternal(path, payload);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throwMlInternalError(path, res, detail);
  }
  return (await res.json()) as T;
}
