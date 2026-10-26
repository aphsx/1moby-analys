"use client";
/**
 * Create-run card (redesigned). One card does the whole job:
 *   pick (or import) a predict source → name → Run.
 * Cutoff is auto-managed and only surfaces in Advanced; per-run model
 * overrides also live in Advanced. Importing a new source happens inline
 * via the "+ import ใหม่" toggle next to the source picker — there is no
 * separate data-sources section anymore.
 */

import { type ModelVersionSummary, type PredictDataSource } from "@moby/types";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileSpreadsheet,
  Play,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  UploadCloud,
  X,
} from "lucide-react";
import { notifyStatusDialog } from "@/components/global-status-dialog-host";
import { Select } from "@/components/select";
import { SectionCard } from "@/components/ui";
import { uploadPredictDataFile } from "@/lib/api";
import { createPredictionRun, fetchModelVersions, fetchPredictSuggestedCutoff } from "@/lib/ml-api";
import { getDisplayError, getImportErrorMessage } from "@/lib/ui-error";
import { formatCount, formatDate } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import {
  defaultRunName,
  formatRelative,
  getCleanCounts,
  todayISO,
} from "./runs-utils";

const MODEL_TYPES = ["churn", "clv", "credit"] as const;
type ModelType = (typeof MODEL_TYPES)[number];

const fieldCls =
  "mt-1.5 h-11 w-full rounded-card border border-border bg-surface px-3.5 text-small text-text shadow-[var(--shadow-1)] outline-none transition-colors focus:border-accent disabled:opacity-50";

export function CreateRunPanel({
  sources,
  onRefresh,
}: {
  sources: PredictDataSource[];
  onRefresh: () => Promise<void>;
}) {
  const readySources = sources.filter((s) => s.import_status === "ready");

  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  // Prediction cutoff is fully auto-managed (the as-of date = latest data in the
  // source). It is computed from the API suggestion and sent to the run, but is
  // not user-editable — there is no legitimate non-replay reason to override it.
  const [cutoff, setCutoff] = useState(todayISO());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-run model selection. "" = use the production champion for that type.
  const [overrides, setOverrides] = useState<Record<ModelType, string>>({
    churn: "",
    clv: "",
    credit: "",
  });

  // A model type whose versions fail to load just offers no overrides.
  const versions = useAsync(
    () => Promise.all(MODEL_TYPES.map((t) => fetchModelVersions(t).catch((): ModelVersionSummary[] => []))),
    []
  );
  const [churnVersions, clvVersions, creditVersions] = versions.data ?? [[], [], []];
  const versionsByType: Record<ModelType, ModelVersionSummary[]> = {
    churn: churnVersions,
    clv: clvVersions,
    credit: creditVersions,
  };

  useEffect(() => {
    if (sourceId && readySources.some((s) => s.id === sourceId)) return;
    setSourceId(readySources[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readySources.map((s) => s.id).join(",")]);

  const selected = readySources.find((s) => s.id === sourceId) ?? null;
  useEffect(() => {
    if (nameTouched) return;
    setName(selected ? defaultRunName(selected.name) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, nameTouched]);

  useEffect(() => {
    setCutoff("");
    if (!selected) return;
    let alive = true;
    fetchPredictSuggestedCutoff(selected.id)
      .then(({ suggested_cutoff }) => {
        if (alive) setCutoff(suggested_cutoff);
      })
      .catch(() => {
        // Keep the local fallback when no suggestion is available.
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const canCreate = Boolean(sourceId && name.trim() && cutoff && !creating);

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const modelOverrides: { churn?: string; clv?: string; credit?: string } = {};
      for (const modelType of MODEL_TYPES) {
        if (overrides[modelType]) modelOverrides[modelType] = overrides[modelType];
      }
      await createPredictionRun({
        predict_source_id: sourceId,
        name: name.trim(),
        cutoff_date: cutoff,
        ...(Object.keys(modelOverrides).length > 0 ? { model_overrides: modelOverrides } : {}),
      });
      setNameTouched(false);
      setName(selected ? defaultRunName(selected.name) : "");
      await onRefresh();
    } catch (e) {
      setError(getDisplayError(e, "สร้างรอบทำนายไม่สำเร็จ") ?? "สร้างรอบทำนายไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

  const counts = selected ? getCleanCounts(selected) : null;

  return (
    <SectionCard
      eyebrow="รอบทำนาย"
      title="สร้างรอบทำนาย"
      hint="เลือกข้อมูล ตั้งชื่อ แล้วกดรัน — ระบบจัดการ cutoff และรัน lifecycle / churn / CLV / credit ให้ทุกลูกค้า"
      right={
        <button
          type="button"
          onClick={() => void create()}
          disabled={!canCreate}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-card bg-accent px-4 text-small font-semibold text-white shadow-[0_16px_34px_rgba(0,107,255,0.14)] hover:bg-accent-ink disabled:opacity-50 sm:w-auto sm:min-w-[140px]"
        >
          {creating ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
          {creating ? "กำลังรัน…" : "รัน"}
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <span className="text-small text-muted">แหล่งข้อมูล</span>
          <div className="mt-1.5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Select
              value={sourceId}
              onChange={setSourceId}
              disabled={creating || readySources.length === 0}
              size="lg"
              className="min-w-0 flex-1"
              placeholder="ยังไม่มี source ที่ ready"
              aria-label="ข้อมูลสำหรับทำนาย"
              options={readySources.map((s) => ({
                value: s.id,
                label: s.client_label ? `${s.name} · ${s.client_label}` : s.name,
              }))}
            />
            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-card border border-border bg-surface px-3.5 text-small font-semibold text-accent shadow-[var(--shadow-1)] hover:bg-raised sm:justify-start"
            >
              <Plus size={14} />
              นำเข้าใหม่
            </button>
          </div>
          {selected && (
            <p className="mt-2 text-micro text-faint">
              {counts ? `${formatCount(counts.customers)} ลูกค้า · ` : ""}
              นำเข้า {formatRelative(selected.imported_at)}
              {selected.created_by_name ? ` โดย ${selected.created_by_name}` : ""}
              {cutoff ? ` · ทำนาย ณ ${formatDate(cutoff)} (อัตโนมัติ)` : ""}
            </p>
          )}
        </div>

        <label className="block">
          <span className="text-small text-muted">ชื่อรอบทำนาย</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="ชื่อรอบทำนาย"
            disabled={creating || readySources.length === 0}
            className={fieldCls}
          />
        </label>
      </div>

      {showImport && (
        <InlineImportForm
          onClose={() => setShowImport(false)}
          onImported={async () => {
            await onRefresh();
            setShowImport(false);
          }}
        />
      )}

      <div className="mt-4 border-t border-rule pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-2 text-small font-medium text-text hover:text-accent"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${showAdvanced ? "rotate-0" : "-rotate-90"}`}
          />
          <SlidersHorizontal size={13} />
          ตั้งค่าขั้นสูง — เลือกเวอร์ชันโมเดล
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-4">
            <div>
              <span className="text-small text-muted">เลือกโมเดลต่อ run</span>
              <p className="mt-1 mb-2 text-micro leading-5 text-muted">
                ปล่อยเป็น &quot;Production (ปัจจุบัน)&quot; เพื่อใช้ champion — หรือเลือกเวอร์ชันเจาะจงสำหรับ run นี้
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {MODEL_TYPES.map((modelType) => (
                  <label key={modelType} className="block">
                    <span className="text-micro font-semibold text-faint">
                      {modelType}
                    </span>
                    <Select
                      value={overrides[modelType]}
                      onChange={(next) =>
                        setOverrides((prev) => ({ ...prev, [modelType]: next }))
                      }
                      disabled={creating}
                      size="lg"
                      className="mt-1.5"
                      aria-label={`${modelType} model version`}
                      options={[
                        { value: "", label: "Production (ปัจจุบัน)" },
                        ...versionsByType[modelType].map((v) => ({
                          value: v.id,
                          label: `${v.version}${v.is_active ? " · production" : ""} · ${v.algorithm || "—"}`,
                        })),
                      ]}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-card border border-negative bg-[var(--pill-negative-bg)] px-4 py-3 text-small text-negative">
          {error}
        </div>
      )}
    </SectionCard>
  );
}

function InlineImportForm({
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
            className={fieldCls}
          />
        </label>

        <label className="block">
          <span className="text-small text-muted">Client label</span>
          <input
            value={clientLabel}
            onChange={(e) => setClientLabel(e.target.value)}
            placeholder="ไม่บังคับ"
            disabled={busy}
            className={fieldCls}
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
