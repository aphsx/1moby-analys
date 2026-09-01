"use client";
/**
 * Train card (redesigned). One card does the whole job:
 *   pick (or upload) a Ready dataset → Train.
 * Cutoff is auto-managed and only surfaces in Advanced (with horizon).
 * Uploading a new dataset happens inline via the "upload ใหม่" toggle next to
 * the dataset picker — there is no separate dataset table anymore.
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileSpreadsheet,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { SectionCard } from "@/components/ui";
import { Select } from "@/components/select";
import type { TrainDataSource } from "@/lib/api";
import { ProgressCard } from "./progress-card";
import { formatFileSize, getCleanCounts, PRIMARY_BUTTON_CLS } from "./training-utils";
import { DEFAULT_HORIZON_DAYS } from "./training-run-utils";

const fieldCls =
  "mt-1.5 h-11 w-full rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)] outline-none transition-colors focus:border-[color:var(--moby-500)] disabled:opacity-50";

export function TrainPanel({
  readySources,
  selectedSource,
  onSelect,
  onDeleteSource,
  onUpload,
  importing,
  importProgress,
  importStep,
  importPhase,
  suggestedCutoff,
  latestDataDate,
  creating,
  trainingInProgress,
  onTrain,
}: {
  readySources: TrainDataSource[];
  selectedSource: TrainDataSource | null;
  onSelect: (id: string) => void;
  onDeleteSource: (source: TrainDataSource) => void;
  onUpload: (file: File) => void;
  importing: boolean;
  importProgress: number;
  importStep: string;
  importPhase: "raw" | "clean" | null;
  suggestedCutoff: string | null;
  latestDataDate: string | null;
  creating: boolean;
  trainingInProgress: boolean;
  onTrain: (input: { cutoff_date: string; horizon_days: number }) => void;
}) {
  // Training cutoff is fully auto-managed: the API picks the latest cutoff that
  // still has a complete label horizon (leakage-safe). It is sent to the run but
  // not user-editable — manual cutoff is only meaningful for replay/backtest.
  const [cutoffDate, setCutoffDate] = useState("");
  const [horizonDays, setHorizonDays] = useState<number>(DEFAULT_HORIZON_DAYS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCutoffDate("");
    setHorizonDays(DEFAULT_HORIZON_DAYS);
  }, [selectedSource?.id]);

  useEffect(() => {
    if (suggestedCutoff) setCutoffDate(suggestedCutoff);
  }, [suggestedCutoff]);

  const horizonValid = Number.isInteger(horizonDays) && horizonDays > 0;
  const trainBusy = creating || trainingInProgress;
  const canTrain =
    Boolean(selectedSource) && Boolean(cutoffDate) && horizonValid && !trainBusy;
  const counts = selectedSource ? getCleanCounts(selectedSource) : null;

  return (
    <SectionCard
      eyebrow="Training"
      title="เริ่มเทรน"
      hint="เลือก dataset แล้วกดเทรน — ระบบจัดการ cutoff, leakage และเลือกโมเดลที่ดีที่สุดให้อัตโนมัติ"
      right={
        <button
          type="button"
          disabled={!canTrain}
          onClick={() => onTrain({ cutoff_date: cutoffDate, horizon_days: horizonDays })}
          className={`${PRIMARY_BUTTON_CLS} w-full sm:w-auto sm:min-w-[140px]`}
        >
          {trainBusy ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {creating ? "กำลังเริ่ม…" : trainingInProgress ? "กำลังเทรน…" : "เทรน"}
        </button>
      }
    >
      <div>
        <span className="type-label">dataset</span>
        <div className="mt-1.5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Select
            value={selectedSource?.id ?? ""}
            onChange={onSelect}
            disabled={trainBusy || readySources.length === 0}
            size="lg"
            className="min-w-0 flex-1"
            placeholder="ยังไม่มี dataset ที่ ready"
            aria-label="Training dataset"
            options={readySources.map((s) => ({
              value: s.id,
              label: s.client_label ? `${s.name} · ${s.client_label}` : s.name,
            }))}
          />
          {selectedSource && (
            <button
              type="button"
              onClick={() => onDeleteSource(selectedSource)}
              className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-[color:var(--ink-4)] shadow-[var(--shadow-1)] hover:border-[color:var(--danger)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:cursor-not-allowed disabled:opacity-45 sm:w-11"
              title="ลบ dataset นี้"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 text-[12.5px] font-semibold text-[color:var(--moby-600)] shadow-[var(--shadow-1)] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 sm:justify-start"
          >
            <UploadCloud size={14} />
            upload ใหม่
          </button>
        </div>

        <p className="mt-2 text-[12px] text-[color:var(--ink-5)]">
          {selectedSource
            ? `${counts ? `${counts.customers.toLocaleString()} แถว · ` : ""}${
                selectedSource.created_by_name ? `นำเข้าโดย ${selectedSource.created_by_name} · ` : ""
              }cutoff ${
                cutoffDate || "—"
              } (อัตโนมัติ${latestDataDate ? `, ข้อมูลล่าสุด ${latestDataDate}` : ""}) · horizon ${horizonDays} วัน`
            : "เลือก dataset ที่ Ready หรือ upload ไฟล์ Excel ใหม่"}
        </p>

        {showUpload && (
          <UploadForm
            uploadRef={uploadRef}
            importing={importing}
            onClose={() => setShowUpload(false)}
            onUpload={onUpload}
          />
        )}
      </div>

      {importing && (
        <ProgressCard
          training={false}
          progress={importProgress}
          step={importStep}
          phase={importPhase}
        />
      )}

      {trainingInProgress && !importing && (
        <ProgressCard training progress={100} step="" phase={null} />
      )}

      <div className="mt-4 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[color:var(--ink-3)] hover:text-[color:var(--moby-600)]"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${showAdvanced ? "rotate-0" : "-rotate-90"}`}
          />
          <SlidersHorizontal size={13} />
          ตั้งค่าขั้นสูง — horizon
        </button>
        {showAdvanced && (
          <div className="mt-3">
            <label className="block">
              <span className="type-label">Horizon (days)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={Number.isNaN(horizonDays) ? "" : horizonDays}
                onChange={(e) => setHorizonDays(Number.parseInt(e.target.value, 10))}
                className={`${fieldCls} max-w-[200px]`}
              />
              <span className="mt-1.5 block text-[12px] leading-5 text-[color:var(--ink-4)]">
                default {DEFAULT_HORIZON_DAYS} วัน — เปลี่ยนเฉพาะเมื่อรู้ว่าทำอะไรอยู่
              </span>
              {!horizonValid && (
                <span className="mt-1 block text-[12px] text-[color:var(--danger)]">
                  Horizon ต้องเป็นจำนวนวันที่มากกว่า 0
                </span>
              )}
            </label>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function UploadForm({
  uploadRef,
  importing,
  onClose,
  onUpload,
}: {
  uploadRef: React.RefObject<HTMLInputElement>;
  importing: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center justify-between">
        <span className="type-label">นำเข้า dataset ใหม่ (.xlsx 8 sheets)</span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ink-5)] hover:bg-gray-50"
          aria-label="ปิด"
        >
          <X size={14} />
        </button>
      </div>

      <input
        ref={uploadRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          disabled={importing}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 text-[12.5px] font-semibold text-[color:var(--moby-600)] shadow-[var(--shadow-1)] hover:bg-gray-50 disabled:opacity-40"
        >
          <FileSpreadsheet size={14} />
          เลือกไฟล์
        </button>
        <span className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--ink-4)]" title={file?.name}>
          {file ? `${file.name} · ${formatFileSize(file.size)}` : "ยังไม่ได้เลือกไฟล์"}
        </span>
        <button
          type="button"
          onClick={() => {
            if (!file) return;
            onUpload(file);
            setFile(null);
            onClose();
          }}
          disabled={importing || !file}
          className={PRIMARY_BUTTON_CLS}
        >
          <UploadCloud size={16} />
          Upload and clean
        </button>
      </div>
    </div>
  );
}
