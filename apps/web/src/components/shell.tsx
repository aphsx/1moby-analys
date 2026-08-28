"use client";
import { ReactNode, Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "./sidebar";
import AIChatWidget from "./ai-chat-widget";
import { MobyIntroSplash } from "./moby-intro-splash";
import { GlobalStatusDialogHost } from "./global-status-dialog-host";
import RunSelector from "./run-selector";
import { RunUrlSync } from "@/stores/run-url-sync";
import {
  getRouteTitle,
  isBareRoute,
  shouldHideAiWidget,
  shouldShowRunSelector,
} from "@/lib/nav";

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const bare = isBareRoute(pathname);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (bare) {
    return (
      <>
        <MobyIntroSplash />
        {children}
        <GlobalStatusDialogHost />
      </>
    );
  }

  const hideWidget = shouldHideAiWidget(pathname);
  const routeTitle = getRouteTitle(pathname);
  const showRunSelector = shouldShowRunSelector(pathname);

  return (
    <>
      <MobyIntroSplash />
      <GlobalStatusDialogHost />
      {showRunSelector && (
        <Suspense fallback={null}>
          <RunUrlSync />
        </Suspense>
      )}
      <div className="flex h-dvh overflow-hidden md:h-screen">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 lg:h-16 lg:flex-nowrap lg:overflow-hidden lg:px-8 lg:py-0">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-[color:var(--ink-3)] hover:bg-gray-50 md:hidden"
                aria-label="เปิดเมนูนำทาง"
                aria-expanded={mobileNavOpen}
              >
                <Menu size={18} />
              </button>
              {routeTitle ? (
                <h1 className="type-display min-w-0 truncate text-[18px] leading-tight sm:text-[20px]">
                  {routeTitle}
                </h1>
              ) : null}
            </div>
            {showRunSelector && (
              <div className="w-full min-w-0 lg:w-auto lg:shrink-0">
                <RunSelector />
              </div>
            )}
          </header>
          <main className="flex-1 overflow-y-auto">
            <Suspense fallback={<div className="p-8 text-[color:var(--ink-5)]">Loading…</div>}>
              {children}
            </Suspense>
          </main>
        </div>
        {!hideWidget && <AIChatWidget />}
      </div>
    </>
  );
}
