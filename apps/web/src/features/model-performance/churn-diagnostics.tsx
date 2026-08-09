"use client";

/**
 * Churn-only diagnostics (spec §2.4): calibration curve, confusion matrix
 * at the operating threshold, lift table with a business reading, and the
 * risk-level thresholds legend. All values come from the API entry —
 * nothing is computed client-side.
 */

import { StatusPill } from "@/components/ui";
import type { ModelPerfEntry } from "@/lib/ml-api";
import { metricInfo } from "./metric-info";

const PANEL_TITLE = "text-[13px] font-semibold text-[color:var(--ink-2)]";
const PANEL_HINT = "text-[11.5px] leading-5 text-[color:var(--ink-5)] mt-1";

export function ChurnDiagnostics({ entry }: { entry: ModelPerfEntry }) {
  const testMetrics =
    entry.splits.find((s) => s.split === "test")?.metrics ??
    entry.splits[0]?.metrics;

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {entry.calibration && (
          <CalibrationPanel calibration={entry.calibration} />
        )}
        {entry.confusion && <ConfusionPanel confusion={entry.confusion} />}
        {entry.lift_table && entry.lift_table.length > 0 && (
          <LiftPanel
            liftTable={entry.lift_table}
            recallAtTop10={testMetrics?.recall_at_top10pct}
          />
        )}
      </div>

      {entry.thresholds && <ThresholdsLegend thresholds={entry.thresholds} />}
    </div>
  );
}

/* ── Calibration curve ─────────────────────────────────────────── */

function CalibrationPanel({
  calibration,
}: {
  calibration: NonNullable<ModelPerfEntry["calibration"]>;
}) {
  const size = 180;
  const pad = 12;
  const plot = size - pad * 2;
  const x = (v: number): number => pad + v * plot;
  const y = (v: number): number => size - pad - v * plot;
  const pts = calibration.prob_pred.map(
    (p, i) => [x(p), y(calibration.prob_true[i] ?? 0)] as const
  );
  const path = pts
    .map(
      ([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`
    )
    .join(" ");

  return (
    <div className="surface-soft p-4">
      <div className={PANEL_TITLE}>Calibration curve</div>
      <p className={PANEL_HINT} title={metricInfo("ece").tooltip}>
        ค่าความน่าจะเป็นที่โมเดลบอก เทียบกับอัตรา churn จริง — เส้นทแยง = perfect
      </p>
      <div className="mt-3 flex flex-col items-center gap-3">
        <svg
          aria-label="Calibration curve: predicted vs observed churn probability"
          className="shrink-0"
          height={size}
          role="img"
          viewBox={`0 0 ${size} ${size}`}
          width={size}
        >
          <rect
            fill="#ffffff"
            height={plot}
            stroke="#e5e7eb"
            width={plot}
            x={pad}
            y={pad}
          />
          <line
            stroke="#9ca3af"
            strokeDasharray="4 3"
            strokeWidth="1"
            x1={x(0)}
            x2={x(1)}
            y1={y(0)}
            y2={y(1)}
          />
          <path
            d={path}
            fill="none"
            stroke="var(--moby-600)"
            strokeWidth="1.75"
          />
          {pts.map(([px, py], i) => (
            <circle cx={px} cy={py} fill="var(--moby-600)" key={i} r="2.5" />
          ))}
        </svg>
        <div className="w-full text-center">
          <div
            className="font-semibold text-[10.5px] text-[color:var(--ink-5)] uppercase tracking-[.08em]"
            title={metricInfo("ece").tooltip}
          >
            ECE
          </div>
          <div className="num font-semibold text-[22px] leading-none">
            {calibration.ece.toFixed(3)}
          </div>
          <p className="mt-2 text-[11px] text-[color:var(--ink-4)] leading-5">
            แกน X = prob ที่ทำนาย
            <br />
            แกน Y = churn จริง
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Confusion matrix ──────────────────────────────────────────── */

function ConfusionPanel({
  confusion,
}: {
  confusion: NonNullable<ModelPerfEntry["confusion"]>;
}) {
  const cells = [
    {
      bg: "var(--ok-bg)",
      fg: "var(--ok)",
      hint: "ชี้ว่าเสี่ยง และ churn จริง",
      key: "TP",
      value: confusion.tp,
    },
    {
      bg: "var(--warn-bg)",
      fg: "var(--warn)",
      hint: "ชี้ว่าเสี่ยง แต่ไม่ churn (โทรเก้อ)",
      key: "FP",
      value: confusion.fp,
    },
    {
      bg: "var(--danger-bg)",
      fg: "var(--danger)",
      hint: "ไม่ได้ชี้ แต่ churn จริง (หลุดมือ)",
      key: "FN",
      value: confusion.fn,
    },
    {
      bg: "#f3f4f6",
      fg: "#4b5563",
      hint: "ไม่ได้ชี้ และไม่ churn",
      key: "TN",
      value: confusion.tn,
    },
  ];

  return (
    <div className="surface-soft p-4">
      <div className={PANEL_TITLE}>Confusion matrix</div>
      <p className={PANEL_HINT} title={metricInfo("f1").tooltip}>
        ที่ threshold ใช้งาน ={" "}
        <span className="num">{confusion.threshold.toFixed(2)}</span>
      </p>
      <div className="mt-3">
        <table className="w-full border-separate border-spacing-2 text-[11px]">
          <thead>
            <tr>
              <th aria-hidden className="w-[88px]" />
              <th className="pb-1 text-center font-medium text-[color:var(--ink-5)]">
                Churn จริง
              </th>
              <th className="pb-1 text-center font-medium text-[color:var(--ink-5)]">
                ไม่ churn
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th
                className="pr-2 text-left font-medium text-[color:var(--ink-5)] leading-4"
                scope="row"
              >
                ชี้ว่าเสี่ยง
              </th>
              <td>
                <Cell cell={cells[0]} />
              </td>
              <td>
                <Cell cell={cells[1]} />
              </td>
            </tr>
            <tr>
              <th
                className="pr-2 text-left font-medium text-[color:var(--ink-5)] leading-4"
                scope="row"
              >
                ไม่ได้ชี้
              </th>
              <td>
                <Cell cell={cells[2]} />
              </td>
              <td>
                <Cell cell={cells[3]} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({
  cell,
}: {
  cell: { key: string; value: number; hint: string; fg: string; bg: string };
}) {
  return (
    <div
      className="rounded-lg px-3 py-3 text-center"
      style={{ background: cell.bg }}
      title={cell.hint}
    >
      <div
        className="font-semibold text-[10px] uppercase tracking-[.06em]"
        style={{ color: cell.fg }}
      >
        {cell.key}
      </div>
      <div className="num mt-0.5 font-semibold text-[18px] text-[color:var(--ink-1)] leading-none">
        {cell.value.toLocaleString()}
      </div>
    </div>
  );
}

/* ── Lift table ────────────────────────────────────────────────── */

function LiftPanel({
  liftTable,
  recallAtTop10,
}: {
  liftTable: NonNullable<ModelPerfEntry["lift_table"]>;
  recallAtTop10: number | undefined;
}) {
  const topDecile = liftTable.find((r) => r.decile === 1) ?? liftTable[0];
  return (
    <div className="surface-soft p-4">
      <div className={PANEL_TITLE}>Lift by decile</div>
      <p className={PANEL_HINT} title={metricInfo("lift_at_top10pct").tooltip}>
        เรียงลูกค้าตามคะแนนเสี่ยง แล้วแบ่งเป็น 10 กลุ่ม
      </p>
      <div className="mt-3">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="text-[10.5px] text-[color:var(--ink-5)] uppercase tracking-[.08em]">
              <th className="pb-2 text-left font-semibold">Decile</th>
              <th
                className="pb-2 text-right font-semibold"
                title="กลุ่มนี้กิน churner จริงทั้งหมดกี่ %"
              >
                % of churners
              </th>
              <th
                className="pb-2 text-right font-semibold"
                title={metricInfo("lift_at_top10pct").tooltip}
              >
                Lift
              </th>
            </tr>
          </thead>
          <tbody>
            {liftTable.map((row) => (
              <tr className="border-gray-200/80 border-t" key={row.decile}>
                <td className="py-1.5 text-[color:var(--ink-3)]">
                  #{row.decile}
                </td>
                <td className="num py-1.5 text-right">
                  {(row.share_of_churners * 100).toFixed(1)}%
                </td>
                <td className="num py-1.5 text-right">
                  {row.lift.toFixed(2)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {recallAtTop10 !== undefined && topDecile && (
        <p className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[11.5px] text-[color:var(--ink-3)] leading-5">
          โทรหา top 10% = เจอ churner จริง{" "}
          <span className="num font-semibold">
            {(recallAtTop10 * 100).toFixed(1)}%
          </span>{" "}
          (lift{" "}
          <span className="num font-semibold">
            {topDecile.lift.toFixed(2)}×
          </span>
          )
        </p>
      )}
    </div>
  );
}

/* ── Risk-level thresholds legend ──────────────────────────────── */

const THRESHOLD_TONES: Record<string, "ok" | "warn" | "danger"> = {
  critical: "danger",
  high: "danger",
  medium: "warn",
};

function ThresholdsLegend({
  thresholds,
}: {
  thresholds: Record<string, number>;
}) {
  const sorted = Object.entries(thresholds).sort((a, b) => a[1] - b[1]);
  if (sorted.length === 0) {
    return null;
  }
  const lowest = sorted[0][1];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <span
        className="text-[11px] text-[color:var(--ink-5)]"
        title="เส้นแบ่งระดับเสี่ยงมาจาก model card ของรุ่นนี้ — คำนวณใหม่ทุกครั้งที่ retrain ไม่ hardcode ใน UI"
      >
        Risk thresholds (churn_probability):
      </span>
      <StatusPill dot={false} tone="ok">
        low <span className="num">&lt; {lowest.toFixed(2)}</span>
      </StatusPill>
      {sorted.map(([name, value]) => (
        <StatusPill
          dot={false}
          key={name}
          tone={THRESHOLD_TONES[name] ?? "warn"}
        >
          {name} <span className="num">≥ {value.toFixed(2)}</span>
        </StatusPill>
      ))}
    </div>
  );
}
