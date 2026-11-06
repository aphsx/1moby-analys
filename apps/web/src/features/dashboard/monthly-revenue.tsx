"use client";
/** Monthly top-up revenue, the last 12 months against the 12 before (docs/ui/DESIGN.md §7). */
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { EmptyState, Panel } from "@/components/ui";
import { formatBaht, formatBahtCompact } from "@/lib/format";
import { type MonthPoint, type OverviewModel } from "./overview-model";

const RECENT = "12 เดือนล่าสุด";
const PREVIOUS = "12 เดือนก่อนหน้า";

export function MonthlyRevenue({ model }: { model: OverviewModel }) {
  const hasPrevious = model.revenuePrev12m > 0;
  const empty = model.revenue12m <= 0 && !hasPrevious;

  return (
    <Panel
      title="รายได้รายเดือน"
      info="ยอดเติมเครดิตรวมต่อเดือน เส้นสีคือ 12 เดือนล่าสุด เส้นเทาคือช่วงเดียวกันของปีก่อน เป็นข้อมูลจริง ไม่ใช่ผลทำนาย"
      meta="ยอดเติมเครดิต (บาท) ก่อนวันตัดข้อมูล"
      right={
        empty ? null : (
          <ul className="flex flex-wrap gap-x-4 text-micro text-muted">
            <Swatch color="var(--chart-1)">{RECENT}</Swatch>
            {hasPrevious ? <Swatch color="var(--chart-muted)">{PREVIOUS}</Swatch> : null}
          </ul>
        )
      }
    >
      {empty ? (
        <EmptyState title="ไม่มีข้อมูลการชำระเงินในช่วงนี้" />
      ) : (
        <div
          role="img"
          aria-label={`รายได้ 12 เดือนล่าสุดรวม ${formatBahtCompact(model.revenue12m)}${hasPrevious ? ` เทียบกับ ${formatBahtCompact(model.revenuePrev12m)} ใน 12 เดือนก่อนหน้า` : ""}`}
          className="h-[240px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={model.months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "var(--axis-ink)" }} interval="preserveStartEnd" />
              <YAxis axisLine={false} tickLine={false} tickCount={5} width={56} tick={{ fontSize: 12, fill: "var(--axis-ink)" }} tickFormatter={formatBahtCompact} />
              <Tooltip content={<BareTooltip hasPrevious={hasPrevious} />} cursor={{ stroke: "var(--axis-ink)", strokeOpacity: 0.35 }} />
              {hasPrevious ? (
                <Line type="linear" dataKey="previous" stroke="var(--chart-muted)" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
              ) : null}
              <Line type="linear" dataKey="recent" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

function Swatch({ color, children }: { color: string; children: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-0.5 w-3" style={{ background: color }} />
      {children}
    </li>
  );
}

function BareTooltip({ active, payload, hasPrevious }: TooltipProps<number, string> & { hasPrevious: boolean }) {
  const row = payload?.[0]?.payload as MonthPoint | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-control px-3 py-2 text-micro" style={{ background: "var(--tip-bg)", color: "var(--tip-ink)", boxShadow: "var(--shadow-float)" }}>
      <p className="mb-1 font-medium">{row.label}</p>
      <p className="num">{RECENT} {formatBaht(row.recent)}</p>
      {hasPrevious ? <p className="num opacity-80">{PREVIOUS} {formatBaht(row.previous)}</p> : null}
    </div>
  );
}
