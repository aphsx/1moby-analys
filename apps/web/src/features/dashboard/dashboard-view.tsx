"use client";
/**
 * Overview page (UI plan phase 2). Its question: which revenue is at risk, and who holds it.
 * The largest block (RiskMap) answers it; the KPI strip and the rail support it.
 */
import Link from "next/link";
import { type RunSummary } from "@moby/types";
import { RunScope } from "@/components/run-selector";
import { BUTTON, Delta, EmptyState, KpiStrip, PageHeader, Skeleton } from "@/components/ui";
import { fetchRunSummary } from "@/lib/ml-api";
import { formatBahtCompact, formatCount, formatDate, formatPercent } from "@/lib/format";
import { getRouteTitle } from "@/lib/nav";
import { getDisplayError } from "@/lib/ui-error";
import { useAsync } from "@/lib/use-async";
import { useActiveRun } from "@/stores/run-store";
import { AiSummaryLine } from "./ai-summary-line";
import { MonthlyRevenue } from "./monthly-revenue";
import { CallFirstList, TopupUrgency } from "./overview-rail";
import { assertAtRiskMatches, overviewModel, type OverviewModel } from "./overview-model";
import { RiskMap } from "./risk-map";

const TITLE = getRouteTitle("/") ?? "";

export function DashboardView() {
  const { run, runId, loading: runsLoading } = useActiveRun();
  const loaded = useAsync(() => fetchRunSummary(runId), [runId], Boolean(runId));
  const summary = loaded.data;
  const model = summary ? overviewModel(summary) : null;
  if (summary && model) assertAtRiskMatches(model, summary);

  const callFirstHref = `/customers?run=${encodeURIComponent(runId)}&customer_value_tier=high&churn_risk_level=high,critical&sort=revenue_at_risk:desc`;

  let body;
  if (!runsLoading && !run) {
    body = (
      <EmptyState
        title="ยังไม่มีผลทำนาย"
        hint="อัปโหลดข้อมูลแล้วสร้างรอบทำนายแรกได้ที่ “รอบทำนาย”"
        action={<Link href="/runs" className={BUTTON.primary}>สร้างรอบทำนาย</Link>}
      />
    );
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
    body = <OverviewBody summary={summary} model={model} runId={runId} callFirstHref={callFirstHref} />;
  }

  return (
    <>
      <PageHeader
        title={TITLE}
        finding={
          model ? (
            <>
              <p>{finding(model)}</p>
              <AiSummaryLine runId={runId} />
            </>
          ) : undefined
        }
        action={
          model && model.callFirst.count > 0 ? (
            <Link href={callFirstHref} className={BUTTON.primary}>
              เปิดรายชื่อ {formatCount(model.callFirst.count)} ราย
            </Link>
          ) : undefined
        }
        scope={<RunScope />}
      />
      <div className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">{body}</div>
    </>
  );
}

/** One sentence about the data, not about the screen (docs/ui/CONTENT.md §1). */
function finding(m: OverviewModel): string {
  if (m.atRisk <= 0) return "รอบนี้ยังไม่มีรายได้ที่เสี่ยงหาย";
  const tier = `${formatPercent(m.highTier.share)} ของรายได้ที่เสี่ยงหายอยู่กับลูกค้ามูลค่าสูง ${formatCount(m.highTier.count)} ราย`;
  if (m.callFirst.count === 0) return `${tier} ไม่มีรายใดเสี่ยงสูง`;
  return `${tier} ในนั้น ${formatCount(m.callFirst.count)} รายเสี่ยงสูงขึ้นไป`;
}

// Grid at 1440: 1440 − 232 sidebar − 64 padding = 1144; main = 1144 − 384 rail − 24 gap = 736.
// Below 1180 the rail drops under the main column.
const GRID = "grid gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_384px]";

function OverviewBody({
  summary,
  model,
  runId,
  callFirstHref,
}: {
  summary: RunSummary;
  model: OverviewModel;
  runId: string;
  callFirstHref: string;
}) {
  const cutoff = formatDate(summary.run.cutoff_date);
  return (
    <div className={GRID}>
      <div className="min-w-0 space-y-6">
        <KpiStrip
          items={[
            {
              label: "รายได้ที่เสี่ยงหาย",
              lead: true,
              value: formatBahtCompact(model.atRisk),
              caption: `จากมูลค่า 6 เดือน ${formatBahtCompact(model.clvTotal)}`,
              info: `ผลรวมของ โอกาสเลิกใช้ × มูลค่าที่คาดว่าจะจ่ายใน 6 เดือน ของลูกค้า ${formatCount(model.scored)} รายที่มีคะแนน อีก ${formatCount(model.unscored)} รายใช้งานไม่ถึง 90 วัน ยังไม่มีคะแนน`,
            },
            {
              label: "รายได้ 12 เดือน",
              value: formatBahtCompact(model.revenue12m),
              caption: <Delta value={model.revenueChange} base="จากปีก่อน" />,
              info: "ยอดเติมเครดิตรวม 12 เดือนก่อนวันตัดข้อมูล จากตารางการชำระเงิน เทียบกับ 12 เดือนก่อนหน้านั้น",
            },
            {
              label: "ไม่มีการใช้งาน",
              value: formatCount(model.paidNoUsage),
              unit: "ราย",
              caption: `จากลูกค้าที่จ่ายเงิน ${formatCount(model.paidCustomers)} ราย`,
              info: "ลูกค้าที่ใช้งานและจ่ายเงิน แต่ไม่ได้ส่งข้อความเลยใน 180 วันก่อนวันตัดข้อมูล",
            },
            {
              label: "ต้องเติมเครดิตใน 14 วัน",
              value: formatCount(summary.credit.by_urgency.critical),
              unit: "ราย",
              caption: `ใน 7 วัน ${formatCount(summary.credit.topup_due_7d)} ราย`,
              info: `วันที่คาดว่าลูกค้าจะเติมเครดิตครั้งถัดไป ทำนายจากรอบการเติมเงินที่ผ่านมา นับจากวันตัดข้อมูล ${cutoff}`,
            },
          ]}
        />
        <RiskMap model={model} thresholds={summary.churn.thresholds} runId={runId} />
      </div>
      <aside className="space-y-6" aria-label="รายการที่ต้องดูแล">
        <CallFirstList rows={summary.top_priority} total={model.callFirst.count} listHref={callFirstHref} runId={runId} />
        <TopupUrgency credit={summary.credit} runId={runId} />
        {/* in the rail so main and rail end near each other (DESIGN.md §5) */}
        <MonthlyRevenue model={model} />
      </aside>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className={GRID}>
      <div className="min-w-0 space-y-6">
        <Skeleton className="h-[124px]" />
        <Skeleton className="h-[540px]" />
      </div>
      <div className="space-y-6">
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[180px]" />
        <Skeleton className="h-[340px]" />
      </div>
    </div>
  );
}
