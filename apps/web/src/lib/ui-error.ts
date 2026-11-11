const HIDDEN_UI_ERROR_MESSAGES = new Set([
  "API returned invalid JSON",
]);

/** The message to show for a failure: the error's own message, or the fallback when it has none fit to show. */
export function getDisplayError(error: unknown, fallbackMessage: string): string {
  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  return HIDDEN_UI_ERROR_MESSAGES.has(message) ? fallbackMessage : message;
}

export function isImportTimeoutError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "TimeoutError") {
    return true;
  }
  if (error instanceof Error && "code" in error && (error as Error & { code?: string }).code === "IMPORT_TIMEOUT") {
    return true;
  }
  return false;
}

/** User-facing import failure, with a stable timeout message. */
export function getImportErrorMessage(error: unknown, fallbackMessage: string): string {
  if (isImportTimeoutError(error)) {
    return "นำเข้าข้อมูลหมดเวลา กรุณาลองใหม่อีกครั้ง";
  }
  return getDisplayError(error, fallbackMessage);
}
