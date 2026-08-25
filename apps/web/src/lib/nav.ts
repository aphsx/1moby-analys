/**
 * Single source of truth for navigation + header metadata.
 * Both the sidebar (items/labels/icons) and the shell header (titles, run
 * selector, AI widget visibility) derive from here, instead of duplicating
 * route lists across sidebar.tsx and shell.tsx.
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Database,
  LayoutDashboard,
  MessageSquareMore,
  Users,
} from "lucide-react";

export interface NavItem {
  badge?: "AI";
  href: string;
  icon: LucideIcon;
  /** Sidebar label. */
  label: string;
  /** Header title (kept distinct from `label` where the existing text differed). */
  title: string;
}

export interface NavSection {
  items: NavItem[];
  title: string;
}

/** Top sidebar sections. */
export const PRIMARY_NAV: NavSection[] = [
  {
    items: [
      {
        href: "/",
        icon: LayoutDashboard,
        label: "Dashboard",
        title: "Dashboard",
      },
      {
        href: "/customers",
        icon: Users,
        label: "Customers",
        title: "Customers",
      },
    ],
    title: "Operate",
  },
  {
    items: [
      {
        badge: "AI",
        href: "/ai-chat",
        icon: MessageSquareMore,
        label: "AI Assistant",
        title: "AI Assistant",
      },
    ],
    title: "Assistant",
  },
];

// Footer nav: [LEGACY] /runs = predict upload · /training = [NEW] train raw import + [LEGACY] model train
/** Bottom sidebar sections. */
export const FOOTER_NAV: NavSection[] = [
  {
    items: [
      {
        href: "/runs",
        icon: Database,
        label: "Prediction Runs",
        title: "Prediction runs",
      },
      {
        href: "/training",
        icon: Activity,
        label: "Model Training",
        title: "Model Training",
      },
    ],
    title: "Prediction",
  },
  {
    items: [
      {
        href: "/model-performance",
        icon: Activity,
        label: "Model Metrics",
        title: "Model Metrics",
      },
    ],
    title: "Models",
  },
];

/** Header titles for routes that aren't in the sidebar nav. */
const EXTRA_TITLES: Record<string, string> = {
  "/profile": "My Account",
};

const EXACT_TITLES: Record<string, string> = {
  ...Object.fromEntries(
    [...PRIMARY_NAV, ...FOOTER_NAV].flatMap((s) =>
      s.items.map((i) => [i.href, i.title])
    )
  ),
  ...EXTRA_TITLES,
};

/** Header title for a pathname (handles the dynamic /customers/:id detail page). */
export function getRouteTitle(pathname: string): string | undefined {
  if (pathname.startsWith("/customers/")) {
    return "Customer detail";
  }
  return EXACT_TITLES[pathname];
}

/** Routes rendered without the app chrome (sidebar/header). */
export const BARE_ROUTES = ["/login"];

export function isBareRoute(pathname: string): boolean {
  return BARE_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** The run selector shows on the dashboard and customer pages. */
export function shouldShowRunSelector(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/customers" ||
    pathname.startsWith("/customers/")
  );
}

/** The floating AI widget is hidden on the full AI chat page. */
export function shouldHideAiWidget(pathname: string): boolean {
  return pathname.startsWith("/ai-chat");
}
