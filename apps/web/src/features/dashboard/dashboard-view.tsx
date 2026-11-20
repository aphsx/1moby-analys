"use client";
/**
 * Overview page (DASHBOARD.md). Its question: how is the business doing, and which paying customers
 * should we act on first? Section 1 is facts from imported data; section 2 is model output plus one
 * usage signal. Every number comes from overviewModel().
 */
import Link from "next/link";
import { type ReactNode } from "react";
import { type PredictionRun, type RunSummary } from "@moby/types";
import { NoRunState, RunScope } from "@/components/run-selector";
import { BUTTON, Delta, KpiStrip, PageHeader, Provenance, Skeleton, Swatch } from "@/components/ui";
import { fetchRunSummary } from "@/lib/ml-api";
import { formatBahtCompact, formatCount, formatDate, formatMonth, formatPercent } from "@/lib/format";
import { riskRange } from "@/lib/labels";
import { getRouteTitle } from "@/lib/nav";
import { getDisplayError } from "@/lib/ui-error";
import { useAsync } from "@/lib/use-async";
import { useActiveRun } from "@/stores/run-store";
import { AiSummaryLine } from "./ai-summary-line";
import { assertAtRiskMatches, grew, overviewModel, type OverviewModel } from "./overview-model";
import { CustomerBase } from "./customer-base";
import { MonthlyTrend } from "./monthly-trend";
import { RevenueConcentration } from "./revenue-concentration";
import { NextTopup } from "./next-topup";
import { RiskMap } from "./risk-map";
import { SendingMonths } from "./sending-months";
import { TopRiskTable } from "./top-risk-table";

const TITLE = getRouteTitle("/") ?? "";

export function DashboardView() {
  const { run, runId, loading: runsLoading } = useActiveRun();
  const loaded = useAsync(() => fetchRunSummary(runId), [runId], Boolean(runId));
  const summary = loaded.data;
  const model = summary ? overviewModel(summary) : null;
  if (summary && model) assertAtRiskMatches(model, summary);

  let body;
  if (!runsLoading && !run) {
    body = <NoRunState />;
  } else if (loaded.error) {
    body = (
      <div className="rounded-card border border-border bg-surface p-5 text-body text-text">
        โหลดภาพรวมไม่สำเร็จ: {getDisplayError(loaded.error, "เกิดข้อผิดพลาด")}{" "}
        <button type="button" onClick={loaded.reload} className="text-accent-ink underline underline-offset-2">
          ลองอีกครั้ง
        </button>
      </div>
    );
  } else if (!summary || !model) {
    body = <OverviewSkeleton />;
  } else {
    body = <OverviewBody summary={summary} model={model} run={run} runId={runId} />;
  }

  return (
    <>
      <PageHeader
        title={TITLE}
        meta={summary ? dataPeriod(summary) : undefined}
        finding={
          model ? (
            <>
              <p>{finding(model)}</p>
              <AiSummaryLine runId={runId} />
            </>
          ) : undefined
        }
        action={
          model && model.scored > 0 ? (
            <Link href={`/customers?run=${encodeURIComponent(runId)}`} className={BUTTON.primary}>
              เปิดรายชื่อที่ต้องโทร
            </Link>
          ) : undefined
        }
        scope={<RunScope />}
      />
      <div className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">{body}</div>
    </>
  );
}

function dataPeriod(s: RunSummary): string {
  const last = s.revenue.monthly_actual.at(-1)?.month;
  const period = s.run.data_start && last ? `${formatMonth(s.run.data_start, true)} – ${formatMonth(last, true)} · ` : "";
  return `ข้อมูลการชำระเงินและการใช้งานจริง ${period}ผลทำนายรอบ ${formatDate(s.run.cutoff_date)}`;
}

/** One sentence about the data, not about the screen (docs/ui/CONTENT.md §1). */
function finding(m: OverviewModel): string {
  if (m.atRisk <= 0) return "รอบนี้ยังไม่มีรายได้ที่เสี่ยงหาย";
  const tier = `${formatPercent(m.highTier.share)} ของรายได้ที่เสี่ยงหายอยู่กับลูกค้ามูลค่าสูง ${formatCount(m.highTier.count)} ราย`;
  const head = m.callListHead
    ? ` · ${formatCount(m.callListHead.count)} รายถือ ${formatPercent(m.callListHead.share)} ของรายได้ที่เสี่ยงหาย`
    : "";
  return tier + head;
}

// Rows at 1440: 1440 − 232 sidebar − 64 padding = 1144; wide = 1144 − 360 narrow − 24 gap = 760.
// Below 1180 every row stacks in source order.
const ROW = "grid gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]";

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="space-y-4 pt-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-section font-semibold text-text">{title}</h2>
        <p className="text-small text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function OverviewBody({
  summary,
  model,
  run,
  runId,
}: {
  summary: RunSummary;
  model: OverviewModel;
  run: PredictionRun | null;
  runId: string;
}) {
  const cutoff = formatDate(summary.run.cutoff_date);
  return (
    <div className="space-y-6">
      <Kpis summary={summary} model={model} />
      <Section title={`ธุรกิจปี ${model.yearLabel}`} description="รายได้มาจากไหน และฐานลูกค้าเป็นอย่างไร">
        <div className={ROW}>
          <MonthlyTrend model={model} />
          <RevenueConcentration data={summary.revenue_concentration} yearLabel={model.yearLabel} />
        </div>
        <CustomerBase
          model={model}
          runId={runId}
          cutoff={summary.run.cutoff_date}
          dataStart={summary.run.data_start}
          churnedEverPaid={summary.lifecycle_detail.churned_ever_paid}
        />
      </Section>
      <Section
        title="ลูกค้าที่จ่ายเงิน · ใครเสี่ยงจะหาย"
        description={`${formatCount(summary.lifecycle.active_paid)} ราย · ผลทำนายรอบ ${cutoff} และสัญญาณจากการใช้งานจริง`}
      >
        <div className={ROW}>
          <RiskMap model={model} thresholds={summary.churn.thresholds} runId={runId} />
          <SendingMonths data={summary.sending_months} runId={runId} />
        </div>
        <div className={ROW}>
          <TopRiskTable rows={summary.top_priority} runId={runId} />
          <NextTopup model={model} credit={summary.credit} cutoff={summary.run.cutoff_date} runId={runId} />
        </div>
      </Section>
      <p className="text-small text-muted">
        ตัวเลขที่ติด “ข้อมูลจริง” มาจากข้อมูลที่นำเข้า{run?.predict_source_name ? ` (รอบข้อมูล ${run.predict_source_name})` : ""} ·
        ตัวเลขที่ติด “คาดการณ์” มาจากโมเดล: churn {summary.model_versions.churn || "—"} · clv{" "}
        {summary.model_versions.clv || "—"} · credit {summary.model_versions.credit || "—"}
      </p>
    </div>
  );
}

function Kpis({ summary, model }: { summary: RunSummary; model: OverviewModel }) {
  const rev = model.trend.rev;
  const first = rev.months[0]?.month;
  const last = rev.months.at(-1)?.month;
  const c = model.topContributor;
  const ranges = riskRange(summary.churn.thresholds);
  const meter = model.clvTotal > 0 ? model.atRisk / model.clvTotal : null;
  const { critical, high, eligible } = model.highRisk;

  return (
    <KpiStrip
      items={[
        {
          label: `รายได้ปี ${model.yearLabel}`,
          value: formatBahtCompact(model.revenue12m),
          caption: <Delta value={rev.growth} base="ครึ่งปีหลัง เทียบครึ่งปีแรก" />,
          chip: <Provenance kind="fact" />,
          info: [
            `เงินที่ลูกค้าชำระจริงรวมกันตั้งแต่ ${first ? formatMonth(first, true) : ""} ถึง ${last ? formatMonth(last, true) : ""} จากตารางการชำระเงิน ตามวันที่ชำระ`,
            model.revenueChange != null ? `เทียบ 12 เดือนก่อนหน้า ${grew(model.revenueChange)}` : "",
            c && c.growthEx != null ? `ไม่นับบัญชี #${c.accId} รายได้ครึ่งปีหลัง${grew(c.growthEx)}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        },
        {
          label: "ลูกค้าที่ใช้งาน",
          value: formatCount(model.active),
          unit: "ราย",
          caption: `จ่ายเงิน ${formatCount(summary.lifecycle.active_paid)} · จาก ${formatCount(model.totalCustomers)} บัญชี`,
          chip: <Provenance kind="fact" />,
          info: "บัญชีที่ส่งข้อความหรือชำระเงินภายใน 180 วันก่อนวันตัดข้อมูล คือสถานะ “ใช้งาน · จ่ายเงิน” และ “ใช้งาน · ไม่ได้เติมเงิน”",
        },
        {
          label: "รายได้เสี่ยงหาย 6 เดือน",
          lead: true,
          value: formatBahtCompact(model.atRisk),
          chip: <Provenance kind="forecast" />,
          viz:
            meter != null ? (
              <div
                role="img"
                aria-label={`รายได้เสี่ยงหาย ${formatPercent(meter)} ของมูลค่าที่คาดว่าจะได้ใน 6 เดือน`}
                className="h-2 overflow-hidden rounded-full"
                style={{ background: "var(--risk-emph-track)" }}
              >
                <div className="h-full rounded-full" style={{ width: `${meter * 100}%`, background: "var(--risk-emph)" }} />
              </div>
            ) : undefined,
          caption: meter != null ? `${formatPercent(meter)} ของ ${formatBahtCompact(model.clvTotal)} ที่คาดว่าจะได้ใน 6 เดือน` : undefined,
          info: `ผลรวมของ โอกาสเลิกใช้ × มูลค่าที่คาดว่าจะจ่ายใน 6 เดือน ของลูกค้า ${formatCount(model.scored)} รายที่มีคะแนน เป็นค่าคาดหวัง ไม่ใช่เงินที่หายไปแล้ว อีก ${formatCount(model.unscored)} รายใช้งานไม่ถึง 90 วัน ยังไม่มีคะแนน · มูลค่า 6 เดือนเป็นค่าที่โมเดลคาด เทียบกับรายได้จริง 6 เดือนล่าสุด ${formatBahtCompact(model.revenueLast6m)}`,
        },
        {
          label: "เสี่ยงเลิกใช้สูง",
          value: eligible > 0 ? formatCount(critical + high) : "—",
          unit: eligible > 0 ? "ราย" : undefined,
          chip: <Provenance kind="forecast" />,
          viz: eligible > 0 ? <RiskSplit critical={critical} high={high} eligible={eligible} /> : undefined,
          caption:
            eligible > 0 ? (
              <span className="flex flex-wrap gap-x-3">
                <Swatch color="var(--heat-4)">วิกฤต {formatCount(critical)}</Swatch>
                <Swatch color="var(--heat-3)">สูง {formatCount(high)}</Swatch>
                <span>จาก {formatCount(eligible)} ราย</span>
              </span>
            ) : (
              "ยังไม่มีคะแนนความเสี่ยงในรอบนี้"
            ),
          info: `ลูกค้าที่จ่ายเงินซึ่งมีโอกาสไม่ใช้งานและไม่ชำระเงินเลยใน 180 วันข้างหน้า ระดับสูง (${ranges.high}) หรือวิกฤต (${ranges.critical}) ประเมินเฉพาะลูกค้าที่ใช้งานมาเกิน 90 วัน ${formatCount(eligible)} ราย`,
        },
      ]}
    />
  );
}

function RiskSplit({ critical, high, eligible }: { critical: number; high: number; eligible: number }) {
  const rest = Math.max(0, eligible - critical - high);
  return (
    <div
      role="img"
      aria-label={`วิกฤต ${formatCount(critical)} ราย สูง ${formatCount(high)} ราย จากลูกค้าที่มีคะแนน ${formatCount(eligible)} ราย`}
      className="flex h-2 gap-0.5"
    >
      {[
        [critical, "var(--heat-4)"],
        [high, "var(--heat-3)"],
        [rest, "var(--raised)"],
      ].map(([n, color], i) =>
        Number(n) > 0 ? <span key={i} className="h-full rounded-full" style={{ flexGrow: Number(n), background: String(color) }} /> : null
      )}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[124px]" />
      <div className={ROW}>
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
      <Skeleton className="h-[220px]" />
      <div className={ROW}>
        <Skeleton className="h-[640px]" />
        <Skeleton className="h-[640px]" />
      </div>
      <div className={ROW}>
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
    </div>
  );
}
