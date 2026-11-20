"use client";
/**
 * Create-run card (redesigned). One card does the whole job:
 *   pick (or import) a predict source → name → Run.
 * Cutoff is auto-managed and only surfaces in Advanced; per-run model
 * overrides also live in Advanced. Importing a new source happens inline
 * via the "+ import ใหม่" toggle next to the source picker — there is no
 * separate data-sources section anymore.
 */

import { MODEL_TYPES, type ModelType, type ModelVersionSummary, type PredictDataSource } from "@moby/types";
import { useEffect, useState } from "react";
import { ChevronDown, Play, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Select } from "@/components/select";
import { SectionCard } from "@/components/ui";
import { createPredictionRun, fetchModelVersions, fetchPredictSuggestedCutoff } from "@/lib/ml-api";
import { getDisplayError } from "@/lib/ui-error";
import { formatCount, formatDate } from "@/lib/format";
import { useAsync } from "@/lib/use-async";
import { PredictImportForm } from "./predict-import-form";
import { defaultRunName, FIELD_CLASS, formatRelative, getCleanCounts, todayISO } from "./runs-utils";

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
  }, [readySources.map((s) => s.id).join(",")]);

  const selected = readySources.find((s) => s.id === sourceId) ?? null;
  useEffect(() => {
    if (nameTouched) return;
    setName(selected ? defaultRunName(selected.name) : "");
  }, [selected?.id, nameTouched]);

  // The cutoff field starts from the source's suggestion (empty while it loads or when there is
  // none) and stays editable; a newly selected source resets it.
  const suggested = useAsync(() => fetchPredictSuggestedCutoff(selected!.id), [selected?.id], Boolean(selected)).data;
  useEffect(() => setCutoff(suggested?.suggested_cutoff ?? ""), [suggested]);

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
      setError(getDisplayError(e, "สร้างรอบทำนายไม่สำเร็จ"));
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
            className={FIELD_CLASS}
          />
        </label>
      </div>

      {showImport && (
        <PredictImportForm
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
