"use client";

/**
 * Model status (redesigned) — one card per model type that merges what used to
 * be three separate sections: the production champion's headline metric, the
 * latest training result (promoted / lost vs baseline), and inline version
 * management (set production, delete non-production) behind an expander.
 * Full metric breakdowns still live on the read-only /model-performance page.
 */

import {
  ArrowRight,
  Bolt,
  Check,
  ChevronDown,
  Coins,
  Trash2,
  UserX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusDialog } from "@/components/status-dialog";
import { SectionCard, StatusPill } from "@/components/ui";
import { ADMIN_ONLY_TITLE, useIsAdmin } from "@/lib/auth";
import {
  activateModelVersion,
  deleteModelVersion,
  fetchModelVersions,
  type ModelVersionSummary,
  type TrainingRun,
  type TrainingRunResult,
} from "@/lib/ml-api";
import {
  beatsBaseline,
  formatMetric,
  MODEL_TYPE_LABELS,
} from "./training-run-utils";

const MODEL_TYPES = ["churn", "clv", "credit"] as const;
type ModelType = (typeof MODEL_TYPES)[number];

const TYPE_ICON: Record<ModelType, typeof UserX> = {
  churn: UserX,
  clv: Coins,
  credit: Bolt,
};

export function ModelStatusCards({
  latestRun,
}: {
  latestRun: TrainingRun | null;
}) {
  const resultByType = new Map<string, TrainingRunResult>();
  for (const r of latestRun?.results ?? []) {
    resultByType.set(r.model_type, r);
  }

  return (
    <SectionCard
      eyebrow="Models"
      hint="champion ปัจจุบัน + ผลเทรนล่าสุด — กด เวอร์ชัน เพื่อสลับ production หรือลบเวอร์ชันเก่า"
      right={
        <Link
          className="inline-flex items-center gap-1 font-medium text-[12.5px] text-[color:var(--ink-3)] underline-offset-2 hover:text-[color:var(--moby-600)] hover:underline"
          href="/model-performance"
        >
          ดู metric เต็ม
          <ArrowRight size={12} />
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {MODEL_TYPES.map((modelType) => (
          <ModelStatusCard
            key={modelType}
            latestResult={resultByType.get(modelType) ?? null}
            modelType={modelType}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function ModelStatusCard({
  modelType,
  latestResult,
}: {
  modelType: ModelType;
  latestResult: TrainingRunResult | null;
}) {
  const [versions, setVersions] = useState<ModelVersionSummary[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Pin/delete model versions is admin-only (the API returns 403 for members).
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const adminLocked = !(roleLoading || isAdmin);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<ModelVersionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    fetchModelVersions(modelType)
      .then(setVersions)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "โหลดเวอร์ชันไม่สำเร็จ")
      );

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelType]);

  async function activate(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await activateModelVersion(modelType, id);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เปลี่ยนโมเดลไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(version: ModelVersionSummary) {
    setDeletingId(version.id);
    setError(null);
    try {
      await deleteModelVersion(modelType, version.id);
      setPendingDelete(null);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ลบเวอร์ชันไม่สำเร็จ");
    } finally {
      setDeletingId(null);
    }
  }

  const busy = busyId !== null || deletingId !== null;
  const active = versions?.find((v) => v.is_active) ?? null;
  const Icon = TYPE_ICON[modelType];

  return (
    <div className="rounded-[22px] border border-gray-200 bg-white p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-[14px] text-[color:var(--ink-1)]">
          <Icon className="text-[color:var(--moby-600)]" size={15} />
          {MODEL_TYPE_LABELS[modelType]}
        </span>
        {latestResult ? (
          latestResult.promoted ? (
            <StatusPill icon={Check} tone="brand">
              promoted {latestResult.new_version ?? ""}
            </StatusPill>
          ) : (
            <StatusPill icon={X} tone="warn">
              ไม่ promote
            </StatusPill>
          )
        ) : (
          <StatusPill tone="neutral">ยังไม่เทรน</StatusPill>
        )}
      </div>

      {/* Headline metric — the production champion. */}
      {active ? (
        <>
          <p className="num mt-3 font-semibold text-[24px] text-[color:var(--ink-1)] tracking-[-0.03em]">
            {active.primary_metric_value === null
              ? "—"
              : formatMetric(active.primary_metric_value)}
          </p>
          <p className="text-[12px] text-[color:var(--ink-4)]">
            {active.primary_metric_name}
            {latestResult && (
              <>
                {" · "}
                <span
                  className={
                    beatsBaseline(latestResult)
                      ? "text-[color:var(--moby-600)]"
                      : "text-[color:var(--danger)]"
                  }
                >
                  {beatsBaseline(latestResult) ? "ชนะ" : "แพ้"} baseline{" "}
                  {formatMetric(latestResult.baseline_value)}
                </span>
              </>
            )}
          </p>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-[color:var(--ink-4)]">
          {versions === null ? "กำลังโหลด…" : "ยังไม่มีเวอร์ชัน production"}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between border-gray-100 border-t pt-3 text-[12px] text-[color:var(--ink-5)]">
        <span className="truncate">
          {active ? `${active.version} · ${active.algorithm || "—"}` : "—"}
        </span>
        <button
          className="inline-flex shrink-0 items-center gap-1 font-medium text-[color:var(--ink-3)] hover:text-[color:var(--moby-600)]"
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          เวอร์ชัน
          <ChevronDown
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            size={13}
          />
        </button>
      </div>

      {error && (
        <p className="mt-2 text-[11px] text-[color:var(--danger)]">{error}</p>
      )}

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {versions === null && !error && (
            <p className="text-[11px] text-[color:var(--ink-5)]">กำลังโหลด…</p>
          )}
          {versions?.length === 0 && (
            <p className="text-[11px] text-[color:var(--ink-5)]">ยังไม่มีเวอร์ชัน</p>
          )}
          {versions?.map((v) => (
            <div
              className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5"
              key={v.id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-[11.5px] text-[color:var(--ink-2)]">
                  {v.version} · {v.algorithm || "—"}
                </p>
                <p className="text-[10.5px] text-[color:var(--ink-5)]">
                  {v.primary_metric_name}:{" "}
                  {v.primary_metric_value === null
                    ? "—"
                    : v.primary_metric_value.toFixed(4)}
                </p>
              </div>
              {v.is_active ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-[10px] text-emerald-700">
                  production
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    className="rounded-full bg-gray-900 px-2.5 py-1 font-semibold text-[10.5px] text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={busy || adminLocked}
                    onClick={() => activate(v.id)}
                    title={adminLocked ? ADMIN_ONLY_TITLE : undefined}
                    type="button"
                  >
                    {busyId === v.id ? "กำลังเปลี่ยน…" : "ใช้ตัวนี้"}
                  </button>
                  <button
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--ink-5)] hover:bg-[color:var(--danger-bg)] hover:text-[color:var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={busy || adminLocked}
                    onClick={() => setPendingDelete(v)}
                    title={adminLocked ? ADMIN_ONLY_TITLE : "ลบเวอร์ชันนี้"}
                    type="button"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <StatusDialog
          cancelLabel="ยกเลิก"
          confirmLabel="ลบเวอร์ชัน"
          loading={deletingId === pendingDelete.id}
          message="ไฟล์โมเดล (.pkl) และผลประเมินของเวอร์ชันนี้จะถูกลบถาวร กู้คืนไม่ได้ — เวอร์ชัน production ปัจจุบันจะไม่ถูกแตะต้อง"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove(pendingDelete)}
          open
          title={`ยืนยันการลบเวอร์ชัน ${pendingDelete.version}`}
          tone="warning"
        />
      )}
    </div>
  );
}
