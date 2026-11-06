"use client";

import { type ModelPerfEntry } from "@moby/types";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatCount, formatDate } from "@/lib/format";
import { MetricLabel } from "./metric-help";

const MODEL_TITLE: Record<string, string> = {
  lifecycle: "สถานะลูกค้า",
  churn: "โอกาสเลิกใช้",
  clv: "มูลค่า 6 เดือน",
  credit: "การเติมและใช้เครดิต",
};
import {
  formatBaselineName,
  metricInfo,
  metricInfoByLabel,
  pickSecondaryMetrics,
  PRIMARY_METRIC_KEY,
  SPLIT_LABELS,
  SPLIT_ORDER,
} from "./metric-info";

/** One production champion — same data as before, tighter layout. */
export function ModelPerformanceCard({ entry }: { entry: ModelPerfEntry }) {
  const isMl = entry.model_type !== "lifecycle";
  const primary = entry.primary_metric;
  const primaryInfo = metricInfoByLabel(primary.name);
  const testSplit = entry.splits.find((s) => s.split === "test") ?? entry.splits[0] ?? null;
  const secondary = testSplit
    ? pickSecondaryMetrics(entry.model_type, testSplit.metrics, entry.component_metrics)
    : [];
  const primaryValue =
    typeof primary.value === "number" ? primaryInfo.fmt(primary.value) : String(primary.value);

  return (
    <article className="surface flex flex-col overflow-visible p-4 sm:p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-section font-semibold text-text">
          {MODEL_TITLE[entry.model_type] ?? entry.model_type}
        </h2>
        {entry.version ? (
          <span className="truncate text-micro text-faint">{entry.version}</span>
        ) : null}
      </header>
      {isMl && entry.algorithm ? (
        <p className="mt-0.5 text-micro text-faint">{entry.algorithm}</p>
      ) : null}

      <section className="mt-4">
        <div className="flex items-center gap-1 text-micro text-faint">
          <MetricLabel info={primaryInfo} />
          <span>· ชุดทดสอบ</span>
        </div>
        <p className="num mt-1 text-[32px] font-semibold leading-none ">{primaryValue}</p>
        {isMl && primary.baseline !== undefined && primary.baseline > 0 && (
          <p className="num mt-1.5 text-micro text-faint">
            baseline {formatBaselineName(primary.baseline_name ?? "baseline")}{" "}
            {typeof primary.baseline === "number"
              ? primaryInfo.fmt(primary.baseline)
              : primary.baseline}
          </p>
        )}
      </section>

      {isMl && entry.splits.length > 0 ? (
        <section className="mt-4 border-t border-rule pt-4">
          <SplitStrip entry={entry} primaryInfo={primaryInfo} />
        </section>
      ) : null}

      {secondary.length > 0 ? (
        <section className="mt-4 border-t border-rule pt-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {secondary.map(({ key, value }) => {
              const info = metricInfo(key);
              return (
                <div key={key} className="min-w-0 overflow-visible">
                  <dt className="text-micro text-faint">
                    <MetricLabel info={info} />
                  </dt>
                  <dd className="num text-body font-semibold leading-snug">{info.fmt(value)}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : null}

      {entry.competition && entry.competition.length > 0 ? (
        <section className="mt-4 border-t border-rule pt-3">
          <CandidateCompetition competition={entry.competition} />
        </section>
      ) : null}

      {isMl ? (
        <section className="mt-4 border-t border-rule pt-3">
          <RealizedStrip entry={entry} primaryInfo={primaryInfo} />
        </section>
      ) : null}

      <footer className="mt-4 border-t border-rule pt-3 text-micro leading-5 text-faint">
        {entry.trained_at ? <p>เทรนเมื่อ {formatDate(entry.trained_at)}</p> : null}
        {entry.dataset_rows != null ? <p>{formatCount(entry.dataset_rows)} แถว</p> : null}
        {entry.notes ? <p className="mt-1 text-muted">{entry.notes}</p> : null}
      </footer>
    </article>
  );
}

function SplitStrip({
  entry,
  primaryInfo,
}: {
  entry: ModelPerfEntry;
  primaryInfo: ReturnType<typeof metricInfoByLabel>;
}) {
  const primaryKey = PRIMARY_METRIC_KEY[entry.model_type];
  if (!primaryKey) return null;

  const cells = SPLIT_ORDER.map((splitKey) => {
    const split = entry.splits.find((s) => s.split === splitKey);
    const value = split?.metrics[primaryKey];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return { splitKey, value };
  }).filter(Boolean) as Array<{ splitKey: (typeof SPLIT_ORDER)[number]; value: number }>;

  if (cells.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-raised/80 p-2">
      {cells.map(({ splitKey, value }) => (
        <div
          key={splitKey}
          className={`rounded-md px-2 py-1.5 text-center ${
            splitKey === "test" ? "bg-surface ring-1 ring-rule" : ""
          }`}
        >
          <p className="text-micro text-faint">{SPLIT_LABELS[splitKey]}</p>
          <p className="num mt-0.5 text-small font-semibold">{primaryInfo.fmt(value)}</p>
        </div>
      ))}
    </div>
  );
}

function RealizedStrip({
  entry,
  primaryInfo,
}: {
  entry: ModelPerfEntry;
  primaryInfo: ReturnType<typeof metricInfoByLabel>;
}) {
  const realized = entry.realized;

  if (!realized || realized.primary_value == null) {
    return (
      <p className="text-micro text-faint">
        <span className="font-medium text-muted">ผลจริง</span>
        {" — "}
        ยังไม่มี (รอ backfill ที่หน้า Runs)
      </p>
    );
  }

  const run = realized.prediction_run_name ?? realized.prediction_run_id?.slice(0, 8);

  return (
    <div>
      <p className="text-micro text-faint">
        <span className="font-medium text-muted">ผลจริง</span>
        {" · "}
        <span className="num font-semibold text-text">
          {primaryInfo.fmt(realized.primary_value)}
        </span>
      </p>
      {(run || realized.cutoff_date) && (
        <p className="mt-0.5 truncate text-micro text-faint">
          {[run, realized.cutoff_date, formatDate(realized.measured_at)].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function CandidateCompetition({
  competition,
}: {
  competition: NonNullable<ModelPerfEntry["competition"]>;
}) {
  const [open, setOpen] = useState(false);
  const champion = competition.find((c) => c.is_champion);
  const hasTest = competition.some((c) => c.test_score != null);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-micro text-faint"
        aria-expanded={open}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
        <span className="font-medium text-muted">โมเดลที่แข่งกัน</span>
        {!open && champion ? (
          <span className="truncate">
            · {champion.algorithm}
            {champion.cv_score != null ? ` CV ${champion.cv_score.toFixed(3)}` : ""}
            {champion.test_score != null ? ` / test ${champion.test_score.toFixed(3)}` : ""}
          </span>
        ) : null}
      </button>

      {open ? (
        <ul className="mt-2 space-y-1 pl-5">
          {competition.map((c) => (
            <li
              key={c.algorithm}
              className="flex items-center justify-between gap-2 text-micro"
            >
              <span className="truncate text-text">
                {c.algorithm}
                {c.is_champion ? (
                  <span className="ml-1.5 text-micro font-medium text-positive">prod</span>
                ) : null}
              </span>
              <span className="num shrink-0 text-muted">
                {c.cv_score != null ? `CV ${c.cv_score.toFixed(3)}` : ""}
                {hasTest ? (c.test_score != null ? ` / ${c.test_score.toFixed(3)}` : " / —") : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
