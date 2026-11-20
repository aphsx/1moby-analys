"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { INTRO_ASSETS } from "@/lib/login-brand-colors";
import { NAV } from "@/lib/nav";
import { useSidebarStore } from "@/stores/sidebar-store";
import { UserNavProfile } from "./user-nav-profile";

/** The logo SVG is single-colour white; masking it lets the text token colour it in any theme. */
function Logo({ collapsed }: { collapsed: boolean }) {
  const maskFull = `url(${INTRO_ASSETS.logo}) no-repeat left center / contain`;
  const maskMark = `url(${INTRO_ASSETS.logo}) no-repeat left center / auto 20px`;
  return (
    <>
      <span
        role="img"
        aria-label="1Moby"
        className={`block h-5 w-[140px] bg-text ${collapsed ? "min-[860px]:hidden" : ""}`}
        style={{ mask: maskFull, WebkitMask: maskFull }}
      />
      {collapsed ? (
        <span
          role="img"
          aria-label="1Moby"
          className="hidden h-5 w-8 bg-text min-[860px]:block"
          style={{ mask: maskMark, WebkitMask: maskMark }}
        />
      ) : null}
    </>
  );
}

/**
 * ≥ 860px: a static column on the page ground, split off by a 1px line (DESIGN.md §5).
 *   Expanded 232px · collapsed icon rail 56px (Theme C rail width in DESIGN.md §5).
 * < 860px: a full-screen sheet opened from the shell's top bar (collapse ignored).
 */
export function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside
      id="app-nav"
      data-collapsed={collapsed ? "true" : undefined}
      className={`fixed inset-0 z-50 flex flex-col bg-ground transition-[transform,width] duration-200 min-[860px]:static min-[860px]:z-auto min-[860px]:shrink-0 min-[860px]:translate-x-0 min-[860px]:border-r min-[860px]:border-border ${
        collapsed ? "min-[860px]:w-[var(--sidebar-collapsed-w)]" : "min-[860px]:w-[var(--sidebar-w)]"
      } ${mobileOpen ? "translate-x-0" : "invisible -translate-x-full min-[860px]:visible"}`}
    >
      <div
        className={`flex h-12 items-center justify-between px-4 min-[860px]:h-16 ${
          collapsed ? "min-[860px]:justify-center min-[860px]:px-0" : "min-[860px]:px-5"
        }`}
      >
        <Logo collapsed={collapsed} />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted hover:text-text min-[860px]:hidden"
          aria-label="ปิดเมนู"
        >
          <X size={18} />
        </button>
        {!collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-raised hover:text-text min-[860px]:inline-flex"
            aria-label="ย่อเมนู"
            title="ย่อเมนู"
          >
            <PanelLeftClose size={16} strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      <nav
        aria-label="เมนูหลัก"
        className={`flex-1 overflow-y-auto px-3 pb-3 ${collapsed ? "min-[860px]:px-1.5" : ""}`}
      >
        {NAV.map((g, gi) => (
          <div key={g.title ?? gi} className={gi > 0 ? "mt-5" : ""}>
            {g.title ? (
              <p className={`mb-1 px-2 text-micro text-muted ${collapsed ? "min-[860px]:hidden" : ""}`}>{g.title}</p>
            ) : null}
            {g.title && collapsed && gi > 0 ? (
              <div className="mx-2 mb-2 hidden border-t border-border min-[860px]:block" aria-hidden />
            ) : null}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onClose}
                      title={it.label}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-11 items-center gap-2.5 rounded-control px-2 text-body transition-colors duration-150 min-[860px]:h-8 ${
                        collapsed ? "min-[860px]:justify-center min-[860px]:gap-0 min-[860px]:px-0" : ""
                      } ${active ? "bg-accent-soft font-medium text-accent-ink" : "text-text hover:bg-raised"}`}
                    >
                      <Icon size={16} strokeWidth={1.5} aria-hidden className={active ? "text-accent" : "text-muted"} />
                      <span className={collapsed ? "min-[860px]:hidden" : undefined}>{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {collapsed ? (
        <div className="hidden border-t border-border px-1.5 py-2 min-[860px]:block">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-8 w-full items-center justify-center rounded-control text-muted hover:bg-raised hover:text-text"
            aria-label="ขยายเมนู"
            title="ขยายเมนู"
          >
            <PanelLeftOpen size={16} strokeWidth={1.5} />
          </button>
        </div>
      ) : null}

      <UserNavProfile collapsed={collapsed} />
    </aside>
  );
}
