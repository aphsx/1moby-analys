"use client";
/**
 * Binds /customers to the URL-selected or active prediction run. All list state (tab, filters, sort,
 * search, page) lives in the search params so reloads, links and the back button keep the view;
 * filtering and sorting are server-side so every lifecycle stage is reachable.
 */
import { type OutputsPage } from "@moby/types";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActiveRun } from "@/stores/run-store";
import { BUTTON, EmptyState } from "@/components/ui";
import { fetchRunOutputs, fetchRunSummary } from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { useAsync } from "@/lib/use-async";
import {
  CustomersView,
  FILTER_KEYS,
  PAGE_SIZE,
  presetFilters,
  TAB_KEYS,
  TABS,
  toOutputsQuery,
  type ListState,
  type TabKey,
} from "./customers-view";

const SEARCH_DEBOUNCE_MS = 300;

function stateFromParams(sp: URLSearchParams): ListState {
  const tab = (TAB_KEYS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as TabKey) : "paid";
  const sort = sp.get("sort") ?? "";
  const page = Number(sp.get("page"));
  return {
    tab,
    search: sp.get("search") ?? "",
    filters: Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? ""])) as ListState["filters"],
    sort: TABS[tab].sorts.some((s) => s.value === sort) ? sort : "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function paramsFromState(s: ListState, base: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  const set = (key: string, value: string) => (value ? params.set(key, value) : params.delete(key));
  set("tab", s.tab === "paid" ? "" : s.tab);
  set("search", s.search.trim());
  FILTER_KEYS.forEach((k) => set(k, s.filters[k]));
  set("sort", s.sort);
  set("page", s.page > 1 ? String(s.page) : "");
  return params;
}

function CustomersClientInner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { run, runId, runs, loading: runsLoading } = useActiveRun();
  const requestedRunId = sp.get("run") || "";
  const effectiveRunId = requestedRunId && runs.some((r) => r.id === requestedRunId) ? requestedRunId : runId;
  const effectiveRun = runs.find((r) => r.id === effectiveRunId) ?? run;

  const state = stateFromParams(sp);
  // The search box updates at once; the URL (and the fetch) follow after a pause
  const [search, setSearch] = useState(state.search);
  const [data, setData] = useState<OutputsPage | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Tab and preset counts; the list still renders if this fails
  const summary = useAsync(() => fetchRunSummary(effectiveRunId), [effectiveRunId], Boolean(effectiveRunId)).data ?? null;
  // One count per preset pill, from the server with the pill's own filters (page_size 1: only `total` is read)
  const presets = TABS[state.tab].presets;
  const presetCounts =
    useAsync(
      async () => {
        const totals = await Promise.all(
          presets.map((p) =>
            fetchRunOutputs(effectiveRunId, { ...toOutputsQuery({ ...state, search: "", filters: presetFilters(p) }), page_size: 1 }).then((r) => r.total)
          )
        );
        return Object.fromEntries(presets.map((p, i) => [p.key, totals[i]]));
      },
      [effectiveRunId, state.tab],
      Boolean(effectiveRunId) && presets.length > 1
    ).data ?? null;

  const replace = (next: ListState) => {
    const query = paramsFromState(next, new URLSearchParams(Array.from(sp.entries()))).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const onChange = (next: Partial<ListState>) => {
    if (next.search !== undefined) setSearch(next.search);
    const merged = { ...state, search, ...next, page: next.page ?? 1 };
    // Search waits for the debounce below; everything else goes to the URL now
    if (Object.keys(next).some((k) => k !== "search")) replace(merged);
  };

  useEffect(() => setSearch(state.search), [state.search]);

  useEffect(() => {
    if (search === state.search) return;
    const timer = window.setTimeout(() => replace({ ...state, search, page: 1 }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Not useAsync: the current page stays on screen while the next one loads, and a page past the
  // end sends the URL back to the last page instead of showing an empty list.
  const queryKey = JSON.stringify([effectiveRunId, toOutputsQuery(state), state.page, reload]);
  useEffect(() => {
    if (!effectiveRunId) return;
    let alive = true;
    setPending(true);
    setError(null);
    fetchRunOutputs(effectiveRunId, { ...toOutputsQuery(state), page: state.page, page_size: PAGE_SIZE })
      .then((result) => {
        if (!alive) return;
        const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (state.page > totalPages) return replace({ ...state, page: totalPages });
        setData(result);
      })
      .catch((e: unknown) => alive && setError(getDisplayError(e, "เกิดข้อผิดพลาด")))
      .finally(() => alive && setPending(false));
    return () => {
      alive = false;
    };
  }, [queryKey]);

  if (!runsLoading && !effectiveRun) {
    return (
      <div className="px-4 pt-6 sm:px-6 lg:px-8">
        <EmptyState
          title="ยังไม่มีผลทำนาย"
          hint="อัปโหลดข้อมูลแล้วสร้างรอบทำนายแรกได้ที่ “รอบทำนาย”"
          action={<Link href="/runs" className={BUTTON.primary}>สร้างรอบทำนาย</Link>}
        />
      </div>
    );
  }

  // Carried to the customer page so its back link returns to this exact view
  const listQuery = paramsFromState(state, new URLSearchParams(effectiveRunId ? { run: effectiveRunId } : {})).toString();

  return (
    <CustomersView
      state={{ ...state, search }}
      summary={summary}
      presetCounts={presetCounts}
      runId={effectiveRunId}
      cutoff={effectiveRun?.cutoff_date ?? null}
      data={data}
      pending={pending || runsLoading}
      error={error}
      onRetry={() => setReload((n) => n + 1)}
      onChange={onChange}
      customerHref={(accId) => `/customers/${accId}?${listQuery}`}
    />
  );
}

export function CustomersClient() {
  return (
    <Suspense fallback={<div className="p-8 text-muted">กำลังโหลด…</div>}>
      <CustomersClientInner />
    </Suspense>
  );
}
