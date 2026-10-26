"use client";
/**
 * Customer page (UI plan phase 4): profile on the left, four tabs on the right. Every label and ⓘ
 * text follows docs/ui/CONTENT.md §3 and §5.
 */
import { type ChurnFactor, type PaymentEvent, type PredictionOutput } from "@moby/types";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeft, CalendarClock, Coins, Gauge, HeartPulse, Loader2, Sparkles, TrendingDown, Wallet } from "lucide-react";
import { MarkdownLite } from "@/components/chat/markdown-lite";
import { BUTTON, EmptyState, InfoTip, KpiStrip, Panel, StatusPill, type PillTone } from "@/components/ui";
import { generateCustomerAiExplanation } from "@/lib/ml-api";
import {
  formatBaht,
  formatBahtCompact,
  formatCount,
  formatCredits,
  formatDate,
  formatDaysAgo,
  formatDaysAhead,
  formatPercent,
} from "@/lib/format";
import { LIFECYCLE_LABEL, RISK_LABEL, SEGMENT_LABEL, URGENCY_LABEL, VALUE_TIER_LABEL } from "@/lib/labels";
import { getDisplayError } from "@/lib/ui-error";
import { CustomerPaymentChart } from "./customer-payment-chart";
import { CustomerProfilePanel } from "./customer-profile-panel";
import { UsageCreditPanel, type UsageTrendPoint } from "./customer-usage-chart";
import { humanizeFeature } from "./reasoning";

export type { UsageTrendPoint };

const INFO = {
  churn: "โอกาสที่ลูกค้าจะเลิกใช้ ปรับเทียบ (calibration) แล้ว อ่านเป็นเปอร์เซ็นต์ได้ตรง ๆ: 78% คือจากลูกค้าลักษณะนี้ 100 ราย คาดว่าจะเลิกใช้ราว 78 ราย",
  factors: "ผลของแต่ละปัจจัยต่อคะแนนของลูกค้ารายนี้ (SHAP) แถบไปทางขวาทำให้เสี่ยงขึ้น ไปทางซ้ายช่วยลดความเสี่ยง ความยาวเทียบกันได้เฉพาะในลูกค้ารายนี้",
  clv: "ยอดที่คาดว่าจะชำระใน 6 เดือนข้างหน้า คิดจากความถี่และยอดเติมเงินที่ผ่านมา ช่วงคาดการณ์คือค่าต่ำสุด–สูงสุดที่น่าจะเป็น",
  topup: "จำนวนวันที่คาดว่าลูกค้าจะเติมเครดิตครั้งถัดไป นับจากวันตัดข้อมูล ช่วงคาดการณ์บอกว่าอาจเร็วหรือช้าได้แค่ไหน",
  alive: "ความน่าจะเป็นที่ลูกค้ายังเป็นลูกค้าอยู่ ดูจากความถี่และระยะห่างของการซื้อที่ผ่านมา",
  atRisk: "โอกาสเลิกใช้ × มูลค่าที่คาดว่าจะจ่ายใน 6 เดือน ใช้จัดลำดับว่าควรติดต่อใครก่อน",
  credit: "เครดิตที่คาดว่าจะใช้ พร้อมช่วงต่ำสุด–สูงสุด",
  ai: "ข้อความอธิบายที่สร้างโดย AI จากข้อมูลของลูกค้ารายนี้",
};

const RISK_TONE: Record<string, PillTone> = { critical: "negative", high: "warning", medium: "neutral", low: "neutral" };

type Tab = "overview" | "predictions" | "usage" | "payments";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "ภาพรวม" },
  { key: "predictions", label: "การทำนาย" },
  { key: "usage", label: "การใช้งาน" },
  { key: "payments", label: "การชำระเงิน" },
];

export function CustomerDetailView({
  accId,
  customer,
  usageTrend,
  payments,
  runId,
  customersHref,
  onCustomerChange,
}: {
  accId: string;
  customer: PredictionOutput;
  usageTrend: UsageTrendPoint[];
  payments: PaymentEvent[];
  runId?: string;
  customersHref?: string;
  onCustomerChange: (customer: PredictionOutput) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const listHref = customersHref ?? (runId ? `/customers?run=${encodeURIComponent(runId)}` : "/customers");

  return (
    <div className="space-y-5 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <Link href={listHref} className="inline-flex items-center gap-1 text-small text-muted hover:text-text">
        <ArrowLeft size={14} aria-hidden /> รายชื่อลูกค้า
      </Link>

      {customer.needs_review ? (
        <p className="flex flex-wrap items-center gap-2 text-small text-text">
          <StatusPill tone="warning">ควรตรวจสอบ</StatusPill>
          ผลทำนายของลูกค้ารายนี้มีข้อสังเกต ควรให้คนตรวจก่อนใช้
        </p>
      ) : null}

      <div className="grid gap-6 min-[1180px]:grid-cols-[320px_minmax(0,1fr)]">
        <CustomerProfilePanel customer={customer} payments={payments} />

        <div className="min-w-0 space-y-5">
          <nav aria-label="หัวข้อของลูกค้า" className="-mx-1 overflow-x-auto border-b border-border">
            <ul className="flex min-w-max gap-5 px-1">
              {TABS.map((t) => (
                <li key={t.key}>
                  <button
                    type="button"
                    aria-current={tab === t.key ? "true" : undefined}
                    onClick={() => setTab(t.key)}
                    className={`-mb-px h-11 border-b-2 text-body transition-colors duration-150 ${
                      tab === t.key ? "border-text font-medium text-text" : "border-transparent text-muted hover:text-text"
                    }`}
                  >
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {tab === "overview" ? (
            <Overview customer={customer} accId={accId} runId={runId} onCustomerChange={onCustomerChange} />
          ) : tab === "predictions" ? (
            <Predictions customer={customer} />
          ) : tab === "usage" ? (
            <UsageCreditPanel data={usageTrend} daysSinceActivity={customer.days_since_last_activity} />
          ) : (
            <Panel title="การชำระเงิน" meta="ยอดชำระรายเดือนจากตารางการชำระเงิน">
              {payments.length > 0 ? <CustomerPaymentChart payments={payments} /> : <EmptyState title="ไม่มีประวัติการชำระเงิน" />}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── ภาพรวม ─────────────────────────────────────────────────────────────── */

function churnValue(c: PredictionOutput): string {
  if (c.churn_probability != null) return formatPercent(c.churn_probability);
  return c.lifecycle_stage === "Active Paid" ? "ยังไม่มีคะแนน" : "—";
}

function Overview({
  customer: c,
  accId,
  runId,
  onCustomerChange,
}: {
  customer: PredictionOutput;
  accId: string;
  runId?: string;
  onCustomerChange: (customer: PredictionOutput) => void;
}) {
  return (
    <div className="space-y-5">
      <KpiStrip
        items={[
          {
            label: "โอกาสเลิกใช้",
            lead: true,
            value: churnValue(c),
            caption: c.churn_risk_level ? (
              <StatusPill tone={RISK_TONE[c.churn_risk_level]}>{RISK_LABEL[c.churn_risk_level]}</StatusPill>
            ) : c.lifecycle_stage === "Active Paid" ? "ใช้งานไม่ถึง 90 วัน" : "ทำนายเฉพาะลูกค้าที่จ่ายเงิน",
            info: INFO.churn,
          },
          {
            label: "รายได้ที่เสี่ยงหาย",
            value: c.revenue_at_risk != null ? formatBaht(c.revenue_at_risk) : "—",
            caption: c.priority_rank != null ? `อันดับที่ต้องดูแล ${formatCount(c.priority_rank)}` : undefined,
            info: INFO.atRisk,
          },
          {
            label: "มูลค่า 6 เดือน",
            value: c.predicted_clv_6m != null ? formatBahtCompact(c.predicted_clv_6m) : "—",
            caption: VALUE_TIER_LABEL[c.customer_value_tier],
            info: INFO.clv,
          },
          {
            label: "เติมครั้งถัดไป",
            value: formatDaysAhead(c.estimated_days_until_topup),
            caption: c.credit_urgency_level ? URGENCY_LABEL[c.credit_urgency_level] : undefined,
            info: INFO.topup,
          },
        ]}
      />
      <Panel title="ปัจจัยที่มีผล" info={INFO.factors} meta="5 อันดับแรกของลูกค้ารายนี้">
        <FactorBars factors={c.churn_factors} />
      </Panel>
      <AiCard customer={c} accId={accId} runId={runId} onCustomerChange={onCustomerChange} />
    </div>
  );
}

function factorValue(v: number | string): string {
  if (typeof v !== "number") return String(v);
  if (!Number.isFinite(v)) return "—";
  return Math.abs(v) > 0 && Math.abs(v) < 1 ? v.toFixed(2) : formatCount(v);
}

/** Two-way bars: right raises the risk, left lowers it; lengths compare within this customer only. */
function FactorBars({ factors }: { factors: ChurnFactor[] | null }) {
  const rows = (factors ?? []).slice(0, 5);
  if (rows.length === 0) return <EmptyState title="รอบทำนายนี้ไม่มีข้อมูลปัจจัย (SHAP) ของลูกค้ารายนี้" />;
  const max = Math.max(...rows.map((f) => Math.abs(f.impact)), 0) || 1;
  return (
    <ul className="space-y-3" aria-label="ปัจจัยที่มีผลต่อโอกาสเลิกใช้">
      {rows.map((f) => {
        const up = f.direction === "up";
        const width = `${(Math.abs(f.impact) / max) * 50}%`;
        return (
          <li key={f.feature} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3">
            <span className="min-w-0">
              <span className="block truncate text-body text-text">{humanizeFeature(f.feature)}</span>
              <span className="num block text-micro text-muted">
                ค่า {factorValue(f.value)} · {up ? "ทำให้เสี่ยงขึ้น" : "ช่วยลดความเสี่ยง"}
              </span>
            </span>
            <span aria-hidden className="relative h-3">
              <span className="absolute inset-y-[-4px] left-1/2 w-px bg-border" />
              <span
                className="absolute inset-y-0 rounded-[2px]"
                style={{ width, background: up ? "var(--negative)" : "var(--positive)", ...(up ? { left: "50%" } : { right: "50%" }) }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AiCard({
  customer: c,
  accId,
  runId,
  onCustomerChange,
}: {
  customer: PredictionOutput;
  accId: string;
  runId?: string;
  onCustomerChange: (customer: PredictionOutput) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = c.ai_explanation?.trim();

  async function generate() {
    if (!runId) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await generateCustomerAiExplanation(runId, accId, { force: Boolean(text) });
      onCustomerChange({ ...c, ai_status: r.ai_status, ai_explanation: r.ai_explanation });
    } catch (e: unknown) {
      setError(getDisplayError(e, "สร้างสรุปจาก AI ไม่สำเร็จ"));
    } finally {
      setGenerating(false);
    }
  }

  const busy = generating || c.ai_status === "pending";
  return (
    <Panel
      title="สรุปจาก AI"
      info={INFO.ai}
      right={
        <button type="button" onClick={generate} disabled={busy || !runId} className={BUTTON.secondary}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden className="text-accent" />}
          {busy ? "กำลังสรุป…" : text ? "สร้างใหม่" : "สรุปด้วย AI"}
        </button>
      }
    >
      {text ? (
        <div className="max-w-[65ch] text-body text-text">
          <MarkdownLite text={text} strongClassName="font-semibold text-text" />
        </div>
      ) : (
        <p className="text-body text-muted">
          {c.ai_status === "failed" ? "สร้างสรุปจาก AI ไม่สำเร็จ ลองอีกครั้งได้" : "ยังไม่มีสรุปจาก AI สำหรับลูกค้ารายนี้"}
        </p>
      )}
      {error ? <p className="mt-2 text-small text-negative">{error}</p> : null}
    </Panel>
  );
}

/* ── การทำนาย ───────────────────────────────────────────────────────────── */

type Section = "risk" | "value" | "credit";
const SECTIONS: { key: Section | "all"; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "risk", label: "ความเสี่ยงเลิกใช้" },
  { key: "value", label: "มูลค่าและรายได้" },
  { key: "credit", label: "เครดิตและการใช้งาน" },
];

function creditRange(p10: number | undefined, p90: number | undefined): string {
  return p10 != null && p90 != null ? `${formatCount(p10)}–${formatCount(p90)}` : "—";
}

function Predictions({ customer: c }: { customer: PredictionOutput }) {
  const [section, setSection] = useState<Section | "all">("all");
  const show = (s: Section) => section === "all" || section === s;
  const ci = c.credit_forecast_interval;
  const clv = c.clv_forecast_interval;

  return (
    <div className="space-y-6">
      <div role="group" aria-label="หมวดการทำนาย" className="flex max-w-full gap-1 overflow-x-auto rounded-card bg-raised p-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={section === s.key}
            onClick={() => setSection(s.key)}
            className={`h-8 shrink-0 whitespace-nowrap rounded-control px-3 text-body transition-colors duration-150 max-[859px]:h-11 ${
              section === s.key ? "bg-accent-soft font-semibold text-accent-ink" : "text-text hover:bg-surface"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {show("risk") ? (
        <PredictionSection title="ความเสี่ยงเลิกใช้">
          <PredictionCard
            icon={<TrendingDown size={16} />}
            title="โอกาสเลิกใช้"
            value={churnValue(c)}
            info={INFO.churn}
            facts={[
              ["ระดับความเสี่ยง", c.churn_risk_level ? RISK_LABEL[c.churn_risk_level] : "—"],
              ["อันดับที่ต้องดูแล", c.priority_rank != null ? formatCount(c.priority_rank) : "—"],
              ["สถานะลูกค้า", LIFECYCLE_LABEL[c.lifecycle_stage]],
            ]}
            footer={c.churn_probability == null && c.lifecycle_stage === "Active Paid" ? "ยังไม่มีคะแนน · ใช้งานไม่ถึง 90 วัน" : undefined}
          />
          <PredictionCard
            icon={<HeartPulse size={16} />}
            title="โอกาสยังใช้งานอยู่"
            value={c.p_alive != null ? formatPercent(c.p_alive) : "—"}
            info={INFO.alive}
            facts={[
              ["ใช้งานล่าสุด", formatDaysAgo(c.days_since_last_activity)],
              ["จำนวนครั้งที่ชำระ", formatCount(c.n_purchases)],
              ["ลูกค้าตั้งแต่", formatDate(c.profile_snapshot.join_date)],
            ]}
          />
        </PredictionSection>
      ) : null}

      {show("value") ? (
        <PredictionSection title="มูลค่าและรายได้">
          <PredictionCard
            icon={<Coins size={16} />}
            title="มูลค่า 6 เดือน"
            value={c.predicted_clv_6m != null ? formatBaht(c.predicted_clv_6m) : "—"}
            info={INFO.clv}
            facts={[
              ["กลุ่มมูลค่า", VALUE_TIER_LABEL[c.customer_value_tier]],
              ["โอกาสจ่ายใน 6 เดือน", c.clv_pay_probability != null ? formatPercent(c.clv_pay_probability) : "—"],
              ["ช่วงคาดการณ์ (ถ้าจ่าย)", clv ? `${formatBahtCompact(clv.p10)}–${formatBahtCompact(clv.p90)}` : "—"],
            ]}
            footer={c.predicted_clv_6m == null ? "ยังไม่มีประวัติการชำระพอสำหรับประเมิน" : undefined}
          />
          <PredictionCard
            icon={<Wallet size={16} />}
            title="รายได้ที่เสี่ยงหาย"
            value={c.revenue_at_risk != null ? formatBaht(c.revenue_at_risk) : "—"}
            info={INFO.atRisk}
            facts={[
              ["โอกาสเลิกใช้", churnValue(c)],
              ["มูลค่า 6 เดือน", c.predicted_clv_6m != null ? formatBahtCompact(c.predicted_clv_6m) : "—"],
              ["กลุ่มแนะนำ", c.segment && c.segment in SEGMENT_LABEL ? SEGMENT_LABEL[c.segment as keyof typeof SEGMENT_LABEL] : "—"],
            ]}
          />
        </PredictionSection>
      ) : null}

      {show("credit") ? (
        <PredictionSection title="เครดิตและการใช้งาน">
          <PredictionCard
            icon={<CalendarClock size={16} />}
            title="เติมครั้งถัดไป"
            value={formatDaysAhead(c.estimated_days_until_topup)}
            info={INFO.topup}
            facts={[
              ["ความเร่งด่วน", c.credit_urgency_level ? URGENCY_LABEL[c.credit_urgency_level] : "—"],
              ["เครดิต SMS คงเหลือ", formatCount(c.profile_snapshot.credit_sms)],
              ["เครดิต Email คงเหลือ", formatCount(c.profile_snapshot.credit_email)],
            ]}
            footer="ไม่ใช่วันที่เครดิตหมด"
          />
          <PredictionCard
            icon={<Gauge size={16} />}
            title="คาดว่าจะใช้ใน 30 วัน"
            value={c.predicted_credit_usage_30d != null ? formatCredits(c.predicted_credit_usage_30d) : "—"}
            info={INFO.credit}
            facts={[
              ["ช่วงคาดการณ์ 30 วัน", creditRange(ci?.p10_30d, ci?.p90_30d)],
              ["คาดว่าจะใช้ใน 90 วัน", c.predicted_credit_usage_90d != null ? formatCount(c.predicted_credit_usage_90d) : "—"],
              ["ช่วงคาดการณ์ 90 วัน", creditRange(ci?.p10_90d, ci?.p90_90d)],
            ]}
          />
        </PredictionSection>
      ) : null}
    </div>
  );
}

function PredictionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-section font-semibold text-text">{title}</h2>
      <div className="grid gap-4 min-[860px]:grid-cols-2">{children}</div>
    </section>
  );
}

function PredictionCard({
  icon,
  title,
  value,
  info,
  facts,
  footer,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  info: string;
  facts: [string, string][];
  footer?: string;
}) {
  return (
    <article className="surface flex flex-col rounded-card p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-raised text-muted">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-0.5 text-body text-muted">
            {title}
            <InfoTip label={title}>{info}</InfoTip>
          </h3>
          <p className="num text-kpi font-medium text-text">{value}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-rule pt-3">
        {facts.map(([label, v]) => (
          <div key={label} className="min-w-0">
            <dt className="text-micro text-muted">{label}</dt>
            <dd className="num mt-0.5 break-words text-small text-text">{v}</dd>
          </div>
        ))}
      </dl>
      {footer ? <p className="mt-3 text-small text-muted">{footer}</p> : null}
    </article>
  );
}
