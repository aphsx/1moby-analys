"use client";

/**
 * Theme-aligned select — custom panel instead of the native OS/browser
 * dropdown, so every picker matches Moby surfaces (border, radius, ink, focus).
 * Menu is portaled to body so overflow:hidden ancestors (header, SectionCard)
 * cannot clip it.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import clsx from "clsx";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectSize = "sm" | "md" | "lg";

const SIZE_CLS: Record<SelectSize, string> = {
  sm: "h-8 rounded-lg pl-2.5 pr-7 text-[11.5px]",
  md: "h-9 rounded-lg pl-3 pr-9 text-[13px]",
  lg: "h-11 rounded-2xl pl-3.5 pr-10 text-[13px] shadow-[var(--shadow-1)]",
};

const MENU_RADIUS: Record<SelectSize, string> = {
  sm: "rounded-lg",
  md: "rounded-xl",
  lg: "rounded-2xl",
};

const OPTION_PAD: Record<SelectSize, string> = {
  sm: "px-2.5 py-1.5 text-[11.5px]",
  md: "px-3 py-2 text-[13px]",
  lg: "px-3.5 py-2.5 text-[13px]",
};

type MenuPos = { top: number; left: number; width: number; placement: "above" | "below" };

export function Select({
  value,
  onChange,
  options,
  placeholder = "เลือก…",
  disabled = false,
  size = "md",
  className = "",
  leftIcon,
  title,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: SelectSize;
  className?: string;
  leftIcon?: ReactNode;
  title?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const enabledIndexes = useCallback(
    () => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0),
    [options]
  );

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
    setMenuPos(null);
  }, []);

  const updatePos = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const placement: "above" | "below" =
      spaceBelow < 160 && rect.top > spaceBelow ? "above" : "below";
    setMenuPos({
      top: placement === "above" ? rect.top - gap : rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      placement,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener("resize", onScroll);
    // capture scroll from any ancestor
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const enabled = enabledIndexes();
    const idx = options.findIndex((o) => o.value === value && !o.disabled);
    setHighlight(idx >= 0 ? idx : enabled[0] ?? -1);
  }, [open, value, options, enabledIndexes]);

  useEffect(() => {
    if (!open || highlight < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  const pick = (next: string) => {
    onChange(next);
    close();
  };

  const moveHighlight = (dir: 1 | -1) => {
    const enabled = enabledIndexes();
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(highlight);
    const nextPos =
      pos < 0
        ? dir === 1
          ? 0
          : enabled.length - 1
        : (pos + dir + enabled.length) % enabled.length;
    setHighlight(enabled[nextPos]);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (e.key === "ArrowDown") moveHighlight(1);
      else if (highlight >= 0 && !options[highlight]?.disabled) {
        pick(options[highlight].value);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      else moveHighlight(-1);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  };

  const hasLeft = Boolean(leftIcon);

  const menuStyle: CSSProperties | undefined = menuPos
    ? {
        position: "fixed",
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        transform: menuPos.placement === "above" ? "translateY(-100%)" : undefined,
        zIndex: 80,
      }
    : undefined;

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-activedescendant={
              highlight >= 0 ? `${listId}-opt-${highlight}` : undefined
            }
            style={menuStyle}
            className={clsx(
              "max-h-60 overflow-auto border border-gray-200 bg-white py-1",
              "shadow-[var(--shadow-3)]",
              MENU_RADIUS[size]
            )}
          >
            {options.length === 0 ? (
              <li className={clsx(OPTION_PAD[size], "text-[color:var(--ink-5)]")}>
                ไม่มีตัวเลือก
              </li>
            ) : (
              options.map((opt, i) => {
                const isSelected = opt.value === value;
                const isActive = i === highlight;
                return (
                  <li
                    key={`${opt.value}-${i}`}
                    id={`${listId}-opt-${i}`}
                    data-idx={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    className={clsx(
                      "flex cursor-pointer items-center gap-2",
                      OPTION_PAD[size],
                      opt.disabled && "cursor-not-allowed opacity-45",
                      !opt.disabled && isActive && "bg-[color:var(--moby-50)]",
                      !opt.disabled && !isActive && "hover:bg-gray-50",
                      isSelected
                        ? "font-medium text-[color:var(--moby-700)]"
                        : "text-[color:var(--ink-2)]"
                    )}
                    onMouseEnter={() => !opt.disabled && setHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!opt.disabled) pick(opt.value);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {isSelected ? (
                      <Check
                        size={size === "sm" ? 12 : 14}
                        className="shrink-0 text-[color:var(--moby-600)]"
                      />
                    ) : (
                      <span className="w-3.5 shrink-0" aria-hidden />
                    )}
                  </li>
                );
              })
            )}
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={clsx("relative min-w-0", className)}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className={clsx(
          "relative flex w-full min-w-0 items-center border border-gray-200 bg-white text-left outline-none transition-colors",
          "text-[color:var(--ink-2)] hover:border-[color:var(--moby-200)]",
          "focus-visible:border-[color:var(--moby-500)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-[color:var(--moby-500)]",
          SIZE_CLS[size],
          hasLeft && (size === "sm" ? "pl-7" : size === "md" ? "pl-9" : "pl-10")
        )}
      >
        {leftIcon ? (
          <span
            className={clsx(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-[color:var(--ink-4)]",
              size === "sm" ? "left-2" : "left-3"
            )}
          >
            {leftIcon}
          </span>
        ) : null}
        <span
          className={clsx(
            "min-w-0 flex-1 truncate",
            !selected && "text-[color:var(--ink-5)]"
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={size === "sm" ? 12 : 14}
          className={clsx(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-[color:var(--ink-4)] transition-transform",
            size === "sm" ? "right-2" : "right-3",
            open && "rotate-180"
          )}
        />
      </button>
      {menu}
    </div>
  );
}
