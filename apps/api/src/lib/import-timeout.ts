/**
 * Import wall-clock timeout. Large workbooks can take minutes; without a
 * bound a hung parse/insert leaves catalogs in `importing` forever.
 */
import { importTimeoutMs } from "./constants";

export const IMPORT_TIMEOUT_CODE = "IMPORT_TIMEOUT";

export class ImportTimeoutError extends Error {
  readonly code = IMPORT_TIMEOUT_CODE;

  constructor(timeoutMs: number = importTimeoutMs()) {
    super(`Import timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = "ImportTimeoutError";
  }
}

export function isImportTimeoutError(e: unknown): e is ImportTimeoutError {
  return (
    e instanceof ImportTimeoutError ||
    (typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === IMPORT_TIMEOUT_CODE)
  );
}

export function throwIfImportAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ImportTimeoutError();
}

export async function withImportTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const timeoutMs = importTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_, reject) => {
        const onAbort = () => reject(new ImportTimeoutError(timeoutMs));
        if (controller.signal.aborted) {
          onAbort();
          return;
        }
        controller.signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
