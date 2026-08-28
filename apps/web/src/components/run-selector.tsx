"use client";
/**
 * Run selector (spec §2.0) — binds /, /customers, /customers/[id] to one
 * completed prediction run. Defaults to the latest completed run.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { Select } from "@/components/select";
import { useRunStore } from "@/stores/run-store";
import { fetchPredictionRuns, type PredictionRun } from "@/lib/ml-api";

export function useActiveRun() {
  const { runId, setRunId } = useRunStore();
  const [runs, setRuns] = useState<PredictionRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPredictionRuns()
      .then((all) => {
        if (!alive) return;
        const completed = all.filter((r) => r.status === "completed");
        setRuns(completed);
        if (completed.length === 0) {
          if (runId) setRunId("");
        } else if (!runId || !completed.some((r) => r.id === runId)) {
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
  return { run, runs, runId: run?.id ?? "", setRunId, loading };
}

export function MockBadge() {
  return null;
}

export default function RunSelector() {
  const { run, runs, runId, setRunId, loading } = useActiveRun();

  if (!loading && runs.length === 0) {
    return (
      <Link
        href="/runs"
        className="inline-flex h-10 w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-[color:var(--ink-3)] hover:border-[color:var(--moby-200)] sm:h-9 sm:w-auto sm:rounded-lg sm:text-[13px]"
      >
        <Calendar size={14} className="text-[color:var(--ink-4)]" />
        ยังไม่มี prediction run — สร้างที่หน้า Runs
      </Link>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 lg:w-auto">
      <Select
        value={runId}
        onChange={setRunId}
        disabled={loading}
        size="md"
        className="w-full min-w-0 lg:min-w-[230px] lg:w-auto"
        leftIcon={<Calendar size={14} />}
        placeholder={loading ? "Loading runs…" : "เลือก run"}
        aria-label="Prediction run"
        options={runs.map((r) => ({
          value: r.id,
          label: `${r.name} · cutoff ${r.cutoff_date}`,
        }))}
      />
    </div>
  );
}
