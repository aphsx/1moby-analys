"use client";
/**
 * Scope row under the page title (docs/ui/DESIGN.md §6.1): the prediction run that binds /,
 * /customers and /customers/[id] on the left, the freshness stamp on the right. Defaults to the
 * latest completed run.
 */
import Link from "next/link";
import { Select } from "@/components/select";
import { BUTTON, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useActiveRun } from "@/stores/run-store";

/**
 * What a run-bound page shows without a run: the run list failed to load (with a retry), or there is
 * no completed run yet.
 */
export function NoRunState() {
  const { error, reload } = useActiveRun();
  if (error) {
    return (
      <EmptyState
        title="โหลดรายการรอบทำนายไม่สำเร็จ"
        hint={error}
        action={
          <button type="button" onClick={() => void reload()} className={BUTTON.secondary}>
            ลองอีกครั้ง
          </button>
        }
      />
    );
  }
  return (
    <EmptyState
      title="ยังไม่มีผลทำนาย"
      hint="อัปโหลดข้อมูลแล้วสร้างรอบทำนายแรกได้ที่ “รอบทำนาย”"
      action={<Link href="/runs" className={BUTTON.primary}>สร้างรอบทำนาย</Link>}
    />
  );
}

export function RunScope() {
  const { run, runs, runId, setRunId, loading, error } = useActiveRun();

  if (error) return <p className="text-small text-negative">โหลดรายการรอบทำนายไม่สำเร็จ</p>;

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
      <label className="flex min-w-0 items-center gap-2 whitespace-nowrap text-small text-muted">
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
