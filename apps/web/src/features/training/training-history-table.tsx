"use client";
/**
 * Training history — one row per training run (all runs, newest first).
 * Shows status, creator, cutoff/horizon, when it ran, duration, and the
 * gate/promotion outcome. Any authenticated user can delete a finished run
 * (blocked if prediction runs still reference models from this run; production
 * champions owned by the run are auto-repointed or cleared when safe).
 */

import { type TrainingRun } from "@moby/types";
import { useState } from "react";
import { History, RefreshCw, Trash2 } from "lucide-react";
import { StatusDialog } from "@/components/status-dialog";
import { EmptyState, ProgressMeter, SectionCard, Skeleton, StatusPill } from "@/components/ui";
import { deleteTrainingRun } from "@/lib/ml-api";
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
        className="block max-w-[260px] truncate text-micro text-negative"
        title={run.error_message ?? undefined}
      >
        {run.error_message ?? "ล้มเหลว"}
      </span>
    );
  }
  if (run.status !== "completed") {
    return <span className="text-faint">—</span>;
  }
  const promoted = promotedSummary(run.results);
  const primary = primaryResultSummary(run.results);
  if (!promoted && !primary) {
    return <span className="text-faint">ไม่มีผลลัพธ์</span>;
  }
  return (
    <div className="min-w-0">
      {promoted && <div className="font-medium text-text">{promoted}</div>}
      {primary && <div className="text-micro text-faint">{primary}</div>}
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
  const [notice, setNotice] = useState<string | null>(null);

  function formatDeleteNotice(result: Awaited<ReturnType<typeof deleteTrainingRun>>): string | null {
    const parts: string[] = [];
    for (const item of result.production_repointed ?? []) {
      parts.push(`${item.model_type}: สลับ production จาก ${item.from_version} → ${item.to_version}`);
    }
    for (const item of result.production_cleared ?? []) {
      parts.push(
        `${item.model_type}: ยกเลิก production (${item.from_version}) — ต้องเทรนใหม่ก่อน predict`
      );
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  async function remove(run: TrainingRun) {
    setDeletingId(run.id);
    setError(null);
    setNotice(null);
    try {
      const result = await deleteTrainingRun(run.id);
      setPendingDelete(null);
      setNotice(formatDeleteNotice(result));
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
        eyebrow="ประวัติการเทรน"
        title="ประวัติการเทรนทั้งหมด"
        hint="หนึ่งแถวต่อหนึ่งรอบเทรน — ใหม่สุดอยู่บน · ลบได้ถ้าไม่มี prediction ที่ใช้โมเดลจากรอบนั้น (production จะสลับอัตโนมัติถ้ามีเวอร์ชันอื่น)"
      >
        {notice && (
          <div className="mb-3 rounded-control border border-positive bg-[var(--pill-positive-bg)] px-3 py-2 text-small text-positive">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-control border border-negative bg-[var(--pill-negative-bg)] px-3 py-2 text-small text-negative">
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
            title="ยังไม่มี training run"
            hint="เลือก dataset ที่ Ready แล้วกด เทรน ด้านบน"
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="data-table min-w-[860px]">
              <thead>
                <tr>
                  <th>ชุดข้อมูล</th>
                  <th>สถานะ</th>
                  <th>โดย</th>
                  <th>วันตัดข้อมูล</th>
                  <th>เมื่อไหร่</th>
                  <th className="text-right">ใช้เวลา</th>
                  <th>ผลเกณฑ์ปล่อยใช้</th>
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
                        <div className="font-medium text-text">{run.dataset_name}</div>
                        <div className="text-micro text-faint">
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
                      <td className="text-text">{run.created_by_name ?? "—"}</td>
                      <td className="num text-text">{run.cutoff_date}</td>
                      <td className="whitespace-nowrap text-text">{formatRelative(run.started_at)}</td>
                      <td className="num text-right text-text">
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
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-[var(--pill-negative-bg)] hover:text-negative disabled:cursor-not-allowed disabled:opacity-40"
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
