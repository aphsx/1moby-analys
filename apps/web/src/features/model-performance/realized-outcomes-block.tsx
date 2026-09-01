"use client";

import type { ModelPerfEntry } from "@/lib/ml-api";
import { MetricLabel } from "./metric-help";
import { formatDate, metricInfo, metricInfoByLabel, PRIMARY_METRIC_KEY } from "./metric-info";

const REALIZED_HELP =
  "วัดจาก prediction run ที่ครบ horizon แล้ว — เปรียบเทียบคำทำนายกับผลจริงที่เกิดขึ้น (production monitoring) ใช้สูตร metric เดียวกับตอนเทรน";

/** Latest production_holdout metric for the current champion, if backfill has run. */
export function RealizedOutcomesBlock({ entry }: { entry: ModelPerfEntry }) {
  if (entry.model_type === "lifecycle") return null;

  const primaryKey = PRIMARY_METRIC_KEY[entry.model_type];
  const primaryInfo = metricInfoByLabel(entry.primary_metric.name);
  const realized = entry.realized;

  if (!realized || realized.primary_value == null) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">
          Realized outcome
        </p>
        <p className="mt-1 text-[11.5px] leading-5 text-[color:var(--ink-5)]">
          ยังไม่มีผลจริง — รอ prediction run ครบ horizon แล้วสั่ง backfill ที่หน้า Runs
        </p>
      </div>
    );
  }

  const runLabel = realized.prediction_run_name ?? realized.prediction_run_id?.slice(0, 8) ?? "—";

  return (
    <div className="mt-5 rounded-xl border border-sky-100 bg-sky-50/40 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-800">
          Realized outcome
        </p>
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">
          ผลจริงหลัง deploy
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-[color:var(--ink-5)]">{REALIZED_HELP}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <MetricLabel info={primaryInfo} />
        <span className="num text-[22px] font-semibold leading-none text-[color:var(--ink-2)]">
          {primaryInfo.fmt(realized.primary_value)}
        </span>
      </div>
      {primaryKey && realized.metrics[primaryKey] != null && entry.splits.length > 0 && (
        <p className="mt-1 text-[11px] text-[color:var(--ink-5)]">
          เทียบ test holdout:{" "}
          <span className="num font-medium">
            {primaryInfo.fmt(
              entry.splits.find((s) => s.split === "test")?.metrics[primaryKey] ??
                (typeof entry.primary_metric.value === "number" ? entry.primary_metric.value : NaN)
            )}
          </span>
        </p>
      )}
      <div className="mt-2 space-y-0.5 text-[11px] leading-5 text-[color:var(--ink-5)]">
        {realized.prediction_run_id && <p>run: {runLabel}</p>}
        {realized.cutoff_date && <p>cutoff: {realized.cutoff_date}</p>}
        <p>measured: {formatDate(realized.measured_at)}</p>
      </div>
    </div>
  );
}
