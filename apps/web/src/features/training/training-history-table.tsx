"use client";
/**
 * Training history — one row per training run (all runs, newest first).
 * Shows status, creator, cutoff/horizon, when it ran, duration, and the
 * gate/promotion outcome. Any authenticated user can delete a finished run
 * (blocked if production or prediction runs still reference models from this run).
 */

import { useState } from "react";
import { History, RefreshCw, Trash2 } from "lucide-react";
import { StatusDialog } from "@/components/status-dialog";
import { EmptyState, ProgressMeter, SectionCard, Skeleton, StatusPill } from "@/components/ui";
import { deleteTrainingRun, type TrainingRun } from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { formatRelative } from "@/features/runs/runs-utils";
import {
  primaryResultSummary,
  promotedSummary,
  runStatusLabel,
  runStatusTone,
} from "./training-run-utils";
import { getTimestamp } from "./training-utils";

/** "1 ชม. 12 นาที" / "12 นาที" / "45 วิ" — duration between start and finish. */
function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  const ms = getTimestamp(finishedAt) - getTimestamp(startedAt);
  if (ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} วิ`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} นาที`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
}

function GateResultCell({ run }: { run: TrainingRun }) {
  if (run.status === "failed") {
    return (
      <span
        className="block max-w-[260px] truncate text-[11.5px] text-[color:var(--danger)]"
        title={run.error_message ?? undefined}
      >
        {run.error_message ?? "ล้มเหลว"}
      </span>
    );
  }
  if (run.status !== "completed") {
    return <span className="text-[color:var(--ink-5)]">—</span>;
  }
  const promoted = promotedSummary(run.results);
  const primary = primaryResultSummary(run.results);
  if (!promoted && !primary) {
    return <span className="text-[color:var(--ink-5)]">ไม่มีผลลัพธ์</span>;
  }
  return (
    <div className="min-w-0">
      {promoted && <div className="font-medium text-[color:var(--ink-2)]">{promoted}</div>}
      {primary && <div className="text-[11.5px] text-[color:var(--ink-5)]">{primary}</div>}
    </div>
  );
}

export function TrainingHistoryTable({
  runs,
  loading,
  onDeleted,
}: {
  runs: TrainingRun[];
  loading: boolean;
  /** Called after a successful delete so the parent can refresh runs / model cards. */
  onDeleted?: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TrainingRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(run: TrainingRun) {
    setDeletingId(run.id);
    setError(null);
    try {
      await deleteTrainingRun(run.id);
      setPendingDelete(null);
      onDeleted?.();
    } catch (e: unknown) {
      setError(getDisplayError(e, "ลบ training run ไม่สำเร็จ") ?? "ลบ training run ไม่สำเร็จ");
      setPendingDelete(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <SectionCard
        eyebrow="Training history"
        title="ประวัติการเทรนทั้งหมด"
        hint="หนึ่งแถวต่อหนึ่งรอบเทรน — ใหม่สุดอยู่บน · ลบได้ถ้าไม่ใช่ production และไม่มี prediction ที่ใช้โมเดลจากรอบนั้น"
      >
        {error && (
          <div className="mb-3 rounded-xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-3 py-2 text-[12.5px] text-[color:var(--danger)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={History}
            title="ยังไม่มี training run"
            hint="เลือก dataset ที่ Ready แล้วกด เทรน ด้านบน"
          />
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-gray-200">
            <table className="table-base min-w-[860px]">
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Status</th>
                  <th>โดย</th>
                  <th>Cutoff</th>
                  <th>เมื่อไหร่</th>
                  <th className="text-right">ใช้เวลา</th>
                  <th>ผล gate</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const inProgress = run.status === "in_progress" || run.status === "pending";
                  const canDelete = !inProgress;
                  return (
                    <tr key={run.id}>
                      <td>
                        <div className="font-medium text-[color:var(--ink-1)]">{run.dataset_name}</div>
                        <div className="text-[11.5px] text-[color:var(--ink-5)]">
                          horizon {run.horizon_days} วัน
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1.5">
                          <StatusPill tone={runStatusTone(run.status)} loading={inProgress}>
                            {runStatusLabel(run.status)}
                          </StatusPill>
                          {inProgress && run.progress && (
                            <div className="max-w-[200px]">
                              <ProgressMeter value={run.progress.pct} label={run.progress.phase} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="text-[color:var(--ink-3)]">{run.created_by_name ?? "—"}</td>
                      <td className="num text-[color:var(--ink-3)]">{run.cutoff_date}</td>
                      <td className="text-[color:var(--ink-3)]">{formatRelative(run.started_at)}</td>
                      <td className="num text-right text-[color:var(--ink-3)]">
                        {formatDuration(run.started_at, run.finished_at)}
                      </td>
                      <td>
                        <GateResultCell run={run} />
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => setPendingDelete(run)}
                          disabled={deletingId === run.id || !canDelete}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ink-4)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            inProgress
                              ? "รอให้เทรนจบก่อน"
                              : "ลบรอบเทรนนี้ (และโมเดลจากรอบนี้)"
                          }
                        >
                          {deletingId === run.id ? (
                            <RefreshCw size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {pendingDelete && (
        <StatusDialog
          open
          tone="warning"
          title="ยืนยันการลบรอบเทรนนี้"
          message="ประวัติรอบเทรนและไฟล์โมเดล (.pkl) จากรอบนี้จะถูกลบถาวร — ถ้ายังมี prediction ที่ใช้โมเดลจากรอบนี้ หรือยังเป็น production อยู่ จะลบไม่ได้"
          confirmLabel="ลบรอบเทรน"
          cancelLabel="ยกเลิก"
          loading={deletingId === pendingDelete.id}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove(pendingDelete)}
        />
      )}
    </>
  );
}
