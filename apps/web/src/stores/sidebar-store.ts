import { create } from "zustand";

/** Desktop sidebar: expanded (232px) or the collapsed icon rail (56px). */
interface SidebarState {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

// ponytail: not persisted, so it resets on reload; add zustand `persist` (with skipHydration for SSR) if that matters
export const useSidebarStore = create<SidebarState>()((set) => ({
  collapsed: false,
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
}));
