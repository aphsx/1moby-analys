"use client";
/** Left panel of the customer page: who they are, how they use the service, how they pay. */
import { type PaymentEvent, type PredictionOutput } from "@moby/types";
import { type ReactNode } from "react";
import { StatusPill } from "@/components/ui";
import { formatBaht, formatCount, formatCredits, formatDate, formatDaysAgo, formatPercent } from "@/lib/format";
import { CHANNEL_LABEL, LIFECYCLE_LABEL, SEGMENT_LABEL, VALUE_TIER_LABEL } from "@/lib/labels";

// ShareBar parts take the one-hue risk ladder, darkest first (DESIGN.md §4, §7)
const CHANNELS = [
  { key: "bc_usage_share", label: CHANNEL_LABEL.bc, color: "var(--risk-critical)" },
  { key: "api_usage_share", label: CHANNEL_LABEL.api, color: "var(--risk-high)" },
  { key: "otp_usage_share", label: CHANNEL_LABEL.otp, color: "var(--risk-medium)" },
  { key: "email_usage_share", label: CHANNEL_LABEL.email, color: "var(--risk-low)" },
] as const;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function CustomerProfilePanel({ customer: c, payments }: { customer: PredictionOutput; payments: PaymentEvent[] }) {
  const s = c.profile_snapshot;
  const lastPayment = payments.reduce<string | null>((a, p) => (!a || p.payment_date > a ? p.payment_date : a), null);
  const shares = CHANNELS.map((ch) => ({ ...ch, share: Math.max(0, s[ch.key] ?? 0) }));
  const used = shares.filter((ch) => ch.share > 0);

  return (
    <aside className="surface h-fit space-y-5 rounded-card p-5 max-[1179px]:order-last" aria-label="ข้อมูลลูกค้า">
      <div className="flex flex-wrap gap-2">
        <StatusPill tone={c.customer_value_tier === "high" ? "accent" : "neutral"}>{VALUE_TIER_LABEL[c.customer_value_tier]}</StatusPill>
        <StatusPill>{LIFECYCLE_LABEL[c.lifecycle_stage]}</StatusPill>
        {c.segment && c.segment in SEGMENT_LABEL ? (
          <StatusPill>{SEGMENT_LABEL[c.segment as keyof typeof SEGMENT_LABEL]}</StatusPill>
        ) : null}
      </div>

      <Facts>
        <Fact label="ลูกค้าตั้งแต่" value={formatDate(s.join_date)} hint={`${formatCount(s.customer_age_days)} วัน`} />
        <Fact label="ใช้งานล่าสุด" value={formatDaysAgo(c.days_since_last_activity)} />
        <Fact label="เข้าระบบล่าสุด" value={formatDate(s.last_access)} hint={formatDaysAgo(daysSince(s.last_access))} />
        <Fact label="ส่งข้อความล่าสุด" value={formatDate(s.last_send)} hint={formatDaysAgo(daysSince(s.last_send))} />
      </Facts>

      <Group title="ช่องทางที่ใช้ · 180 วัน" right={formatCredits(s.usage_total_180d)}>
        {used.length === 0 ? (
          <p className="text-small text-muted">ไม่มีการใช้งานใน 180 วัน</p>
        ) : (
          <>
            {/* one 100% bar split by 2px gaps (ShareBar) */}
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={used.map((ch) => `${ch.label} ${formatPercent(ch.share)}`).join(", ")}>
              {used.map((ch) => (
                <span key={ch.key} style={{ flexGrow: ch.share, background: ch.color }} />
              ))}
            </div>
            <ul className="mt-2 space-y-1">
              {shares.map((ch) => (
                <li key={ch.key} className="flex items-center justify-between gap-3 text-small">
                  <span className="flex items-center gap-2 text-text">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: ch.color }} />
                    {ch.label}
                  </span>
                  <span className="num text-muted">{formatPercent(ch.share)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Group>

      <Group title="เครดิตคงเหลือ">
        <Facts>
          <Fact label="SMS" value={formatCredits(s.credit_sms)} hint={s.expire_sms ? `หมดอายุ ${formatDate(s.expire_sms)}` : undefined} tag={s.status_sms} />
          <Fact label="Email" value={formatCredits(s.credit_email)} hint={s.expire_email ? `หมดอายุ ${formatDate(s.expire_email)}` : undefined} tag={s.status_email} />
        </Facts>
      </Group>

      <Group title="การชำระเงิน">
        <Facts>
          <Fact label="ยอดชำระรวม" value={formatBaht(c.total_revenue)} />
          <Fact label="จำนวนครั้งที่ชำระ" value={`${formatCount(c.n_purchases)} ครั้ง`} />
          <Fact label="ยอดเฉลี่ยต่อครั้ง" value={c.avg_transaction_value != null ? formatBaht(c.avg_transaction_value) : "—"} />
          <Fact label="ชำระครั้งล่าสุด" value={formatDate(lastPayment)} />
        </Facts>
      </Group>
    </aside>
  );
}

function Group({ title, right, children }: { title: string; right?: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule pt-4">
      <h2 className="mb-2 flex items-baseline justify-between gap-3 text-small font-semibold text-text">
        {title}
        {right ? <span className="num font-normal text-muted">{right}</span> : null}
      </h2>
      {children}
    </section>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="space-y-2">{children}</dl>;
}

function Fact({ label, value, hint, tag }: { label: string; value: string; hint?: string; tag?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="num min-w-0 text-right text-small text-text">
        {tag ? <span className="mr-1.5 align-middle"><StatusPill>{tag}</StatusPill></span> : null}
        {value}
        {hint ? <span className="block text-micro text-muted">{hint}</span> : null}
      </dd>
    </div>
  );
}
