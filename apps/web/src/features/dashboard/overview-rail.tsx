"use client";
/** Right rail of the overview (docs/ui/DESIGN.md §5): headings sit outside their cards. */
import Link from "next/link";
import { type ReactNode } from "react";
import { type RunSummary, type UrgencyLevel } from "@moby/types";
import { BUTTON, EmptyState, InfoTip, StatusPill } from "@/components/ui";
import { formatBaht, formatCount, formatDaysAhead, formatPercent } from "@/lib/format";
import { RISK_LABEL, URGENCY_LABEL } from "@/lib/labels";
import { humanizeFeature } from "@/features/customers/reasoning";

const CALL_FIRST_ROWS = 5;
const URGENCY_ROWS: UrgencyLevel[] = ["critical", "warning", "monitor"];

export function RailSection({ title, info, children }: { title: string; info: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-0.5 text-section font-semibold text-text">
        {title}
        <InfoTip label={title} align="right">{info}</InfoTip>
      </h2>
      <div className="surface rounded-card">{children}</div>
    </section>
  );
}

type PriorityRow = RunSummary["top_priority"][number];

function reason(row: PriorityRow): string {
  if (row.top_factor) {
    const label = humanizeFeature(row.top_factor.feature);
    return row.top_factor.direction === "up" ? `${label} ทำให้เสี่ยงขึ้น` : label;
  }
  // No SHAP factors for this run: say when they are due to top up instead
  return `เติมครั้งถัดไป ${formatDaysAhead(row.estimated_days_until_topup)}`;
}

export function CallFirstList({
  rows,
  total,
  listHref,
  runId,
}: {
  rows: PriorityRow[];
  total: number;
  listHref: string;
  runId: string;
}) {
  return (
    <RailSection title="ต้องโทรก่อน" info="ลูกค้ามูลค่าสูงที่โอกาสเลิกใช้ระดับสูงหรือวิกฤต เรียงตามรายได้ที่เสี่ยงหาย">
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="ไม่มีลูกค้ามูลค่าสูงที่เสี่ยงสูงในรอบนี้" />
        </div>
      ) : (
        <>
          <ul>
            {rows.slice(0, CALL_FIRST_ROWS).map((row) => (
              <li key={row.acc_id} className="border-b border-rule last:border-b-0">
                <Link
                  href={`/customers/${row.acc_id}?run=${encodeURIComponent(runId)}`}
                  className="flex h-16 flex-col justify-center gap-1 px-4 transition-colors duration-150 hover:bg-raised"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="num font-semibold text-text">#{row.acc_id}</span>
                    <span className="num font-semibold text-text">{row.revenue_at_risk != null ? formatBaht(row.revenue_at_risk) : "—"}</span>
                  </span>
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-small text-muted">{reason(row)}</span>
                    {row.churn_risk_level ? (
                      <StatusPill tone={row.churn_risk_level === "critical" ? "negative" : "warning"}>
                        {row.churn_probability != null ? `${formatPercent(row.churn_probability)} · ` : ""}
                        {RISK_LABEL[row.churn_risk_level]}
                      </StatusPill>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-rule p-3">
            <Link href={listHref} className={`${BUTTON.secondary} w-full`}>
              ดูทั้งหมด {formatCount(total)} ราย
            </Link>
          </div>
        </>
      )}
    </RailSection>
  );
}

export function TopupUrgency({ credit, runId }: { credit: RunSummary["credit"]; runId: string }) {
  const counts = URGENCY_ROWS.map((level) => credit.by_urgency[level]);
  const max = Math.max(...counts, 0);
  return (
    <RailSection
      title="ใกล้ถึงรอบเติมเครดิต"
      info="จัดกลุ่มจากวันที่คาดว่าลูกค้าจะเติมเครดิตครั้งถัดไป ทำนายจากรอบการเติมเงินที่ผ่านมา นับจากวันตัดข้อมูล ไม่ใช่วันที่เครดิตหมด"
    >
      {max <= 0 ? (
        <div className="p-4">
          <EmptyState title="ไม่มีลูกค้าที่ต้องเติมเครดิตใน 90 วัน" />
        </div>
      ) : (
        <ul className="p-2">
          {URGENCY_ROWS.map((level, i) => (
            <li key={level}>
              <Link
                href={`/customers?run=${encodeURIComponent(runId)}&credit_urgency_level=${level}&sort=estimated_days_until_topup:asc`}
                className="block rounded-control px-2 py-2 transition-colors duration-150 hover:bg-raised"
              >
                <span className="flex items-baseline justify-between gap-3 text-body">
                  <span className="text-text">{URGENCY_LABEL[level]}</span>
                  <span className="num text-text">{formatCount(counts[i])} ราย</span>
                </span>
                <span aria-hidden className="mt-1.5 block h-[3px] rounded-full bg-raised">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(counts[i] / max) * 100}%`, background: i === 0 ? "var(--text)" : "var(--control)" }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </RailSection>
  );
}
