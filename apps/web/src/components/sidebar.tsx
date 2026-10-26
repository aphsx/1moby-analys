"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { INTRO_ASSETS } from "@/lib/login-brand-colors";
import { NAV } from "@/lib/nav";
import UserNavProfile from "./user-nav-profile";

/** The logo SVG is single-colour white; masking it lets the text token colour it in any theme. */
function Logo() {
  const mask = `url(${INTRO_ASSETS.logo}) no-repeat left center / contain`;
  return <span role="img" aria-label="1Moby" className="block h-5 w-[140px] bg-text" style={{ mask, WebkitMask: mask }} />;
}

/**
 * ≥ 860px: a static 232px column on the page ground, split off by a 1px line (DESIGN.md §5).
 * < 860px: a full-screen sheet opened from the shell's top bar.
 */
export default function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside
      id="app-nav"
      className={`fixed inset-0 z-50 flex flex-col bg-ground transition-transform duration-200 min-[860px]:static min-[860px]:z-auto min-[860px]:w-[232px] min-[860px]:shrink-0 min-[860px]:translate-x-0 min-[860px]:border-r min-[860px]:border-border ${
        mobileOpen ? "translate-x-0" : "invisible -translate-x-full min-[860px]:visible"
      }`}
    >
      <div className="flex h-12 items-center justify-between px-4 min-[860px]:h-16 min-[860px]:px-5">
        <Logo />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-11 items-center justify-center rounded-control text-muted hover:text-text min-[860px]:hidden"
          aria-label="ปิดเมนู"
        >
          <X size={18} />
        </button>
      </div>

      <nav aria-label="เมนูหลัก" className="flex-1 overflow-y-auto px-3 pb-3">
        {NAV.map((g, gi) => (
          <div key={g.title ?? gi} className={gi > 0 ? "mt-5" : ""}>
            {g.title ? <p className="mb-1 px-2 text-micro text-muted">{g.title}</p> : null}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-11 items-center gap-2.5 rounded-control px-2 text-body transition-colors duration-150 min-[860px]:h-8 ${
                        active ? "bg-accent-soft font-medium text-accent-ink" : "text-text hover:bg-raised"
                      }`}
                    >
                      <Icon size={16} strokeWidth={1.5} aria-hidden className={active ? "text-accent" : "text-muted"} />
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <UserNavProfile />
    </aside>
  );
}
