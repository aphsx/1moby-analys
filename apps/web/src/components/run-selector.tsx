"use client";
/**
 * Scope row under the page title (docs/ui/DESIGN.md §6.1): the prediction run that binds /,
 * /customers and /customers/[id] on the left, the freshness stamp on the right. Defaults to the
 * latest completed run.
 */
import Link from "next/link";
import { Select } from "@/components/select";
import { formatDate } from "@/lib/format";
import { useActiveRun } from "@/stores/run-store";

export function RunScope() {
  const { run, runs, runId, setRunId, loading } = useActiveRun();

  if (!loading && runs.length === 0) {
    return (
      <p className="text-small text-muted">
        ยังไม่มีผลทำนาย · สร้างรอบทำนายแรกได้ที่{" "}
        <Link href="/runs" className="text-accent-ink underline underline-offset-2">
          รอบทำนาย
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <label className="flex min-w-0 items-center gap-2 text-small text-muted">
        รอบทำนาย
        <Select
          value={runId}
          onChange={setRunId}
          disabled={loading}
          size="md"
          className="min-w-0 sm:min-w-[240px]"
          placeholder={loading ? "กำลังโหลด…" : "เลือกรอบทำนาย"}
          aria-label="รอบทำนาย"
          options={runs.map((r) => ({ value: r.id, label: `${r.name} · ${formatDate(r.cutoff_date)}` }))}
        />
      </label>
      {run ? <p className="num text-small text-muted">ข้อมูลถึง {formatDate(run.cutoff_date)}</p> : null}
    </div>
  );
}
