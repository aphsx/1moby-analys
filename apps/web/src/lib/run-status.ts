import { type RunStatus } from "@moby/types";
import type { PillTone } from "@/components/ui";
/**
 * Canonical tone + label mapping for an ML run status (prediction + training).
 * Previously duplicated in features/runs/runs-utils.ts (a Record, with an invalid
 * "warm" tone) and features/training/training-run-utils.ts (functions). Unified
 * here as functions; `pending` maps to the valid "neutral" tone.
 */

/** Subset of the StatusPill tones used for run statuses. */
export type RunStatusTone = Extract<PillTone, "positive" | "negative" | "accent" | "neutral">;

export function runStatusTone(status: RunStatus): RunStatusTone {
  if (status === "completed") return "positive";
  if (status === "failed") return "negative";
  if (status === "in_progress") return "accent";
  return "neutral";
}

/** A run that has not finished yet: queued or running. Pages poll while one exists. */
export function isActiveRunStatus(status: RunStatus): boolean {
  return status === "pending" || status === "in_progress";
}

/** Poll cadence while any run on the page is active. */
export const RUN_POLL_MS = 3_000;

export function runStatusLabel(status: RunStatus): string {
  if (status === "completed") return "เสร็จแล้ว";
  if (status === "failed") return "ไม่สำเร็จ";
  if (status === "in_progress") return "กำลังทำงาน";
  return "รอคิว";
}
