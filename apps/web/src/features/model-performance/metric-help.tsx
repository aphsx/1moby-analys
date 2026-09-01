"use client";

import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";
import type { MetricInfo } from "./metric-info";

interface MetricHelpProps {
  info: Pick<MetricInfo, "label" | "tooltip" | "help" | "goodRange">;
  /** Popover opens upward when near card bottom. */
  placement?: "bottom" | "top";
}

const PANEL_WIDTH = 272;

/** Clickable ? — plain-Thai explanation for non-ML readers. */
export function MetricHelp({ info, placement = "bottom" }: MetricHelpProps) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const reposition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 32);
    let left = rect.right - width;
    left = Math.max(16, Math.min(left, window.innerWidth - width - 16));

    const panelHeight = panelRef.current?.offsetHeight ?? 120;
    const gap = 6;
    let top =
      placement === "top" ? rect.top - panelHeight - gap : rect.bottom + gap;
    top = Math.max(8, Math.min(top, window.innerHeight - panelHeight - 8));

    setPanelStyle({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    const onPointer = (e: Event) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, placement]);

  useEffect(() => {
    if (open) reposition();
  }, [open]);

  const toggle = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((v) => !v);
  };

  const body = info.help ?? info.tooltip;

  const panel =
    open && panelStyle && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            style={{
              position: "fixed",
              top: panelStyle.top,
              left: panelStyle.left,
              width: Math.min(PANEL_WIDTH, window.innerWidth - 32),
            }}
            className="z-[200] rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[12px] font-semibold text-[color:var(--ink-2)]">{info.label}</p>
            <p className="mt-1.5 text-[11.5px] leading-[1.55] text-[color:var(--ink-4)]">{body}</p>
            {info.goodRange ? (
              <p className="mt-2 border-t border-gray-100 pt-2 text-[11px] leading-[1.45] text-[color:var(--ink-5)]">
                <span className="font-semibold text-[color:var(--ink-3)]">ค่าที่ใช้งานได้: </span>
                {info.goodRange}
              </p>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`อธิบาย ${info.label}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[color:var(--ink-5)] transition-colors hover:bg-gray-100 hover:text-[color:var(--ink-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ink-3)]"
      >
        <CircleHelp className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      {panel}
    </>
  );
}

/** Metric name + ? trigger — label truncates, ? always clickable. */
export function MetricLabel({
  info,
  className = "",
}: {
  info: MetricInfo;
  className?: string;
}) {
  return (
    <span className={`inline-flex max-w-full min-w-0 items-center gap-1 ${className}`}>
      <span className="truncate">{info.label}</span>
      <MetricHelp info={info} />
    </span>
  );
}
