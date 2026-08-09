"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type MouseEvent, useState } from "react";
import { notifyStatusDialog } from "@/components/global-status-dialog-host";
import { StatusDialog } from "@/components/status-dialog";
import { Skeleton } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import type { OutputsQuery, PredictionOutput } from "@/lib/ml-api";
import { shouldConfirmAiOverwrite } from "./customer-ai";
import {
  CUSTOMER_ROW_GRID,
  CUSTOMER_ROW_HEADER_GRID,
  HighValueMedal,
  isHighValueTier,
  LifecycleRowPill,
  MetricCell,
} from "./customer-row-ui";
import { EXPORT_ROW_CAP, exportOutputsCsv } from "./export-csv";
import { GenAiButton } from "./gen-ai-button";

export const STAGES = ["Active Paid", "Active Free", "Churned", "Ghost"];

export type CustomerRow = Pick<
  PredictionOutput,
  | "acc_id"
  | "lifecycle_stage"
  | "sub_stage"
  | "churn_probability"
  | "predicted_clv_6m"
  | "customer_value_tier"
  | "n_purchases"
  | "total_revenue"
  | "revenue_at_risk"
  | "credit_urgency_level"
  | "estimated_days_until_topup"
  | "days_since_last_activity"
  | "priority_score"
  | "ai_status"
  | "ai_explanation"
>;

export type CustomerSortKey =
  | "acc_id"
  | "lifecycle_stage"
  | "churn_probability"
  | "priority_score"
  | "predicted_clv_6m"
  | "total_revenue"
  | "revenue_at_risk"
  | "estimated_days_until_topup"
  | "days_since_last_activity"
  | "ai_status";

export type CustomerSortDirection = "asc" | "desc";

export interface CustomerSort {
  direction: CustomerSortDirection;
  key: CustomerSortKey;
}

export interface CustomerFilters {
  churn_risk_level: string;
  credit_urgency_level: string;
  customer_value_tier: string;
  lifecycle_stage: string;
  search: string;
}

const EMPTY_FILTERS: CustomerFilters = {
  churn_risk_level: "",
  credit_urgency_level: "",
  customer_value_tier: "",
  lifecycle_stage: "",
  search: "",
};

/** Quick preset = one click sets filters + sort together (single URL update). */
export interface CustomerPreset {
  filters: CustomerFilters;
  key: string;
  label: string;
  sort: CustomerSort | null;
}

// Server filters are single-value (eq), so "เสี่ยงสูง" pins churn_risk_level to
// "high" and surfaces critical rows via the revenue_at_risk sort.
export const CUSTOMER_PRESETS: CustomerPreset[] = [
  {
    filters: {
      ...EMPTY_FILTERS,
      churn_risk_level: "high",
      customer_value_tier: "high",
    },
    key: "high_value_high_risk",
    label: "มูลค่าสูง + เสี่ยงสูง",
    sort: { direction: "desc", key: "revenue_at_risk" },
  },
  {
    filters: { ...EMPTY_FILTERS, credit_urgency_level: "critical" },
    key: "credit_running_out",
    label: "เครดิตใกล้หมด",
    sort: { direction: "asc", key: "estimated_days_until_topup" },
  },
  {
    filters: { ...EMPTY_FILTERS },
    key: "long_inactive",
    label: "หายไปนาน",
    sort: { direction: "desc", key: "days_since_last_activity" },
  },
  {
    filters: { ...EMPTY_FILTERS },
    key: "all",
    label: "ทั้งหมด",
    sort: null,
  },
];

function presetIsActive(
  preset: CustomerPreset,
  filters: CustomerFilters,
  sort: CustomerSort | null
): boolean {
  const filterKeys = Object.keys(EMPTY_FILTERS) as Array<keyof CustomerFilters>;
  const filtersMatch = filterKeys.every((key) =>
    key === "search" ? true : filters[key] === preset.filters[key]
  );
  const sortMatch =
    preset.sort === null
      ? sort === null
      : sort !== null &&
        sort.key === preset.sort.key &&
        sort.direction === preset.sort.direction;
  return filtersMatch && sortMatch;
}

/** Build the server outputs query for the current view (shared with CSV export). */
export function toOutputsQuery(
  filters: CustomerFilters,
  sort: CustomerSort | null
): Omit<OutputsQuery, "page" | "page_size"> {
  return {
    churn_risk_level:
      filters.churn_risk_level as OutputsQuery["churn_risk_level"],
    credit_urgency_level:
      filters.credit_urgency_level as OutputsQuery["credit_urgency_level"],
    customer_value_tier:
      filters.customer_value_tier as OutputsQuery["customer_value_tier"],
    lifecycle_stage: filters.lifecycle_stage as OutputsQuery["lifecycle_stage"],
    search: filters.search.trim() || undefined,
    sort: sort ? `${sort.key}:${sort.direction}` : undefined,
  };
}

const URGENCY_COLORS: Record<string, string> = {
  critical: "#fc4c02",
  monitor: "#9ca3af",
  stable: "#006bff",
  warning: "#ffa400",
};

interface CustomersViewProps {
  aiError?: string | null;
  filters: CustomerFilters;
  onFiltersChange: (filters: CustomerFilters) => void;
  onGenerateAi: (accId: number, options?: { force?: boolean }) => Promise<void>;
  onPageChange: (page: number) => void;
  /** Applies filters + sort atomically (one URL update) — used by presets. */
  onPresetApply: (filters: CustomerFilters, sort: CustomerSort | null) => void;
  onSortChange: (sort: CustomerSort | null) => void;
  page: number;
  pageSize: number;
  pending: boolean;
  rows: CustomerRow[];
  runId: string;
  sort: CustomerSort | null;
  total: number;
}

function Inner({
  rows,
  total,
  page,
  pageSize,
  pending,
  runId,
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  onPresetApply,
  onPageChange,
  onGenerateAi,
  aiError = null,
}: CustomersViewProps) {
  const router = useRouter();

  const [generatingAccIds, setGeneratingAccIds] = useState<Set<number>>(
    () => new Set()
  );
  const [pendingOverwriteAccId, setPendingOverwriteAccId] = useState<
    number | null
  >(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);

  const setFilter = (key: keyof CustomerFilters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };
  const clearAll = () => onFiltersChange(EMPTY_FILTERS);
  const cycleSort = (key: CustomerSortKey) => {
    if (!sort || sort.key !== key) {
      onSortChange({ direction: "asc", key });
      return;
    }
    if (sort.direction === "asc") {
      onSortChange({ direction: "desc", key });
      return;
    }
    onSortChange(null);
  };

  const runAiGeneration = async (accId: number, force = false) => {
    setGeneratingAccIds((current) => new Set(current).add(accId));
    try {
      await onGenerateAi(accId, { force });
    } finally {
      setGeneratingAccIds((current) => {
        const next = new Set(current);
        next.delete(accId);
        return next;
      });
    }
  };

  const handleGenAiClick = (
    event: MouseEvent<HTMLButtonElement>,
    row: CustomerRow
  ) => {
    event.stopPropagation();
    if (shouldConfirmAiOverwrite(row)) {
      setPendingOverwriteAccId(row.acc_id);
      return;
    }
    void runAiGeneration(row.acc_id);
  };

  const handleExport = async () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    setExportProgress(null);
    try {
      const result = await exportOutputsCsv(
        runId,
        toOutputsQuery(filters, sort),
        (loaded, t) => setExportProgress({ loaded, total: t })
      );
      if (result.capped) {
        notifyStatusDialog({
          message: `ผลลัพธ์ที่ตรงเงื่อนไขมี ${result.total.toLocaleString()} แถว — ไฟล์ CSV มีเฉพาะ ${result.rows.toLocaleString()} แถวแรกตามการเรียงปัจจุบัน กรุณา filter ให้แคบลงถ้าต้องการครบทุกแถว`,
          title: `Export ถูกตัดที่ ${EXPORT_ROW_CAP.toLocaleString()} แถว`,
          tone: "warning",
        });
      }
    } catch (e: unknown) {
      notifyStatusDialog({
        message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
        title: "Export CSV ไม่สำเร็จ",
        tone: "error",
      });
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const activeFilters = Object.entries(filters).filter(
    ([_, value]) => value
  ).length;
  const pendingRows = pending;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(total, (page - 1) * pageSize + rows.length);
  const customerHref = (accId: number) => {
    const params = new URLSearchParams({ run: runId });
    Object.entries(filters).forEach(([key, value]) => {
      const trimmed = value.trim();
      if (trimmed) {
        params.set(key, trimmed);
      }
    });
    return `/customers/${accId}?${params.toString()}`;
  };

  return (
    <main className="px-8 py-6 pb-12">
      {aiError ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {aiError}
        </div>
      ) : null}
      <section className="surface-elev overflow-hidden">
        <div className="border-gray-100 border-b p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 focus-within:border-[color:var(--moby-200)]">
              <Search className="text-[color:var(--ink-5)]" size={15} />
              <input
                className="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[color:var(--ink-5)]"
                onChange={(event) => setFilter("search", event.target.value)}
                placeholder="Search account ID..."
                value={filters.search}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                active={!filters.lifecycle_stage}
                onClick={() => setFilter("lifecycle_stage", "")}
              >
                All
              </FilterChip>
              {STAGES.map((stage) => (
                <FilterChip
                  active={filters.lifecycle_stage === stage}
                  key={stage}
                  onClick={() => setFilter("lifecycle_stage", stage)}
                >
                  {stage}
                </FilterChip>
              ))}
              {filters.customer_value_tier && (
                <FilterChip
                  active
                  onClick={() => setFilter("customer_value_tier", "")}
                >
                  Tier: {filters.customer_value_tier} ✕
                </FilterChip>
              )}
              {filters.churn_risk_level && (
                <FilterChip
                  active
                  onClick={() => setFilter("churn_risk_level", "")}
                >
                  Risk: {filters.churn_risk_level} ✕
                </FilterChip>
              )}
              {filters.credit_urgency_level && (
                <FilterChip
                  active
                  onClick={() => setFilter("credit_urgency_level", "")}
                >
                  Urgency: {filters.credit_urgency_level} ✕
                </FilterChip>
              )}
              {activeFilters > 0 && (
                <button
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 font-semibold text-[12px] text-[color:var(--ink-4)] hover:bg-gray-50 hover:text-[color:var(--danger)]"
                  onClick={clearAll}
                  type="button"
                >
                  <RotateCcw size={13} /> Reset
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.12em]">
              มุมมองด่วน
            </span>
            {CUSTOMER_PRESETS.map((preset) => (
              <FilterChip
                active={presetIsActive(preset, filters, sort)}
                key={preset.key}
                onClick={() =>
                  onPresetApply(
                    { ...preset.filters, search: filters.search },
                    preset.sort
                  )
                }
              >
                {preset.label}
              </FilterChip>
            ))}
            <div className="ml-auto">
              <button
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 font-semibold text-[12px] text-[color:var(--moby-600)] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={exporting || total === 0}
                onClick={() => void handleExport()}
                title="ดาวน์โหลดทุกแถวที่ตรง filter ปัจจุบันเป็น CSV (UTF-8, เปิดใน Excel ได้)"
                type="button"
              >
                <Download
                  className={exporting ? "animate-bounce" : undefined}
                  size={13}
                />
                {exporting
                  ? exportProgress
                    ? `กำลัง export… ${exportProgress.loaded.toLocaleString()}/${Math.min(exportProgress.total, EXPORT_ROW_CAP).toLocaleString()}`
                    : "กำลัง export…"
                  : "Export CSV"}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="xl:min-w-[1220px]">
            <div
              className={`grid gap-4 border-gray-100 border-b bg-gray-50 px-5 py-3 font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.12em] max-xl:hidden ${CUSTOMER_ROW_HEADER_GRID}`}
            >
              <SortableHeader
                activeSort={sort}
                label="Account"
                onSort={cycleSort}
                sortKey="acc_id"
              />
              <SortableHeader
                activeSort={sort}
                label="Lifecycle"
                onSort={cycleSort}
                sortKey="lifecycle_stage"
              />
              <SortableHeader
                activeSort={sort}
                label="Churn"
                onSort={cycleSort}
                sortKey="churn_probability"
              />
              <SortableHeader
                activeSort={sort}
                alignRight
                label="Score"
                onSort={cycleSort}
                sortKey="priority_score"
              />
              <SortableHeader
                activeSort={sort}
                alignRight
                label="CLV 6m"
                onSort={cycleSort}
                sortKey="predicted_clv_6m"
              />
              <SortableHeader
                activeSort={sort}
                alignRight
                label="Revenue"
                onSort={cycleSort}
                sortKey="total_revenue"
              />
              <SortableHeader
                activeSort={sort}
                alignRight
                label="At risk"
                onSort={cycleSort}
                sortKey="revenue_at_risk"
              />
              <SortableHeader
                activeSort={sort}
                alignRight
                label="Credit"
                onSort={cycleSort}
                sortKey="estimated_days_until_topup"
              />
              <SortableHeader
                activeSort={sort}
                alignRight
                label="Inactive"
                onSort={cycleSort}
                sortKey="days_since_last_activity"
              />
              <SortableHeader
                activeSort={sort}
                alignRight
                label="AI"
                onSort={cycleSort}
                sortKey="ai_status"
              />
            </div>

            <div className="divide-y divide-gray-100">
              {pendingRows &&
                [...new Array(8)].map((_, i) => (
                  <div className="px-5 py-4" key={i}>
                    <Skeleton className="h-10" />
                  </div>
                ))}
              {!pendingRows &&
                rows.map((r) => (
                  <CustomerTableRow
                    href={customerHref(r.acc_id)}
                    inFlight={generatingAccIds.has(r.acc_id)}
                    key={r.acc_id}
                    onGenAiClick={(event) => handleGenAiClick(event, r)}
                    onNavigate={(href) => router.push(href)}
                    row={r}
                  />
                ))}
              {!pendingRows && rows.length === 0 && (
                <div className="px-5 py-12 text-center">
                  <p className="font-semibold text-[15px] text-[color:var(--ink-2)]">
                    No customers match this view
                  </p>
                  <p className="mt-1 text-[13px] text-[color:var(--ink-4)]">
                    Reset filters or search another account ID.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-gray-100 border-t bg-gray-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="num text-[12px] text-[color:var(--ink-4)]">
            {pendingRows
              ? "Loading customers..."
              : `${startRow.toLocaleString()}-${endRow.toLocaleString()} of ${total.toLocaleString()} matching`}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 font-semibold text-[12px] text-[color:var(--ink-4)] hover:bg-gray-50 hover:text-[color:var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={pendingRows || page <= 1}
              onClick={() => onPageChange(page - 1)}
              type="button"
            >
              <ChevronLeft size={13} /> Previous
            </button>
            <span className="num min-w-[76px] text-center text-[12px] text-[color:var(--ink-4)]">
              Page {page.toLocaleString()} / {totalPages.toLocaleString()}
            </span>
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 font-semibold text-[12px] text-[color:var(--ink-4)] hover:bg-gray-50 hover:text-[color:var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={pendingRows || page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              type="button"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {pendingOverwriteAccId !== null && (
        <StatusDialog
          cancelLabel="ยกเลิก"
          confirmLabel="เขียนทับ"
          message={`Account ${pendingOverwriteAccId} มีเหตุผลที่ได้จาก AI อยู่แล้ว ต้องการ generate ใหม่และเขียนทับข้อมูลเดิมไหม?`}
          onCancel={() => setPendingOverwriteAccId(null)}
          onConfirm={() => {
            void runAiGeneration(pendingOverwriteAccId, true);
            setPendingOverwriteAccId(null);
          }}
          open
          title="มีข้อมูลจาก AI อยู่แล้ว"
          tone="warning"
        />
      )}
    </main>
  );
}

function CustomerTableRow({
  row: r,
  href,
  inFlight,
  onNavigate,
  onGenAiClick,
}: {
  row: CustomerRow;
  href: string;
  inFlight: boolean;
  onNavigate: (href: string) => void;
  onGenAiClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const churnPct =
    r.churn_probability === null ? null : r.churn_probability * 100;
  const urgency = r.credit_urgency_level;
  return (
    <div
      className={`grid w-full cursor-pointer gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50 xl:items-center xl:gap-4 ${CUSTOMER_ROW_GRID}`}
      onClick={() => onNavigate(href)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onNavigate(href);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div>
        <p className="font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.12em] xl:hidden">
          Account
        </p>
        <div className="flex items-center gap-2">
          <p className="num font-semibold text-[18px] text-[color:var(--ink-2)]">
            {r.acc_id}
          </p>
          {isHighValueTier(r.customer_value_tier) ? <HighValueMedal /> : null}
        </div>
        <p className="mt-0.5 text-[11.5px] text-[color:var(--ink-5)]">
          {r.n_purchases ?? 0} purchases
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <LifecycleRowPill stage={r.lifecycle_stage ?? "—"} />
        {r.sub_stage && (
          <span className="truncate text-[12px] text-[color:var(--ink-4)]">
            {r.sub_stage}
          </span>
        )}
      </div>
      <MetricCell
        label="Churn"
        value={churnPct === null ? "—" : `${churnPct.toFixed(1)}%`}
        valueColor="#fc4c02"
      />
      <MetricCell
        alignRight
        label="Score"
        value={r.priority_score.toFixed(0)}
      />
      <MetricCell
        alignRight
        label="CLV 6m"
        value={
          r.predicted_clv_6m === null ? "—" : formatCurrency(r.predicted_clv_6m)
        }
      />
      <MetricCell
        alignRight
        label="Revenue"
        value={r.total_revenue === null ? "—" : formatCurrency(r.total_revenue)}
      />
      <MetricCell
        alignRight
        label="At risk"
        value={
          r.revenue_at_risk === null ? "—" : formatCurrency(r.revenue_at_risk)
        }
        valueColor={
          r.revenue_at_risk !== null && r.revenue_at_risk > 0
            ? "#fc4c02"
            : undefined
        }
      />
      <div className="xl:text-right">
        <p className="font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.12em] xl:hidden">
          Credit
        </p>
        <p
          className="num mt-0.5 font-semibold text-[14px] xl:mt-0"
          style={
            urgency
              ? { color: URGENCY_COLORS[urgency] ?? undefined }
              : undefined
          }
        >
          {urgency ?? "—"}
        </p>
        {r.estimated_days_until_topup !== null && (
          <p className="text-[11px] text-[color:var(--ink-5)]">
            topup ~{r.estimated_days_until_topup} วัน
          </p>
        )}
      </div>
      <MetricCell
        alignRight
        label="Inactive"
        value={
          r.days_since_last_activity === null
            ? "—"
            : `${r.days_since_last_activity} วัน`
        }
      />
      <div className="flex justify-start xl:justify-end">
        <GenAiButton ai={r} inFlight={inFlight} onClick={onGenAiClick} />
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
  alignRight = false,
}: {
  label: string;
  sortKey: CustomerSortKey;
  activeSort: CustomerSort | null;
  onSort: (key: CustomerSortKey) => void;
  alignRight?: boolean;
}) {
  const isActive = activeSort?.key === sortKey;
  const direction = isActive ? activeSort.direction : null;
  const Icon = direction === "desc" ? ArrowDown : ArrowUp;

  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-lg py-1 transition-colors hover:text-[color:var(--ink-2)] ${
        alignRight ? "justify-end text-right" : "justify-start text-left"
      } ${isActive ? "text-[color:var(--moby-600)]" : ""}`}
      onClick={() => onSort(sortKey)}
      title="Click to sort ascending, descending, then reset"
      type="button"
    >
      <span>{label}</span>
      <Icon className={isActive ? "opacity-100" : "opacity-25"} size={12} />
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`inline-flex h-10 items-center rounded-xl border px-3 font-semibold text-[12px] transition-colors ${
        active
          ? "border-[color:var(--moby-100)] bg-[color:var(--moby-50)] text-[color:var(--moby-600)]"
          : "border-gray-200 bg-white text-[color:var(--ink-4)] hover:bg-gray-50 hover:text-[color:var(--ink-2)]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function CustomersView(props: CustomersViewProps) {
  return <Inner {...props} />;
}
