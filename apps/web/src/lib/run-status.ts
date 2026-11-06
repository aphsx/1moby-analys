import { type RunStatus } from "@moby/types";
/**
 * Canonical tone + label mapping for an ML run status (prediction + training).
 * Previously duplicated in features/runs/runs-utils.ts (a Record, with an invalid
 * "warm" tone) and features/training/training-run-utils.ts (functions). Unified
 * here as functions; `pending` maps to the valid "neutral" tone.
 */

/** Subset of the StatusPill tones used for run statuses. */
export type RunStatusTone = "brand" | "danger" | "info" | "neutral";

export function runStatusTone(status: RunStatus): RunStatusTone {
  if (status === "completed") return "brand";
  if (status === "failed") return "danger";
  if (status === "in_progress") return "info";
  return "neutral";
}

/** A run that has not finished yet: queued or running. Pages poll while one exists. */
export function isActiveRunStatus(status: RunStatus): boolean {
  return status === "pending" || status === "in_progress";
}

/** Poll cadence while any run on the page is active. */
export const RUN_POLL_MS = 3_000;

export function runStatusLabel(status: RunStatus): string {
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "in_progress") return "In progress";
  return "Pending";
}
