"use client";
/**
 * Top 5 of the Call List (DASHBOARD.md §8.3): exactly who to call first. Every scored Active Paid
 * customer, largest revenue at risk first; the inline meter is ฿ at risk relative to row 1.
 */
import Link from "next/link";
import { type RunSummary } from "@moby/types";
import { BUTTON, EmptyState, Panel, Provenance, StatusPill, type PillTone } from "@/components/ui";
import { formatBaht, formatBahtCompact, formatDaysAhead, formatPercent } from "@/lib/format";
import { RISK_LABEL, valueTierLabel } from "@/lib/labels";
import { humanizeFeature } from "@/features/customers/reasoning";

const ROWS = 5;
const URGENT_DAYS = 14;
const COLS = "grid grid-cols-[20px_minmax(150px,1fr)_112px_92px_136px_84px] items-center gap-x-3";

type Row = RunSummary["top_priority"][number];

/** The model's main reason when it gives one; the TabICL champion gives none (DASHBOARD.md D6). */
function reason(row: Row): string {
  if (row.top_factor) {
    const label = humanizeFeature(row.top_factor.feature);
    return row.top_factor.direction === "up" ? `${label} ทำให้เสี่ยงขึ้น` : label;
  }
  const tier = row.customer_value_tier ? valueTierLabel(row.customer_value_tier, row.lifecycle_stage) : "";
  return row.predicted_clv_6m != null ? `${tier} · คาดจ่าย 6 เดือน ${formatBahtCompact(row.predicted_clv_6m)}` : tier;
}

const tone = (r: Row["churn_risk_level"]): PillTone => (r === "critical" ? "negative" : r === "high" ? "warning" : "neutral");

export function TopRiskTable({ rows, runId }: { rows: Row[]; runId: string }) {
  const top = rows.slice(0, ROWS);
  const first = top[0]?.revenue_at_risk ?? 0;
  const showDots = top.some((r) => r.sending_month_flags.length > 0);
  const listHref = `/customers?run=${encodeURIComponent(runId)}`;

  return (
    <Panel
      title="5 รายที่รายได้เสี่ยงหายมากที่สุด"
      info="รายได้ที่เสี่ยงหาย = โอกาสเลิกใช้ × มูลค่าที่คาดว่าจะจ่ายใน 6 เดือน เรียงจากลูกค้าที่จ่ายเงินทุกระดับ · บรรทัดใต้เลขบัญชีคือเหตุผลหลักจากโมเดลเมื่อมี ถ้าไม่มีจะแสดงระดับมูลค่าและยอดที่คาดว่าจะจ่าย"
      meta="ลูกค้าที่จ่ายเงินทุกระดับ · เรียงตามรายได้เสี่ยงหาย · กดแถวเพื่อเปิดหน้าลูกค้า"
      right={
        <>
          <Provenance kind="forecast" />
          {top.length ? (
            <Link href={listHref} className={BUTTON.secondary}>
              ดูทั้งหมด ›
            </Link>
          ) : null}
        </>
      }
    >
      {top.length === 0 ? (
        <EmptyState title="ยังไม่มีลูกค้าที่มีคะแนนความเสี่ยงในรอบนี้" />
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <div className="min-w-[660px] px-2">
            <div className={`${COLS} border-b border-border pb-2 text-micro text-muted`}>
              <span>#</span>
              <span className="sticky left-0 bg-surface">บัญชี</span>
              <span>โอกาสเลิกใช้</span>
              <span>{showDots ? `ส่งข้อความ ${top[0].sending_month_flags.length} ด.` : ""}</span>
              <span className="text-right">รายได้เสี่ยงหาย</span>
              <span className="text-right">เติมครั้งถัดไป</span>
            </div>
            {top.map((row, i) => {
              const sent = row.sending_month_flags.filter(Boolean).length;
              const days = row.estimated_days_until_topup;
              return (
                <Link
                  key={row.acc_id}
                  href={`/customers/${row.acc_id}?run=${encodeURIComponent(runId)}`}
                  className={`${COLS} group min-h-16 border-b border-rule py-2 transition-colors duration-150 last:border-b-0 hover:bg-raised`}
                >
                  <span className="num text-small text-muted">{i + 1}</span>
                  <span className="sticky left-0 min-w-0 bg-surface transition-colors duration-150 group-hover:bg-raised">
                    <span className="num block text-[15px] font-semibold text-text">#{row.acc_id}</span>
                    <span className="block truncate text-small text-muted">{reason(row)}</span>
                  </span>
                  <span>
                    {row.churn_risk_level ? (
                      <StatusPill tone={tone(row.churn_risk_level)}>
                        {row.churn_probability != null ? `${formatPercent(row.churn_probability)} · ` : ""}
                        {RISK_LABEL[row.churn_risk_level]}
                      </StatusPill>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {showDots ? (
                      <>
                        <span className="flex gap-0.5" aria-label={`ส่งข้อความ ${sent} จาก ${row.sending_month_flags.length} เดือน`}>
                          {row.sending_month_flags.map((on, j) => (
                            <span
                              key={j}
                              className="h-2.5 w-2.5 rounded-[2px]"
                              style={on ? { background: "var(--chart-1)" } : { boxShadow: "inset 0 0 0 1px var(--control)" }}
                            />
                          ))}
                        </span>
                        <span className="num text-micro" style={{ color: sent <= 2 ? "var(--pill-negative-ink)" : "var(--muted)" }}>
                          {sent}/{row.sending_month_flags.length}
                        </span>
                      </>
                    ) : null}
                  </span>
                  <span className="text-right">
                    <span className="num block text-[15px] font-medium text-text">
                      {row.revenue_at_risk != null ? formatBaht(row.revenue_at_risk) : "—"}
                    </span>
                    <span aria-hidden className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: "var(--risk-emph-track)" }}>
                      <span
                        className="ml-auto block h-full rounded-full"
                        style={{ width: `${first > 0 ? ((row.revenue_at_risk ?? 0) / first) * 100 : 0}%`, background: "var(--risk-emph)" }}
                      />
                    </span>
                  </span>
                  <span
                    className={`num text-right text-small ${days != null && days <= URGENT_DAYS ? "font-semibold" : "text-muted"}`}
                    style={days != null && days <= URGENT_DAYS ? { color: "var(--pill-negative-ink)" } : undefined}
                  >
                    {formatDaysAhead(days)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}
