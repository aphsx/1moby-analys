"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ChevronDown, CircleHelp } from "lucide-react";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { fetchModelPerformance, type ModelPerfEntry } from "@/lib/ml-api";
import { ChurnDiagnostics } from "./churn-diagnostics";
import { MetricHelp, MetricLabel } from "./metric-help";
import {
  formatBaselineName,
  metricInfo,
  metricInfoByLabel,
  pickSecondaryMetrics,
} from "./metric-info";
import { BASELINE_HELP, MODEL_TYPE_HELP } from "./model-type-help";
import { RealizedOutcomesBlock } from "./realized-outcomes-block";
import { SplitMetricsTable } from "./split-metrics-table";

// This page is READ-ONLY: it shows the metrics of the current production
// champion per model type. Version management (set production / delete) lives on
// the Model Training page so "view" and "manage" stay cleanly separated.

export function ModelPerformanceView() {
  const [entries, setEntries] = useState<ModelPerfEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetchModelPerformance()
      .then(setEntries)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "โหลด model performance ไม่สำเร็จ")
      );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="pb-12">
      <PageHeader eyebrow="Model accuracy" title="Model Accuracy" />

      <div className="mt-4 space-y-5 px-4 sm:px-6 lg:px-8">
        <p className="max-w-4xl text-[12.5px] leading-6 text-[color:var(--ink-4)]">
          แสดง metric ของโมเดล production ปัจจุบัน (ดูอย่างเดียว) — ตัวเลขหลักมาจาก{" "}
          <strong className="font-semibold text-[color:var(--ink-3)]">test holdout</strong>{" "}
          (ข้อมูลที่โมเดลไม่เคยเห็นตอนเทรน) · กด{" "}
          <CircleHelp className="inline h-3.5 w-3.5 align-[-2px] text-[color:var(--ink-5)]" />{" "}
          ข้างชื่อ metric เพื่อดูความหมาย · จัดการเวอร์ชันได้ที่หน้า Model Training
        </p>

        {error && <EmptyState icon={Activity} title="โหลด model performance ไม่สำเร็จ" hint={error} />}

        {!error && entries === null && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-[26px]" />
            ))}
          </section>
        )}

        {!error && entries?.length === 0 && (
          <EmptyState
            icon={Activity}
            title="ยังไม่มี model evaluation"
            hint="รัน training ให้สำเร็จก่อน หน้านี้จะแสดง champion metrics จาก registry"
          />
        )}

        {!error && entries && entries.length > 0 && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {entries.map((entry) => (
              <MetricSummaryCard key={entry.model_type} entry={entry} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function MetricSummaryCard({ entry }: { entry: ModelPerfEntry }) {
  const primary = entry.primary_metric;
  const primaryInfo = metricInfoByLabel(primary.name);
  const split = entry.splits.find((item) => item.split === "test") ?? entry.splits[0] ?? null;
  const metricRows = split
    ? pickSecondaryMetrics(entry.model_type, split.metrics, entry.component_metrics)
    : [];
  const primaryValue =
    typeof primary.value === "number" ? primaryInfo.fmt(primary.value) : String(primary.value);

  const modelHelp = MODEL_TYPE_HELP[entry.model_type];

  return (
    <section className="surface lift overflow-visible p-5">
      <div className="flex items-center gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">
          {entry.model_type}
        </p>
        {modelHelp ? (
          <MetricHelp
            info={{
              label: modelHelp.label,
              tooltip: modelHelp.help,
              help: modelHelp.help,
            }}
          />
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink-3)]">
          {entry.method}
        </span>
        <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink-3)]">
          {entry.algorithm}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="flex items-center gap-1 text-[12px] font-semibold text-[color:var(--ink-5)]">
          <MetricLabel info={primaryInfo} />
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          test holdout
        </span>
      </div>
      <p className="num mt-1 text-[34px] font-semibold leading-none">{primaryValue}</p>
      {primary.baseline !== undefined && primary.baseline > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11.5px] text-[color:var(--ink-5)]">
          <span>
            baseline {formatBaselineName(primary.baseline_name ?? "baseline")}:{" "}
            <span className="num">
              {typeof primary.baseline === "number"
                ? primaryInfo.fmt(primary.baseline)
                : primary.baseline}
            </span>
          </span>
          <MetricHelp
            info={{
              label: "Baseline",
              tooltip: BASELINE_HELP,
              help: BASELINE_HELP,
            }}
          />
        </div>
      )}

      {entry.model_type !== "lifecycle" && <SplitMetricsTable entry={entry} />}

      <div className="mt-5 space-y-3">
        {metricRows.map(({ key, value }) => {
          const info = metricInfo(key);
          return (
            <div
              key={key}
              className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl bg-gray-50 px-3 py-2.5"
            >
              <div className="text-[12px] font-semibold text-[color:var(--ink-2)]">
                <MetricLabel info={info} />
              </div>
              <p className="num text-[15px] font-semibold">{info.fmt(value)}</p>
            </div>
          );
        })}
      </div>

      {entry.competition && entry.competition.length > 0 && (
        <CandidateCompetition competition={entry.competition} />
      )}

      {entry.model_type !== "lifecycle" && <RealizedOutcomesBlock entry={entry} />}

      <div className="mt-4 space-y-1 text-[11.5px] leading-5 text-[color:var(--ink-5)]">
        {entry.version && <p>version: {entry.version}</p>}
        {entry.trained_at && <p>trained: {new Date(entry.trained_at).toLocaleString()}</p>}
        {entry.dataset_rows != null && <p>rows: {entry.dataset_rows.toLocaleString()}</p>}
      </div>

      {entry.notes ? (
        <p className="mt-4 text-[11.5px] leading-5 text-[color:var(--ink-5)]">{entry.notes}</p>
      ) : null}

      {entry.model_type === "churn" && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <ChurnDiagnostics entry={entry} />
        </div>
      )}
    </section>
  );
}

function CandidateCompetition({
  competition,
}: {
  competition: NonNullable<ModelPerfEntry["competition"]>;
}) {
  const [open, setOpen] = useState(false);
  const cvMetric = competition[0]?.cv_metric ?? "CV score";
  const champion = competition.find((c) => c.is_champion);
  const hasTest = competition.some((c) => c.test_score != null);

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[color:var(--ink-5)] transition-transform ${open ? "rotate-180" : ""}`}
        />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">
          Candidate competition
        </p>
        {!open && champion && (
          <span className="truncate text-[11px] font-normal normal-case text-[color:var(--ink-5)]">
            · {champion.algorithm}
            {champion.cv_score != null ? ` CV ${champion.cv_score.toFixed(3)}` : ""}
            {champion.test_score != null ? ` · test ${champion.test_score.toFixed(3)}` : ""}
          </span>
        )}
      </button>

      {open && (
        <>
          <p className="mt-1 pl-5 text-[11px] leading-5 text-[color:var(--ink-5)]">
            CV = เลือก candidate ตอนเทรน · Test = holdout ที่รายงานจริง ({cvMetric})
          </p>
          <div className="mt-2 space-y-1 pl-5">
            {competition.map((c) => (
              <div
                key={c.algorithm}
                className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-gray-50 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-medium text-[color:var(--ink-2)]">
                    {c.algorithm}
                  </span>
                  {c.is_champion && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Production
                    </span>
                  )}
                  {!c.is_champion && c.gate_passed === false && (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-[color:var(--ink-5)]">
                      ไม่ผ่าน gate
                    </span>
                  )}
                </div>
                <div className="num text-right text-[12px] font-semibold leading-5">
                  {c.cv_score != null && (
                    <div className="text-[color:var(--ink-4)]">
                      CV {c.cv_score.toFixed(4)}
                    </div>
                  )}
                  {hasTest && (
                    <div className={c.is_champion ? "text-emerald-700" : "text-[color:var(--ink-3)]"}>
                      {c.test_score != null ? `test ${c.test_score.toFixed(4)}` : "test —"}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {champion?.reason && (
            <p className="mt-2 pl-5 text-[11px] leading-5 text-[color:var(--ink-5)]">
              เหตุผลที่เลือก: {champion.reason}
            </p>
          )}
        </>
      )}
    </div>
  );
}
