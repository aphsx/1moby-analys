/**
 * Number-range filters on the customer list: one query key per column, value "min-max" with either
 * side optional ("50000-100000", "50000-", "-100000"). Bounds are inclusive.
 * Pure on purpose (no db import) so it can be tested without a database.
 */

export const RANGE_KEYS = ["predicted_clv_6m", "total_revenue", "revenue_at_risk", "days_since_last_activity"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

/** The only shape the outputs route accepts for a range key; anything else is rejected before SQL. */
export const RANGE_PATTERN = "^(\\d+(\\.\\d+)?)?-(\\d+(\\.\\d+)?)?$";
const RANGE_RE = new RegExp(RANGE_PATTERN);

export type Range = { min?: number; max?: number };

/** null when the value is missing, malformed, or has neither bound. */
export function parseRange(raw: string | undefined): Range | null {
  const match = raw?.match(RANGE_RE);
  if (!match) return null;
  const [, min, , max] = match;
  if (min === undefined && max === undefined) return null;
  const range: Range = {};
  if (min !== undefined) range.min = Number(min);
  if (max !== undefined) range.max = Number(max);
  return range;
}
