"use client";
/**
 * Model training surface (redesigned). Two sections only:
 *   1. TrainPanel       — pick/upload a dataset → Train (cutoff/horizon in Advanced)
 *   2. ModelStatusCards — production champion + latest result + version management
 * This view owns all state: data sources (load/upload/select/delete) and training
 * runs (create/poll/suggested cutoff). The old upload section, dataset table,
 * training-history table, result cards, and version section are gone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifyStatusDialog } from "@/components/global-status-dialog-host";
import { StatusDialog } from "@/components/status-dialog";
import { Skeleton } from "@/components/ui";
import {
  deleteTrainDataSource,
  fetchTrainDataSources,
  type TrainDataSource,
  uploadTrainDataFileWithProgress,
} from "@/lib/api";
import {
  createTrainingRun,
  fetchTrainingRuns,
  fetchTrainSuggestedCutoff,
  type RunStatus,
  type TrainingRun,
} from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { ModelStatusCards } from "./model-status-cards";
import { TrainPanel } from "./train-panel";
import { TrainingHistoryTable } from "./training-history-table";
import { promotedSummary } from "./training-run-utils";
import { getTimestamp, wait } from "./training-utils";

const POLL_INTERVAL_MS = 3000;
const XLSX_EXTENSION_RE = /\.xlsx$/i;

function isActiveRunStatus(status: RunStatus) {
  return status === "in_progress" || status === "pending";
}

/** Sort newest-first and fire completion/failure toasts on status transitions. */
function applyTrainingRuns(
  runs: TrainingRun[],
  knownStatuses: Map<string, RunStatus>
): TrainingRun[] {
  const sorted = runs
    .slice()
    .sort((a, b) => getTimestamp(b.started_at) - getTimestamp(a.started_at));

  for (const run of sorted) {
    const previous = knownStatuses.get(run.id);
    if (previous === undefined) {
      knownStatuses.set(run.id, run.status);
      continue;
    }
    if (previous === run.status) {
      continue;
    }

    if (isActiveRunStatus(previous) && run.status === "completed") {
      const promoted = promotedSummary(run.results);
      notifyStatusDialog({
        message: promoted
          ? `Training pipeline เสร็จแล้ว (${promoted})`
          : "Training pipeline เสร็จแล้ว — ดูผลลัพธ์ด้านล่าง",
        title: "เทรนโมเดลสำเร็จ",
        tone: "success",
      });
    } else if (isActiveRunStatus(previous) && run.status === "failed") {
      notifyStatusDialog({
        message: run.error_message ?? "เกิดข้อผิดพลาดระหว่าง training pipeline",
        title: "เทรนโมเดลไม่สำเร็จ",
        tone: "error",
      });
    }

    knownStatuses.set(run.id, run.status);
  }

  return sorted;
}

export function TrainingView() {
  const [trainSources, setTrainSources] = useState<TrainDataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Upload state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStep, setImportStep] = useState("");
  const [importPhase, setImportPhase] = useState<"raw" | "clean" | null>(null);

  // Delete-source state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteSource, setPendingDeleteSource] =
    useState<TrainDataSource | null>(null);

  // Training-run state
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [trainError, setTrainError] = useState<string | null>(null);
  const [suggestedCutoff, setSuggestedCutoff] = useState<string | null>(null);
  const [latestDataDate, setLatestDataDate] = useState<string | null>(null);
  const knownStatusesRef = useRef<Map<string, RunStatus>>(new Map());

  const loadSources = useCallback(async () => {
    setLoadError(null);
    try {
      const sources = await fetchTrainDataSources().catch(
        () => [] as TrainDataSource[]
      );
      setTrainSources(Array.isArray(sources) ? sources : []);
    } catch (e) {
      setTrainSources([]);
      setLoadError(getDisplayError(e, "Failed to load training workspace"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const readySources = useMemo(
    () => trainSources.filter((source) => source.import_status === "ready"),
    [trainSources]
  );
  const sortedReady = useMemo(
    () =>
      readySources
        .slice()
        .sort(
          (a, b) =>
            getTimestamp(b.imported_at || b.created_at) -
            getTimestamp(a.imported_at || a.created_at)
        ),
    [readySources]
  );
  const selectedSource =
    sortedReady.find((source) => source.id === selectedSourceId) ??
    sortedReady[0] ??
    null;

  useEffect(() => {
    if (sortedReady.length === 0) {
      setSelectedSourceId(null);
      return;
    }
    if (
      selectedSourceId &&
      sortedReady.some((source) => source.id === selectedSourceId)
    ) {
      return;
    }
    setSelectedSourceId(sortedReady[0]?.id ?? null);
  }, [selectedSourceId, sortedReady]);

  // Suggested cutoff for the selected dataset.
  const selectedSourceId2 = selectedSource?.id ?? null;
  useEffect(() => {
    setSuggestedCutoff(null);
    setLatestDataDate(null);
    if (!selectedSourceId2) {
      return;
    }
    let alive = true;
    fetchTrainSuggestedCutoff(selectedSourceId2)
      .then(({ suggested_cutoff, latest_data_date }) => {
        if (!alive) {
          return;
        }
        setSuggestedCutoff(suggested_cutoff);
        setLatestDataDate(latest_data_date);
      })
      .catch(() => {
        // TrainPanel falls back to its local default when no suggestion is available.
      });
    return () => {
      alive = false;
    };
  }, [selectedSourceId2]);

  // Training runs — load + poll while active.
  const loadRuns = useCallback(async () => {
    try {
      const data = await fetchTrainingRuns();
      setRuns(applyTrainingRuns(data, knownStatusesRef.current));
    } catch (e) {
      setTrainError(getDisplayError(e, "โหลดสถานะ training ไม่สำเร็จ"));
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const hasActiveRun = runs.some(
    (run) => run.status === "in_progress" || run.status === "pending"
  );
  useEffect(() => {
    if (!hasActiveRun) {
      return;
    }
    const timer = setInterval(() => void loadRuns(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveRun, loadRuns]);

  const handleUpload = async (file: File) => {
    const datasetName = file.name.replace(XLSX_EXTENSION_RE, "");
    setImporting(true);
    setImportProgress(1);
    setImportStep("Uploading Excel file...");
    setImportPhase(null);

    try {
      await uploadTrainDataFileWithProgress(
        file,
        datasetName,
        (event) => {
          setImportProgress(event.progress);
          setImportStep(event.step);
          if (event.phase) {
            setImportPhase(event.phase);
          }
        },
        undefined
      );
      setImportProgress(100);
      setImportStep("Import complete");
      await wait(450);
      await loadSources();
      notifyStatusDialog({
        message: "ระบบ import และ clean data เสร็จเรียบร้อย",
        title: "นำเข้าข้อมูลสำเร็จ",
        tone: "success",
      });
    } catch (e) {
      setImportProgress(0);
      setImportStep("");
      setImportPhase(null);
      const err = e as Error & { code?: string };
      notifyStatusDialog({
        message:
          err.code === "DUPLICATE_FILE"
            ? "ไฟล์นี้ถูกนำเข้าแล้ว เลือก dataset เดิมจากรายการได้เลย"
            : (getDisplayError(e, "นำเข้าข้อมูลไม่สำเร็จ") ??
              "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"),
        title: "นำเข้าข้อมูลไม่สำเร็จ",
        tone: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  const deleteSource = async (source: TrainDataSource) => {
    setDeletingId(source.id);
    setPendingDeleteSource(null);
    try {
      await deleteTrainDataSource(source.id);
      setTrainSources((prev) => prev.filter((item) => item.id !== source.id));
    } catch (e) {
      notifyStatusDialog({
        message:
          getDisplayError(e, "ลบ dataset ไม่สำเร็จ") ??
          "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
        title: "ลบ dataset ไม่สำเร็จ",
        tone: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleTrain = async (input: {
    cutoff_date: string;
    horizon_days: number;
  }) => {
    if (!selectedSource) {
      return;
    }
    setCreating(true);
    setTrainError(null);
    try {
      const run = await createTrainingRun({
        cutoff_date: input.cutoff_date,
        dataset_name: selectedSource.name,
        horizon_days: input.horizon_days,
        train_source_id: selectedSource.id,
      });
      knownStatusesRef.current.set(run.id, run.status);
      setRuns((prev) => [run, ...prev.filter((item) => item.id !== run.id)]);
    } catch (e) {
      setTrainError(getDisplayError(e, "เริ่ม training run ไม่สำเร็จ"));
    } finally {
      setCreating(false);
    }
  };

  const latestCompleted =
    runs.find(
      (run) => run.status === "completed" && (run.results?.length ?? 0) > 0
    ) ?? null;

  if (loading) {
    return (
      <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <Skeleton className="h-[220px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
      <div className="space-y-6">
        {(loadError || trainError) && (
          <div className="rounded-2xl border border-[color:var(--danger)] bg-[color:var(--danger-bg)] px-4 py-3 text-[13px] text-[color:var(--danger)]">
            {loadError ?? trainError}
          </div>
        )}

        <TrainPanel
          creating={creating}
          importing={importing}
          importPhase={importPhase}
          importProgress={importProgress}
          importStep={importStep}
          latestDataDate={latestDataDate}
          onDeleteSource={(source) => setPendingDeleteSource(source)}
          onSelect={(id) => setSelectedSourceId(id)}
          onTrain={handleTrain}
          onUpload={(file) => void handleUpload(file)}
          readySources={sortedReady}
          selectedSource={selectedSource}
          suggestedCutoff={suggestedCutoff}
        />

        <ModelStatusCards
          key={latestCompleted?.finished_at ?? "none"}
          latestRun={latestCompleted}
        />

        <TrainingHistoryTable loading={runsLoading} runs={runs} />
      </div>

      {pendingDeleteSource && (
        <StatusDialog
          cancelLabel="ยกเลิก"
          confirmLabel="ลบ dataset"
          loading={deletingId === pendingDeleteSource.id}
          message="ข้อมูล raw และ clean ทั้งหมดของ dataset นี้จะถูกลบถาวร"
          onCancel={() => setPendingDeleteSource(null)}
          onConfirm={() => void deleteSource(pendingDeleteSource)}
          open
          title="ยืนยันการลบ dataset"
          tone="warning"
        />
      )}
    </main>
  );
}
