"use client";
import { Calendar, ChevronDown } from "lucide-react";
import Link from "next/link";
/**
 * Run selector (spec §2.0) — binds /, /customers, /customers/[id] to one
 * completed prediction run. Defaults to the latest completed run.
 */
import { useEffect, useState } from "react";
import { fetchPredictionRuns, type PredictionRun } from "@/lib/ml-api";
import { useRunStore } from "@/stores/run-store";

export function useActiveRun() {
  const { runId, setRunId } = useRunStore();
  const [runs, setRuns] = useState<PredictionRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPredictionRuns()
      .then((all) => {
        if (!alive) {
          return;
        }
        const completed = all.filter((r) => r.status === "completed");
        setRuns(completed);
        if (completed.length === 0) {
          if (runId) {
            setRunId("");
          }
        } else if (!(runId && completed.some((r) => r.id === runId))) {
          setRunId(completed[0].id);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = runs.find((r) => r.id === runId) ?? null;
  return { loading, run, runId: run?.id ?? "", runs, setRunId };
}

export function MockBadge() {
  return null;
}

export default function RunSelector() {
  const { runs, runId, setRunId, loading } = useActiveRun();

  if (!loading && runs.length === 0) {
    return (
      <Link
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-[color:var(--ink-3)] hover:border-[color:var(--moby-200)]"
        href="/runs"
      >
        <Calendar className="text-[color:var(--ink-4)]" size={14} />
        ยังไม่มี prediction run — สร้างที่หน้า Runs
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          className="h-9 min-w-[230px] cursor-pointer appearance-none rounded-lg border border-gray-200 bg-white pr-9 pl-9 text-[13px] text-[color:var(--ink-2)] hover:border-[color:var(--moby-200)]"
          disabled={loading}
          onChange={(e) => setRunId(e.target.value)}
          value={runId}
        >
          {loading && <option value="">Loading runs…</option>}
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · cutoff {r.cutoff_date}
            </option>
          ))}
        </select>
        <Calendar
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ink-4)]"
          size={14}
        />
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[color:var(--ink-4)]"
          size={14}
        />
      </div>
    </div>
  );
}
