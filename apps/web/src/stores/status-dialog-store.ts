import { create } from "zustand";
import type { StatusDialogTone } from "@/components/status-dialog";

export type StatusDialogPayload = {
  tone: StatusDialogTone;
  title: string;
  message?: string;
  confirmLabel?: string;
};

interface StatusDialogState {
  dialog: StatusDialogPayload | null;
  dismiss: () => void;
  notify: (payload: StatusDialogPayload) => void;
}

/** App-wide status dialog. Rendered by GlobalStatusDialogHost. */
export const useStatusDialogStore = create<StatusDialogState>()((set) => ({
  dialog: null,
  dismiss: () => set({ dialog: null }),
  notify: (dialog) => set({ dialog }),
}));
