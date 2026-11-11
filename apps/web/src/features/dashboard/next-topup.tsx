"use client";
/**
 * Next top-up (DASHBOARD.md §8.4): who may buy credit soon. A sales opportunity, so blue, not
 * orange. About 1 in 4 predicted 14-day top-ups happen, so it states a chance and its hit rate.
 */
import Link from "next/link";
import { type RunSummary } from "@moby/types";
import { BUTTON, EmptyState, Panel, Provenance } from "@/components/ui";
import { formatCount, formatCountCompact, formatDate, formatPercent } from "@/lib/format";
import { type OverviewModel, type TopupRow } from "./overview-model";

// apps/ml/src/constants.py: URGENCY_CRITICAL_DAYS = 14, WARNING = 30, MONITOR = 90
const LABEL: Record<TopupRow["key"], string> = {
  d7: "ภายใน 7 วัน",
  d14: "8–14 วัน",
  d30: "15–30 วัน",
  d90: "31–90 วัน",
  later: "เกิน 90 วัน",
};

export function NextTopup({ model, credit, cutoff, runId }: { model: OverviewModel; credit: RunSummary["credit"]; cutoff: string; runId: string }) {
  const rows = model.topup;
  const total = rows.reduce((a, r) => a + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const critical = credit.by_urgency.critical;
  const hit = credit.urgent_topup_hit_rate;

  return (
    <Panel
      title={`${formatCount(critical)} รายอาจเติมเครดิตใน 14 วัน`}
      info={`โมเดลทำนายจำนวนวันถึงการเติมเครดิต (ชำระเงิน) ครั้งถัดไป จากประวัติการเติมเงินจริง นับจากวันตัดข้อมูล ${formatDate(cutoff)} ไม่ใช่วันที่เครดิตหมด${
        hit != null ? ` · ในการทดสอบย้อนหลัง ราว ${formatPercent(hit)} ของรายที่คาดว่าจะเติมใน 14 วัน เติมจริงภายใน 14 วัน` : ""
      }`}
      meta={`ลูกค้าที่ใช้งาน ${formatCount(total)} ราย · นับจาก ${formatDate(cutoff)}`}
      right={<Provenance kind="forecast" />}
      className="flex flex-col"
    >
      {total === 0 ? (
        <EmptyState title="ยังไม่มีผลทำนายการเติมเครดิตในรอบนี้" />
      ) : (
        <>
          <ul className="space-y-3.5">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[84px_1fr_44px] items-center gap-2">
                <span className="text-small text-muted">{LABEL[r.key]}</span>
                <span aria-hidden className="h-[18px]">
                  <span
                    className="block h-full rounded-r"
                    style={{ width: `${(r.count / max) * 100}%`, minWidth: r.count > 0 ? 2 : 0, background: r.urgent ? "var(--chart-1)" : "var(--chart-muted)" }}
                  />
                </span>
                <span className={`num text-right text-small text-text ${r.urgent ? "font-semibold" : ""}`}>{formatCount(r.count)}</span>
              </li>
            ))}
          </ul>
          <div className="mb-4 mt-5 grid grid-cols-2 divide-x divide-rule rounded-control border border-rule">
            <div className="p-3">
              <p className="text-micro text-muted">อาจเติมใน 7 วัน</p>
              <p className="num text-section font-semibold text-text">{formatCount(credit.topup_due_7d)} ราย</p>
            </div>
            <div className="p-3">
              <p className="text-micro text-muted">คาดใช้ใน 30 วัน</p>
              <p className="num text-section font-semibold text-text">{formatCountCompact(credit.demand_30d)} เครดิต</p>
            </div>
          </div>
          <Link
            href={`/customers?run=${encodeURIComponent(runId)}&credit_urgency_level=critical&sort=estimated_days_until_topup:asc`}
            className={`${BUTTON.secondary} mt-auto w-full`}
          >
            {/* no count: the list preset is the paid tab, the card counts Active Free too */}
            ดูรายชื่อลูกค้าที่จ่ายเงิน →
          </Link>
        </>
      )}
    </Panel>
  );
}
