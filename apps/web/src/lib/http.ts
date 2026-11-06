/**
 * One HTTP path for every web API client (api.ts, ml-api.ts, ai-chat-api.ts): cookie
 * credentials, a redirect to /login on 401, and the API's `{ message, code? }` errors
 * thrown as ApiError.
 */

/** A failed API call: the server's message and code, plus the HTTP status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

export const IMPORT_TIMEOUT_CODE = "IMPORT_TIMEOUT";

/** The error every import path throws when the import time budget runs out. */
export const importTimeoutError = () =>
  new ApiError("นำเข้าข้อมูลหมดเวลา กรุณาลองใหม่อีกครั้ง", 504, IMPORT_TIMEOUT_CODE);

/** ApiError from a response body, falling back to `Request failed (status)`. */
export function toApiError(body: unknown, status: number): ApiError {
  const b = typeof body === "object" && body !== null ? (body as { message?: unknown; code?: unknown }) : {};
  return new ApiError(
    typeof b.message === "string" ? b.message : `Request failed (${status})`,
    status,
    typeof b.code === "string" ? b.code : undefined
  );
}

export function redirectToLogin(): never {
  window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
  throw new ApiError("Unauthorized", 401, "UNAUTHENTICATED");
}

/** fetch() with cookie credentials that redirects to /login on 401 (browser only). For streams and uploads. */
export async function redirectingFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401 && typeof window !== "undefined") redirectToLogin();
  return res;
}

/**
 * A JSON API call. `body` is sent as JSON, or as-is when it is FormData. Resolves to the
 * parsed response (undefined for 204) and throws ApiError for any non-2xx status.
 */
export async function requestJson<T>(
  url: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await redirectingFetch(url, {
    method: init.method ?? "GET",
    headers: init.body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    signal: init.signal,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(`Unexpected response (${res.status})`, res.status);
    }
  }
  if (!res.ok) throw toApiError(body, res.status);
  return body as T;
}
