"use client";
import Link from "next/link";
import { AiBadge } from "@/components/ai-badge";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { INTRO_ASSETS } from "@/lib/login-brand-colors";
import { PRIMARY_NAV, FOOTER_NAV } from "@/lib/nav";
import UserNavProfile from "./user-nav-profile";

export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/30 md:hidden"
          onClick={onClose}
          aria-label="ปิดเมนูนำทาง"
        />
      )}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(86vw,300px)] shrink-0 flex-col border-r border-gray-200 bg-white shadow-2xl transition-transform duration-200 md:static md:z-auto md:w-[248px] md:translate-x-0 md:shadow-none ${
      mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
    }`}>
      {/* Brand */}
      <div
        className="relative flex items-center justify-between border-b border-gray-200 px-5 pb-4 pt-5"
        style={{
          backgroundImage: [
            "radial-gradient(rgba(7, 29, 126, 0.42) 0%, transparent 42%)",
            "url(/assets/intro/about_bg.webp)",
            "linear-gradient(140deg, #1d1f2a -10%, #006bff 58%, #1893f0 74%, #ffa400 88%, #fc4c02 96%)",
          ].join(", "),
          backgroundRepeat: "no-repeat, no-repeat, no-repeat",
          backgroundSize: "150% 130%, cover, 100% 100%",
          backgroundPosition: "center, left 58% top 0, center",
        }}
      >
        <img
          src={INTRO_ASSETS.logo}
          alt="1Moby"
          className="block h-8 w-auto"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white md:hidden"
          aria-label="ปิดเมนูนำทาง"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {PRIMARY_NAV.map(g => (
          <div key={g.title} className="mb-4">
            <div className="px-5 mb-2 text-[11px] font-semibold tracking-[.16em] text-[color:var(--ink-5)] uppercase">
              {g.title}
            </div>
            <ul className="px-3 space-y-1">
              {g.items.map(it => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onClose}
                      className={`group flex min-h-[44px] items-center gap-3 px-4 py-2.5 rounded-xl text-[15px] transition-colors
                        ${active
                          ? "bg-[color:var(--moby-50)] text-[color:var(--moby-600)] font-medium"
                          : "text-[color:var(--ink-3)] hover:bg-gray-50 hover:text-[color:var(--ink-1)]"}`}
                    >
                      <Icon size={17} strokeWidth={active ? 2.2 : 1.9}
                        className={active ? "text-[color:var(--moby-600)]" : "text-[color:var(--ink-4)]"} />
                      <span>{it.label}</span>
                      {it.badge && !active && <AiBadge className="ml-auto" />}
                      {active && <span className="ml-auto w-1.5 h-5 rounded-full bg-[color:var(--moby-600)]" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="py-3">
        {FOOTER_NAV.map(g => (
          <div key={g.title} className="mb-4 last:mb-0">
            <div className="px-5 mb-2 text-[11px] font-semibold tracking-[.16em] text-[color:var(--ink-5)] uppercase">
              {g.title}
            </div>
            <ul className="px-3 space-y-1">
              {g.items.map(it => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onClose}
                      className={`group flex min-h-[44px] items-center gap-3 px-4 py-2.5 rounded-xl text-[15px] transition-colors
                        ${active
                          ? "bg-[color:var(--moby-50)] text-[color:var(--moby-600)] font-medium"
                          : "text-[color:var(--ink-3)] hover:bg-gray-50 hover:text-[color:var(--ink-1)]"}`}
                    >
                      <Icon size={17} strokeWidth={active ? 2.2 : 1.9}
                        className={active ? "text-[color:var(--moby-600)]" : "text-[color:var(--ink-4)]"} />
                      <span>{it.label}</span>
                      {active && <span className="ml-auto w-1.5 h-5 rounded-full bg-[color:var(--moby-600)]" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <UserNavProfile />
    </aside>
    </>
  );
}
