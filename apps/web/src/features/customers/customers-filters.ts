/**
 * Customer-list state: tabs, filters and the URL keys that carry them. A plain module (no "use client")
 * so the server page of /customers/[id] can build its back link from it.
 */

export const TAB_KEYS = ["paid", "free", "churned", "ghost"] as const;
export type TabKey = (typeof TAB_KEYS)[number];
/** Number ranges, each "min-max" with either side optional; the api parses them (apps/api/src/lib/ml/range-filter.ts). */
export const RANGE_KEYS = ["predicted_clv_6m", "total_revenue", "revenue_at_risk", "days_since_last_activity"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const RANGE_FIELDS: Record<RangeKey, { label: string; unit: "baht" | "days" }> = {
  predicted_clv_6m: { label: "มูลค่า 6 เดือน", unit: "baht" },
  total_revenue: { label: "ยอดชำระรวม", unit: "baht" },
  revenue_at_risk: { label: "รายได้เสี่ยงหาย", unit: "baht" },
  days_since_last_activity: { label: "ไม่ได้ใช้งานมา", unit: "days" },
};

/** Raw filters kept in the URL; presets set them, and dashboard links can set any combination. */
export const FILTER_KEYS = ["customer_value_tier", "churn_risk_level", "credit_urgency_level", "ever_paid", "sending_months_max", ...RANGE_KEYS] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type ListFilters = Record<FilterKey, string>;
export const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])) as ListFilters;

export const isRangeKey = (k: FilterKey): k is RangeKey => (RANGE_KEYS as readonly string[]).includes(k);

/** Both inputs of a range row as the URL value: "" when empty, swapped when min > max, blanks and negatives dropped. */
export function toRangeValue(min: string, max: string): string {
  const read = (s: string) => {
    const n = s.trim() === "" ? NaN : Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  let lo = read(min);
  let hi = read(max);
  if (lo == null && hi == null) return "";
  if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
  return `${lo ?? ""}-${hi ?? ""}`;
}

export interface ListState {
  tab: TabKey;
  search: string;
  filters: ListFilters;
  /** "column:direction"; empty means the tab's default sort */
  sort: string;
  page: number;
}

/** Every key the list keeps in its URL; the customer page carries them back. */
const CUSTOMER_LIST_QUERY_KEYS = ["run", "tab", "search", ...FILTER_KEYS, "sort", "page"] as const;

export type CustomerDetailSearchParams = Partial<Record<(typeof CUSTOMER_LIST_QUERY_KEYS)[number], string | string[]>>;

export function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/** The list URL the customer page links back to, so the back link returns to the same view. */
export function customersHrefFromParams(searchParams: CustomerDetailSearchParams): string {
  const params = new URLSearchParams();
  CUSTOMER_LIST_QUERY_KEYS.forEach((key) => {
    const value = firstParam(searchParams[key]);
    if (value) params.set(key, value);
  });

  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}
