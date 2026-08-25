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
        className="h-9 px-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white text-[13px] text-[color:var(--ink-3)] hover:border-[color:var(--moby-200)]"
      >
        <Calendar size={14} className="text-[color:var(--ink-4)]" />
        ยังไม่มี prediction run — สร้างที่หน้า Runs
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={runId}
        onChange={setRunId}
        disabled={loading}
        size="md"
        className="min-w-[230px]"
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
