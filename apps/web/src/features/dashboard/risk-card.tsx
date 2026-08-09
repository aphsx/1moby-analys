import { formatNumber } from "@/lib/format";
import { CHURN_PALETTE, TEXT_SAFE } from "./palette";
import type { DashboardOverview } from "./types";

export function RiskCard({ overview }: { overview: DashboardOverview }) {
  const churnData = [
    ["High", overview.active_churn.high],
    ["Medium", overview.active_churn.medium],
    ["Low", overview.active_churn.low],
  ] as const;
  const highPct =
    (overview.active_churn.high / overview.active_churn.base_customers) * 100;

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <div className="flex-1 p-4 sm:p-5">
        <div className="mb-4 flex h-[76px] flex-col justify-center rounded-2xl border border-gray-100 bg-white p-4 shadow-[inset_0_1px_4px_rgba(0,0,0,0.04)]">
          <div
            className={`font-normal text-[11px] text-[color:var(--danger)] ${TEXT_SAFE}`}
          >
            High-risk active
          </div>
          <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
            <div className="num text-[24px] text-[color:var(--danger)] tabular-nums leading-none">
              {formatNumber(overview.active_churn.high)}
            </div>
            <div className="type-meta num pb-0.5 text-right font-normal text-[11px]">
              {highPct.toFixed(1)}% จากลูกค้าทั้งหมดที่ใช้งาน
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {churnData.map(([label, value]) => (
            <div
              className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4"
              key={label}
            >
              <RiskListRow
                color={CHURN_PALETTE[label as keyof typeof CHURN_PALETTE]}
                label={label}
                total={overview.active_churn.base_customers}
                totalLabel="active"
                value={value}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RiskListRow({
  label,
  value,
  total,
  totalLabel,
  hint,
  color,
}: {
  label: string;
  value: number;
  total?: number;
  totalLabel?: string;
  hint?: string;
  color: string;
}) {
  const pct = total && total > 0 ? (value / total) * 100 : null;

  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className="h-4 w-4 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(0,0,0,0.04)]"
          style={{ background: color }}
        />
        <div className="min-w-0">
          <div className="truncate font-medium text-[12px] text-[color:var(--ink-2)] leading-tight">
            {label}
          </div>
          <div
            className={`type-meta num mt-1 font-normal text-[11px] ${TEXT_SAFE}`}
          >
            {pct === null
              ? hint
              : `${pct.toFixed(1)}% of ${totalLabel ?? "total"}`}
          </div>
        </div>
      </div>
      <div className="num text-[22px] text-[color:var(--ink-1)] tabular-nums">
        {formatNumber(value)}
      </div>
    </div>
  );
}
