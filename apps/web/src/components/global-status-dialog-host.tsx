"use client";

import { StatusDialog } from "@/components/status-dialog";
import {
  type StatusDialogPayload,
  useStatusDialogStore,
} from "@/stores/status-dialog-store";

export type GlobalStatusDialogPayload = StatusDialogPayload;

/** Imperative helper — callable from non-React code (e.g. async handlers). */
export function notifyStatusDialog(payload: StatusDialogPayload) {
  useStatusDialogStore.getState().notify(payload);
}

export function GlobalStatusDialogHost() {
  const dialog = useStatusDialogStore((s) => s.dialog);
  const dismiss = useStatusDialogStore((s) => s.dismiss);

  if (!dialog) {
    return null;
  }

  return (
    <StatusDialog
      confirmLabel={dialog.confirmLabel}
      message={dialog.message}
      onConfirm={dismiss}
      open
      title={dialog.title}
      tone={dialog.tone}
    />
  );
}
