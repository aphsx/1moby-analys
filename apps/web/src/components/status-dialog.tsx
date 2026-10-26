"use client";

import Image from "next/image";
import type { StatusDialogTone } from "@/stores/status-dialog-store";

type StatusDialogProps = {
  open: boolean;
  tone: StatusDialogTone;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

const TONE_STYLE: Record<StatusDialogTone, { button: string; icon: string; alt: string }> = {
  success: {
    button: "var(--primary)",
    icon: "/icons/success-alert.svg",
    alt: "success",
  },
  error: {
    button: "var(--danger)",
    icon: "/icons/error-alert.svg",
    alt: "error",
  },
  warning: {
    button: "var(--danger)",
    icon: "/icons/noti.svg",
    alt: "notification",
  },
};

export function StatusDialog({
  open,
  tone,
  title,
  message,
  confirmLabel = "ตกลง",
  cancelLabel = "ยกเลิก",
  loading = false,
  onConfirm,
  onCancel,
}: StatusDialogProps) {
  if (!open) return null;

  const style = TONE_STYLE[tone];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
      <div className="w-full max-w-[607px] rounded-card bg-surface shadow-[var(--shadow-float)]">
        <div className="flex flex-col items-center gap-10 px-4 py-10 text-center sm:gap-16 sm:px-6 sm:py-16">
          <div className="flex flex-col items-center justify-center gap-8 sm:gap-10">
            <Image className="h-20 w-20 sm:h-[105px] sm:w-[105px]" src={style.icon} alt={style.alt} width={105} height={105} priority />

            <div>
              <h3 className="max-w-[400px] text-[18px] font-semibold leading-7 text-text">
                {title}
              </h3>
              {message && (
                <p className="mt-3 max-w-[420px] text-small leading-6 text-muted">
                  {message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            {onCancel && (
              <button
                type="button"
                disabled={loading}
                onClick={onCancel}
                className="inline-flex h-[47px] min-w-[102px] items-center justify-center rounded-card border border-border bg-surface px-5 text-small font-semibold text-text hover:bg-raised disabled:opacity-50"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className="inline-flex h-[47px] min-w-[102px] items-center justify-center rounded-card px-5 text-small font-semibold text-white disabled:opacity-50"
              style={{ background: style.button }}
            >
              {loading ? "กำลังดำเนินการ..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
