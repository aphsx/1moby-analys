"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { fetchModelPerformance, type ModelPerfEntry } from "@/lib/ml-api";
import {
  DISPLAY_SECONDARY_METRICS,
  formatBaselineName,
  formatDate,
  metricInfo,
  metricInfoByLabel,
  pickSecondaryMetrics,
  PRIMARY_METRIC_KEY,
  SPLIT_LABELS,
  SPLIT_ORDER,
} from "./metric-info";

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

      <div className="mt-5 space-y-4 px-4 sm:px-6 lg:px-8">
        <p className="max-w-4xl text-[12.5px] text-[color:var(--ink-5)]">
          Production champion · ตัวเลขหลัก = test holdout · จัดการเวอร์ชันที่หน้า Training
        </p>

        {error && <EmptyState icon={Activity} title="โหลดไม่สำเร็จ" hint={error} />}

        {!error && entries === null && (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </section>
        )}

        {!error && entries?.length === 0 && (
          <EmptyState icon={Activity} title="ยังไม่มี evaluation" hint="รัน training ให้สำเร็จก่อน" />
        )}

        {!error && entries && entries.length > 0 && (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {entries.map((entry) => (
              <ModelCard key={entry.model_type} entry={entry} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function ModelCard({ entry }: { entry: ModelPerfEntry }) {
  const isMl = entry.model_type !== "lifecycle";
  const primary = entry.primary_metric;
  const primaryInfo = metricInfoByLabel(primary.name);
  const primaryValue =
    typeof primary.value === "number" ? primaryInfo.fmt(primary.value) : String(primary.value);

  const testSplit = entry.splits.find((s) => s.split === "test");
  const secondary = testSplit
    ? pickSecondaryMetrics(
        entry.model_type,
        testSplit.metrics,
        entry.component_metrics,
        DISPLAY_SECONDARY_METRICS[entry.model_type]
      )
    : [];

  return (
    <article className="surface lift flex flex-col p-4">
      <header className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-5)]">
          {entry.model_type}
        </p>
        {entry.version ? (
          <p className="truncate text-[10.5px] text-[color:var(--ink-5)]">{entry.version}</p>
        ) : null}
      </header>

      <div className="mt-3">
        <p className="text-[11px] text-[color:var(--ink-5)]">{primary.name} · test</p>
        <p className="num mt-0.5 text-[28px] font-semibold leading-none">{primaryValue}</p>
        {isMl && primary.baseline !== undefined && primary.baseline > 0 && (
          <p className="num mt-1 text-[11px] text-[color:var(--ink-5)]">
            baseline {formatBaselineName(primary.baseline_name ?? "baseline")}{" "}
            {typeof primary.baseline === "number"
              ? primaryInfo.fmt(primary.baseline)
              : primary.baseline}
          </p>
        )}
      </div>

      {isMl && entry.splits.length > 0 && (
        <SplitLine entry={entry} primaryInfo={primaryInfo} />
      )}

      {secondary.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-100 pt-3">
          {secondary.map(({ key, value }) => {
            const info = metricInfo(key);
            return (
              <div key={key}>
                <dt
                  className="truncate text-[10.5px] text-[color:var(--ink-5)]"
                  title={info.tooltip}
                >
                  {info.label}
                </dt>
                <dd className="num text-[13px] font-semibold">{info.fmt(value)}</dd>
              </div>
            );
          })}
        </dl>
      )}

      {isMl && entry.realized?.primary_value != null && (
        <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] text-[color:var(--ink-4)]">
          Realized{" "}
          <span className="num font-semibold">{primaryInfo.fmt(entry.realized.primary_value)}</span>
          {entry.realized.prediction_run_name ? (
            <span className="text-[color:var(--ink-5)]"> · {entry.realized.prediction_run_name}</span>
          ) : null}
        </p>
      )}

      <footer className="mt-auto pt-3 text-[10.5px] leading-5 text-[color:var(--ink-5)]">
        {isMl && entry.algorithm ? <p>{entry.algorithm}</p> : null}
        {entry.trained_at ? <p>{formatDate(entry.trained_at)}</p> : null}
        {entry.notes ? <p className="mt-1">{entry.notes}</p> : null}
      </footer>
    </article>
  );
}

function SplitLine({
  entry,
  primaryInfo,
}: {
  entry: ModelPerfEntry;
  primaryInfo: ReturnType<typeof metricInfoByLabel>;
}) {
  const primaryKey = PRIMARY_METRIC_KEY[entry.model_type];
  if (!primaryKey) return null;

  const parts = SPLIT_ORDER.map((splitKey) => {
    const split = entry.splits.find((s) => s.split === splitKey);
    const value = split?.metrics[primaryKey];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return { splitKey, value };
  }).filter(Boolean) as Array<{ splitKey: (typeof SPLIT_ORDER)[number]; value: number }>;

  if (parts.length === 0) return null;

  return (
    <p className="num mt-2 text-[11px] text-[color:var(--ink-5)]">
      {parts.map(({ splitKey, value }, i) => (
        <span key={splitKey}>
          {i > 0 ? " · " : null}
          <span className={splitKey === "test" ? "font-semibold text-[color:var(--ink-3)]" : ""}>
            {SPLIT_LABELS[splitKey]} {primaryInfo.fmt(value)}
          </span>
        </span>
      ))}
    </p>
  );
}
