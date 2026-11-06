"use client";
/**
 * Prediction runs list (redesigned, slim). 5 columns: run (+ source subtitle),
 * status (with inline progress / error), customers, when (relative), actions.
 * Polling while in_progress lives in RunsView.
 */

import { type PredictionRun } from "@moby/types";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, ListChecks, RefreshCw, Trash2 } from "lucide-react";
import { StatusDialog } from "@/components/status-dialog";
import {
  EmptyState, ProgressMeter, SectionCard, Skeleton, StatusPill, BUTTON } from "@/components/ui";
import { deletePredictionRun, retryPredictionRun } from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { formatCount } from "@/lib/format";
import { useRunStore } from "@/stores/run-store";
import { formatRelative, runStatusLabel, runStatusTone } from "./runs-utils";

/** Auto-created runs are named "Auto — {source} {YYYY-MM-DD}" by the import API. */
const AUTO_RUN_PREFIX = "Auto — ";

export function isAutoRun(run: Pick<PredictionRun, "name">): boolean {
  return run.name.startsWith(AUTO_RUN_PREFIX);
}

function AutoRunBadge() {
  return (
    <span
      title="run นี้ถูกสร้างอัตโนมัติหลัง import ข้อมูล predict"
      className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-accent-soft px-1.5 text-micro font-semibold text-accent"
    >
      อัตโนมัติ
    </span>
  );
}

const actionBtnCls = `${BUTTON.secondary} text-small`;

export function RunsTable({
  runs,
  loading,
  onRefresh,
}: {
  runs: PredictionRun[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const setRunId = useRunStore((s) => s.setRunId);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteRun, setPendingDeleteRun] = useState<PredictionRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openRun = (run: PredictionRun) => {
    setRunId(run.id);
    router.push("/");
  };

  const retry = async (run: PredictionRun) => {
    setRetryingId(run.id);
    setError(null);
    try {
      await retryPredictionRun(run.id);
      await onRefresh();
    } catch (e) {
      setError(getDisplayError(e, "Retry ไม่สำเร็จ") ?? "Retry ไม่สำเร็จ");
    } finally {
      setRetryingId(null);
    }
  };

  const remove = async (run: PredictionRun) => {
    setDeletingId(run.id);
    setError(null);
    try {
      await deletePredictionRun(run.id);
      setPendingDeleteRun(null);
      await onRefresh();
    } catch (e) {
      setError(getDisplayError(e, "ลบ run ไม่สำเร็จ") ?? "ลบ run ไม่สำเร็จ");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <SectionCard
                title="รอบทำนายล่าสุด"
        hint="หนึ่งแถวต่อหนึ่งรอบทำนาย เปิดรอบที่เสร็จแล้วเพื่อดูภาพรวม"
      >
        {error && (
          <div className="mb-4 rounded-card border border-negative bg-[var(--pill-negative-bg)] px-4 py-3 text-small text-negative">
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
            title="ยังไม่มีรอบทำนาย · นำเข้าข้อมูลแล้วสร้างรอบแรก"
            hint="เลือก predict source ที่ ready แล้วกด รัน ด้านบน"
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>รอบทำนาย</th>
                  <th>สถานะ</th>
                  <th className="text-right">ลูกค้า</th>
                  <th>เมื่อไหร่</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    retrying={retryingId === run.id}
                    deleting={deletingId === run.id}
                    onOpen={() => openRun(run)}
                    onRetry={() => void retry(run)}
                    onDelete={() => setPendingDeleteRun(run)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {pendingDeleteRun && (
        <StatusDialog
          open
          tone="warning"
          title="ยืนยันการลบผลลัพธ์ทำนายรอบนี้"
          confirmLabel="ลบ run"
          cancelLabel="ยกเลิก"
          loading={deletingId === pendingDeleteRun.id}
          onCancel={() => setPendingDeleteRun(null)}
          onConfirm={() => void remove(pendingDeleteRun)}
        />
      )}
    </>
  );
}

function RunRow({
  run,
  retrying,
  deleting,
  onOpen,
  onRetry,
  onDelete,
}: {
  run: PredictionRun;
  retrying: boolean;
  deleting: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const inProgress = run.status === "in_progress";
  return (
    <tr>
      <td>
        <div className="flex max-w-[340px] items-center gap-1.5 font-medium text-text">
          <span className="min-w-0 truncate" title={run.name}>{run.name}</span>
          {isAutoRun(run) && <AutoRunBadge />}
        </div>
        <div className="max-w-[340px] truncate text-micro text-faint">
          {run.predict_source_name}
          {run.created_by_name ? ` · โดย ${run.created_by_name}` : ""}
        </div>
      </td>
      <td>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <StatusPill tone={runStatusTone(run.status)} loading={inProgress}>
              {runStatusLabel(run.status)}
            </StatusPill>
            {run.status === "failed" && run.error_message && (
              <span
                className="max-w-[180px] truncate text-micro text-negative"
                title={run.error_message}
              >
                {run.error_message}
              </span>
            )}
            {run.status === "completed" && run.warnings.length > 0 && (
              <span
                className="flex max-w-[220px] items-center gap-1 truncate text-micro text-warning"
                title={run.warnings.join("\n")}
              >
                <AlertTriangle size={11} className="shrink-0" />
                {run.warnings[0]}
              </span>
            )}
          </div>
          {inProgress && run.progress && (
            <div className="max-w-[240px]">
              <ProgressMeter value={run.progress.pct} label={run.progress.step} />
            </div>
          )}
        </div>
      </td>
      <td className="text-right num">{run.total_customers != null ? formatCount(run.total_customers) : "—"}</td>
      <td className="whitespace-nowrap text-text">
        {formatRelative(run.finished_at ?? run.created_at)}
      </td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {run.status === "completed" && (
            <button type="button" onClick={onOpen} className={actionBtnCls}>
              เปิด <ChevronRight size={11} />
            </button>
          )}
          {run.status === "failed" && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className={actionBtnCls}
            >
              <RefreshCw size={11} className={retrying ? "animate-spin" : undefined} />
              ลองใหม่
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-[var(--pill-negative-bg)] hover:text-negative disabled:cursor-not-allowed disabled:opacity-40"
            title="ลบ run"
          >
            {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </td>
    </tr>
  );
}
