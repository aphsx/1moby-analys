"use client";
import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { formatPercent, formatSignedPercent } from "@/lib/format";

/* Primitives from docs/ui/DESIGN.md §6. Colours come from tokens only. */

/* ────────────────────────────────────────── */
/*  PageHeader (§6.1): noun title, one-sentence finding, one primary action, scope row */
/* ────────────────────────────────────────── */
export function PageHeader({
  title,
  finding,
  action,
  scope,
}: {
  title: ReactNode;
  /** what the data says, not how to use the screen (CONTENT.md §1) */
  finding?: ReactNode;
  action?: ReactNode;
  /** run selector + freshness stamp */
  scope?: ReactNode;
}) {
  return (
    <header className="px-4 pt-5 sm:px-6 lg:px-8 min-[860px]:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-[1.25] text-text min-[860px]:text-title">{title}</h1>
          {finding ? <p className="mt-1 max-w-[64ch] text-body text-muted">{finding}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {scope ? <div className="mt-4">{scope}</div> : null}
    </header>
  );
}

/* ────────────────────────────────────────── */
/*  SectionCard (replaced by Panel page by page) */
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
        <header className="border-b border-rule px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              {eyebrow ? <p className="type-label">{eyebrow}</p> : null}
              {title ? <h2 className="type-section-title mt-1 text-[20px]">{title}</h2> : null}
              {hint ? <p className="mt-1 max-w-2xl text-small text-muted">{hint}</p> : null}
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
/*  Panel (§6.4)                              */
/* ────────────────────────────────────────── */
export function Panel({
  title,
  info,
  meta,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  /** ⓘ text from docs/ui/CONTENT.md §5 */
  info?: ReactNode;
  /** unit, period or how to read it, 13px under the title */
  meta?: ReactNode;
  /** legend or one action */
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface rounded-card p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="flex items-center gap-1 text-section font-semibold leading-snug text-text">
                {title}
                {info ? <InfoTip label={typeof title === "string" ? title : "คำอธิบาย"}>{info}</InfoTip> : null}
              </h2>
            ) : null}
            {meta ? <p className="mt-0.5 text-small text-muted">{meta}</p> : null}
          </div>
          {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

/* ────────────────────────────────────────── */
/*  InfoTip (§6.3): hover, focus and tap; Esc or tapping outside closes */
/* ────────────────────────────────────────── */
export function InfoTip({ label, children, align = "left" }: { label: string; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`อธิบาย ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-control text-faint transition-colors duration-150 hover:text-text focus-visible:text-text max-[859px]:h-11 max-[859px]:w-11"
      >
        <Info size={14} aria-hidden />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-full z-50 mt-1 w-[264px] rounded-control px-3 py-2 text-left text-micro font-normal leading-[18px] ${
            align === "right" ? "right-[-8px]" : "left-[-8px]"
          }`}
          style={{ background: "var(--tip-bg)", color: "var(--tip-ink)", boxShadow: "var(--shadow-float)" }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}

/* ────────────────────────────────────────── */
/*  KpiStrip (§6.2): one box, 1px dividers, no icons or sparklines */
/* ────────────────────────────────────────── */
export type KpiItem = {
  label: string;
  info?: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** baseline sentence, e.g. <Delta …/> or "จาก 2,572 ราย" */
  caption?: ReactNode;
  /** the number that answers the page's question */
  lead?: boolean;
};

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    // gap-px over bg-border draws the dividers; < 860px it is 2 columns and an odd last cell spans the row
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border min-[860px]:auto-cols-fr min-[860px]:grid-flow-col [&>*:last-child:nth-child(odd)]:col-span-2 min-[860px]:[&>*]:!col-span-1">
      {items.map((k) => (
        <div key={k.label} className="min-w-0 bg-surface p-5">
          <dt className="flex items-center gap-0.5 text-body text-muted">
            {k.label}
            {k.info ? <InfoTip label={k.label}>{k.info}</InfoTip> : null}
          </dt>
          <dd className={`num mt-1 text-text ${k.lead ? "text-lead font-semibold" : "text-kpi font-medium"}`}>
            {k.value}
            {k.unit ? <span className="ml-1 text-small font-normal text-muted">{k.unit}</span> : null}
          </dd>
          {k.caption ? <dd className="mt-1 text-small text-muted">{k.caption}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/* ────────────────────────────────────────── */
/*  Delta (§6.7): text, coloured by good/bad for this metric */
/* ────────────────────────────────────────── */
export function Delta({ value, base, goodWhen = "up" }: { value: number | null | undefined; base: string; goodWhen?: "up" | "down" }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-small text-faint">—</span>;
  const text = formatSignedPercent(value);
  const zero = !text.startsWith("+") && !text.startsWith("−");
  const good = goodWhen === "up" ? value > 0 : value < 0;
  const tone = zero ? "text-muted" : good ? "text-positive" : "text-negative";
  return <span className={`num text-small ${tone}`}>{text} {base}</span>;
}

/* ────────────────────────────────────────── */
/*  StatusPill (§6.6): soft pairs, never a solid fill */
/* ────────────────────────────────────────── */
const PILL_TONES = {
  positive: ["var(--pill-positive-bg)", "var(--pill-positive-ink)"],
  negative: ["var(--pill-negative-bg)", "var(--pill-negative-ink)"],
  warning: ["var(--pill-warning-bg)", "var(--pill-warning-ink)"],
  neutral: ["var(--pill-neutral-bg)", "var(--pill-neutral-ink)"],
  accent: ["var(--accent-soft)", "var(--accent-ink)"],
} as const;
export type PillTone = keyof typeof PILL_TONES;

export function StatusPill({
  tone = "neutral",
  icon: Icon,
  children,
  loading = false,
}: {
  tone?: PillTone;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  children: ReactNode;
  loading?: boolean;
}) {
  const [bg, ink] = PILL_TONES[tone];
  return (
    <span
      className="inline-flex h-[22px] items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-micro font-medium"
      style={{ backgroundColor: bg, color: ink }}
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
  value, max = 100, label, showValue = true,
}: { value: number; max?: number; label?: string; showValue?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      {(label || showValue) && (
        <div className="mb-1 flex items-baseline justify-between">
          {label && <span className="text-micro text-muted">{label}</span>}
          {showValue && <span className="num text-micro">{formatPercent(pct / 100)}</span>}
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  EmptyState (§6.11): dashed box, one sentence */
/* ────────────────────────────────────────── */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-control px-4 py-3 text-center">
      <p className="text-body text-text">{title}</p>
      {hint && <p className="mx-auto mt-0.5 max-w-md text-small text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  Skeleton (§6.11): flat grey bar, no shimmer */
/* ────────────────────────────────────────── */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`rounded-control bg-raised ${className}`} />;
}
