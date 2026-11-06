/**
 * API-only constants. Enum strings shared with web and ML (run statuses, levels,
 * segments) live in @moby/types.
 */
import { positiveNumberEnv } from "./env";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Safety cap so a huge upload cannot OOM the API. Override with IMPORT_MAX_UPLOAD_BYTES. */
export const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

/** Wall-clock budget for one import (raw + clean). Override with IMPORT_TIMEOUT_MS. */
export const DEFAULT_IMPORT_TIMEOUT_MS = 10 * 60 * 1000;

export function maxUploadBytes(): number {
  return positiveNumberEnv("IMPORT_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES);
}

export function importTimeoutMs(): number {
  return positiveNumberEnv("IMPORT_TIMEOUT_MS", DEFAULT_IMPORT_TIMEOUT_MS);
}
