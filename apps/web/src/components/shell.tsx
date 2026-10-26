"use client";
import { ReactNode, Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "./sidebar";
import AIChatWidget from "./ai-chat-widget";
import { MobyIntroSplash } from "./moby-intro-splash";
import { GlobalStatusDialogHost } from "./global-status-dialog-host";
import { RunScope } from "./run-selector";
import { RunUrlSync } from "./run-url-sync";
import { PageHeader } from "./ui";
import { getRouteTitle, isAiChatRoute, isBareRoute, shouldShowRunSelector } from "@/lib/nav";

/**
 * App frame (docs/ui/DESIGN.md §5): no top bar from 860px up; below that a 48px bar with the page
 * title and a menu button that opens the sidebar as a full-screen sheet.
 */
export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  if (isBareRoute(pathname)) {
    return (
      <>
        <MobyIntroSplash />
        {children}
        <GlobalStatusDialogHost />
      </>
    );
  }

  const aiChat = isAiChatRoute(pathname);
  const title = getRouteTitle(pathname);
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
      <div className="flex h-dvh overflow-hidden">
        <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-ground px-2 min-[860px]:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-control text-text"
              aria-label="เปิดเมนู"
              aria-expanded={mobileNavOpen}
              aria-controls="app-nav"
            >
              <Menu size={18} />
            </button>
            {title ? <span className="min-w-0 truncate text-body font-semibold text-text">{title}</span> : null}
          </header>
          <main className="flex-1 overflow-y-auto">
            {!aiChat && title ? (
              <PageHeader title={title} scope={showRunSelector ? <RunScope /> : undefined} />
            ) : null}
            <Suspense fallback={<div className="p-8 text-muted">กำลังโหลด…</div>}>{children}</Suspense>
          </main>
        </div>
        {!aiChat && <AIChatWidget />}
      </div>
    </>
  );
}
