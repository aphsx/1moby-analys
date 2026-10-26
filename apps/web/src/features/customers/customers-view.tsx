"use client";
/**
 * Customer list (UI plan phase 3): lifecycle tabs with counts, quick-filter presets, a group
 * heading that states the filtered total, and a table that turns into two-line rows on phones.
 */
import { type OutputsQuery, type PredictionOutput, type RunSummary } from "@moby/types";
import { useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Download, X } from "lucide-react";
import { notifyStatusDialog } from "@/components/global-status-dialog-host";
import { StatusDialog } from "@/components/status-dialog";
import { BUTTON, InfoTip, Skeleton, StatusPill, type PillTone } from "@/components/ui";
import { formatBaht, formatBahtCompact, formatCount, formatDaysAgo, formatDaysAhead, formatPercent } from "@/lib/format";
import { LIFECYCLE_HELP, LIFECYCLE_LABEL, RISK_LABEL, URGENCY_LABEL, VALUE_TIER_LABEL } from "@/lib/labels";
import { shouldConfirmAiOverwrite } from "./customer-ai";
import { EXPORT_ROW_CAP, exportOutputsCsv } from "./export-csv";
import { GenAiButton } from "./gen-ai-button";
import { humanizeFeature } from "./reasoning";

export type CustomerRow = Pick<
  PredictionOutput,
  | "acc_id"
  | "lifecycle_stage"
  | "churn_probability"
  | "churn_risk_level"
  | "churn_factors"
  | "customer_value_tier"
  | "revenue_at_risk"
  | "estimated_days_until_topup"
  | "days_since_last_activity"
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
  key: CustomerSortKey;
  direction: CustomerSortDirection;
}

export interface CustomerFilters {
  lifecycle_stage: string;
  search: string;
  customer_value_tier: string;
  churn_risk_level: string;
  credit_urgency_level: string;
}

const EMPTY_FILTERS: CustomerFilters = {
  lifecycle_stage: "",
  search: "",
  customer_value_tier: "",
  churn_risk_level: "",
  credit_urgency_level: "",
};

/** Quick preset = one click sets filters + sort together (single URL update). */
interface CustomerPreset {
  key: string;
  label: string;
  help: string;
  filters: CustomerFilters;
  sort: CustomerSort | null;
  /** How many customers it shows, from the run summary (the same counts the overview uses). */
  count: (s: RunSummary) => number;
}

const highValueAtRisk = (s: RunSummary) =>
  s.value_risk_matrix
    .filter((c) => c.value_tier === "high" && (c.risk_level === "high" || c.risk_level === "critical"))
    .reduce((a, c) => a + c.count, 0);

// docs/ui/CONTENT.md §7
const CUSTOMER_PRESETS: CustomerPreset[] = [
  {
    key: "all",
    label: "ทั้งหมด",
    help: "ลูกค้าทุกรายในรอบทำนายนี้",
    filters: { ...EMPTY_FILTERS },
    sort: null,
    count: (s) => s.run.total_customers,
  },
  {
    key: "high_value_high_risk",
    label: "มูลค่าสูง เสี่ยงสูงขึ้นไป",
    help: "ลูกค้ามูลค่าสูงที่โอกาสเลิกใช้ระดับสูงหรือวิกฤต เรียงตามรายได้ที่เสี่ยงหาย",
    filters: { ...EMPTY_FILTERS, customer_value_tier: "high", churn_risk_level: "high,critical" },
    sort: { key: "revenue_at_risk", direction: "desc" },
    count: highValueAtRisk,
  },
  {
    key: "topup_due",
    label: "ต้องเติมเครดิตใน 14 วัน",
    help: "ลูกค้าที่คาดว่าจะเติมเครดิตครั้งถัดไปภายใน 14 วันนับจากวันตัดข้อมูล (โมเดลทำนายวันชำระครั้งถัดไป ไม่ได้ทำนายว่าเครดิตหมด)",
    filters: { ...EMPTY_FILTERS, credit_urgency_level: "critical" },
    sort: { key: "estimated_days_until_topup", direction: "asc" },
    count: (s) => s.credit.by_urgency.critical,
  },
  {
    key: "long_inactive",
    label: "ไม่ได้ใช้งานนาน",
    help: "ลูกค้าทุกราย เรียงจากที่ไม่มีการใช้งานหรือชำระเงินนานที่สุด",
    filters: { ...EMPTY_FILTERS },
    sort: { key: "days_since_last_activity", direction: "desc" },
    count: (s) => s.run.total_customers,
  },
];

const LIFECYCLE_TABS = ["Active Paid", "Active Free", "Churned", "Ghost"] as const;
const LIFECYCLE_COUNT_KEY = {
  "Active Paid": "active_paid",
  "Active Free": "active_free",
  Churned: "churned",
  Ghost: "ghost",
} as const satisfies Record<(typeof LIFECYCLE_TABS)[number], keyof RunSummary["lifecycle"]>;

function presetIsActive(preset: CustomerPreset, filters: CustomerFilters, sort: CustomerSort | null): boolean {
  const filterKeys = Object.keys(EMPTY_FILTERS) as Array<keyof CustomerFilters>;
  const filtersMatch = filterKeys.every((key) => (key === "search" ? true : filters[key] === preset.filters[key]));
  const sortMatch =
    preset.sort === null
      ? sort === null
      : sort !== null && sort.key === preset.sort.key && sort.direction === preset.sort.direction;
  return filtersMatch && sortMatch;
}

/** Build the server outputs query for the current view (shared with CSV export). */
export function toOutputsQuery(filters: CustomerFilters, sort: CustomerSort | null): Omit<OutputsQuery, "page" | "page_size"> {
  return {
    sort: sort ? `${sort.key}:${sort.direction}` : undefined,
    search: filters.search.trim() || undefined,
    lifecycle_stage: filters.lifecycle_stage as OutputsQuery["lifecycle_stage"],
    customer_value_tier: filters.customer_value_tier as OutputsQuery["customer_value_tier"],
    churn_risk_level: filters.churn_risk_level as OutputsQuery["churn_risk_level"],
    credit_urgency_level: filters.credit_urgency_level as OutputsQuery["credit_urgency_level"],
  };
}

const RISK_TONE: Record<string, PillTone> = { critical: "negative", high: "warning", medium: "neutral", low: "neutral" };
/** Top-ups this close are the urgent ones (URGENCY_CRITICAL_DAYS in apps/ml/src/constants.py). */
const TOPUP_URGENT_DAYS = 14;

interface CustomersViewProps {
  rows: CustomerRow[];
  total: number;
  revenueAtRiskSum: number;
  page: number;
  pageSize: number;
  pending: boolean;
  runId: string;
  summary: RunSummary | null;
  filters: CustomerFilters;
  sort: CustomerSort | null;
  onFiltersChange: (filters: CustomerFilters) => void;
  onSortChange: (sort: CustomerSort | null) => void;
  /** Applies filters + sort atomically (one URL update) — used by presets. */
  onPresetApply: (filters: CustomerFilters, sort: CustomerSort | null) => void;
  onPageChange: (page: number) => void;
  onGenerateAi: (accId: number, options?: { force?: boolean }) => Promise<void>;
  aiError?: string | null;
}

export function CustomersView({
  rows,
  total,
  revenueAtRiskSum,
  page,
  pageSize,
  pending,
  runId,
  summary,
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  onPresetApply,
  onPageChange,
  onGenerateAi,
  aiError = null,
}: CustomersViewProps) {
  const [generatingAccIds, setGeneratingAccIds] = useState<Set<number>>(() => new Set());
  const [pendingOverwriteAccId, setPendingOverwriteAccId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ loaded: number; total: number } | null>(null);

  const setFilter = (key: keyof CustomerFilters, value: string) => onFiltersChange({ ...filters, [key]: value });
  const clearAll = () => onFiltersChange({ ...EMPTY_FILTERS });
  const cycleSort = (key: CustomerSortKey) => {
    if (!sort || sort.key !== key) return onSortChange({ key, direction: "desc" });
    if (sort.direction === "desc") return onSortChange({ key, direction: "asc" });
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

  const handleGenAiClick = (event: MouseEvent<HTMLButtonElement>, row: CustomerRow) => {
    event.stopPropagation();
    if (shouldConfirmAiOverwrite(row)) {
      setPendingOverwriteAccId(row.acc_id);
      return;
    }
    void runAiGeneration(row.acc_id);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportProgress(null);
    try {
      const result = await exportOutputsCsv(runId, toOutputsQuery(filters, sort), (loaded, t) =>
        setExportProgress({ loaded, total: t })
      );
      if (result.capped) {
        notifyStatusDialog({
          tone: "warning",
          title: `ไฟล์ถูกตัดที่ ${formatCount(EXPORT_ROW_CAP)} แถว`,
          message: `มีลูกค้าที่ตรงเงื่อนไข ${formatCount(result.total)} ราย ไฟล์ CSV มีเฉพาะ ${formatCount(result.rows)} แถวแรกตามการเรียงปัจจุบัน กรองให้แคบลงถ้าต้องการครบทุกแถว`,
        });
      }
    } catch (e: unknown) {
      notifyStatusDialog({
        tone: "error",
        title: "ดาวน์โหลด CSV ไม่สำเร็จ",
        message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
      });
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const activePreset = CUSTOMER_PRESETS.find((p) => p.key !== "all" && presetIsActive(p, filters, sort));
  const stage = filters.lifecycle_stage as keyof typeof LIFECYCLE_LABEL | "";
  const groupTitle = activePreset?.label ?? (stage ? LIFECYCLE_LABEL[stage] : "ลูกค้าทั้งหมด");
  const groupHelp = activePreset?.help ?? (stage ? LIFECYCLE_HELP[stage] : "ลูกค้าทุกรายในรอบทำนายนี้");
  const extraChips = activePreset ? [] : filterChips(filters);
  const hasFilters = Object.values(filters).some(Boolean) || sort !== null;

  const startRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(total, (page - 1) * pageSize + rows.length);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const customerHref = (accId: number) => {
    const params = new URLSearchParams({ run: runId });
    Object.entries(filters).forEach(([key, value]) => {
      const trimmed = value.trim();
      if (trimmed) params.set(key, trimmed);
    });
    // Carried through so the customer page's back link returns to this exact list view.
    if (sort) params.set("sort", `${sort.key}:${sort.direction}`);
    if (page > 1) params.set("page", String(page));
    return `/customers/${accId}?${params.toString()}`;
  };

  return (
    <div className="space-y-5 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      {aiError ? <p className="rounded-card border border-border bg-surface px-4 py-3 text-body text-negative">{aiError}</p> : null}

      {/* Lifecycle tabs: the tab says the stage, so the table has no status column */}
      <nav aria-label="สถานะลูกค้า" className="-mx-1 overflow-x-auto border-b border-border">
        <ul className="flex min-w-max gap-5 px-1">
          {[{ value: "", label: "ทั้งหมด", count: summary?.run.total_customers }, ...LIFECYCLE_TABS.map((s) => ({
            value: s,
            label: LIFECYCLE_LABEL[s],
            count: summary?.lifecycle[LIFECYCLE_COUNT_KEY[s]],
          }))].map((tab) => {
            const active = filters.lifecycle_stage === tab.value;
            return (
              <li key={tab.value || "all"}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setFilter("lifecycle_stage", tab.value)}
                  className={`-mb-px flex h-11 items-center gap-1.5 border-b-2 text-body transition-colors duration-150 ${
                    active ? "border-text font-medium text-text" : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {tab.label}
                  {tab.count != null ? <span className="num text-micro text-muted">{formatCount(tab.count)}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="ตัวกรองด่วน" className="flex max-w-full gap-1 overflow-x-auto rounded-card bg-raised p-1.5">
          {CUSTOMER_PRESETS.map((preset) => {
            const active = preset.key === "all" ? !activePreset && !hasFilters : presetIsActive(preset, filters, sort);
            return (
              <button
                key={preset.key}
                type="button"
                aria-pressed={active}
                onClick={() => onPresetApply({ ...preset.filters, search: filters.search }, preset.sort)}
                className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body transition-colors duration-150 max-[859px]:h-11 ${
                  active ? "bg-accent-soft font-semibold text-accent-ink" : "text-text hover:bg-surface"
                }`}
              >
                {preset.label}
                {summary ? <span className="num text-micro font-normal opacity-80">{formatCount(preset.count(summary))}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex w-full items-center gap-2 min-[860px]:ml-auto min-[860px]:w-auto">
          <input
            type="search"
            value={filters.search}
            onChange={(event) => setFilter("search", event.target.value)}
            placeholder="ค้นหาเลขบัญชี"
            aria-label="ค้นหาเลขบัญชี"
            inputMode="numeric"
            className="h-8 min-w-0 flex-1 rounded-control border border-control bg-surface px-3 text-body text-text placeholder:text-faint max-[859px]:h-11 min-[860px]:w-44 min-[860px]:flex-none"
          />
          <button type="button" onClick={() => void handleExport()} disabled={exporting || total === 0} className={BUTTON.secondary}>
            <Download size={14} aria-hidden />
            {exporting
              ? exportProgress
                ? `กำลังดาวน์โหลด ${formatCount(exportProgress.loaded)}/${formatCount(Math.min(exportProgress.total, EXPORT_ROW_CAP))}`
                : "กำลังดาวน์โหลด…"
              : "ดาวน์โหลด CSV"}
          </button>
        </div>
      </div>

      <section aria-labelledby="customer-group" className="surface rounded-card">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-3 pt-4 min-[860px]:px-5">
          <div>
            <h2 id="customer-group" className="flex items-center gap-0.5 text-section font-semibold text-text">
              {groupTitle}
              <InfoTip label={groupTitle}>{groupHelp}</InfoTip>
            </h2>
            <p className="num text-small text-muted">
              {pending ? "กำลังโหลด…" : `${formatCount(total)} ราย · รายได้ที่เสี่ยงหายรวม ${formatBahtCompact(revenueAtRiskSum)}`}
            </p>
          </div>
          {extraChips.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {extraChips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    onClick={() => setFilter(chip.key, "")}
                    aria-label={`ล้างตัวกรอง ${chip.label}`}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-micro font-medium text-accent-ink max-[859px]:h-11"
                  >
                    {chip.label}
                    <X size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </header>

        {!pending && rows.length === 0 ? (
          <div className="mx-4 mb-4 rounded-card border border-dashed border-control px-4 py-3 text-center text-body text-text min-[860px]:mx-5">
            ไม่พบลูกค้าที่ตรงเงื่อนไข{" "}
            <button type="button" onClick={clearAll} className="text-accent-ink underline underline-offset-2">
              ล้างตัวกรอง
            </button>
          </div>
        ) : (
          <>
            {/* ≥ 860px: table */}
            <div className="max-[859px]:hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-[38%]">บัญชี</th>
                    <SortHeader label="โอกาสเลิกใช้" sortKey="churn_probability" sort={sort} onSort={cycleSort} />
                    <SortHeader label="รายได้ที่เสี่ยงหาย" sortKey="revenue_at_risk" sort={sort} onSort={cycleSort} right />
                    <SortHeader label="ใช้งานล่าสุด" sortKey="days_since_last_activity" sort={sort} onSort={cycleSort} right />
                    <SortHeader label="เติมครั้งถัดไป" sortKey="estimated_days_until_topup" sort={sort} onSort={cycleSort} right />
                    <th className="w-[1%]">
                      <span className="sr-only">สรุปจาก AI</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pending
                    ? Array.from({ length: 8 }, (_, i) => (
                        <tr key={i}>
                          <td colSpan={6}>
                            <Skeleton className="h-5" />
                          </td>
                        </tr>
                      ))
                    : rows.map((r) => (
                        <tr key={r.acc_id}>
                          <td className="!h-auto py-2.5">
                            <Link href={customerHref(r.acc_id)} className="num font-semibold text-text hover:underline">
                              #{r.acc_id}
                            </Link>
                            <p className="truncate text-small text-muted">{reason(r)}</p>
                          </td>
                          <td>
                            <Churn row={r} />
                          </td>
                          <td className="num text-right">{r.revenue_at_risk != null ? formatBaht(r.revenue_at_risk) : <Dash />}</td>
                          <td className="num text-right">{r.days_since_last_activity != null ? formatDaysAgo(r.days_since_last_activity) : <Dash />}</td>
                          <td className="num text-right">
                            <TopUp days={r.estimated_days_until_topup} />
                          </td>
                          <td className="text-right">
                            <GenAiButton ai={r} inFlight={generatingAccIds.has(r.acc_id)} onClick={(e) => handleGenAiClick(e, r)} />
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* < 860px: two-line rows, no field dropped */}
            <ul className="min-[860px]:hidden">
              {pending
                ? Array.from({ length: 6 }, (_, i) => (
                    <li key={i} className="border-t border-rule px-4 py-3">
                      <Skeleton className="h-12" />
                    </li>
                  ))
                : rows.map((r) => (
                    <li key={r.acc_id} className="border-t border-rule px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link href={customerHref(r.acc_id)} className="num font-semibold text-text underline-offset-2 hover:underline">
                          #{r.acc_id}
                        </Link>
                        <span className="num font-semibold text-text">{r.revenue_at_risk != null ? formatBaht(r.revenue_at_risk) : "—"}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-small text-muted">{reason(r)}</span>
                        <Churn row={r} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-small text-muted">
                        <span className="num">
                          ใช้งานล่าสุด {formatDaysAgo(r.days_since_last_activity)} · เติมครั้งถัดไป <TopUp days={r.estimated_days_until_topup} />
                        </span>
                        <GenAiButton ai={r} inFlight={generatingAccIds.has(r.acc_id)} onClick={(e) => handleGenAiClick(e, r)} />
                      </div>
                    </li>
                  ))}
            </ul>
          </>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3 min-[860px]:px-5">
          <p className="num text-small text-muted">
            {pending ? "กำลังโหลด…" : `${formatCount(startRow)}–${formatCount(endRow)} จาก ${formatCount(total)} ราย`}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onPageChange(page - 1)} disabled={pending || page <= 1} className={BUTTON.ghost}>
              ก่อนหน้า
            </button>
            <button type="button" onClick={() => onPageChange(page + 1)} disabled={pending || page >= totalPages} className={BUTTON.ghost}>
              ถัดไป
            </button>
          </div>
        </footer>
      </section>

      {pendingOverwriteAccId != null && (
        <StatusDialog
          open
          tone="warning"
          title="มีสรุปจาก AI อยู่แล้ว"
          message={`บัญชี #${pendingOverwriteAccId} มีสรุปจาก AI อยู่แล้ว ต้องการสร้างใหม่และเขียนทับของเดิมไหม`}
          confirmLabel="เขียนทับ"
          cancelLabel="ยกเลิก"
          onCancel={() => setPendingOverwriteAccId(null)}
          onConfirm={() => {
            void runAiGeneration(pendingOverwriteAccId, true);
            setPendingOverwriteAccId(null);
          }}
        />
      )}
    </div>
  );
}

/** Second line under the account: value tier, then the strongest churn factor when the run has SHAP. */
function reason(r: CustomerRow): string {
  const tier = r.customer_value_tier ? VALUE_TIER_LABEL[r.customer_value_tier] : null;
  const factor = r.churn_factors?.[0];
  const why = factor ? `${humanizeFeature(factor.feature)}${factor.direction === "up" ? " ทำให้เสี่ยงขึ้น" : ""}` : null;
  return [tier, why].filter(Boolean).join(" · ") || "—";
}

function Churn({ row }: { row: CustomerRow }) {
  if (row.churn_probability == null || !row.churn_risk_level) {
    // Only Active Paid customers are scored; under 90 days of tenure they have no score yet
    return row.lifecycle_stage === "Active Paid" ? (
      <span className="text-small text-muted">ยังไม่มีคะแนน</span>
    ) : (
      <Dash />
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num text-body text-text">{formatPercent(row.churn_probability)}</span>
      <StatusPill tone={RISK_TONE[row.churn_risk_level]}>{RISK_LABEL[row.churn_risk_level]}</StatusPill>
    </span>
  );
}

function TopUp({ days }: { days: number | null }) {
  if (days == null) return <Dash />;
  return <span className={days <= TOPUP_URGENT_DAYS ? "text-negative" : undefined}>{formatDaysAhead(days)}</span>;
}

function Dash() {
  return <span className="text-faint">—</span>;
}

function filterChips(filters: CustomerFilters): { key: keyof CustomerFilters; label: string }[] {
  const chips: { key: keyof CustomerFilters; label: string }[] = [];
  const tier = filters.customer_value_tier as keyof typeof VALUE_TIER_LABEL;
  if (VALUE_TIER_LABEL[tier]) chips.push({ key: "customer_value_tier", label: VALUE_TIER_LABEL[tier] });
  const risks = filters.churn_risk_level
    .split(",")
    .filter((r): r is keyof typeof RISK_LABEL => r in RISK_LABEL)
    .map((r) => RISK_LABEL[r]);
  if (risks.length) chips.push({ key: "churn_risk_level", label: `ความเสี่ยง${risks.join(", ")}` });
  const urgency = filters.credit_urgency_level as keyof typeof URGENCY_LABEL;
  if (URGENCY_LABEL[urgency]) chips.push({ key: "credit_urgency_level", label: URGENCY_LABEL[urgency] });
  return chips;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  right = false,
}: {
  label: ReactNode;
  sortKey: CustomerSortKey;
  sort: CustomerSort | null;
  onSort: (key: CustomerSortKey) => void;
  right?: boolean;
}) {
  const active = sort?.key === sortKey;
  const Icon = active && sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={right ? "text-right" : undefined} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-text ${active ? "text-text" : ""}`}
      >
        {label}
        <Icon size={12} aria-hidden className={active ? "opacity-100" : "opacity-30"} />
      </button>
    </th>
  );
}
