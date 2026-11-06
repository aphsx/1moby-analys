/**
 * The steps of a train import as the web's progress bar shows them (0–100): importing
 * sheets takes 5–44%, Clean 45–97%, done is 100. Predict imports run inline and report none.
 */
import type { ImportProgressEvent } from "@moby/types";

export type OnImportProgress = (event: ImportProgressEvent) => void;

export const READY_STEP = "Ready for model training";

const RAW_START = 5;
const RAW_END = 44;
const CLEAN_START = 45;
const CLEAN_USAGE_START = 75;
const CLEAN_END = 97;

const between = (start: number, end: number, done: number, total: number) =>
  start + Math.round((done / Math.max(total, 1)) * (end - start));

export const importProgress = {
  uploadReceived: (): ImportProgressEvent => ({
    progress: 3,
    step: "Upload received — connecting progress…",
    phase: "raw",
  }),
  readingWorkbook: (): ImportProgressEvent => ({ progress: RAW_START, step: "Reading workbook…", phase: "raw" }),
  sheetStarted: (index: number, total: number, sheet: string): ImportProgressEvent => ({
    progress: between(RAW_START, RAW_END, index, total),
    step: `Importing: ${sheet}…`,
    phase: "raw",
    sheet,
  }),
  sheetImported: (index: number, total: number, sheet: string, rows: number): ImportProgressEvent => ({
    progress: between(RAW_START, RAW_END, index + 1, total),
    step: `Imported: ${sheet} (${rows.toLocaleString()} rows)`,
    phase: "raw",
    sheet,
    rows,
  }),
  rawDone: (): ImportProgressEvent => ({
    progress: RAW_END,
    step: "Raw complete — cleaning automatically…",
    phase: "raw",
  }),
  cleanStarted: (): ImportProgressEvent => ({
    progress: CLEAN_START,
    step: "Starting clean (for model training)…",
    phase: "clean",
  }),
  cleanCustomers: (): ImportProgressEvent => ({ progress: 52, step: "Clean: writing customers…", phase: "clean" }),
  cleanPayments: (): ImportProgressEvent => ({ progress: 65, step: "Clean: writing payments…", phase: "clean" }),
  cleanUsageSheet: (index: number, total: number, sheet: string, rows: number): ImportProgressEvent => ({
    progress: between(CLEAN_USAGE_START, CLEAN_END, index + 1, total),
    step: `Clean: ${sheet} (${rows.toLocaleString()} rows)`,
    phase: "clean",
    sheet,
    rows,
  }),
  done: (): ImportProgressEvent => ({ progress: 100, step: READY_STEP, phase: "clean" }),
};
