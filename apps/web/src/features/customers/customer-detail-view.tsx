"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AiBadge } from "@/components/ai-badge";
import { formatCurrency } from "@/lib/format";
import { MOBY_BRAND } from "@/lib/login-brand-colors";
import type { ChurnFactor, PaymentEvent, ProfileSnapshot } from "@/lib/ml-api";
import {
  CHURN_COLOR,
  FactCard,
  HeroMetric,
  HighValueMedal,
  isHighValueTier,
  LifecycleDetailPill,
  MiniStatCard,
  Panel,
  ReasoningStack,
  SolidDetailPill,
} from "./customer-detail-primitives";
import { CustomerPaymentChart } from "./customer-payment-chart";
import { CustomerProfilePanel } from "./customer-profile-panel";
import { UsageCreditPanel, type UsageTrendPoint } from "./customer-usage-chart";

export type { UsageTrendPoint } from "./customer-usage-chart";

export type CustomerDetail = {
  lifecycle_stage: string;
  sub_stage: string;
  churn_probability: number | null;
  churn_risk_level: string | null;
  predicted_clv_6m: number | null;
  p_alive: number | null;
  customer_value_tier: string;
  revenue_at_risk: number | null;
  predicted_credit_usage_30d: number | null;
  predicted_credit_usage_90d: number | null;
  credit_forecast_interval: {
    p10_30d: number;
    p90_30d: number;
    p10_90d: number;
    p90_90d: number;
  } | null;
  estimated_days_until_topup: number | null;
  credit_urgency_level: string | null;
  usage_trend: "increasing" | "stable" | "declining" | "no_usage";
  days_since_last_activity: number | null;
  n_purchases: number;
  total_revenue: number;
  avg_transaction_value: number | null;
  ever_paid: boolean;
  segment: string | null;
  priority_rank: number | null;
  needs_review: boolean;
  profile_snapshot: ProfileSnapshot;
  churn_factors: ChurnFactor[] | null;
  ai_status: "not_requested" | "pending" | "completed" | "failed";
  ai_explanation: string | null;
  output_status: string;
};

const USAGE_TREND_BADGE: Record<
  CustomerDetail["usage_trend"],
  { label: string; color: string } | null
> = {
  declining: { color: CHURN_COLOR, label: "ใช้งานลดลง" },
  increasing: { color: "#10b981", label: "ใช้งานเพิ่มขึ้น" },
  no_usage: null,
  stable: { color: "#9ca3af", label: "ใช้งานคงที่" },
};

export function CustomerDetailView({
  accId,
  customer,
  usageTrend,
  payments,
  runId,
  customersHref,
}: {
  accId: string;
  customer: CustomerDetail;
  usageTrend: UsageTrendPoint[];
  payments: PaymentEvent[];
  runId?: string;
  customersHref?: string;
}) {
  const churnPct =
    customer.churn_probability === null
      ? null
      : customer.churn_probability * 100;
  const pAlivePct = customer.p_alive === null ? null : customer.p_alive * 100;
  const latestUsage = usageTrend.at(-1);
  const peakUsage =
    usageTrend.length > 0
      ? Math.max(...usageTrend.map((point) => point.total))
      : null;
  const showSubStage =
    Boolean(customer.sub_stage) &&
    customer.sub_stage !== customer.lifecycle_stage;
  const customerListHref =
    customersHref ??
    (runId ? `/customers?run=${encodeURIComponent(runId)}` : "/customers");

  const trend = USAGE_TREND_BADGE[customer.usage_trend];
  const creditRange = (
    point: number | null,
    p10: number | null,
    p90: number | null
  ): string => {
    if (point === null) {
      return "—";
    }
    const base = point.toLocaleString();
    if (p10 === null || p90 === null) {
      return base;
    }
    return `${base} (${p10.toLocaleString()}–${p90.toLocaleString()})`;
  };
  const interval = customer.credit_forecast_interval;

  return (
    <main className="px-8 py-6 pb-12">
      <Link
        className="inline-flex items-center gap-1 font-semibold text-[11px] text-[color:var(--ink-5)] uppercase tracking-[.16em] hover:text-[color:var(--moby-600)]"
        href={customerListHref}
      >
        <ArrowLeft size={11} /> Customers
      </Link>

      {customer.needs_review && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 font-medium text-[13px] text-amber-800">
          <AlertTriangle className="shrink-0" size={15} />
          ลูกค้ารายนี้ถูกตั้งค่าให้ตรวจสอบด้วยมือ (needs review) — ผลโมเดลอาจไม่น่าเชื่อถือเต็มที่
        </div>
      )}

      <section className="mt-4 space-y-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)_340px] xl:items-stretch">
          <Panel title={`Account ${accId}`}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {isHighValueTier(customer.customer_value_tier) ? (
                  <HighValueMedal />
                ) : null}
                <LifecycleDetailPill stage={customer.lifecycle_stage} />
                {customer.segment && (
                  <SolidDetailPill color={MOBY_BRAND.dark}>
                    {customer.segment}
                    {customer.priority_rank === null
                      ? ""
                      : ` · #${customer.priority_rank}`}
                  </SolidDetailPill>
                )}
                {showSubStage && (
                  <SolidDetailPill color="#9ca3af">
                    {customer.sub_stage}
                  </SolidDetailPill>
                )}
                {customer.churn_risk_level && (
                  <SolidDetailPill color={CHURN_COLOR} dot>
                    {customer.churn_risk_level} churn risk
                  </SolidDetailPill>
                )}
                {trend && (
                  <SolidDetailPill color={trend.color}>
                    {trend.label}
                  </SolidDetailPill>
                )}
              </div>

              <div className="space-y-3">
                <HeroMetric
                  hint={
                    customer.churn_risk_level ??
                    // Active-Paid but no score = abstained (too little history to
                    // trust), not "ineligible". Say so instead of implying non-active.
                    (customer.lifecycle_stage === "Active Paid"
                      ? "ข้อมูลไม่พอ (abstain)"
                      : "not eligible")
                  }
                  label="Churn"
                  value={churnPct === null ? "—" : `${churnPct.toFixed(1)}%`}
                  valueColor={CHURN_COLOR}
                />
                <HeroMetric
                  hint="ยังใช้บริการอยู่ (BG/NBD)"
                  label="P(alive)"
                  value={pAlivePct === null ? "—" : `${pAlivePct.toFixed(0)}%`}
                  valueColor={MOBY_BRAND.blue}
                />
                <HeroMetric
                  hint={customer.customer_value_tier}
                  label="CLV 6m"
                  value={
                    customer.predicted_clv_6m === null
                      ? "—"
                      : formatCurrency(customer.predicted_clv_6m)
                  }
                />
                <HeroMetric
                  hint="มูลค่าที่เสี่ยงสูญเสีย"
                  label="Revenue risk"
                  value={
                    customer.revenue_at_risk === null
                      ? "—"
                      : formatCurrency(customer.revenue_at_risk)
                  }
                />
                <HeroMetric
                  hint={customer.credit_urgency_level ?? "ข้อมูลไม่พอประเมิน"}
                  label="Top-up risk"
                  value={
                    customer.estimated_days_until_topup === null
                      ? "—"
                      : `${customer.estimated_days_until_topup}d`
                  }
                />
              </div>
            </div>
          </Panel>

          <UsageCreditPanel data={usageTrend}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MiniStatCard
                hint={
                  latestUsage ? `${latestUsage.month} เครดิต` : "ไม่มีข้อมูลการใช้งาน"
                }
                label="ใช้งานล่าสุด"
                value={latestUsage?.total.toLocaleString() ?? "—"}
              />
              <MiniStatCard
                hint="ย้อนหลัง 12 เดือน"
                label="ใช้งานสูงสุด"
                value={peakUsage === null ? "—" : peakUsage.toLocaleString()}
              />
              <MiniStatCard
                hint="นับจากใช้งานล่าสุด"
                label="ไม่มีการใช้งาน"
                value={
                  customer.days_since_last_activity === null
                    ? "—"
                    : `${customer.days_since_last_activity} วัน`
                }
              />
            </div>
          </UsageCreditPanel>

          <div className="flex min-h-0 flex-col xl:row-span-2">
            <Panel
              bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              className="flex min-h-0 flex-1 flex-col"
              headerRight={<AiBadge />}
              title="พฤติกรรมลูกค้า"
            >
              <ReasoningStack customer={customer} />
            </Panel>
          </div>

          <Panel className="xl:col-span-2" title="โปรไฟล์ลูกค้า">
            <CustomerProfilePanel snapshot={customer.profile_snapshot} />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)] xl:items-start">
          <Panel title="ข้อมูลสรุป">
            <div className="grid grid-cols-2 gap-3">
              <FactCard label="สถานะ" value={customer.lifecycle_stage} />
              <FactCard
                label="จำนวนการชำระ"
                value={customer.n_purchases.toLocaleString()}
              />
              <FactCard
                label="รายได้รวม"
                value={formatCurrency(customer.total_revenue)}
              />
              <FactCard
                label="เฉลี่ยต่อครั้ง"
                value={
                  customer.avg_transaction_value === null
                    ? "—"
                    : formatCurrency(customer.avg_transaction_value)
                }
              />
              <FactCard
                label="เครดิต 30 วัน (p10–90)"
                value={creditRange(
                  customer.predicted_credit_usage_30d,
                  interval?.p10_30d ?? null,
                  interval?.p90_30d ?? null
                )}
              />
              <FactCard
                label="เครดิต 90 วัน (p10–90)"
                value={creditRange(
                  customer.predicted_credit_usage_90d,
                  interval?.p10_90d ?? null,
                  interval?.p90_90d ?? null
                )}
              />
            </div>
          </Panel>

          <Panel title="ประวัติการชำระเงิน">
            <CustomerPaymentChart payments={payments} />
          </Panel>
        </div>
      </section>
    </main>
  );
}
