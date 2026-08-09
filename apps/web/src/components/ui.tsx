"use client";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";

/* ────────────────────────────────────────── */
/*  PageHeader (in-page sub header)          */
/* ────────────────────────────────────────── */
export function PageHeader({
  title,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 px-8 pt-6 pb-2">
      <div>
        <h2 className="type-display text-[24px] leading-tight">{title}</h2>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  SectionCard                              */
/* ────────────────────────────────────────── */
export function SectionCard({
  title,
  hint,
  eyebrow,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  hint?: ReactNode;
  eyebrow?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-elev overflow-hidden ${className}`}>
      {(title || right || eyebrow) && (
        <header className="border-gray-100 border-b px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              {eyebrow ? <p className="type-label">{eyebrow}</p> : null}
              {title ? (
                <h2 className="type-section-title mt-1 text-[20px]">{title}</h2>
              ) : null}
              {hint ? (
                <p className="mt-1 max-w-2xl text-[13px] text-[color:var(--ink-4)] leading-6">
                  {hint}
                </p>
              ) : null}
            </div>
            {right ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {right}
              </div>
            ) : null}
          </div>
        </header>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

/* ────────────────────────────────────────── */
/*  KpiCard                                  */
/* ────────────────────────────────────────── */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  deltaLabel,
  accent = "blue",
  spark,
  format = "number",
  currency,
}: {
  label: string;
  value: number | string;
  hint?: string;
  delta?: number; // positive = up
  deltaLabel?: string;
  accent?: "blue" | "violet" | "amber" | "rose" | "emerald" | "slate";
  spark?: number[];
  format?: "number" | "currency" | "percent" | "raw";
  currency?: string;
}) {
  const accentColor = ACCENTS[accent];
  const formatted =
    typeof value === "string"
      ? value
      : format === "currency"
        ? `${(value as number).toLocaleString()} ${currency || "฿"}`
        : format === "percent"
          ? `${(value as number).toFixed(1)}%`
          : (value as number).toLocaleString();

  return (
    <div className="surface lift relative overflow-hidden p-5">
      <div
        className="absolute top-0 bottom-0 left-0 w-1"
        style={{ background: accentColor }}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="type-label">{label}</div>
          <div className="num mt-1.5 text-[28px] text-[color:var(--ink-1)]">
            {formatted}
          </div>
          {hint && <div className="type-meta mt-0.5 text-[12px]">{hint}</div>}
        </div>
        {delta !== undefined && <DeltaPill label={deltaLabel} value={delta} />}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline color={accentColor} values={spark} />
        </div>
      )}
    </div>
  );
}

const ACCENTS = {
  amber: "#d97706",
  blue: "var(--moby-600)",
  emerald: "var(--moby-600)",
  rose: "#e11d48",
  slate: "#64748b",
  violet: "#7c3aed",
};

/* ────────────────────────────────────────── */
/*  DeltaPill                                */
/* ────────────────────────────────────────── */
export function DeltaPill({ value, label }: { value: number; label?: string }) {
  const up = value > 0,
    flat = value === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat
    ? "text-[color:var(--ink-4)] bg-gray-50"
    : up
      ? "text-[color:var(--ok)] bg-[color:var(--ok-bg)]"
      : "text-[color:var(--danger)] bg-[color:var(--danger-bg)]";
  return (
    <span className={`pill ${color}`}>
      <Icon size={11} />
      <span className="num">
        {flat ? "0%" : `${up ? "+" : ""}${value.toFixed(1)}%`}
      </span>
      {label && <span className="opacity-70">{label}</span>}
    </span>
  );
}

/* ────────────────────────────────────────── */
/*  StatusPill — solid fill, matches /customers lifecycle badges */
/* ────────────────────────────────────────── */
const PILL_TONES: Record<string, string> = {
  brand: "#006bff",
  danger: "#fc4c02",
  info: "#1893f0",
  neutral: "#9ca3af",
  ok: "#006bff",
  orange: "#fc4c02",
  violet: "#7c3aed",
  warm: "#ffa400",
  warn: "#ffa400",
};

export function StatusPill({
  tone = "neutral",
  icon: Icon,
  children,
  loading = false,
}: {
  tone?: keyof typeof PILL_TONES;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  children: ReactNode;
  /** @deprecated dots removed — kept for call-site compat */
  dot?: boolean;
  loading?: boolean;
}) {
  const bg = PILL_TONES[tone] ?? PILL_TONES.neutral;
  return (
    <span
      className="inline-flex h-[26px] items-center justify-center gap-1 rounded-full px-2.5 font-semibold text-[11px] text-white"
      style={{ backgroundColor: bg }}
    >
      {loading ? (
        <RefreshCw className="animate-spin" size={11} />
      ) : Icon ? (
        <Icon size={11} />
      ) : null}
      {children}
    </span>
  );
}

/* ────────────────────────────────────────── */
/*  Lifecycle / churn / urgency mappers     */
/* ────────────────────────────────────────── */
/* Tone mapping follows the dashboard brand palettes (palette.ts):
   Paid/Low/Stable = blue, Free/Medium/Warning = #FFA400, Churned/High/Critical = #FC4C02 */
export const lifecycleTone = (s: string): keyof typeof PILL_TONES =>
  s === "Active Paid"
    ? "brand"
    : s === "Active Free"
      ? "warm"
      : s === "Churned"
        ? "orange"
        : s === "Ghost"
          ? "neutral"
          : "neutral";

export const churnTone = (t: string): keyof typeof PILL_TONES =>
  t === "High"
    ? "orange"
    : t === "Medium"
      ? "warm"
      : t === "Low"
        ? "brand"
        : "neutral";

export const urgencyTone = (u: string): keyof typeof PILL_TONES =>
  u === "Critical"
    ? "orange"
    : u === "Warning"
      ? "warm"
      : u === "Monitor"
        ? "neutral"
        : u === "Stable"
          ? "brand"
          : "neutral";

/* ────────────────────────────────────────── */
/*  StackBar — compact horizontal stack      */
/* ────────────────────────────────────────── */
export function StackBar({
  data,
  palette,
  height = 8,
}: {
  data: Record<string, number>;
  palette: Record<string, string>;
  height?: number;
}) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (!total) {
    return (
      <div className="text-[11.5px] text-[color:var(--ink-5)]">No data</div>
    );
  }
  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full"
        style={{ height }}
      >
        {Object.entries(data).map(([k, v]) => (
          <div
            key={k}
            style={{
              background: palette[k] || "#cbd5e1",
              width: `${(v / total) * 100}%`,
            }}
            title={`${k}: ${v.toLocaleString()}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.entries(data).map(([k, v]) => (
          <span
            className="flex items-center gap-1.5 text-[11.5px] text-[color:var(--ink-3)]"
            key={k}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: palette[k] || "#cbd5e1" }}
            />
            <span className="text-[color:var(--ink-2)]">{k}</span>
            <span className="num text-[color:var(--ink-4)]">
              {v.toLocaleString()}
            </span>
            <span className="text-[color:var(--ink-5)]">·</span>
            <span className="num text-[color:var(--ink-5)]">
              {((v / total) * 100).toFixed(1)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  Sparkline                                 */
/* ────────────────────────────────────────── */
export function Sparkline({
  values,
  color = "var(--moby-600)",
  h = 28,
}: {
  values: number[];
  color?: string;
  h?: number;
}) {
  if (values.length < 2) {
    return null;
  }
  const w = 120;
  const min = Math.min(...values),
    max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  const path = pts
    .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
    .join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg
      height={h}
      preserveAspectRatio="none"
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
    >
      <path d={area} fill={color} fillOpacity="0.10" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* ────────────────────────────────────────── */
/*  ProgressMeter                             */
/* ────────────────────────────────────────── */
export function ProgressMeter({
  value,
  max = 100,
  tone = "blue",
  label,
  showValue = true,
}: {
  value: number;
  max?: number;
  tone?: "blue" | "rose" | "emerald" | "amber" | "slate";
  label?: string;
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = (
    {
      amber: "var(--warn)",
      blue: "var(--moby-600)",
      emerald: "var(--ok)",
      rose: "var(--danger)",
      slate: "#6b7280",
    } as const
  )[tone];
  return (
    <div>
      {(label || showValue) && (
        <div className="mb-1 flex items-baseline justify-between">
          {label && (
            <span className="text-[11.5px] text-[color:var(--ink-4)]">
              {label}
            </span>
          )}
          {showValue && (
            <span className="num text-[12px]">{pct.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-50">
        <div
          className="h-full rounded-full"
          style={{ background: color, width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  EmptyState                                */
/* ────────────────────────────────────────── */
export function EmptyState({
  title,
  hint,
  icon: Icon = Activity,
  action,
}: {
  title: string;
  hint?: string;
  icon?: any;
  action?: ReactNode;
}) {
  return (
    <div className="surface-soft px-6 py-10 text-center">
      <div className="mb-3 inline-flex items-center justify-center text-[color:var(--ink-4)]">
        <Icon size={18} />
      </div>
      <div className="font-medium text-[13.5px] text-[color:var(--ink-2)]">
        {title}
      </div>
      {hint && (
        <div className="mx-auto mt-1 max-w-md text-[12px] text-[color:var(--ink-5)]">
          {hint}
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  Skeleton                                  */
/* ────────────────────────────────────────── */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ────────────────────────────────────────── */
/*  ActionChip — link-like inline action      */
/* ────────────────────────────────────────── */
export function ActionChip({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-1 font-medium text-[12px] text-[color:var(--ink-3)] underline-offset-2 hover:text-[color:var(--moby-600)] hover:underline"
      onClick={onClick}
      type="button"
    >
      {children}
      <ArrowRight size={12} />
    </button>
  );
}

/* ────────────────────────────────────────── */
/*  AlertItem (used on dashboard + alerts)   */
/* ────────────────────────────────────────── */
export function AlertItem({
  severity = "warn",
  title,
  time,
  children,
}: {
  severity?: "danger" | "warn" | "info" | "ok";
  title: string;
  time?: string;
  children?: ReactNode;
}) {
  const iconMap = {
    danger: <AlertTriangle className="text-[color:var(--danger)]" size={14} />,
    info: <Activity className="text-[color:var(--info)]" size={14} />,
    ok: <CheckCircle2 className="text-[color:var(--ok)]" size={14} />,
    warn: <AlertTriangle className="text-[color:var(--warn)]" size={14} />,
  };
  return (
    <div className="flex gap-3 border-gray-100 border-b px-4 py-3 last:border-0">
      <div className="shrink-0 pt-0.5">{iconMap[severity]}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="truncate font-medium text-[13px] text-[color:var(--ink-1)]">
            {title}
          </div>
          {time && (
            <div className="flex shrink-0 items-center gap-1 text-[11px] text-[color:var(--ink-5)]">
              <Clock size={10} /> {time}
            </div>
          )}
        </div>
        {children && (
          <div className="mt-0.5 text-[12px] text-[color:var(--ink-4)]">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
