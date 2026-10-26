/**
 * Shared HTTP plumbing for the web API clients (`api.ts` + `ml-api.ts`).
 * Centralizes the error-shape guard and the cookie-credentialed fetch that
 * redirects to /login on 401.
 */

/** Narrowing guard for the API's `{ message }` error body. */
export function isApiError(data: unknown): data is { message: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
  );
}

/**
 * fetch() with cookie credentials that redirects to /login on 401 (browser only).
 * Used for JSON GETs and for file-upload / SSE / streaming responses.
 */
export async function redirectingFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Unauthorized");
  }
  return res;
}
