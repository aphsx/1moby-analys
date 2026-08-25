import { formatCurrency } from "@/lib/format";
import {
  BRAND_BLUE_GRADIENT,
  BRAND_ORANGE_GRADIENT,
  BRAND_YELLOW_GRADIENT,
  TEXT_SAFE,
} from "./palette";
import { RiskListRow } from "./risk-card";
import type { DashboardOverview } from "./types";

export function ValueCard({ overview }: { overview: DashboardOverview }) {
  const valueData = [
    [
      "High value at risk",
      overview.value.high_value_at_risk,
      "High CLV + high churn risk",
      BRAND_ORANGE_GRADIENT,
    ],
    ["High value", overview.value.high_value, "accounts", BRAND_BLUE_GRADIENT],
    ["Mid value", overview.value.mid_value, "accounts", BRAND_YELLOW_GRADIENT],
    ["Low value", overview.value.low_value, "accounts", "#9ca3af"],
  ] as const;

  return (
    <div className="surface-elev flex h-full flex-col overflow-hidden">
      <div className="flex-1 p-4 sm:p-5">
        <div className="mb-4 flex h-[76px] flex-col justify-center rounded-2xl border border-gray-100 bg-white p-4 shadow-[inset_0_1px_4px_rgba(0,0,0,0.04)]">
          <div
            className={`font-normal text-[11px] text-[color:var(--moby-600)] ${TEXT_SAFE}`}
          >
            Predicted CLV
          </div>
          <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
            <div
              className={`num text-[24px] text-[color:var(--ink-1)] tabular-nums leading-none ${TEXT_SAFE}`}
            >
              {formatCurrency(overview.value.predicted_clv_6m)}
            </div>
            <div className="type-meta pb-0.5 text-right font-normal text-[11px]">
              6-month forecast
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {valueData.map(([label, value, hint, color]) => (
            <div
              className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4"
              key={label}
            >
              <RiskListRow
                color={color}
                hint={hint}
                label={label}
                value={value}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
