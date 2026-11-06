/**
 * Server-only helpers for the ML v2 response contract. The contract types themselves
 * live in @moby/types; import them from there.
 */

/** Drizzle `numeric` columns come back as strings — convert null-safely. */
export function num(v: string | number | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export const DEFAULT_RISK_THRESHOLDS = { medium: 0.3, high: 0.6, critical: 0.85 };

export const EMPTY_MODEL_VERSIONS = { churn: "", clv: "", credit: "" };

/** Last 12 calendar months strictly before the cutoff month, as YYYY-MM keys. */
export function monthKeysBeforeCutoff(cutoffDate: string, months = 12): string[] {
  const cutoff = new Date(`${cutoffDate}T00:00:00Z`);
  const keys: string[] = [];
  for (let i = months; i >= 1; i--) {
    const d = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}
