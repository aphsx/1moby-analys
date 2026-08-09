"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AiBadge } from "@/components/ai-badge";
import { INTRO_ASSETS } from "@/lib/login-brand-colors";
import { FOOTER_NAV, PRIMARY_NAV } from "@/lib/nav";
import UserNavProfile from "./user-nav-profile";

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-gray-200 border-r bg-white">
      {/* Brand */}
      <div
        className="border-gray-200 border-b px-5 pt-5 pb-4"
        style={{
          backgroundImage: [
            "radial-gradient(rgba(7, 29, 126, 0.42) 0%, transparent 42%)",
            "url(/assets/intro/about_bg.webp)",
            "linear-gradient(140deg, #1d1f2a -10%, #006bff 58%, #1893f0 74%, #ffa400 88%, #fc4c02 96%)",
          ].join(", "),
          backgroundPosition: "center, left 58% top 0, center",
          backgroundRepeat: "no-repeat, no-repeat, no-repeat",
          backgroundSize: "150% 130%, cover, 100% 100%",
        }}
      >
        <img
          alt="1Moby"
          className="block h-8 w-auto"
          height={25}
          src={INTRO_ASSETS.logo}
          style={{ filter: "brightness(0) invert(1)" }}
          width={174}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {PRIMARY_NAV.map((g) => (
          <div className="mb-4" key={g.title}>
            <div className="mb-2 px-5 font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.16em]">
              {g.title}
            </div>
            <ul className="space-y-1 px-3">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      className={`group flex min-h-[44px] items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] transition-colors ${
                        active
                          ? "bg-[color:var(--moby-50)] font-medium text-[color:var(--moby-600)]"
                          : "text-[color:var(--ink-3)] hover:bg-gray-50 hover:text-[color:var(--ink-1)]"
                      }`}
                      href={it.href}
                    >
                      <Icon
                        className={
                          active
                            ? "text-[color:var(--moby-600)]"
                            : "text-[color:var(--ink-4)]"
                        }
                        size={17}
                        strokeWidth={active ? 2.2 : 1.9}
                      />
                      <span>{it.label}</span>
                      {it.badge && !active && <AiBadge className="ml-auto" />}
                      {active && (
                        <span className="ml-auto h-5 w-1.5 rounded-full bg-[color:var(--moby-600)]" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="py-3">
        {FOOTER_NAV.map((g) => (
          <div className="mb-4 last:mb-0" key={g.title}>
            <div className="mb-2 px-5 font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.16em]">
              {g.title}
            </div>
            <ul className="space-y-1 px-3">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      className={`group flex min-h-[44px] items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] transition-colors ${
                        active
                          ? "bg-[color:var(--moby-50)] font-medium text-[color:var(--moby-600)]"
                          : "text-[color:var(--ink-3)] hover:bg-gray-50 hover:text-[color:var(--ink-1)]"
                      }`}
                      href={it.href}
                    >
                      <Icon
                        className={
                          active
                            ? "text-[color:var(--moby-600)]"
                            : "text-[color:var(--ink-4)]"
                        }
                        size={17}
                        strokeWidth={active ? 2.2 : 1.9}
                      />
                      <span>{it.label}</span>
                      {active && (
                        <span className="ml-auto h-5 w-1.5 rounded-full bg-[color:var(--moby-600)]" />
                      )}
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
  );
}
