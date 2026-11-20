"use client";
/**
 * Value × risk heat grid (DASHBOARD.md §8.1): rows are Value Tiers (incl. `none`, predicted ฿0),
 * columns are Churn Risk Levels. Each cell prints its count and ฿ at risk; fill = binned ฿ at risk.
 * Selecting a cell shows its Playbook action and a link to the filtered list.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { type RiskLevel, type RunSummary, type ValueTier } from "@moby/types";
import { BUTTON, EmptyState, Panel, Provenance, Swatch } from "@/components/ui";
import { formatBahtCompact, formatCount, formatPercent } from "@/lib/format";
import { CELL_ACTION, RISK_LABEL, VALUE_TIER_LABEL, riskRange } from "@/lib/labels";
import { MAP_RISKS, MAP_TIERS, type OverviewModel } from "./overview-model";

const TIER_LABEL: Record<ValueTier, string> = { ...VALUE_TIER_LABEL, none: "คาดว่าไม่จ่าย" };
const TIER_SUB: Record<ValueTier, string> = { high: "10% แรก", mid: "10–50%", low: "ครึ่งล่าง", none: "มูลค่า 6 เดือน ฿0" };
/** One label per heat bin; keep in step with HEAT_BREAKS in overview-model.ts. */
const LEGEND = ["ต่ำกว่า ฿0.5M", "฿0.5–1M", "฿1–2M", "฿2–5M", "เกิน ฿5M"];

export function RiskMap({
  model,
  thresholds,
  runId,
}: {
  model: OverviewModel;
  thresholds: RunSummary["churn"]["thresholds"];
  runId: string;
}) {
  const [selected, setSelected] = useState(model.defaultCell);
  // a new run starts on its own largest cell
  useEffect(() => setSelected(model.defaultCell), [runId, model.defaultCell.tier, model.defaultCell.risk]);
  const ranges = riskRange(thresholds);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const cell = model.cells.find((c) => c.tier === selected.tier && c.risk === selected.risk)!;
  const href = (tier: ValueTier, risk: RiskLevel) =>
    `/customers?run=${encodeURIComponent(runId)}&customer_value_tier=${tier}&churn_risk_level=${risk}&sort=revenue_at_risk:desc`;

  return (
    <Panel
      title={`${formatPercent(model.highTier.share)} ของรายได้เสี่ยงหาย อยู่ในลูกค้ามูลค่าสูง ${formatCount(model.highTier.count)} ราย`}
      info={`ตัวเลขใหญ่ = จำนวนลูกค้า · สีเข้มขึ้น = รายได้ที่เสี่ยงหายในช่องนั้นมากขึ้น · โอกาสเลิกใช้แบ่งด้วยเกณฑ์ ${pct(thresholds.medium)}, ${pct(thresholds.high)}, ${pct(thresholds.critical)} · มูลค่า 6 เดือน: 10% แรก = สูง, 10–50% = กลาง, ที่เหลือ = ต่ำ (จัดอันดับเฉพาะรายที่คาดว่าจะจ่ายมากกว่า ฿0) · คาดว่าไม่จ่าย = โมเดลคาดว่าจะจ่าย ฿0 ใน 6 เดือน · ไม่รวม ${formatCount(model.unscored)} รายที่ใช้งานไม่ถึง 90 วัน`}
      meta={`ลูกค้า ${formatCount(model.scored)} รายที่ประเมินได้ · กดช่องเพื่อดูแนวทาง`}
      right={<Provenance kind="forecast" />}
    >
      {model.atRisk <= 0 ? (
        <EmptyState title="ยังไม่มีรายได้ที่เสี่ยงหายในรอบนี้" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="grid min-w-[520px] grid-cols-[112px_repeat(4,minmax(0,1fr))] gap-[3px]">
              <div className="self-end pb-1 text-micro text-muted">มูลค่า ↓ · โอกาส →</div>
              {MAP_RISKS.map((risk) => (
                <div key={risk} className="pb-1">
                  <p className="text-small font-medium text-text">{RISK_LABEL[risk]}</p>
                  <p className="num text-micro text-muted">{ranges[risk]}</p>
                </div>
              ))}
              {MAP_TIERS.map((tier) => (
                <Row key={tier} tier={tier} model={model} selected={selected} onSelect={setSelected} />
              ))}
              <div className="pt-1 text-small text-muted">รวม</div>
              {MAP_RISKS.map((risk) => (
                <div key={risk} className="num pt-1 text-small text-muted">
                  <p>{formatCount(model.colTotals[risk].count)} ราย</p>
                  <p>{formatBahtCompact(model.colTotals[risk].revenueAtRisk)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted">
            <span>รายได้ที่เสี่ยงหายต่อช่อง</span>
            {LEGEND.map((l, i) => (
              <Swatch key={l} color={`var(--heat-${i})`}>{l}</Swatch>
            ))}
          </div>

          <div aria-live="polite" className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-control bg-raised p-4">
            <div className="min-w-0 flex-[1_1_260px]">
              <p className="text-micro text-muted">ช่องที่เลือก</p>
              <p className="text-[15px] font-semibold text-text">
                {TIER_LABEL[cell.tier]} × โอกาสเลิกใช้{RISK_LABEL[cell.risk]}
              </p>
              <p className="num mt-0.5 text-small text-muted">
                {formatCount(cell.count)} ราย · รายได้เสี่ยงหาย {formatBahtCompact(cell.revenueAtRisk)} (
                {formatPercent(model.atRisk > 0 ? cell.revenueAtRisk / model.atRisk : 0)} ของ {formatBahtCompact(model.atRisk)})
              </p>
              <p className="mt-1 text-body text-text">แนวทาง: {CELL_ACTION[cell.tier][cell.risk]}</p>
            </div>
            {cell.count > 0 ? (
              <Link href={href(cell.tier, cell.risk)} className={BUTTON.primary}>
                ดูรายชื่อ {formatCount(cell.count)} ราย →
              </Link>
            ) : (
              <span className={`${BUTTON.secondary} pointer-events-none opacity-60`} aria-disabled>
                ดูรายชื่อ 0 ราย
              </span>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function Row({
  tier,
  model,
  selected,
  onSelect,
}: {
  tier: ValueTier;
  model: OverviewModel;
  selected: { tier: ValueTier; risk: RiskLevel };
  onSelect: (c: { tier: ValueTier; risk: RiskLevel }) => void;
}) {
  return (
    <>
      <div className="self-center pr-2">
        <p className="text-small font-medium text-text">{TIER_LABEL[tier]}</p>
        <p className="text-micro text-muted">{TIER_SUB[tier]}</p>
      </div>
      {model.cells
        .filter((c) => c.tier === tier)
        .map((c) => {
          const isSelected = c.tier === selected.tier && c.risk === selected.risk;
          return (
            <button
              key={c.risk}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${TIER_LABEL[c.tier]} × โอกาสเลิกใช้${RISK_LABEL[c.risk]}: ${formatCount(c.count)} ราย รายได้เสี่ยงหาย ${formatBahtCompact(c.revenueAtRisk)}`}
              onClick={() => onSelect({ tier: c.tier, risk: c.risk })}
              className={`min-h-[76px] rounded-[6px] px-3 py-2.5 text-left transition-opacity duration-150 hover:opacity-90 ${
                isSelected ? "outline outline-2 outline-offset-2 outline-[var(--text)]" : ""
              }`}
              style={{ background: `var(--heat-${c.bin})`, color: `var(--heat-ink-${c.bin})` }}
            >
              <span className="num block text-[20px] font-semibold leading-tight">{formatCount(c.count)}</span>
              <span className="num block text-micro">{formatBahtCompact(c.revenueAtRisk)}</span>
            </button>
          );
        })}
    </>
  );
}

