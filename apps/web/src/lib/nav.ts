/**
 * Single source of truth for navigation and page titles. The sidebar, the page header and the
 * browser tab (`pageTitle` in each page.tsx) all derive from here. Copy: docs/ui/CONTENT.md §7.
 */
import type { LucideIcon } from "lucide-react";
import { BrainCircuit, Database, LayoutDashboard, MessageSquareMore, Target, Users } from "lucide-react";

export interface NavItem {
  href: string;
  /** Sidebar label (short). */
  label: string;
  /** Page title: the h1, the mobile top bar and the browser tab. */
  title: string;
  icon: LucideIcon;
}

export interface NavSection {
  /** Group label; the first group has none. */
  title?: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    items: [
      { href: "/", label: "ภาพรวม", title: "ภาพรวมลูกค้า", icon: LayoutDashboard },
      { href: "/customers", label: "ลูกค้า", title: "รายชื่อลูกค้า", icon: Users },
      { href: "/ai-chat", label: "ผู้ช่วย AI", title: "ผู้ช่วย AI", icon: MessageSquareMore },
    ],
  },
  {
    title: "การทำนาย",
    items: [
      { href: "/runs", label: "รอบทำนาย", title: "รอบทำนาย", icon: Database },
      { href: "/training", label: "เทรนโมเดล", title: "เทรนโมเดล", icon: BrainCircuit },
      { href: "/model-performance", label: "ความแม่นยำโมเดล", title: "ความแม่นยำโมเดล", icon: Target },
    ],
  },
];

const TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV.flatMap((s) => s.items.map((i) => [i.href, i.title]))),
  "/profile": "บัญชีของฉัน",
};

/** Page title for a pathname (handles the dynamic /customers/:id page). */
export function getRouteTitle(pathname: string): string | undefined {
  const detail = /^\/customers\/([^/]+)/.exec(pathname);
  if (detail) return `บัญชี #${decodeURIComponent(detail[1])}`;
  return TITLES[pathname];
}

/** Browser-tab title for a page.tsx `metadata`. */
export function pageTitle(pathname: string): string {
  const title = getRouteTitle(pathname);
  return title ? `${title} · 1Moby Intelligence` : "1Moby Intelligence";
}

/** Routes rendered without the app chrome (sidebar/header). */
export const BARE_ROUTES = ["/login"];

export function isBareRoute(pathname: string): boolean {
  return BARE_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The run selector shows on the dashboard and customer pages. */
export function shouldShowRunSelector(pathname: string): boolean {
  return pathname === "/" || pathname === "/customers" || pathname.startsWith("/customers/");
}

/** Pages that render their own PageHeader (with a finding and a primary action). */
const OWN_HEADER_ROUTES = ["/"];

/** The shell renders the page header unless the page owns it or is the full-height AI chat. */
export function shellRendersPageHeader(pathname: string): boolean {
  return !OWN_HEADER_ROUTES.includes(pathname) && !isAiChatRoute(pathname);
}

/** The AI chat page fills the canvas height itself, so it gets no page header or floating widget. */
export function isAiChatRoute(pathname: string): boolean {
  return pathname.startsWith("/ai-chat");
}
