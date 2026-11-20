"use client";
/** Customer base (DASHBOARD.md §7.3): how much of the account base is actually alive. */
import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { type LifecycleStage } from "@moby/types";
import { Panel, Provenance } from "@/components/ui";
import { formatCount, formatDate, formatMonth, formatPercent } from "@/lib/format";
import { LIFECYCLE_HELP, LIFECYCLE_LABEL } from "@/lib/labels";
import { type OverviewModel } from "./overview-model";

const FILL: Record<LifecycleStage, string> = {
  "Active Paid": "var(--base-paid)",
  "Active Free": "var(--base-free)",
  Churned: "var(--base-churned)",
  Ghost: "var(--base-ghost)",
};
const TAB: Record<LifecycleStage, string> = { "Active Paid": "", "Active Free": "free", Churned: "churned", Ghost: "ghost" };

export function CustomerBase({
  model,
  runId,
  cutoff,
  dataStart,
  churnedEverPaid,
}: {
  model: OverviewModel;
  runId: string;
  cutoff: string;
  dataStart: string | null;
  churnedEverPaid: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const run = `run=${encodeURIComponent(runId)}`;
  return (
    <Panel
      title={`ใช้งานอยู่ ${formatCount(model.active)} จาก ${formatCount(model.totalCustomers)} บัญชี`}
      info={`สถานะตามกฎตายตัว ไม่ได้มาจากการทำนาย${dataStart ? ` ข้อมูลกิจกรรมเริ่ม ${formatMonth(dataStart, true)}` : ""} · “ไม่ได้เติมเงิน” = ไม่มีการชำระในช่วงข้อมูล อาจเคยเติมก่อนหน้านั้นแล้วใช้เครดิตเดิม`}
      meta={`สถานะ ณ ${formatDate(cutoff)} · กดกลุ่มเพื่อเปิดรายชื่อในหน้าลูกค้า`}
      right={<Provenance kind="fact" />}
    >
      <div
        role="img"
        aria-label={model.base.map((b) => `${LIFECYCLE_LABEL[b.key]} ${formatCount(b.count)} ราย ${formatPercent(b.share, 1)}`).join(", ")}
        className="flex h-2.5 gap-0.5"
      >
        {model.base.map((b, i) =>
          b.count > 0 ? (
            <span
              key={b.key}
              className="min-w-[4px] rounded-full transition-opacity duration-150"
              style={{ flexGrow: b.share, background: FILL[b.key], opacity: hover == null || hover === i ? 1 : 0.3 }}
            />
          ) : null
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {model.base.map((b, i) => (
          <Link
            key={b.key}
            href={`/customers?${run}${TAB[b.key] ? `&tab=${TAB[b.key]}` : ""}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className={`min-w-0 flex-1 basis-[200px] rounded-card border p-3 transition-colors duration-150 ${hover === i ? "border-control" : "border-border"}`}
          >
            <span className="flex items-center gap-1.5 text-small text-text">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_var(--border)]" style={{ background: FILL[b.key] }} />
              {LIFECYCLE_LABEL[b.key]}
              <ChevronRight size={14} aria-hidden className="ml-auto text-faint" />
            </span>
            <span className="num mt-1 block text-kpi font-semibold text-text">{formatCount(b.count)}</span>
            <span className="num block text-small text-muted">{formatPercent(b.share, 1)}</span>
            <span className="mt-1 block text-small text-muted">
              {LIFECYCLE_HELP[b.key]}
              {b.key === "Churned" && churnedEverPaid > 0 ? ` · ในนี้เคยเติมเงิน ${formatCount(churnedEverPaid)} ราย` : ""}
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
