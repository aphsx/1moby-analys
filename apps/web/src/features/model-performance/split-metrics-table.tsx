"use client";

import type { ModelPerfEntry } from "@/lib/ml-api";
import { MetricLabel } from "./metric-help";
import {
  metricInfo,
  PRIMARY_METRIC_KEY,
  SPLIT_LABELS,
  SPLIT_ORDER,
} from "./metric-info";

/** Primary metric per split — validation / test / backtest average. */
export function SplitMetricsTable({ entry }: { entry: ModelPerfEntry }) {
  const primaryKey = PRIMARY_METRIC_KEY[entry.model_type];
  if (!primaryKey || entry.splits.length === 0) return null;

  const primaryInfo = metricInfo(primaryKey);
  const rows = SPLIT_ORDER.map((splitKey) => {
    const split = entry.splits.find((s) => s.split === splitKey);
    const value = split?.metrics[primaryKey];
    return { splitKey, value };
  }).filter((row) => typeof row.value === "number" && Number.isFinite(row.value));

  if (rows.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-5)]">
          Metric แยก split
        </p>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-[color:var(--ink-5)]">
        ตัวเลขหลักต่อ split — ใช้ <strong className="font-semibold">Test (holdout)</strong> เป็น headline
      </p>
      <div className="mt-2 overflow-hidden rounded-xl border border-gray-100">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="bg-gray-50 text-[color:var(--ink-5)]">
              <th className="px-3 py-2 font-semibold">Split</th>
              <th className="px-3 py-2 font-semibold">
                <MetricLabel info={primaryInfo} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ splitKey, value }) => (
              <tr
                key={splitKey}
                className={
                  splitKey === "test"
                    ? "bg-emerald-50/60 font-semibold text-[color:var(--ink-2)]"
                    : "text-[color:var(--ink-3)]"
                }
              >
                <td className="px-3 py-2">{SPLIT_LABELS[splitKey]}</td>
                <td className="num px-3 py-2">{primaryInfo.fmt(value!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
