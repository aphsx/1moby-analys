/**
 * Customer-list state: tabs, filters and the URL keys that carry them. A plain module (no "use client")
 * so the server page of /customers/[id] can build its back link from it.
 */

export const TAB_KEYS = ["paid", "free", "churned", "ghost"] as const;
export type TabKey = (typeof TAB_KEYS)[number];
/** Raw filters kept in the URL; presets set them, and dashboard links can set any combination. */
export const FILTER_KEYS = ["customer_value_tier", "churn_risk_level", "credit_urgency_level", "ever_paid", "sending_months_max"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type ListFilters = Record<FilterKey, string>;
export const EMPTY_FILTERS: ListFilters = { customer_value_tier: "", churn_risk_level: "", credit_urgency_level: "", ever_paid: "", sending_months_max: "" };

export interface ListState {
  tab: TabKey;
  search: string;
  filters: ListFilters;
  /** "column:direction"; empty means the tab's default sort */
  sort: string;
  page: number;
}

export type CustomerDetailSearchParams = {
  run?: string | string[];
  tab?: string | string[];
  search?: string | string[];
  customer_value_tier?: string | string[];
  churn_risk_level?: string | string[];
  credit_urgency_level?: string | string[];
  ever_paid?: string | string[];
  sort?: string | string[];
  page?: string | string[];
};

const CUSTOMER_LIST_QUERY_KEYS = [
  "run",
  "tab",
  "search",
  "customer_value_tier",
  "churn_risk_level",
  "credit_urgency_level",
  "ever_paid",
  "sort",
  "page",
] as const;

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
