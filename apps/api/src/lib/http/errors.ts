/**
 * One error shape for every route: throw an HttpError, and the app-level onError
 * (apps/api/src/index.ts) answers `{ message, code? }` with its status.
 * `code` is SCREAMING_SNAKE and only set when a client needs to branch on it.
 */
import type { ErrorHandler } from "elysia";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code?: string) => new HttpError(400, message, code);
export const notFound = (message = "Not found") => new HttpError(404, message, "NOT_FOUND");
export const conflict = (message: string, code?: string) => new HttpError(409, message, code);

export type ErrorBody = { message: string; code?: string };

export const handleError: ErrorHandler = ({ error, code, set }): ErrorBody => {
  if (error instanceof HttpError) {
    set.status = error.status;
    return error.code ? { message: error.message, code: error.code } : { message: error.message };
  }
  if (code === "VALIDATION") {
    set.status = 422;
    const first = "all" in error ? (error.all as { summary?: string }[])[0]?.summary : undefined;
    return { message: first ?? "Invalid request", code: "VALIDATION" };
  }
  if (code === "NOT_FOUND") {
    set.status = 404;
    return { message: "Not found", code: "NOT_FOUND" };
  }
  console.error("[api] Unhandled error:", error);
  set.status = 500;
  // ponytail: passes the raw message through (users are signed-in staff, and some flows
  // surface parser errors this way); throw an HttpError where a friendlier message matters.
  const message = error instanceof Error && error.message ? error.message : "Internal server error";
  return { message, code: "INTERNAL" };
};
