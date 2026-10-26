/**
 * [NEW] Elysia → FastAPI internal job trigger (ML v2).
 *
 * The ML service authenticates internal calls with the shared
 * INTERNAL_SERVICE_TOKEN (see apps/ml/api/main.py).
 *
 * Every call is bounded by an AbortController timeout (ML_INTERNAL_TIMEOUT_MS,
 * default 30s) — a hung ML service must surface as a thrown error so callers
 * can mark the run 'failed' instead of leaving it stuck.
 */

const DEFAULT_ML_INTERNAL_TIMEOUT_MS = 30_000;

function mlInternalTimeoutMs(): number {
  const parsed = Number(process.env.ML_INTERNAL_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ML_INTERNAL_TIMEOUT_MS;
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

export async function triggerMlJob(path: string, payload: object): Promise<void> {
  const res = await postMlInternal(path, payload);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throwMlInternalError(path, res, detail);
  }
}

/** Synchronous ML internal routes that return a JSON body (activate, delete, repoint). */
export async function callMlInternalJson<T>(path: string, payload: object): Promise<T> {
  const res = await postMlInternal(path, payload);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throwMlInternalError(path, res, detail);
  }
  return (await res.json()) as T;
}
