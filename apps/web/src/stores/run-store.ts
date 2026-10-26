"use client";

import type { PredictionRun } from "@moby/types";
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { fetchPredictionRuns } from "@/lib/ml-api";

interface RunState {
  /** The active completed Prediction Run (persisted; the URL's ?run= wins, see run-url-sync). */
  runId: string;
  setRunId: (runId: string) => void;
  /** Completed Prediction Runs, newest first. */
  runs: PredictionRun[];
  runsLoading: boolean;
  runsError: string | null;
  /** Fetch the run list; concurrent callers (header + page) share one request. */
  loadRuns: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useRunStore = create<RunState>()(
  persist(
    (set, get) => ({
      runId: "",
      setRunId: (runId) => set({ runId }),
      runs: [],
      runsLoading: true,
      runsError: null,
      loadRuns: () => {
        inFlight ??= (async () => {
          set({ runsLoading: true, runsError: null });
          try {
            const runs = (await fetchPredictionRuns()).filter((r) => r.status === "completed");
            const { runId } = get();
            // Keep a valid selection; otherwise fall back to the latest completed run.
            const nextRunId = runs.some((r) => r.id === runId) ? runId : (runs[0]?.id ?? "");
            set({ runs, runId: nextRunId, runsLoading: false });
          } catch (e) {
            set({ runsLoading: false, runsError: e instanceof Error ? e.message : "โหลด prediction runs ไม่สำเร็จ" });
          } finally {
            inFlight = null;
          }
        })();
        return inFlight;
      },
    }),
    { name: "moby:run", partialize: (s) => ({ runId: s.runId }) }
  )
);

/** The active run for the dashboard and customer pages; refreshes the run list on mount. */
export function useActiveRun() {
  const runId = useRunStore((s) => s.runId);
  const setRunId = useRunStore((s) => s.setRunId);
  const runs = useRunStore((s) => s.runs);
  const loading = useRunStore((s) => s.runsLoading);
  const error = useRunStore((s) => s.runsError);
  const loadRuns = useRunStore((s) => s.loadRuns);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const run = runs.find((r) => r.id === runId) ?? null;
  return { run, runs, runId: run?.id ?? "", setRunId, loading, error };
}
