"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LifecycleRowPill,
  MetricCell,
  TOP_PRIORITY_ROW_GRID,
  TOP_PRIORITY_ROW_HEADER_GRID,
} from "@/features/customers/customer-row-ui";
import { formatCurrency } from "@/lib/format";
import type { RunSummary } from "@/lib/ml-api";
import { TOP_PRIORITY_LIMIT } from "@/lib/ml-api";
import { TEXT_SAFE } from "./palette";

/** Top 10 priority customers (spec §2.1, TOP_PRIORITY_LIMIT) — เรียงตาม priority_score */
export function TopPriorityCard({
  summary,
  runId,
}: {
  summary: RunSummary;
  runId: string;
}) {
  const router = useRouter();
  const customerHref = (accId: number) => `/customers/${accId}?run=${runId}`;

  return (
    <section className="surface-elev overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-gray-100 border-b px-4 py-4 sm:px-5">
        <div>
          <h2
            className={`type-section-title text-[20px] leading-tight ${TEXT_SAFE}`}
          >
            Top priority customers
          </h2>
          <p className="mt-0.5 text-[11.5px] text-[color:var(--ink-5)]">
            เรียงตามเงินที่เสี่ยงจะเสีย (revenue at risk = ความเสี่ยง churn × มูลค่า CLV)
          </p>
        </div>
        <Link
          className="shrink-0 font-medium text-[12px] text-[color:var(--ink-3)] underline-offset-2 hover:text-[color:var(--moby-600)] hover:underline"
          href={`/customers?run=${runId}`}
        >
          ดูทั้งหมด →
        </Link>
      </div>

      <div
        className={`grid gap-4 border-gray-100 border-b bg-gray-50 px-5 py-3 font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.12em] max-xl:hidden ${TOP_PRIORITY_ROW_HEADER_GRID}`}
      >
        <span>Account</span>
        <span>Lifecycle</span>
        <span>Churn</span>
        <span className="text-right">Score</span>
        <span className="text-right">CLV 6m</span>
      </div>

      <div className="divide-y divide-gray-100">
        {summary.top_priority.slice(0, TOP_PRIORITY_LIMIT).map((c) => {
          const churnPct =
            c.churn_probability === null ? null : c.churn_probability * 100;

          return (
            <div
              className={`grid w-full cursor-pointer gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50 xl:items-center xl:gap-4 ${TOP_PRIORITY_ROW_GRID}`}
              key={c.acc_id}
              onClick={() => router.push(customerHref(c.acc_id))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  router.push(customerHref(c.acc_id));
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div>
                <p className="font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.12em] xl:hidden">
                  Account
                </p>
                <p className="num font-semibold text-[18px] text-[color:var(--ink-2)]">
                  {c.acc_id}
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <LifecycleRowPill stage={c.lifecycle_stage ?? "—"} />
              </div>
              <MetricCell
                label="Churn"
                value={churnPct === null ? "—" : `${churnPct.toFixed(1)}%`}
                valueColor="#fc4c02"
              />
              <MetricCell
                alignRight
                label="Score"
                value={c.priority_score.toFixed(0)}
              />
              <MetricCell
                alignRight
                label="CLV 6m"
                value={
                  c.predicted_clv_6m === null
                    ? "—"
                    : formatCurrency(c.predicted_clv_6m)
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
