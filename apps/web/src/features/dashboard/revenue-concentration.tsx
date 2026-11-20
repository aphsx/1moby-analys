"use client";
/**
 * Revenue concentration (DASHBOARD.md §7.2): share of payers vs share of revenue, tier by tier.
 * The legend list is the table view, so the bars need no tooltip.
 */
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { type RunSummary } from "@moby/types";
import { EmptyState, Panel, Provenance } from "@/components/ui";
import { formatBahtCompact, formatCount, formatPercent } from "@/lib/format";

type Concentration = NonNullable<RunSummary["revenue_concentration"]>;
type Tier = Concentration["tiers"][number];

const INK_THRESHOLD = 0.12;

function name(t: Tier): { title: string; sub: string } {
  if (t.key === "top1") return { title: `${formatCount(t.payers)} รายแรก`, sub: "1% ของผู้จ่ายเงิน" };
  if (t.key === "rest") return { title: `อีก ${formatCount(t.payers)} ราย`, sub: "90% ของผู้จ่ายเงิน" };
  const pct = t.key === "top5" ? "4%" : "5%";
  return { title: `อันดับ ${formatCount(t.from_rank)}–${formatCount(t.to_rank)}`, sub: `อีก ${pct} · ${formatCount(t.payers)} ราย` };
}

export function RevenueConcentration({ data, yearLabel }: { data: RunSummary["revenue_concentration"]; yearLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data) {
    return (
      <Panel title="รายได้กระจุกตัวแค่ไหน" right={<Provenance kind="fact" />}>
        <EmptyState title="ยังไม่มีการชำระเงินในช่วงนี้" />
      </Panel>
    );
  }
  const top1Share = data.revenue > 0 ? data.tiers[0].revenue / data.revenue : 0;
  const shareText = top1Share >= 0.45 && top1Share <= 0.55 ? "ครึ่งหนึ่ง" : formatPercent(top1Share);
  const k = data.bottom_k_below_top1_avg;
  const kText = k >= 100 ? Math.floor(k / 100) * 100 : k;

  const bar = (label: string, total: string, value: (t: Tier) => number, whole: number, digits: number) => (
    <div>
      <p className="mb-1.5 flex justify-between text-small text-muted">
        <span>{label}</span>
        <span className="num text-text">{total}</span>
      </p>
      <div role="img" aria-label={`${label}: ${data.tiers.map((t) => `${name(t).title} ${formatPercent(whole > 0 ? value(t) / whole : 0, 1)}`).join(", ")}`} className="flex h-7 gap-0.5">
        {data.tiers.map((t, i) => {
          const share = whole > 0 ? value(t) / whole : 0;
          return share > 0 ? (
            <span
              key={t.key}
              className="flex min-w-[3px] items-center justify-center overflow-hidden rounded text-micro font-semibold transition-opacity duration-150"
              style={{ flexGrow: share, background: `var(--tier-${i + 1})`, color: `var(--tier-ink-${i + 1})`, opacity: hover == null || hover === i ? 1 : 0.3 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {share >= INK_THRESHOLD ? formatPercent(share, digits) : null}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );

  return (
    <Panel
      title={`1% ของผู้จ่ายเงิน ทำรายได้${shareText}`}
      info="รวมยอดชำระต่อบัญชีใน 12 เดือนก่อนวันตัดข้อมูล แล้วเรียงจากมากไปน้อย แบ่งเป็น 1% แรก, 1–5%, 5–10% และที่เหลือ แถบบนคือสัดส่วนจำนวนคน แถบล่างคือสัดส่วนรายได้ของกลุ่มเดียวกัน"
      meta={`ผู้จ่ายเงินปี ${yearLabel} จำนวน ${formatCount(data.payers)} ราย · ชี้กลุ่มเพื่อเทียบ`}
      right={<Provenance kind="fact" />}
      className="flex flex-col"
    >
      <div className="space-y-4">
        {bar("สัดส่วนผู้จ่ายเงิน", `${formatCount(data.payers)} ราย`, (t) => t.payers, data.payers, 0)}
        {bar("สัดส่วนรายได้", formatBahtCompact(data.revenue), (t) => t.revenue, data.revenue, 1)}
      </div>
      <ul className="mb-4 mt-4">
        {data.tiers.map((t, i) => (
          <li
            key={t.key}
            tabIndex={0}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className={`grid grid-cols-[10px_minmax(0,1fr)_auto_52px] items-center gap-x-3 rounded-control px-2 py-1.5 ${hover === i ? "bg-raised" : ""}`}
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `var(--tier-${i + 1})` }} />
            <span className="min-w-0">
              <span className="block truncate text-small text-text">{name(t).title}</span>
              <span className="block truncate text-micro text-muted">{name(t).sub}</span>
            </span>
            <span className="num text-small text-text">{formatBahtCompact(t.revenue)}</span>
            <span className="num text-right text-small font-semibold text-text">
              {formatPercent(data.revenue > 0 ? t.revenue / data.revenue : 0, 1)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto flex gap-2 rounded-control p-3 pt-3 text-small" style={{ background: "var(--pill-negative-bg)", color: "var(--pill-negative-ink)" }}>
        <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          เสีย 1 รายใน {formatCount(data.tiers[0].payers)} รายแรก = รายได้หายเฉลี่ย {formatBahtCompact(data.avg_top1)} ต่อปี
          {kText > 0 ? ` มากกว่ารายได้ทั้งปีของผู้จ่ายเงิน ${formatCount(kText)} รายล่างรวมกัน` : ""}
        </span>
      </p>
    </Panel>
  );
}
