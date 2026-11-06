"use client";
/** การใช้งาน tab and the overview's usage chart: 12 months before the cutoff (CUSTOMER-PAGES.md §3.2, §3.4). */
import type { MonthlyUsagePoint, PaymentEvent } from "@moby/types";
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, KpiStrip, Panel } from "@/components/ui";
import { formatBahtCompact, formatCount, formatCountCompact, formatDate, formatMonth, formatPercent } from "@/lib/format";
import { trailingIdleMonths } from "./customer-model";

const AXIS = { axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "var(--axis-ink)" } } as const;
const TIP_STYLE = { background: "var(--tip-bg)", color: "var(--tip-ink)", boxShadow: "var(--shadow-float)" };

// bc/api/otp is how each message was sent and covers SMS and Email rows, so they sum to the total; never stack Email on top.
const SOURCES = [
  { key: "bc", label: "ส่งเอง", color: "var(--risk-critical)" },
  { key: "api", label: "API", color: "var(--risk-high)" },
  { key: "otp", label: "OTP", color: "var(--risk-medium)" },
] as const;

/** Bars = messages per month; dots above = months with a top-up, labelled with the amount. */
export function UsageTopupChart({ usage, payments }: { usage: MonthlyUsagePoint[]; payments: PaymentEvent[] }) {
  const paid = new Map<string, number>();
  for (const p of payments) paid.set(p.payment_date.slice(0, 7), (paid.get(p.payment_date.slice(0, 7)) ?? 0) + p.amount);
  const rows = usage.map((u) => {
    const amount = paid.get(u.month);
    return { month: u.month, label: formatMonth(u.month), total: u.total, amount, marker: amount != null ? 1 : null, tag: amount != null ? formatBahtCompact(amount) : "" };
  });
  const idle = trailingIdleMonths(usage);
  const topups = rows.filter((r) => r.amount != null).length;

  return (
    <Panel
      title="การใช้งานและการเติมเงิน"
      info="แท่งคือจำนวนข้อความต่อเดือน จุดด้านบนคือเดือนที่มีการเติมเงินพร้อมยอด เป็นข้อมูลจริงก่อนวันตัดข้อมูล ไม่ใช่ผลทำนาย"
      meta={idle > 0 && idle < usage.length ? `ไม่มีการส่งข้อความ ${formatCount(idle)} เดือนล่าสุด` : "12 เดือนก่อนวันตัดข้อมูล"}
    >
      {usage.length === 0 ? (
        <EmptyState title="ไม่มีข้อมูลการใช้งานในช่วงนี้" />
      ) : (
        <div
          role="img"
          aria-label={`ข้อความรวม ${formatCount(usage.reduce((s, u) => s + u.total, 0))} ใน ${usage.length} เดือน เติมเงิน ${topups} เดือน${idle > 0 ? ` ไม่มีการส่งข้อความ ${idle} เดือนล่าสุด` : ""}`}
          className="h-[260px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
              {/* headroom so the tallest bar stays under the top-up dots */}
              <YAxis yAxisId="usage" {...AXIS} width={56} tickFormatter={formatCountCompact} domain={[0, (max: number) => Math.max(max, 1) * 1.3]} tickCount={4} />
              <YAxis yAxisId="marker" hide domain={[0, 1.1]} />
              {idle >= 2 && idle < usage.length ? (
                <ReferenceArea yAxisId="usage" x1={rows[rows.length - idle].label} x2={rows[rows.length - 1].label} fill="var(--raised)" fillOpacity={0.7} stroke="var(--control)" strokeDasharray="4 4" />
              ) : null}
              <Tooltip content={<UsageTip />} cursor={{ fill: "var(--raised)" }} />
              <Bar yAxisId="usage" dataKey="total" fill="var(--chart-1)" radius={[2, 2, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              <Line yAxisId="marker" dataKey="marker" stroke="none" connectNulls={false} dot={{ r: 4, fill: "var(--accent-ink)", stroke: "var(--surface)" }} activeDot={false} isAnimationActive={false}>
                <LabelList dataKey="tag" position="top" style={{ fontSize: 11, fill: "var(--text)" }} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function UsageTip({ active, payload }: { active?: boolean; payload?: { payload: { month: string; total: number; amount?: number } }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-control px-3 py-2 text-micro" style={TIP_STYLE}>
      <p className="mb-1 font-medium">{formatMonth(row.month, true)}</p>
      <p className="num">{formatCount(row.total)} ข้อความ</p>
      {row.amount != null ? <p className="num">เติมเงิน {formatBahtCompact(row.amount)}</p> : null}
    </div>
  );
}

export function CustomerUsageTab({ usage, lastSend }: { usage: MonthlyUsagePoint[]; lastSend: string | null | undefined }) {
  if (usage.length === 0) return <EmptyState title="ไม่มีข้อมูลการใช้งานในช่วงนี้" />;

  const total = usage.reduce((s, u) => s + u.total, 0);
  const activeMonths = usage.filter((u) => u.total > 0).length;
  const sum = (key: "sms" | "email" | "bc" | "api" | "otp") => usage.reduce((s, u) => s + u[key], 0);
  const mix = [...SOURCES.map((s) => ({ ...s, value: sum(s.key) }))];
  const channels = [
    { key: "sms", label: "SMS", value: sum("sms") },
    { key: "email", label: "Email", value: sum("email") },
  ];
  const lastFive = usage.slice(-5);

  return (
    <div className="space-y-5">
      <KpiStrip
        items={[
          { label: "ข้อความ 12 เดือน", info: "จำนวนข้อความรวมทุกช่องทางใน 12 เดือนก่อนวันตัดข้อมูล", value: formatCountCompact(total) },
          { label: "เฉลี่ยต่อเดือน", info: "ข้อความรวมหารด้วยจำนวนเดือนในช่วงนี้ รวมเดือนที่ไม่ได้ใช้งาน", value: formatCountCompact(total / usage.length) },
          { label: "เดือนที่ใช้งาน", info: "จำนวนเดือนที่ส่งข้อความอย่างน้อยหนึ่งข้อความ", value: `${formatCount(activeMonths)} จาก ${formatCount(usage.length)}` },
          { label: "ส่งล่าสุด", info: "วันที่ส่งข้อความล่าสุดจากโปรไฟล์ลูกค้า", value: formatDate(lastSend) },
        ]}
      />

      <Panel
        title="การใช้งานรายเดือน"
        info="จำนวนข้อความต่อเดือน แยกตามวิธีส่ง รวมทั้ง SMS และ Email"
        right={
          <ul className="flex flex-wrap gap-x-4 text-micro text-muted">
            {SOURCES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        }
      >
        <div role="img" aria-label={`ข้อความรวม ${formatCount(total)} ใน ${usage.length} เดือน ${mix.map((m) => `${m.label} ${formatCount(m.value)}`).join(" ")}`} className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={usage.map((u) => ({ ...u, label: formatMonth(u.month) }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
              <YAxis {...AXIS} width={56} tickFormatter={formatCountCompact} tickCount={5} />
              <Tooltip content={<SourceTip />} cursor={{ fill: "var(--raised)" }} />
              {SOURCES.map((s) => (
                <Bar key={s.key} dataKey={s.key} stackId="source" fill={s.color} maxBarSize={28} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-5 min-[860px]:grid-cols-2">
        <Panel title="สัดส่วนช่องทาง" info="สัดส่วนข้อความใน 12 เดือน ตามช่องทางและวิธีส่ง">
          <ul className="space-y-2">
            {[...channels, ...mix].map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 text-body">
                <span className="text-text">{m.label}</span>
                <span className="num text-muted">{total > 0 ? formatPercent(m.value / total) : "—"}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="การใช้งาน 5 เดือนล่าสุด" info="สี่เหลี่ยมทึบคือเดือนที่ส่งข้อความ">
          <ul className="flex gap-3" aria-label={`ใช้งาน ${lastFive.filter((u) => u.total > 0).length} จาก ${lastFive.length} เดือนล่าสุด`}>
            {lastFive.map((u) => (
              <li key={u.month} className="flex flex-col items-center gap-1.5">
                <span aria-hidden className={`h-7 w-7 rounded-[4px] border ${u.total > 0 ? "border-accent bg-accent" : "border-control bg-surface"}`} />
                <span className="text-micro text-muted">{formatMonth(u.month)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function SourceTip({ active, payload }: { active?: boolean; payload?: { payload: MonthlyUsagePoint }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-control px-3 py-2 text-micro" style={TIP_STYLE}>
      <p className="mb-1 font-medium">{formatMonth(row.month, true)}</p>
      {SOURCES.map((s) => (
        <p key={s.key} className="num">{s.label} {formatCount(row[s.key])}</p>
      ))}
    </div>
  );
}
