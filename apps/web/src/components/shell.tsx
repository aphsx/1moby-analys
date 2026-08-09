"use client";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import {
  getRouteTitle,
  isBareRoute,
  shouldHideAiWidget,
  shouldShowRunSelector,
} from "@/lib/nav";
import { RunUrlSync } from "@/stores/run-url-sync";
import AIChatWidget from "./ai-chat-widget";
import { GlobalStatusDialogHost } from "./global-status-dialog-host";
import { MobyIntroSplash } from "./moby-intro-splash";
import RunSelector from "./run-selector";
import Sidebar from "./sidebar";

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bare = isBareRoute(pathname);

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
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 overflow-hidden border-gray-200 border-b bg-white px-8">
            {routeTitle ? (
              <div className="min-w-0 flex-1">
                <h1 className="type-display truncate text-[20px] leading-tight">
                  {routeTitle}
                </h1>
              </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}
            {showRunSelector && (
              <div className="min-w-0 shrink-0">
                <RunSelector />
              </div>
            )}
          </header>
          <main className="flex-1 overflow-y-auto">
            <Suspense
              fallback={
                <div className="p-8 text-[color:var(--ink-5)]">Loading…</div>
              }
            >
              {children}
            </Suspense>
          </main>
        </div>
        {!hideWidget && <AIChatWidget />}
      </div>
    </>
  );
}
