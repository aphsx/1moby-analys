"use client";
/** การชำระเงิน: how much, how regularly, and when next (CUSTOMER-PAGES.md §3.5). */
import type { PaymentEvent, PredictionOutput } from "@moby/types";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BUTTON, Delta, EmptyState, KpiStrip, Panel } from "@/components/ui";
import { formatBaht, formatBahtCompact, formatCount, formatCredits, formatDate, formatDaysAhead } from "@/lib/format";
import { overdueLabel, paidByYear, paymentHistory, topupStats } from "./customer-model";

const AXIS = { axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "var(--axis-ink)" } } as const;
const HISTORY_PREVIEW = 6;
const NOW_LABEL = "ตอนนี้";
const RANGE_MAX_DAYS = 90;

export function CustomerPaymentTab({ customer: c, payments, cutoffMs }: { customer: PredictionOutput; payments: PaymentEvent[]; cutoffMs: number }) {
  const [showAll, setShowAll] = useState(false);
  if (payments.length === 0) return <EmptyState title="ไม่มีประวัติการชำระเงิน" hint="ลูกค้ารายนี้ไม่มีการชำระเงินก่อนวันตัดข้อมูล" />;

  const t = topupStats(payments, cutoffMs);
  const year = paidByYear(payments, cutoffMs);
  const history = paymentHistory(payments);
  const shown = showAll ? history : history.slice(0, HISTORY_PREVIEW);
  const overdue = t.overdueRatio != null;

  const gapRows = [
    ...t.gaps.map((gap, i) => ({ label: `ครั้งที่ ${i + 2}`, gap, now: false })),
    ...(t.daysSinceLast != null ? [{ label: NOW_LABEL, gap: t.daysSinceLast, now: true }] : []),
  ];

  return (
    <div className="space-y-5">
      <KpiStrip
        items={[
          {
            label: "ยอดชำระ 12 เดือน",
            info: "ยอดชำระใน 12 เดือนก่อนวันตัดข้อมูล เทียบกับ 12 เดือนก่อนหน้า",
            value: formatBahtCompact(year.recent),
            caption: year.previous > 0 ? <Delta value={(year.recent - year.previous) / year.previous} base={`จาก ${formatBahtCompact(year.previous)}`} /> : "ไม่มีข้อมูลปีก่อนให้เทียบ",
          },
          { label: "จำนวนครั้ง", info: "จำนวนครั้งที่ชำระตลอดช่วงข้อมูล", value: formatCount(c.n_purchases), unit: "ครั้ง" },
          { label: "เฉลี่ยต่อครั้ง", info: "ยอดชำระรวมหารด้วยจำนวนครั้ง", value: c.avg_transaction_value != null ? formatBahtCompact(c.avg_transaction_value) : "—" },
          {
            label: "เติมล่าสุด",
            info: "สีส้มเมื่อห่างจากครั้งล่าสุดเกิน 1.5 เท่าของรอบเติมปกติ",
            value: <span className={overdue ? "text-negative" : ""}>{t.lastDate ? formatDate(t.lastDate) : "—"}</span>,
            caption: t.overdueRatio != null ? overdueLabel(t.overdueRatio) : t.daysSinceLast != null ? `${formatCount(t.daysSinceLast)} วันก่อนวันตัดข้อมูล` : undefined,
          },
        ]}
      />

      <Panel
        title="ระยะห่างระหว่างการเติมเงิน"
        info="จำนวนวันระหว่างการเติมเงินแต่ละครั้ง แท่งสุดท้ายคือจำนวนวันตั้งแต่เติมครั้งล่าสุดถึงวันตัดข้อมูล เส้นประคือรอบเติมปกติ (ค่ากลาง)"
        meta={t.usualCycle != null ? `รอบเติมปกติ ${formatCount(Math.round(t.usualCycle))} วัน` : "ต้องเติมอย่างน้อย 2 ครั้งจึงจะคำนวณรอบได้"}
      >
        <div
          role="img"
          aria-label={`${t.usualCycle != null ? `รอบเติมปกติ ${Math.round(t.usualCycle)} วัน ` : ""}ตอนนี้ไม่ได้เติมมา ${t.daysSinceLast ?? 0} วัน`}
          className="h-[220px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gapRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
              <YAxis {...AXIS} width={40} tickCount={5} />
              <Tooltip content={<GapTip />} cursor={{ fill: "var(--raised)" }} />
              {t.usualCycle != null ? <ReferenceLine y={t.usualCycle} stroke="var(--axis-ink)" strokeDasharray="4 4" /> : null}
              <Bar dataKey="gap" radius={[2, 2, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                {gapRows.map((r) => (
                  <Cell key={r.label} fill={r.now && overdue ? "var(--negative)" : r.now ? "var(--chart-muted)" : "var(--chart-1)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <NextTopup days={c.estimated_days_until_topup} cutoffMs={cutoffMs} />

      <Panel title="ประวัติการชำระเงิน" meta={`${formatCount(history.length)} ครั้งล่าสุดในข้อมูล`}>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[480px]">
            <thead>
              <tr>
                <th>วันที่</th>
                <th className="num">ยอดชำระ</th>
                <th className="num">เครดิตที่ได้</th>
                <th className="num">ห่างจากครั้งก่อน</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p, i) => (
                <tr key={`${p.payment_date}-${i}`}>
                  <td className="tabular-nums">{formatDate(p.payment_date)}</td>
                  <td className="tabular-nums text-right">{formatBaht(p.amount)}</td>
                  <td className="tabular-nums text-right">{formatCredits(p.credit_add)}</td>
                  <td className="tabular-nums text-right">{p.gap != null ? `${formatCount(p.gap)} วัน` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history.length > HISTORY_PREVIEW ? (
          <button type="button" onClick={() => setShowAll((v) => !v)} className={`${BUTTON.secondary} mt-4`}>
            {showAll ? "แสดงน้อยลง" : `ดูทั้งหมด ${formatCount(history.length)} ครั้ง`}
          </button>
        ) : null}
      </Panel>
    </div>
  );
}

function GapTip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; gap: number; now: boolean } }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-control px-3 py-2 text-micro" style={{ background: "var(--tip-bg)", color: "var(--tip-ink)", boxShadow: "var(--shadow-float)" }}>
      <p className="font-medium">{row.now ? "ตอนนี้ (ยังไม่เติม)" : row.label}</p>
      <p className="num">{formatCount(row.gap)} วัน</p>
    </div>
  );
}

/** ponytail: marker only; the spec's shaded prediction interval needs the model to output a days range, which it does not yet. */
function NextTopup({ days, cutoffMs }: { days: number | null; cutoffMs: number }) {
  if (days == null) {
    return (
      <Panel title="เติมครั้งถัดไป" info="จำนวนวันที่คาดว่าเครดิตจะหมดและต้องเติมครั้งถัดไป (Runway) คำนวณจากเครดิตคงเหลือหารด้วยอัตราการใช้รายวัน">
        <p className="text-body text-muted">ยังไม่มีผลทำนายวันเติมครั้งถัดไปของลูกค้ารายนี้</p>
      </Panel>
    );
  }
  const position = Math.min(100, (Math.max(0, days) / RANGE_MAX_DAYS) * 100);
  return (
    <Panel title="เติมครั้งถัดไป" info="จำนวนวันที่คาดว่าเครดิตจะหมดและต้องเติมครั้งถัดไป (Runway) คำนวณจากเครดิตคงเหลือหารด้วยอัตราการใช้รายวัน">
      <p className="num text-lead font-semibold text-text">{formatDaysAhead(days)}</p>
      <p className="num text-small text-muted">ประมาณ {formatDate(cutoffMs + days * 86_400_000)}</p>
      <div aria-hidden className="relative mt-4 h-2 rounded-full bg-raised">
        <span className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-accent" style={{ left: `calc(${position}% - 2px)` }} />
      </div>
      <div aria-hidden className="num mt-1 flex justify-between text-micro text-muted">
        <span>0</span>
        <span>{RANGE_MAX_DAYS} วัน</span>
      </div>
    </Panel>
  );
}
