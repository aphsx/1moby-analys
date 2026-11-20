"use client";
/**
 * Sending months (DASHBOARD.md §8.2): which behaviour predicts churn, and how many paying customers
 * show it now. Columns = Active Paid customers by months with messages sent; the text row under
 * them = the Backtest churn rate of the same bucket six months earlier (no second axis).
 */
import Link from "next/link";
import { useState } from "react";
import { type RunSummary } from "@moby/types";
import { EmptyState, Panel, Provenance } from "@/components/ui";
import { formatCount, formatMonth, formatPercent } from "@/lib/format";

/** Buckets 0..EMPHASIS are the story: customers who sent in at most one month. */
const EMPHASIS = 1;

const addMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export function SendingMonths({ data, runId }: { data: RunSummary["sending_months"]; runId: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = data.buckets;
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const rates = buckets.map((b) => b.backtest_churn_rate);
  const hasRates = data.backtest_date != null && rates.some((r) => r != null);
  const falling = hasRates && rates.every((r, i) => i === 0 || r == null || rates[i - 1] == null || r <= rates[i - 1]!);
  const N = data.window_months;
  const window = `${formatMonth(data.window_start)}–${formatMonth(addMonth(data.window_start, N - 1), true)}`;
  const backtest = data.backtest_date ? formatMonth(data.backtest_date.slice(0, 7), true) : "";
  const low = buckets.slice(0, EMPHASIS + 1);
  const lowCount = low.reduce((a, b) => a + b.count, 0);
  const lowRates = low.map((b) => b.backtest_churn_rate).filter((r): r is number => r != null);
  const neutral = "ลูกค้าที่จ่ายเงินตามจำนวนเดือนที่ส่งข้อความ";

  const readout =
    hover == null
      ? `แถวบน = จำนวนเดือนที่ส่งข้อความ${hasRates ? ` · แถวล่าง = เคยเลิกใช้จริง (ย้อนทดสอบ ${backtest})` : ""} · ชี้แท่งเพื่อดูสัดส่วน`
      : `ส่งข้อความ ${hover} จาก ${N} เดือน: ${formatCount(buckets[hover].count)} ราย (${formatPercent(total > 0 ? buckets[hover].count / total : 0)} ของลูกค้าที่จ่ายเงิน)${
          rates[hover] != null ? ` · เคยเลิกใช้จริง ${formatPercent(rates[hover]!)}` : ""
        }`;

  return (
    <Panel
      title={falling ? "ยิ่งส่งข้อความน้อยเดือน ยิ่งเลิกใช้" : neutral}
      info={`จำนวนเดือนที่ลูกค้าที่จ่ายเงินมีการส่งข้อความ ใน ${window}${
        hasRates ? ` · “เคยเลิกใช้” = สัดส่วนที่เลิกใช้จริงภายใน 180 วัน เมื่อย้อนทดสอบ ณ ${backtest} (6 เดือนก่อนวันตัดข้อมูล) กับลูกค้าในข้อมูลชุดเดียวกัน เป็นสัญญาณที่บอกการเลิกใช้ได้ดีที่สุดในข้อมูล` : ""
      }`}
      meta={`${neutral} ${window}`}
      right={<Provenance kind="fact" />}
      className="flex flex-col"
    >
      {total === 0 ? (
        <EmptyState title="ยังไม่มีลูกค้าที่จ่ายเงินในรอบนี้" />
      ) : (
        <>
          <div className="flex h-[200px] items-end gap-1 border-b border-control" onMouseLeave={() => setHover(null)}>
            {buckets.map((b, i) => (
              <button
                key={b.months}
                type="button"
                aria-label={`ส่งข้อความ ${b.months} จาก ${N} เดือน: ${formatCount(b.count)} ราย${rates[i] != null ? ` เคยเลิกใช้จริง ${formatPercent(rates[i]!)}` : ""}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className={`flex h-full flex-1 flex-col items-center justify-end rounded-t-control ${hover === i ? "bg-raised" : ""}`}
              >
                <span className="num mb-1 text-small font-semibold text-text">{formatCount(b.count)}</span>
                <span
                  className="block w-6 rounded-t"
                  style={{
                    height: `${(b.count / max) * 160}px`,
                    background: i <= EMPHASIS ? "var(--risk-emph)" : "var(--chart-muted)",
                    filter: hover === i ? "brightness(0.85)" : undefined,
                  }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {buckets.map((b) => (
              <span key={b.months} className="flex-1 text-center text-micro text-muted">
                {b.months} เดือน
              </span>
            ))}
          </div>
          {hasRates ? (
            <div className="mt-2 flex gap-1 border-y border-rule py-1.5">
              {rates.map((r, i) => (
                <span
                  key={i}
                  className={`num flex-1 text-center text-body ${i <= EMPHASIS ? "font-semibold" : "text-text"}`}
                  style={i <= EMPHASIS ? { color: "var(--pill-negative-ink)" } : undefined}
                >
                  {r != null ? formatPercent(r) : "—"}
                </span>
              ))}
            </div>
          ) : null}
          <p aria-live="polite" className="mt-2 min-h-[36px] text-micro text-muted">
            {readout}
          </p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 rounded-control p-3 text-small" style={{ background: "var(--pill-negative-bg)", color: "var(--pill-negative-ink)" }}>
            <span className="flex items-center gap-2">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: "var(--risk-emph)" }} />
              <span>
                <strong className="num">{formatCount(lowCount)} ราย</strong> ส่งข้อความแค่ 0–{EMPHASIS} เดือน
                {lowRates.length ? ` เคยเลิกใช้ ${formatPercent(Math.min(...lowRates))}–${formatPercent(Math.max(...lowRates))}` : ""}
              </span>
            </span>
            <Link
              href={`/customers?run=${encodeURIComponent(runId)}&sending_months_max=${EMPHASIS}&sort=revenue_at_risk:desc`}
              className="font-medium underline-offset-2 hover:underline"
            >
              ดูรายชื่อ ›
            </Link>
          </div>
        </>
      )}
    </Panel>
  );
}
