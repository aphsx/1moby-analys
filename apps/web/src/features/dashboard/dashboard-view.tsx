"use client";

import {
  CalendarClock,
  CreditCard,
  Gem,
  ShieldCheck,
  TrendingDown,
  Users,
} from "lucide-react";
import { formatCredits, formatCurrency, formatNumber } from "@/lib/format";
import type { RunSummary } from "@/lib/ml-api";
import { CreditUrgencyCard } from "./credit-urgency-card";
import { LifecycleMixCard } from "./lifecycle-mix-card";
import { MetricCard } from "./metric-card";
import { MonthlyRevenueCard } from "./monthly-revenue-card";
import { TEXT_SAFE } from "./palette";
import { RiskCard } from "./risk-card";
import { RunInsightCard } from "./run-insight-card";
import { TopPriorityCard } from "./top-priority-card";
import { fromRunSummary } from "./types";
import { ValueCard } from "./value-card";
import { ValueRiskMatrixCard } from "./value-risk-matrix-card";

export function DashboardView({
  summary,
  runId,
}: {
  summary: RunSummary;
  runId: string;
}) {
  const { overview, monthlyRevenue } = fromRunSummary(summary);
  const activeHighRiskPct =
    overview.active_churn.base_customers > 0
      ? (overview.active_churn.high / overview.active_churn.base_customers) *
        100
      : 0;

  return (
    <main className="min-w-0 px-4 py-6 pb-12 sm:px-6 lg:px-8">
      {/* Active-run banner — the dashboard auto-selects the latest completed run;
          switch to older runs via the run selector in the top-right header. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="type-display text-[22px] leading-tight">
          ข้อมูล ณ วันที่ {overview.run.cutoff_date}
        </h2>
        <span className="min-w-0 truncate text-[13px] text-[color:var(--ink-4)]">
          Run: {overview.run.name} — เปลี่ยน run เก่าได้จากตัวเลือกมุมขวาบน
        </span>
      </div>

      <div className="mb-6">
        <RunInsightCard runId={runId} />
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          hint={`run cutoff ${overview.run.cutoff_date}`}
          icon={Users}
          label="Total customers"
          tone="brand"
          value={formatNumber(overview.totals.customers)}
        />
        <MetricCard
          hint={`${overview.monthly_value.months}-month avg from payment history (actual)`}
          icon={Gem}
          label="Avg monthly value"
          tone="warn"
          value={formatCurrency(overview.monthly_value.avg_monthly_revenue)}
        />
        <MetricCard
          hint={`${activeHighRiskPct.toFixed(1)}% of churn-eligible (active paid) — forecast`}
          icon={TrendingDown}
          label="Active high risk"
          tone="danger"
          value={formatNumber(overview.active_churn.high)}
        />
        <MetricCard
          hint="expected 6m loss across active paid — forecast"
          icon={CreditCard}
          label="Revenue at risk"
          tone="warn"
          value={formatCurrency(overview.totals.revenue_at_risk)}
        />
        <MetricCard
          hint="การคาดการณ์ความต้องการในการใช้งาน SMS/Email"
          icon={CalendarClock}
          label="30d credit demand"
          tone="brand"
          value={formatCredits(overview.credit.predicted_usage_30d)}
        />
      </section>

      <section className="mt-6 space-y-6">
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
          <LifecycleMixCard overview={overview} />
          <MonthlyRevenueCard data={monthlyRevenue} />
        </div>
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-3">
          <RiskCard overview={overview} />
          <ValueCard overview={overview} />
          <CreditUrgencyCard overview={overview} />
        </div>
        <ValueRiskMatrixCard runId={runId} summary={summary} />
        <TopPriorityCard runId={runId} summary={summary} />
      </section>

      <section className="surface mt-6 p-4">
        <div
          className={`flex min-w-0 flex-wrap items-center gap-3 text-[11px] text-[color:var(--ink-5)] ${TEXT_SAFE}`}
        >
          <ShieldCheck size={12} />
          Run: {overview.run.name} · cutoff {overview.run.cutoff_date}
          <span className="opacity-50">·</span>
          Models: churn {summary.model_versions.churn} / clv{" "}
          {summary.model_versions.clv} / credit {summary.model_versions.credit}
        </div>
      </section>
    </main>
  );
}
