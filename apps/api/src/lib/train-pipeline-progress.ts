/**
 * Combined raw import + train clean progress (0–100%).
 */

export type PipelinePhase = "raw" | "clean";

export interface TrainPipelineProgressEvent {
  phase: PipelinePhase;
  progress: number;
  rows?: number;
  sheet?: string;
  step: string;
}

const RAW_END = 45;
const CLEAN_START = 45;
const CLEAN_END = 97;

/** Map raw-only progress (5–100 from train-import-progress) → 5–45% pipeline. */
export function mapRawImportProgress(rawPct: number): number {
  const clamped = Math.max(5, Math.min(100, rawPct));
  return Math.round(5 + ((clamped - 5) / 95) * (RAW_END - 5));
}

export function progressCleanStart(): TrainPipelineProgressEvent {
  return {
    phase: "clean",
    progress: CLEAN_START,
    step: "Starting clean (for model training)…",
  };
}

export function progressCleanCustomers(): TrainPipelineProgressEvent {
  return { phase: "clean", progress: 52, step: "Clean: writing customers…" };
}

export function progressCleanPayments(): TrainPipelineProgressEvent {
  return { phase: "clean", progress: 65, step: "Clean: writing payments…" };
}

export function progressCleanUsageSheet(
  sheetIndex: number,
  sheetCount: number,
  sheetName: string,
  rows: number
): TrainPipelineProgressEvent {
  if (sheetCount <= 0) {
    return {
      phase: "clean",
      progress: 75,
      rows,
      sheet: sheetName,
      step: `Clean: ${sheetName}`,
    };
  }
  const span = CLEAN_END - 75;
  const pct = 75 + Math.round(((sheetIndex + 1) / sheetCount) * span);
  return {
    phase: "clean",
    progress: pct,
    rows,
    sheet: sheetName,
    step: `Clean: ${sheetName} (${rows.toLocaleString()} rows)`,
  };
}

export function progressPipelineDone(): TrainPipelineProgressEvent {
  return { phase: "clean", progress: 100, step: "Ready for model training" };
}
