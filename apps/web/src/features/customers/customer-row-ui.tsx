export function MetricCell({
  label,
  value,
  alignRight = false,
  valueColor,
}: {
  label: string;
  value: string;
  alignRight?: boolean;
  valueColor?: string;
}) {
  return (
    <div className={alignRight ? "xl:text-right" : undefined}>
      <p className="font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.12em] xl:hidden">
        {label}
      </p>
      <p
        className="num mt-0.5 font-semibold text-[14px] xl:mt-0"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export function LifecycleRowPill({ stage }: { stage: string }) {
  return (
    <span
      className="inline-flex h-[26px] w-[92px] items-center justify-center rounded-full font-semibold text-[11px] text-white"
      style={{ backgroundColor: lifecycleButtonColor(stage) }}
    >
      {stage}
    </span>
  );
}

export function lifecycleButtonColor(stage: string): string {
  if (stage === "Active Paid") {
    return "#006bff";
  }
  if (stage === "Active Free") {
    return "#ffa400";
  }
  if (stage === "Churned") {
    return "#fc4c02";
  }
  if (stage === "Ghost") {
    return "#9ca3af";
  }
  return "#9ca3af";
}

export function isHighValueTier(tier: string | null): boolean {
  return (tier ?? "").toLowerCase().includes("high");
}

export function HighValueMedal() {
  return (
    <img
      alt="High value customer"
      className="h-5 w-5 shrink-0"
      height={20}
      src="/assets/images/achievement-award-medal-icon.svg"
      width={20}
    />
  );
}

/** Grid template shared by /customers table and dashboard top-priority widget.
 *  10 columns: account, lifecycle, churn, score, CLV, revenue, revenue at risk,
 *  credit urgency, days inactive, AI. The xl table scrolls horizontally when
 *  narrower than the min width (see customers-view.tsx). */
export const CUSTOMER_ROW_GRID =
  "grid-cols-1 xl:grid-cols-[minmax(150px,1.1fr)_minmax(170px,1.2fr)_90px_80px_120px_120px_130px_120px_100px_90px]";

export const TOP_PRIORITY_ROW_GRID =
  "grid-cols-1 xl:grid-cols-[minmax(180px,1.1fr)_minmax(220px,1.4fr)_120px_110px_150px]";

export const CUSTOMER_ROW_HEADER_GRID =
  "grid-cols-[minmax(150px,1.1fr)_minmax(170px,1.2fr)_90px_80px_120px_120px_130px_120px_100px_90px]";

export const TOP_PRIORITY_ROW_HEADER_GRID =
  "grid-cols-[minmax(180px,1.1fr)_minmax(220px,1.4fr)_120px_110px_150px]";
