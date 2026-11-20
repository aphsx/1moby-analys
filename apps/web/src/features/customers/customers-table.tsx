"use client";
/**
 * Customer list (CUSTOMER-PAGES.md §2). Answers "who needs attention first, and why": one tab per
 * lifecycle stage, each with its own columns, presets and sorts from TABS, and from 1280px up a side
 * panel that summarises the selected row.
 */
import type { LifecycleStage, OutputsPage, OutputsQuery, PredictionOutput, ProfileSnapshot, RunSummary } from "@moby/types";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Building2, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { notifyStatusDialog } from "@/components/global-status-dialog-host";
import { RunScope } from "@/components/run-selector";
import { Select } from "@/components/select";
import { BUTTON, InfoTip, Skeleton, StatusPill, type PillTone } from "@/components/ui";
import { formatBaht, formatBahtCompact, formatCount, formatDate, formatDaysAgo, formatDaysAhead, formatPercent } from "@/lib/format";
import { CHANNEL_LABEL, LIFECYCLE_HELP, LIFECYCLE_LABEL, RISK_LABEL, URGENCY_LABEL, VALUE_TIER_HELP, VALUE_TIER_LABEL, valueTierLabel } from "@/lib/labels";
import { EXPORT_ROW_CAP, exportOutputsCsv } from "./export-csv";
import { pageItems } from "./page-items";
import { EMPTY_FILTERS, FILTER_KEYS, TAB_KEYS, type FilterKey, type ListFilters, type ListState, type TabKey } from "./customers-filters";
import { humanizeFeature } from "./reasoning";
import { getDisplayError } from "@/lib/ui-error";


interface Ctx {
  /** cutoff of the run, epoch ms */
  cutoff: number | null;
  /** churn probability where "critical" starts */
  critical: number | null;
}

interface Column {
  label: string;
  tip?: (ctx: Ctx) => string;
  right?: boolean;
  cell: (r: PredictionOutput, ctx: Ctx) => ReactNode;
}

interface Preset {
  key: string;
  label: string;
  title: string;
  help: string;
  filters: Partial<ListFilters>;
  sort?: string;
}

interface TabConfig {
  stage: LifecycleStage;
  count: (s: RunSummary) => number;
  note?: string;
  /** the first is the default */
  sorts: { value: string; label: string }[];
  presets: Preset[];
  columns: Column[];
}

const DAY_MS = 86_400_000;
/** Top-ups and expiries this close are the urgent ones (URGENCY_CRITICAL_DAYS in apps/ml/src/constants.py). */
const URGENT_DAYS = 14;
export const PAGE_SIZE = 10;

const RISK_TONE: Record<string, PillTone> = { critical: "negative", high: "warning", medium: "neutral", low: "neutral" };

const daysFromCutoff = (iso: string | null | undefined, ctx: Ctx) =>
  iso && ctx.cutoff != null ? Math.round((Date.parse(iso) - ctx.cutoff) / DAY_MS) : null;

const acctColumn = (sub?: (r: PredictionOutput) => string): Column => ({
  label: sub ? "บัญชี · เหตุผลหลัก" : "บัญชี",
  cell: (r) => (
    <>
      <span className="tabular-nums block font-semibold text-text group-hover:underline">#{r.acc_id}</span>
      {sub ? <span className="block truncate text-small text-muted">{sub(r)}</span> : null}
    </>
  ),
});

const topupColumn: Column = {
  label: "เติมครั้งถัดไป",
  tip: () => "วันที่คาดว่าจะเติมเครดิตครั้งถัดไป นับจากวันตัดข้อมูล",
  cell: (r) => <TopUp days={r.estimated_days_until_topup} />,
};

const revenueColumn: Column = { label: "ยอดชำระรวม", right: true, cell: (r) => <Money value={r.total_revenue} /> };

export const TABS: Record<TabKey, TabConfig> = {
  paid: {
    stage: "Active Paid",
    count: (s) => s.lifecycle.active_paid,
    sorts: [
      { value: "revenue_at_risk:desc", label: "รายได้เสี่ยงหาย" },
      { value: "churn_probability:desc", label: "โอกาสเลิกใช้" },
      { value: "predicted_clv_6m:desc", label: "มูลค่า 6 เดือน" },
      { value: "estimated_days_until_topup:asc", label: "เติมครั้งถัดไป" },
    ],
    presets: [
      { key: "all", label: "ทั้งหมด", title: "ลูกค้าที่จ่ายเงินทั้งหมด", help: LIFECYCLE_HELP["Active Paid"], filters: {} },
      {
        key: "critical",
        label: "ต้องติดต่อด่วน",
        title: "ต้องติดต่อด่วน",
        help: "โอกาสเลิกใช้ระดับวิกฤต เรียงตามรายได้ที่เสี่ยงหาย",
        filters: { churn_risk_level: "critical" },
      },
      {
        key: "high",
        label: "เสี่ยงสูง",
        title: "เสี่ยงสูง",
        help: "โอกาสเลิกใช้ระดับสูง รองจากวิกฤต",
        filters: { churn_risk_level: "high" },
      },
      {
        key: "credit",
        label: "อาจเติมใน 14 วัน",
        title: "อาจเติมเครดิตใน 14 วัน",
        help: "คาดว่าจะเติมเครดิตครั้งถัดไปภายใน 14 วันนับจากวันตัดข้อมูล (โมเดลทำนายวันชำระครั้งถัดไป ไม่ได้ทำนายว่าเครดิตหมด)",
        filters: { credit_urgency_level: "critical" },
        sort: "estimated_days_until_topup:asc",
      },
      { key: "value", label: "มูลค่าสูง", title: "ลูกค้ามูลค่าสูง", help: VALUE_TIER_HELP.high, filters: { customer_value_tier: "high" } },
    ],
    columns: [
      acctColumn(reason),
      {
        label: "โอกาสเลิกใช้",
        tip: (ctx) =>
          `ความน่าจะเป็นที่จะเลิกใช้ใน 90 วัน${ctx.critical != null ? ` · วิกฤตตั้งแต่ ${formatPercent(ctx.critical)}` : ""} · ลูกค้าใหม่กว่า 90 วันยังไม่มีคะแนน`,
        cell: (r) => <Risk row={r} />,
      },
      { label: "มูลค่า 6 ด.", tip: () => "ยอดที่คาดว่าจะจ่ายใน 6 เดือนข้างหน้า", right: true, cell: (r) => <Money value={r.predicted_clv_6m} muted /> },
      { label: "รายได้เสี่ยงหาย", tip: () => "โอกาสเลิกใช้ × มูลค่า 6 เดือน", right: true, cell: (r) => <Money value={r.revenue_at_risk} strong /> },
      topupColumn,
    ],
  },
  free: {
    stage: "Active Free",
    count: (s) => s.lifecycle.active_free,
    sorts: [
      { value: "days_since_last_activity:asc", label: "ใช้งานล่าสุด" },
      { value: "estimated_days_until_topup:asc", label: "เติมครั้งถัดไป" },
    ],
    presets: [
      { key: "all", label: "ทั้งหมด", title: "ใช้งานแต่ไม่ได้เติมเงิน", help: LIFECYCLE_HELP["Active Free"], filters: {} },
      {
        key: "soon",
        label: "อาจเติมใน 14 วัน",
        title: "อาจเติมเครดิตใน 14 วัน",
        help: "คาดว่าจะเติมเครดิตครั้งถัดไปภายใน 14 วันนับจากวันตัดข้อมูล",
        filters: { credit_urgency_level: "critical" },
        sort: "estimated_days_until_topup:asc",
      },
    ],
    columns: [
      acctColumn(),
      {
        label: "เครดิตคงเหลือ",
        tip: () => "เครดิต SMS ที่เหลือในบัญชี ณ วันตัดข้อมูล",
        right: true,
        cell: (r) =>
          r.profile_snapshot?.credit_sms != null ? (
            <span className="tabular-nums">
              {formatCount(r.profile_snapshot.credit_sms)} <span className="text-small text-muted">เครดิต</span>
            </span>
          ) : (
            <Dash />
          ),
      },
      {
        label: "หมดอายุ",
        tip: () => `วันหมดอายุของเครดิต SMS · สีส้มเมื่อจะหมดอายุภายใน ${URGENT_DAYS} วัน · สีเทาเมื่อหมดอายุแล้ว`,
        right: true,
        cell: (r, ctx) => {
          const expiry = r.profile_snapshot?.expire_sms;
          const days = daysFromCutoff(expiry, ctx);
          if (!expiry) return <Dash />;
          // Orange only for credit about to expire; credit that already expired is history, so grey
          const tone = days == null ? "" : days < 0 ? "text-muted" : days <= URGENT_DAYS ? "font-medium text-negative" : "";
          return <span className={`tabular-nums ${tone}`}>{formatDate(expiry)}</span>;
        },
      },
      { label: "ส่งข้อความล่าสุด", right: true, cell: (r) => <DateCell iso={r.profile_snapshot?.last_send} /> },
      topupColumn,
    ],
  },
  churned: {
    stage: "Churned",
    count: (s) => s.lifecycle.churned,
    sorts: [
      { value: "total_revenue:desc", label: "ยอดชำระรวม" },
      { value: "days_since_last_activity:asc", label: "เพิ่งหยุดใช้" },
    ],
    presets: [
      { key: "all", label: "ทั้งหมด", title: "ลูกค้าที่หยุดใช้ทั้งหมด", help: LIFECYCLE_HELP.Churned, filters: {} },
      { key: "paid", label: "เคยเติมเงิน", title: "หยุดใช้ · เคยเติมเงิน", help: "เคยชำระเงินมาก่อน เหมาะกับการชวนกลับ", filters: { ever_paid: "true" } },
      { key: "never", label: "ไม่เคยเติม", title: "หยุดใช้ · ไม่เคยเติม", help: "ไม่เคยชำระเงิน เหมาะกับแคมเปญอัตโนมัติ", filters: { ever_paid: "false" } },
    ],
    columns: [
      acctColumn(),
      revenueColumn,
      {
        label: "หยุดใช้มา",
        tip: () => "จำนวนวันที่ไม่มีการใช้งานหรือชำระเงิน นับถึงวันตัดข้อมูล",
        right: true,
        cell: (r) => (r.days_since_last_activity != null ? <span className="tabular-nums">{formatCount(r.days_since_last_activity)} วัน</span> : <Dash />),
      },
      { label: "ช่องทางหลัก", cell: (r) => mainChannel(r.profile_snapshot) ?? <Dash /> },
    ],
  },
  ghost: {
    stage: "Ghost",
    count: (s) => s.lifecycle.ghost,
    note: "ไม่มีการใช้งานหรือชำระเงินเลยในช่วงข้อมูล ส่วนใหญ่เป็นบัญชีเก่า ใช้สำหรับแคมเปญอัตโนมัติ ไม่ใช่งานรักษาลูกค้า",
    sorts: [
      { value: "acc_id:desc", label: "บัญชีใหม่สุด" },
      { value: "total_revenue:desc", label: "ยอดชำระรวม" },
    ],
    presets: [{ key: "all", label: "ทั้งหมด", title: "บัญชีที่ไม่มีกิจกรรม", help: LIFECYCLE_HELP.Ghost, filters: {} }],
    columns: [acctColumn(), { label: "สมัครเมื่อ", right: true, cell: (r) => <DateCell iso={r.profile_snapshot?.join_date} /> }, revenueColumn],
  },
};

export const effectiveSort = (s: ListState) => s.sort || TABS[s.tab].sorts[0].value;

/** The server query for the current view (shared with CSV export). */
export function toOutputsQuery(s: ListState): Omit<OutputsQuery, "page" | "page_size"> {
  const filters = Object.fromEntries(FILTER_KEYS.filter((k) => s.filters[k]).map((k) => [k, s.filters[k]]));
  return { sort: effectiveSort(s), search: s.search.trim() || undefined, lifecycle_stage: TABS[s.tab].stage, ...filters };
}

export const presetFilters = (p: Preset): ListFilters => ({ ...EMPTY_FILTERS, ...p.filters });
const sameFilters = (a: ListFilters, b: ListFilters) => FILTER_KEYS.every((k) => a[k] === b[k]);

interface CustomersTableProps {
  state: ListState;
  summary: RunSummary | null;
  /** rows per preset of the current tab, counted by the server with the same filters */
  presetCounts: Record<string, number> | null;
  runId: string;
  cutoff: string | null;
  data: OutputsPage | null;
  pending: boolean;
  error: string | null;
  onRetry: () => void;
  /** Merges into the URL state; the page goes back to 1 unless `page` is given. */
  onChange: (next: Partial<ListState>) => void;
  customerHref: (accId: number) => string;
}

export function CustomersTable({ state, summary, presetCounts, runId, cutoff, data, pending, error, onRetry, onChange, customerHref }: CustomersTableProps) {
  const router = useRouter();
  const tab = TABS[state.tab];
  const ctx: Ctx = { cutoff: cutoff ? Date.parse(cutoff) : null, critical: summary?.churn.thresholds.critical ?? null };
  const rows = data?.data ?? [];
  // Two-line account cells (paid tab) need the taller pitch; one-line tabs keep the table default
  const rowH = state.tab === "paid" ? "!h-[68px]" : "!h-[52px]";
  const total = data?.total ?? 0;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = rows.find((r) => r.acc_id === selectedId) ?? rows[0] ?? null;

  useEffect(() => {
    setSelectedId(null);
  }, [data]);

  const activePreset = tab.presets.find((p) => sameFilters(presetFilters(p), state.filters));
  const chips = activePreset ? [] : filterChips(state.filters, tab.stage);
  const title = activePreset?.title ?? "ลูกค้าที่ตรงตัวกรอง";
  const help = activePreset?.help ?? LIFECYCLE_HELP[tab.stage];
  const unscored = summary ? summary.lifecycle.active_paid - summary.churn.eligible_count : 0;
  const summaryLine = [
    `${formatCount(total)} ราย`,
    state.tab === "paid" ? `รายได้ที่เสี่ยงหายรวม ${formatBahtCompact(data?.revenue_at_risk_sum ?? 0)}` : null,
    state.tab === "paid" && activePreset?.key === "all" && unscored > 0 ? `${formatCount(unscored)} รายยังไม่มีคะแนน` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startRow = total === 0 ? 0 : (state.page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(total, (state.page - 1) * PAGE_SIZE + rows.length);

  // From 1280px a row click fills the side panel; narrower screens have no panel, so it opens the page.
  const wide = () => window.matchMedia("(min-width: 1280px)").matches;
  const onRowClick = (e: MouseEvent, accId: number) => {
    if ((e.target as HTMLElement).closest("a")) return;
    if (wide()) setSelectedId(accId);
    else router.push(customerHref(accId));
  };
  const onLinkClick = (e: MouseEvent, accId: number) => {
    if (!wide() || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    setSelectedId(accId);
  };

  return (
    <div className="pb-12">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border px-4 py-4 sm:px-6 lg:px-8 min-[860px]:py-5">
        <nav aria-label="ตำแหน่งในระบบ" className="flex items-center gap-2 text-[20px] leading-tight">
          <span className="text-muted">ลูกค้า</span>
          <ChevronRight size={16} aria-hidden className="text-faint" />
          <h1 className="text-[20px] font-semibold text-text">รายชื่อลูกค้า</h1>
        </nav>
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 min-[860px]:w-auto">
          <input
            type="search"
            value={state.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="ค้นหาเลขบัญชี"
            aria-label="ค้นหาเลขบัญชี"
            inputMode="numeric"
            className="h-9 w-full min-w-0 rounded-control border border-control bg-surface px-3 text-body text-text placeholder:text-faint max-[859px]:h-11 min-[860px]:w-56"
          />
          {/* max-w-full lets the run name truncate instead of pushing past the phone edge */}
          <div className="min-w-0 max-w-full">
            <RunScope />
          </div>
        </div>
      </header>

      <div className="grid gap-6 px-4 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_336px] xl:items-start">
        <section aria-labelledby="customer-group" className="min-w-0">
          <nav aria-label="สถานะลูกค้า" className="overflow-x-auto border-b border-border">
            <ul className="flex min-w-max gap-7">
              {TAB_KEYS.map((key) => {
                const active = state.tab === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onChange({ tab: key, filters: EMPTY_FILTERS, sort: "" })}
                      className={`-mb-px flex h-14 items-center gap-2 border-b-2 px-0.5 text-[15px] transition-colors duration-150 ${
                        active ? "border-text font-semibold text-text" : "border-transparent text-muted hover:text-text"
                      }`}
                    >
                      {LIFECYCLE_LABEL[TABS[key].stage]}
                      {summary ? <span className="tabular-nums text-small font-normal text-muted">{formatCount(TABS[key].count(summary))}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {tab.note ? <p className="mt-5 rounded-card bg-raised px-4 py-3 text-body text-text">{tab.note}</p> : null}

          {tab.presets.length > 1 ? (
            <div role="group" aria-label="ตัวกรองด่วน" className="mt-5 flex gap-1 overflow-x-auto rounded-card bg-raised p-1.5 min-[860px]:flex-wrap">
              {tab.presets.map((p) => {
                const active = p === activePreset;
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ filters: presetFilters(p), sort: p.sort ?? "" })}
                    className={`flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-control px-3.5 text-body transition-colors duration-150 max-[859px]:h-11 ${
                      active ? "bg-accent-soft font-semibold text-accent-ink" : "text-text hover:bg-surface"
                    }`}
                  >
                    {p.label}
                    {presetCounts?.[p.key] != null ? <span className="tabular-nums text-micro font-normal opacity-80">{formatCount(presetCounts[p.key])}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="customer-group" className="flex items-center gap-0.5 text-[18px] font-semibold text-text">
                {title}
                <InfoTip label={title}>{help}</InfoTip>
              </h2>
              <p className="tabular-nums text-body text-muted">{data ? summaryLine : "กำลังโหลด…"}</p>
              {chips.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <li key={chip.key}>
                      <button
                        type="button"
                        onClick={() => onChange({ filters: { ...state.filters, [chip.key]: "" } })}
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={effectiveSort(state)}
                onChange={(sort) => onChange({ sort })}
                options={tab.sorts.map((s) => ({ value: s.value, label: `เรียงตาม: ${s.label}` }))}
                leftIcon={<ArrowUpDown size={14} aria-hidden />}
                aria-label="เรียงตาม"
                className="min-w-[200px]"
              />
              <ExportButton runId={runId} state={state} disabled={total === 0} />
            </div>
          </div>

          <div className="surface mt-4 overflow-hidden">
            {error ? (
              <p role="alert" className="flex flex-wrap items-center gap-x-3 px-5 py-6 text-body text-text">
                โหลดรายชื่อลูกค้าไม่สำเร็จ · {error}
                <button type="button" onClick={onRetry} className="font-medium text-accent-ink underline underline-offset-2">
                  ลองอีกครั้ง
                </button>
              </p>
            ) : data && rows.length === 0 ? (
              <p className="px-5 py-6 text-body text-text">
                ไม่พบลูกค้าที่ตรงเงื่อนไข{" "}
                {state.search || !activePreset || activePreset.key !== "all" ? (
                  <button
                    type="button"
                    onClick={() => onChange({ search: "", filters: EMPTY_FILTERS, sort: "" })}
                    className="font-medium text-accent-ink underline underline-offset-2"
                  >
                    ล้างตัวกรอง
                  </button>
                ) : null}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className={`data-table min-w-[680px] transition-opacity duration-150 ${pending && data ? "opacity-60" : ""}`} aria-busy={pending}>
                  <thead>
                    <tr>
                      {tab.columns.map((c, i) => {
                        const tip = c.tip ? (
                          <InfoTip label={c.label} align={i === tab.columns.length - 1 || c.right ? "right" : "left"}>
                            {c.tip(ctx)}
                          </InfoTip>
                        ) : null;
                        // `th.num` is the table's right-align rule; the label sits on the column's text edge and the ⓘ goes on the inside
                        return (
                          <th key={c.label} className={`h-12 whitespace-nowrap ${c.right ? "num" : ""} ${i === 0 ? "sticky left-0 z-[2] w-[36%]" : ""}`}>
                            <span className="inline-flex items-center gap-0.5 text-small">
                              {c.right ? tip : null}
                              {c.label}
                              {c.right ? null : tip}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {!data
                      ? Array.from({ length: PAGE_SIZE }, (_, i) => (
                          <tr key={i}>
                            {tab.columns.map((c, j) => (
                              <td key={c.label} className={rowH}>
                                <Skeleton className={`h-4 ${j === 0 ? "w-32" : "ml-auto w-16"}`} />
                              </td>
                            ))}
                          </tr>
                        ))
                      : rows.map((r) => {
                          const isSelected = selected?.acc_id === r.acc_id;
                          return (
                            <tr key={r.acc_id} onClick={(e) => onRowClick(e, r.acc_id)} className="group cursor-pointer">
                              {tab.columns.map((c, i) => (
                                <td
                                  key={c.label}
                                  className={`${rowH} ${c.right ? "text-right" : ""} ${isSelected ? "xl:bg-active" : ""} ${
                                    i === 0 ? "sticky left-0 z-[1] max-w-0 bg-surface" : ""
                                  }`}
                                >
                                  {i === 0 ? (
                                    <Link
                                      href={customerHref(r.acc_id)}
                                      onClick={(e) => onLinkClick(e, r.acc_id)}
                                      aria-label={`บัญชี #${r.acc_id}`}
                                      className="block min-w-0 rounded-control"
                                    >
                                      {c.cell(r, ctx)}
                                    </Link>
                                  ) : (
                                    c.cell(r, ctx)
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            )}

            {total > 0 ? (
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-3">
                <p className="tabular-nums text-small text-muted">
                  แสดง {formatCount(startRow)}–{formatCount(endRow)} จาก {formatCount(total)} ราย
                </p>
                <nav aria-label="เลือกหน้า" className="flex items-center gap-1">
                  <PageButton label="หน้าก่อน" disabled={state.page <= 1} onClick={() => onChange({ page: state.page - 1 })}>
                    <ChevronLeft size={16} aria-hidden />
                  </PageButton>
                  {pageItems(state.page, totalPages).map((p, i) =>
                    p === "…" ? (
                      <span key={`gap-${i}`} className="w-6 text-center text-muted">
                        …
                      </span>
                    ) : (
                      <PageButton key={p} current={p === state.page} onClick={() => onChange({ page: p })}>
                        {formatCount(p)}
                      </PageButton>
                    )
                  )}
                  <PageButton label="หน้าถัดไป" disabled={state.page >= totalPages} onClick={() => onChange({ page: state.page + 1 })}>
                    <ChevronRight size={16} aria-hidden />
                  </PageButton>
                </nav>
              </footer>
            ) : null}
          </div>
        </section>

        <CustomerPanel row={selected} tab={state.tab} ctx={ctx} href={selected ? customerHref(selected.acc_id) : null} loading={!data} />
      </div>
    </div>
  );
}

function PageButton({
  children,
  label,
  current = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  label?: string;
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`tabular-nums inline-flex h-9 min-w-9 items-center justify-center rounded-control px-2 text-body transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 max-[859px]:h-11 max-[859px]:min-w-11 ${
        current ? "bg-text font-semibold text-surface" : "text-text hover:bg-raised"
      }`}
    >
      {children}
    </button>
  );
}

/** Side panel (≥1280px): who the selected customer is, the tab's facts, and why the model scored them. */
function CustomerPanel({ row, tab, ctx, href, loading }: { row: PredictionOutput | null; tab: TabKey; ctx: Ctx; href: string | null; loading: boolean }) {
  const shell = "surface sticky top-6 mt-6 hidden p-6 xl:block";
  if (!row || !href) {
    return (
      <aside aria-label="ลูกค้าที่เลือก" className={shell}>
        {loading ? <Skeleton className="h-[420px]" /> : <p className="text-body text-muted">ไม่มีลูกค้าในมุมมองนี้</p>}
      </aside>
    );
  }

  const scored = row.churn_probability != null && row.churn_risk_level != null;
  const subtitle =
    tab === "paid"
      ? [valueTierLabel(row.customer_value_tier, row.lifecycle_stage), scored && row.churn_risk_level ? `เสี่ยง${RISK_LABEL[row.churn_risk_level]}` : "ยังไม่มีคะแนน"]
          .filter(Boolean)
          .join(" · ")
      : LIFECYCLE_LABEL[row.lifecycle_stage];
  const lastAccess = row.profile_snapshot?.last_access;
  const factors = (row.churn_factors ?? []).slice(0, 3);

  return (
    <aside aria-label="ลูกค้าที่เลือก" className={shell}>
      <div className="flex flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-raised text-muted">
          <Building2 size={22} aria-hidden />
        </span>
        <h2 className="tabular-nums mt-3 text-[20px] font-semibold leading-tight text-text">บัญชี #{row.acc_id}</h2>
        <p className="mt-1 text-small text-muted">{subtitle}</p>
        {lastAccess ? (
          <p className="tabular-nums mt-3 text-small text-muted">
            เข้าระบบล่าสุด <span className="font-medium text-text">{formatDate(lastAccess)}</span>
          </p>
        ) : null}
      </div>

      <section className="mt-5 border-t border-border pt-5">
        <h3 className="text-small text-muted">ตัวเลขสำคัญ</h3>
        <dl className="mt-3 space-y-3">
          {TABS[tab].columns.slice(1).map((c) => (
            <div key={c.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-body text-muted">{c.label}</dt>
              <dd className="text-right text-body">{c.cell(row, ctx)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {tab === "paid" ? (
        <section className="mt-5 border-t border-border pt-5">
          <h3 className="text-small text-muted">เหตุผลหลักจากโมเดล</h3>
          {!scored ? (
            <p className="mt-2 text-body text-text">ยังไม่มีคะแนน · ลูกค้าใหม่กว่า 90 วัน</p>
          ) : factors.length === 0 ? (
            <p className="mt-2 text-body text-muted">รอบนี้ไม่มีคำอธิบายจากโมเดล</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {factors.map((f) => {
                const up = f.direction === "up";
                const Icon = up ? ArrowUp : ArrowDown;
                return (
                  <li key={f.feature} className="flex gap-3">
                    <Icon size={16} aria-hidden className={`mt-0.5 shrink-0 ${up ? "text-negative" : "text-accent"}`} />
                    <div className="min-w-0">
                      <p className="text-body text-text">{humanizeFeature(f.feature)}</p>
                      <p className="text-micro text-muted">{up ? "ทำให้เสี่ยงขึ้น" : "ช่วยลดความเสี่ยง"}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <Link
        href={href}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-card bg-text text-body font-semibold text-surface transition-opacity duration-150 hover:opacity-90"
      >
        เปิดหน้าลูกค้า
        <ArrowRight size={16} aria-hidden />
      </Link>
    </aside>
  );
}

function ExportButton({ runId, state, disabled }: { runId: string; state: ListState; disabled: boolean }) {
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const run = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exportOutputsCsv(runId, toOutputsQuery(state), (loaded, total) => setProgress({ loaded, total }));
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
        message: getDisplayError(e, "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง"),
      });
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  return (
    <button type="button" onClick={() => void run()} disabled={exporting || disabled} className={`${BUTTON.secondary} h-9`}>
      <Download size={14} aria-hidden />
      {exporting
        ? progress
          ? `กำลังดาวน์โหลด ${formatCount(progress.loaded)}/${formatCount(Math.min(progress.total, EXPORT_ROW_CAP))}`
          : "กำลังดาวน์โหลด…"
        : "ส่งออก CSV"}
    </button>
  );
}

/**
 * Second line under the account: the strongest churn factor when the run has SHAP; otherwise the
 * value tier with the customer's own activity, so the line differs from row to row.
 */
function reason(r: PredictionOutput): string {
  const factor = r.churn_factors?.[0];
  if (factor) return `${humanizeFeature(factor.feature)}${factor.direction === "up" ? " ทำให้เสี่ยงขึ้น" : " ช่วยลดความเสี่ยง"}`;
  const activity = r.days_since_last_activity != null ? `ใช้งานล่าสุด ${formatDaysAgo(r.days_since_last_activity)}` : null;
  const tier = r.customer_value_tier && r.customer_value_tier !== "none" ? VALUE_TIER_LABEL[r.customer_value_tier] : null;
  return [tier, activity].filter(Boolean).join(" · ") || "—";
}

/** Email when it carries most of the usage, else the biggest SMS channel. */
function mainChannel(p: ProfileSnapshot | null | undefined): string | null {
  if (!p) return null;
  if (p.email_usage_share > p.sms_usage_share) return CHANNEL_LABEL.email;
  const [key, share] = (["bc", "api", "otp"] as const)
    .map((k) => [k, p[`${k}_usage_share`]] as const)
    .reduce((a, b) => (b[1] > a[1] ? b : a));
  return share > 0 ? CHANNEL_LABEL[key] : null;
}

function Risk({ row }: { row: PredictionOutput }) {
  // Only Active Paid customers are scored; under 90 days of tenure the model abstains
  if (row.churn_probability == null || !row.churn_risk_level) return <StatusPill tone="neutral">ยังไม่มีคะแนน</StatusPill>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums min-w-[2rem] text-right font-semibold text-text">{formatPercent(row.churn_probability)}</span>
      <StatusPill tone={RISK_TONE[row.churn_risk_level]}>{RISK_LABEL[row.churn_risk_level]}</StatusPill>
    </span>
  );
}

function Money({ value, strong = false, muted = false }: { value: number | null; strong?: boolean; muted?: boolean }) {
  if (value == null) return <Dash />;
  return <span className={`tabular-nums ${strong ? "font-semibold text-text" : muted ? "text-muted" : "text-text"}`}>{formatBaht(value)}</span>;
}

function DateCell({ iso }: { iso: string | null | undefined }) {
  return iso ? <span className="tabular-nums">{formatDate(iso)}</span> : <Dash />;
}

function TopUp({ days }: { days: number | null }) {
  if (days == null) return <Dash />;
  return <span className={`tabular-nums ${days <= URGENT_DAYS ? "font-medium text-negative" : ""}`}>{formatDaysAhead(days)}</span>;
}

function Dash() {
  return <span className="text-faint">—</span>;
}

function filterChips(filters: ListFilters, stage: LifecycleStage): { key: FilterKey; label: string }[] {
  const chips: { key: FilterKey; label: string }[] = [];
  const tier = filters.customer_value_tier as keyof typeof VALUE_TIER_LABEL;
  if (VALUE_TIER_LABEL[tier]) chips.push({ key: "customer_value_tier", label: valueTierLabel(tier, stage) });
  const risks = filters.churn_risk_level
    .split(",")
    .filter((r): r is keyof typeof RISK_LABEL => r in RISK_LABEL)
    .map((r) => RISK_LABEL[r]);
  if (risks.length) chips.push({ key: "churn_risk_level", label: `ความเสี่ยง${risks.join(", ")}` });
  const urgency = filters.credit_urgency_level as keyof typeof URGENCY_LABEL;
  if (URGENCY_LABEL[urgency]) chips.push({ key: "credit_urgency_level", label: URGENCY_LABEL[urgency] });
  if (filters.ever_paid) chips.push({ key: "ever_paid", label: filters.ever_paid === "true" ? "เคยเติมเงิน" : "ไม่เคยเติม" });
  if (/^\d+$/.test(filters.sending_months_max)) {
    chips.push({ key: "sending_months_max", label: `ส่งข้อความไม่เกิน ${filters.sending_months_max} เดือน` });
  }
  return chips;
}
