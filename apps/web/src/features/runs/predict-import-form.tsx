"use client";
/** Inline import of a new Predict Data Source, opened from the create-run card. */
import { useRef, useState } from "react";
import { FileSpreadsheet, RefreshCw, UploadCloud, X } from "lucide-react";
import { notifyStatusDialog } from "@/components/global-status-dialog-host";
import { uploadPredictDataFile } from "@/lib/api";
import { getImportErrorMessage } from "@/lib/ui-error";
import { FIELD_CLASS } from "./runs-utils";

export function PredictImportForm({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doImport = async () => {
    if (!file || busy) return;
    const datasetName = name.trim() || file.name.replace(/\.xlsx$/i, "");
    setBusy(true);
    setError(null);
    try {
      const result = await uploadPredictDataFile(file, datasetName, clientLabel.trim() || undefined);
      await onImported();
      // The import auto-creates + triggers a prediction run — surface it so the
      // user knows the new run in the history table is already underway.
      if (result.auto_prediction_run_id) {
        notifyStatusDialog({
          tone: "success",
          title: "นำเข้าข้อมูลสำเร็จ",
          message: `ระบบเริ่มรอบทำนายให้อัตโนมัติแล้ว (Auto — ${datasetName}) ติดตามสถานะได้จากตารางด้านล่าง`,
        });
      }
    } catch (e) {
      setError(getImportErrorMessage(e, "นำเข้าข้อมูลไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-card border border-border bg-surface p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center justify-between">
        <span className="text-small text-muted">นำเข้า predict data ใหม่ (.xlsx 8 sheets)</span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-faint hover:bg-raised"
          aria-label="ปิด"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] sm:items-end">
        <div>
          <span className="text-small text-muted">ไฟล์ Excel</span>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card border border-border bg-surface px-3.5 text-small font-semibold text-accent shadow-[var(--shadow-1)] hover:bg-raised disabled:opacity-40"
            >
              <FileSpreadsheet size={14} />
              เลือกไฟล์
            </button>
            <span className="min-w-0 truncate text-micro text-muted" title={file?.name}>
              {file ? file.name : "ยังไม่ได้เลือก"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </div>
        </div>

        <label className="block">
          <span className="text-small text-muted">ชื่อ</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={file ? file.name.replace(/\.xlsx$/i, "") : "เช่น Customers 2026-06"}
            disabled={busy}
            className={FIELD_CLASS}
          />
        </label>

        <label className="block">
          <span className="text-small text-muted">Client label</span>
          <input
            value={clientLabel}
            onChange={(e) => setClientLabel(e.target.value)}
            placeholder="ไม่บังคับ"
            disabled={busy}
            className={FIELD_CLASS}
          />
        </label>

        <button
          type="button"
          onClick={() => void doImport()}
          disabled={busy || !file}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-card bg-accent px-4 text-small font-semibold text-white shadow-[0_16px_34px_rgba(0,107,255,0.14)] hover:bg-accent-ink disabled:opacity-50 sm:w-auto"
        >
          {busy ? <RefreshCw size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          {busy ? "กำลังนำเข้า…" : "นำเข้า"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-control border border-negative bg-[var(--pill-negative-bg)] px-3 py-2 text-micro text-negative">
          {error}
        </div>
      )}
    </div>
  );
}
