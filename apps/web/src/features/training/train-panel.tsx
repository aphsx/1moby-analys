"use client";

/**
 * Train card (redesigned). One card does the whole job:
 *   pick (or upload) a Ready dataset → Train.
 * Cutoff is auto-managed and only surfaces in Advanced (with horizon).
 * Uploading a new dataset happens inline via the "upload ใหม่" toggle next to
 * the dataset picker — there is no separate dataset table anymore.
 */

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
import { useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/ui";
import type { TrainDataSource } from "@/lib/api";
import { ADMIN_ONLY_TITLE, useIsAdmin } from "@/lib/auth";
import { ProgressCard } from "./progress-card";
import { DEFAULT_HORIZON_DAYS } from "./training-run-utils";
import {
  formatFileSize,
  getCleanCounts,
  PRIMARY_BUTTON_CLS,
} from "./training-utils";

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
  // Import / training / dataset deletion are admin-only (the API returns 403).
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const adminLocked = !(roleLoading || isAdmin);

  useEffect(() => {
    setCutoffDate("");
    setHorizonDays(DEFAULT_HORIZON_DAYS);
  }, [selectedSource?.id]);

  useEffect(() => {
    if (suggestedCutoff) {
      setCutoffDate(suggestedCutoff);
    }
  }, [suggestedCutoff]);

  const horizonValid = Number.isInteger(horizonDays) && horizonDays > 0;
  const canTrain =
    Boolean(selectedSource) &&
    Boolean(cutoffDate) &&
    horizonValid &&
    !creating &&
    !adminLocked;
  const counts = selectedSource ? getCleanCounts(selectedSource) : null;

  return (
    <SectionCard
      eyebrow="Training"
      hint="เลือก dataset แล้วกดเทรน — ระบบจัดการ cutoff, leakage และเลือกโมเดลที่ดีที่สุดให้อัตโนมัติ"
      right={
        <button
          className={`${PRIMARY_BUTTON_CLS} sm:min-w-[140px]`}
          disabled={!canTrain}
          onClick={() =>
            onTrain({ cutoff_date: cutoffDate, horizon_days: horizonDays })
          }
          title={adminLocked ? ADMIN_ONLY_TITLE : undefined}
          type="button"
        >
          {creating ? (
            <RefreshCw className="animate-spin" size={16} />
          ) : (
            <Play size={16} />
          )}
          {creating ? "กำลังเริ่ม…" : "เทรน"}
        </button>
      }
    >
      <div className="relative">
        <span className="type-label">dataset</span>
        <div className="mt-1.5 flex items-center gap-2">
          <select
            className="h-11 min-w-0 flex-1 rounded-2xl border border-gray-200 bg-white px-3.5 text-[13px] text-[color:var(--ink-2)] shadow-[var(--shadow-1)] outline-none transition-colors focus:border-[color:var(--moby-500)] disabled:opacity-50"
            disabled={creating || readySources.length === 0}
            onChange={(e) => onSelect(e.target.value)}
            value={selectedSource?.id ?? ""}
          >
            {readySources.length === 0 && (
              <option value="">ยังไม่มี dataset ที่ ready</option>
            )}
            {readySources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.client_label ? ` · ${s.client_label}` : ""}
              </option>
            ))}
          </select>
          {selectedSource && (
            <button
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-[color:var(--ink-4)] shadow-[var(--shadow-1)] hover:border-[color:var(--danger)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={adminLocked}
              onClick={() => onDeleteSource(selectedSource)}
              title={adminLocked ? ADMIN_ONLY_TITLE : "ลบ dataset นี้"}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 font-semibold text-[12.5px] text-[color:var(--moby-600)] shadow-[var(--shadow-1)] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={adminLocked}
            onClick={() => setShowUpload((v) => !v)}
            title={adminLocked ? ADMIN_ONLY_TITLE : undefined}
            type="button"
          >
            <UploadCloud size={14} />
            upload ใหม่
          </button>
        </div>

        <p className="mt-2 text-[12px] text-[color:var(--ink-5)]">
          {selectedSource
            ? `${counts ? `${counts.customers.toLocaleString()} แถว · ` : ""}${
                selectedSource.created_by_name
                  ? `นำเข้าโดย ${selectedSource.created_by_name} · `
                  : ""
              }cutoff ${
                cutoffDate || "—"
              } (อัตโนมัติ${latestDataDate ? `, ข้อมูลล่าสุด ${latestDataDate}` : ""}) · horizon ${horizonDays} วัน`
            : "เลือก dataset ที่ Ready หรือ upload ไฟล์ Excel ใหม่"}
        </p>

        {showUpload && (
          <UploadForm
            importing={importing}
            onClose={() => setShowUpload(false)}
            onUpload={onUpload}
            uploadRef={uploadRef}
          />
        )}
      </div>

      {importing && (
        <ProgressCard
          phase={importPhase}
          progress={importProgress}
          step={importStep}
          training={false}
        />
      )}

      <div className="mt-4 border-gray-100 border-t pt-4">
        <button
          className="inline-flex items-center gap-2 font-medium text-[12.5px] text-[color:var(--ink-3)] hover:text-[color:var(--moby-600)]"
          onClick={() => setShowAdvanced((v) => !v)}
          type="button"
        >
          <ChevronDown
            className={`transition-transform ${showAdvanced ? "rotate-0" : "-rotate-90"}`}
            size={14}
          />
          <SlidersHorizontal size={13} />
          ตั้งค่าขั้นสูง — horizon
        </button>
        {showAdvanced && (
          <div className="mt-3">
            <label className="block">
              <span className="type-label">Horizon (days)</span>
              <input
                className={`${fieldCls} max-w-[200px]`}
                min={1}
                onChange={(e) =>
                  setHorizonDays(Number.parseInt(e.target.value, 10))
                }
                step={1}
                type="number"
                value={Number.isNaN(horizonDays) ? "" : horizonDays}
              />
              <span className="mt-1.5 block text-[12px] text-[color:var(--ink-4)] leading-5">
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
    <div className="absolute top-full right-0 left-0 z-10 mt-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_20px_48px_rgba(13,17,35,0.12)]">
      <div className="flex items-center justify-between">
        <span className="type-label">นำเข้า dataset ใหม่ (.xlsx 8 sheets)</span>
        <button
          aria-label="ปิด"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ink-5)] hover:bg-gray-50"
          onClick={onClose}
          type="button"
        >
          <X size={14} />
        </button>
      </div>

      <input
        accept=".xlsx"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        ref={uploadRef}
        type="file"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3.5 font-semibold text-[12.5px] text-[color:var(--moby-600)] shadow-[var(--shadow-1)] hover:bg-gray-50 disabled:opacity-40"
          disabled={importing}
          onClick={() => uploadRef.current?.click()}
          type="button"
        >
          <FileSpreadsheet size={14} />
          เลือกไฟล์
        </button>
        <span
          className="min-w-0 flex-1 truncate text-[12px] text-[color:var(--ink-4)]"
          title={file?.name}
        >
          {file
            ? `${file.name} · ${formatFileSize(file.size)}`
            : "ยังไม่ได้เลือกไฟล์"}
        </span>
        <button
          className={PRIMARY_BUTTON_CLS}
          disabled={importing || !file}
          onClick={() => {
            if (!file) {
              return;
            }
            onUpload(file);
            setFile(null);
            onClose();
          }}
          type="button"
        >
          <UploadCloud size={16} />
          Upload and clean
        </button>
      </div>
    </div>
  );
}
