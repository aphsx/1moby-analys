"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import type { MetricInfo } from "./metric-info";

interface MetricHelpProps {
  info: Pick<MetricInfo, "label" | "tooltip" | "help" | "goodRange">;
  /** Popover opens upward when near card bottom. */
  placement?: "bottom" | "top";
}

/** Clickable ? — plain-Thai explanation for non-ML readers. */
export function MetricHelp({ info, placement = "bottom" }: MetricHelpProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const body = info.help ?? info.tooltip;

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={`อธิบาย ${info.label}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[color:var(--ink-5)] transition-colors hover:bg-gray-100 hover:text-[color:var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ink-3)]"
      >
        <CircleHelp className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>

      {open && (
        <div
          id={panelId}
          role="tooltip"
          className={`absolute z-50 w-[min(17rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-3 shadow-lg ${
            placement === "top" ? "bottom-full right-0 mb-1.5" : "right-0 top-full mt-1.5"
          }`}
        >
          <p className="text-[12px] font-semibold text-[color:var(--ink-2)]">{info.label}</p>
          <p className="mt-1.5 text-[11.5px] leading-[1.55] text-[color:var(--ink-4)]">{body}</p>
          {info.goodRange ? (
            <p className="mt-2 border-t border-gray-100 pt-2 text-[11px] leading-[1.45] text-[color:var(--ink-5)]">
              <span className="font-semibold text-[color:var(--ink-3)]">ค่าที่ใช้งานได้: </span>
              {info.goodRange}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Metric name + ? trigger on one line. */
export function MetricLabel({
  info,
  className = "",
}: {
  info: MetricInfo;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{info.label}</span>
      <MetricHelp info={info} />
    </span>
  );
}
