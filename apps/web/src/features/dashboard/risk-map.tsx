"use client";
/**
 * The overview's main block (docs/ui/DESIGN.md §7, RiskMap): rows are value tiers, columns are
 * risk levels, and each square's AREA is proportional to revenue at risk (side ∝ √value). Every
 * cell opens the customer list filtered to that cell.
 */
import Link from "next/link";
import { type RunSummary } from "@moby/types";
import { EmptyState, Panel } from "@/components/ui";
import { formatBahtCompact, formatCount } from "@/lib/format";
import { RISK_LABEL, VALUE_TIER_LABEL, riskRange } from "@/lib/labels";
import { MAP_RISKS, MAP_TIERS, type OverviewModel } from "./overview-model";

export function RiskMap({
  model,
  thresholds,
  runId,
}: {
  model: OverviewModel;
  thresholds: RunSummary["churn"]["thresholds"];
  runId: string;
}) {
  const ranges = riskRange(thresholds);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const max = Math.max(...model.cells.map((c) => c.revenueAtRisk), 0);

  return (
    <Panel
      title="รายได้ที่เสี่ยงหายอยู่ที่ไหน"
      info={`แถวคือกลุ่มมูลค่า (จากมูลค่า 6 เดือนของรอบนี้) คอลัมน์คือระดับโอกาสเลิกใช้ตามเกณฑ์ใน model card (${pct(thresholds.medium)}, ${pct(thresholds.high)}, ${pct(thresholds.critical)}) ขนาดคือรายได้ที่เสี่ยงหาย`}
      meta="ขนาดสี่เหลี่ยมคือรายได้ที่เสี่ยงหาย · กดช่องเพื่อเปิดรายชื่อ"
    >
      {max <= 0 ? (
        <EmptyState title="ยังไม่มีรายได้ที่เสี่ยงหายในรอบนี้" />
      ) : (
        <>
          {/* --map-max is the side of the largest square: 4 columns must fit 390px phones */}
          <div
            className="grid grid-cols-[64px_repeat(4,minmax(0,1fr))] gap-x-2 gap-y-4 [--map-max:56px] min-[860px]:grid-cols-[112px_repeat(4,minmax(0,1fr))] min-[860px]:gap-x-4 min-[860px]:[--map-max:112px]"
          >
            <div />
            {MAP_RISKS.map((risk) => (
              <div key={risk} className="text-micro text-muted">
                <span className="text-text">{RISK_LABEL[risk]}</span>
                <span className="num block whitespace-nowrap">{ranges[risk]}</span>
              </div>
            ))}
            {MAP_TIERS.map((tier) => (
              <Row key={tier} tier={tier} model={model} max={max} runId={runId} />
            ))}
          </div>
          <p className="mt-5 border-t border-rule pt-3 text-small text-muted">
            รวม <span className="num font-semibold text-text">{formatBahtCompact(model.atRisk)}</span> จากลูกค้า{" "}
            <span className="num">{formatCount(model.scored)}</span> รายที่มีคะแนน
            {model.unscored > 0 ? (
              <>
                {" "}· อีก <span className="num">{formatCount(model.unscored)}</span> รายใช้งานไม่ถึง 90 วัน ยังไม่มีคะแนน
              </>
            ) : null}
          </p>
        </>
      )}
    </Panel>
  );
}

function Row({ tier, model, max, runId }: { tier: (typeof MAP_TIERS)[number]; model: OverviewModel; max: number; runId: string }) {
  const cells = model.cells.filter((c) => c.tier === tier);
  const count = cells.reduce((a, c) => a + c.count, 0);
  return (
    <>
      <div className="self-end pb-1">
        <p className="text-small font-medium text-text">{VALUE_TIER_LABEL[tier]}</p>
        <p className="num text-micro text-muted">{formatCount(count)} ราย</p>
      </div>
      {cells.map((c) => {
        const side = Math.sqrt(c.revenueAtRisk / max);
        const href = `/customers?run=${encodeURIComponent(runId)}&customer_value_tier=${c.tier}&churn_risk_level=${c.risk}&sort=revenue_at_risk:desc`;
        return (
          <Link
            key={c.risk}
            href={href}
            aria-label={`${VALUE_TIER_LABEL[c.tier]} ความเสี่ยง${RISK_LABEL[c.risk]}: ${formatCount(c.count)} ราย รายได้ที่เสี่ยงหาย ${formatBahtCompact(c.revenueAtRisk)}`}
            className="group flex min-w-0 flex-col justify-end gap-1 rounded-control"
          >
            {c.revenueAtRisk > 0 ? (
              <span
                aria-hidden
                className="block rounded-[2px] transition-opacity duration-150 group-hover:opacity-80"
                style={{
                  width: `calc(var(--map-max) * ${side})`,
                  height: `calc(var(--map-max) * ${side})`,
                  minWidth: 4,
                  minHeight: 4,
                  background: `var(--risk-${c.risk})`,
                }}
              />
            ) : null}
            <span className="num truncate text-micro text-text group-hover:underline">
              {c.revenueAtRisk > 0 ? formatBahtCompact(c.revenueAtRisk) : "—"}
            </span>
            <span className="num truncate text-micro text-muted">{formatCount(c.count)} ราย</span>
          </Link>
        );
      })}
    </>
  );
}
