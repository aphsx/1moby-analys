"use client";
import { ReactNode } from "react";
import { Activity, RefreshCw } from "lucide-react";

/* ────────────────────────────────────────── */
/*  PageHeader (in-page sub header)          */
/* ────────────────────────────────────────── */
export function PageHeader({
  title, actions,
}: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 px-4 pb-2 pt-5 sm:px-6 sm:pt-6 lg:px-8">
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
        <header className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              {eyebrow ? <p className="type-label">{eyebrow}</p> : null}
              {title ? <h2 className="type-section-title mt-1 text-[20px]">{title}</h2> : null}
              {hint ? (
                <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[color:var(--ink-4)]">{hint}</p>
              ) : null}
            </div>
            {right ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto">{right}</div> : null}
          </div>
        </header>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

/* ────────────────────────────────────────── */
/*  StatusPill — solid fill, matches /customers lifecycle badges */
/* ────────────────────────────────────────── */
const PILL_TONES: Record<string, string> = {
  ok:      "#006bff",
  brand:   "#006bff",
  warn:    "#ffa400",
  danger:  "#fc4c02",
  info:    "#1893f0",
  neutral: "#9ca3af",
  violet:  "#7c3aed",
  warm:    "#ffa400",
  orange:  "#fc4c02",
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
  loading?: boolean;
}) {
  const bg = PILL_TONES[tone] ?? PILL_TONES.neutral;
  return (
    <span
      className="inline-flex h-[26px] items-center justify-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: bg }}
    >
      {loading ? <RefreshCw size={11} className="animate-spin" /> : Icon ? <Icon size={11} /> : null}
      {children}
    </span>
  );
}

/* ────────────────────────────────────────── */
/*  ProgressMeter                             */
/* ────────────────────────────────────────── */
export function ProgressMeter({
  value, max = 100, tone = "blue", label, showValue = true,
}: { value: number; max?: number; tone?: "blue" | "rose" | "emerald" | "amber" | "slate"; label?: string; showValue?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = ({
    blue: "var(--moby-600)", rose: "var(--danger)", emerald: "var(--ok)", amber: "var(--warn)", slate: "#6b7280"
  } as const)[tone];
  return (
    <div>
      {(label || showValue) && (
        <div className="flex items-baseline justify-between mb-1">
          {label && <span className="text-[11.5px] text-[color:var(--ink-4)]">{label}</span>}
          {showValue && <span className="num text-[12px]">{pct.toFixed(0)}%</span>}
        </div>
      )}
      <div className="w-full h-1.5 rounded-full bg-gray-50 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  EmptyState                                */
/* ────────────────────────────────────────── */
export function EmptyState({
  title, hint, icon: Icon = Activity, action,
}: { title: string; hint?: string; icon?: any; action?: ReactNode }) {
  return (
    <div className="surface-soft py-10 px-6 text-center">
      <div className="inline-flex items-center justify-center text-[color:var(--ink-4)] mb-3">
        <Icon size={18} />
      </div>
      <div className="text-[13.5px] font-medium text-[color:var(--ink-2)]">{title}</div>
      {hint && <div className="text-[12px] text-[color:var(--ink-5)] mt-1 max-w-md mx-auto">{hint}</div>}
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
