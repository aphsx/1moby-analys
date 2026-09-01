/**
 * Metric display metadata for the Model Performance page.
 * Thai tooltip meanings come from docs/ML-CALCULATIONS-TH.md §9 —
 * the UI never computes metrics, it only explains them.
 */

export interface MetricInfo {
  label: string;
  /** Short Thai meaning (TRAINING-PIPELINE §11) — rendered as title attr. */
  tooltip: string;
  fmt: (v: number) => string;
  /** true = larger value means a better model (used for win highlighting). */
  higherIsBetter: boolean;
}

const dec3 = (v: number): string => v.toFixed(3);
const pct1 = (v: number): string => `${(v * 100).toFixed(1)}%`;
const times = (v: number): string => `${v.toFixed(2)}×`;
const int = (v: number): string => Math.round(v).toLocaleString();

export const METRIC_INFO: Record<string, MetricInfo> = {
  // ── Churn ──
  pr_auc: {
    label: "PR-AUC",
    tooltip: "คุณภาพการจับคนที่จะ churn จริงเมื่อ class เอียง — ค่าหลัก",
    fmt: dec3,
    higherIsBetter: true,
  },
  roc_auc: {
    label: "ROC-AUC",
    tooltip: "ความสามารถแยกกลุ่มโดยรวม — > 0.97 ต้องสงสัย data leak",
    fmt: dec3,
    higherIsBetter: true,
  },
  precision: {
    label: "Precision",
    tooltip: "กลุ่มที่โมเดลชี้ว่าเสี่ยง ชี้ถูกกี่ % — โทรไปไม่เก้อกี่สาย",
    fmt: pct1,
    higherIsBetter: true,
  },
  recall: {
    label: "Recall",
    tooltip: "คนที่จะ churn จริง โมเดลจับได้กี่ % — หลุดมือไปกี่คน",
    fmt: pct1,
    higherIsBetter: true,
  },
  f1: {
    label: "F1",
    tooltip: "สมดุล precision/recall ที่ threshold เดียว — ค่าขึ้นกับ threshold เสมอ",
    fmt: dec3,
    higherIsBetter: true,
  },
  recall_at_top10pct: {
    label: "Recall@top-10%",
    tooltip: "ถ้าทีมขายโทรได้แค่ 10% ของลูกค้า จะครอบ churner จริงกี่ %",
    fmt: pct1,
    higherIsBetter: true,
  },
  lift_at_top10pct: {
    label: "Lift@top-10%",
    tooltip: "top 10% ของโมเดลเจอ churner หนาแน่นกว่าสุ่มกี่เท่า — > 2.5× ถือว่าใช้งานได้",
    fmt: times,
    higherIsBetter: true,
  },
  brier: {
    label: "Brier score",
    tooltip: "ความแม่นของค่าความน่าจะเป็น — ยิ่งต่ำยิ่งดี",
    fmt: dec3,
    higherIsBetter: false,
  },
  ece: {
    label: "ECE",
    tooltip: "ความตรงของ calibration (บอก 70% แล้ว churn จริง ~70% ไหม) — เป้า < 0.05",
    fmt: dec3,
    higherIsBetter: false,
  },
  // ── CLV ──
  // ── CLV (two-part composite) ──
  clv_composite: {
    label: "CLV composite",
    tooltip: "คะแนนรวม: Spearman + top-decile + portfolio bias + range coverage + p_pay ECE",
    fmt: dec3,
    higherIsBetter: true,
  },
  p_pay_roc_auc: {
    label: "P(pay) ROC-AUC",
    tooltip: "แยกลูกค้าที่จะมีรายได้ใน 6 เดือนได้ดีแค่ไหน",
    fmt: dec3,
    higherIsBetter: true,
  },
  p_pay_ece: {
    label: "P(pay) ECE",
    tooltip: "ความตรงของความน่าจะเป็นจ่าย — ยิ่งต่ำยิ่งดี",
    fmt: dec3,
    higherIsBetter: false,
  },
  revenue_bias_ratio: {
    label: "Portfolio bias",
    tooltip: "Σ ทำนาย / Σ จริง — 1.0 = ยอดรวมไม่เอียง",
    fmt: (v: number) => `${v.toFixed(2)}×`,
    higherIsBetter: false,
  },
  range_coverage: {
    label: "Value range coverage",
    tooltip: "รายได้จริง (ถ้าจ่าย) ตกในช่วง p10–p90 กี่ %",
    fmt: pct1,
    higherIsBetter: true,
  },
  spearman: {
    label: "Spearman",
    tooltip: "จัดอันดับลูกค้าตามมูลค่า — องค์ประกอบหลักของ CLV composite",
    fmt: dec3,
    higherIsBetter: true,
  },
  mae: {
    label: "MAE (฿)",
    tooltip: "คลาดเคลื่อนเฉลี่ยเป็นบาท",
    fmt: int,
    higherIsBetter: false,
  },
  rmse: {
    label: "RMSE (฿)",
    tooltip: "คลาดเคลื่อนเฉลี่ยเป็นบาท — โดน outlier ลากแรงกว่า MAE",
    fmt: int,
    higherIsBetter: false,
  },
  smape: {
    label: "SMAPE",
    tooltip: "% คลาดเคลื่อนแบบสมมาตร (กัน zero หาร) — รายงานประกอบ",
    fmt: pct1,
    higherIsBetter: false,
  },
  top_decile_capture: {
    label: "Top-decile capture",
    tooltip: "top 10% ตามโมเดล กินรายได้จริงกี่ % ของทั้งหมด — เป้า > 35%",
    fmt: pct1,
    higherIsBetter: true,
  },
  // ── Credit ──
  mae_30d: {
    label: "MAE 30d",
    tooltip: "คลาดเคลื่อนของ p50 ที่ horizon 30 วัน (เครดิต)",
    fmt: int,
    higherIsBetter: false,
  },
  smape_30d: {
    label: "SMAPE 30d",
    tooltip: "% คลาดเคลื่อนแบบสมมาตรที่ horizon 30 วัน",
    fmt: pct1,
    higherIsBetter: false,
  },
  mae_90d: {
    label: "MAE 90d",
    tooltip: "คลาดเคลื่อนของ p50 ที่ horizon 90 วัน (เครดิต)",
    fmt: int,
    higherIsBetter: false,
  },
  smape_90d: {
    label: "SMAPE 90d",
    tooltip: "% คลาดเคลื่อนแบบสมมาตรที่ horizon 90 วัน",
    fmt: pct1,
    higherIsBetter: false,
  },
  coverage_p10_p90: {
    label: "Coverage p10–p90",
    tooltip: "ค่าจริงตกในช่วง p10–p90 กี่ % — ควร ≈ 80% (75–85%)",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_topup_recall: {
    label: "Urgent recall",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนครบแค่ไหน — เป้า > 0.7",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_topup_precision: {
    label: "Urgent precision",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนถูกแค่ไหน",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_recall: {
    label: "Urgent recall",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนครบแค่ไหน — เป้า > 0.7",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_precision: {
    label: "Urgent precision",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนถูกแค่ไหน",
    fmt: pct1,
    higherIsBetter: true,
  },
};

/** Map model_card primary_metric.name → METRIC_INFO key. */
const PRIMARY_LABEL_TO_KEY: Record<string, string> = {
  "PR-AUC": "pr_auc",
  "CLV composite": "clv_composite",
  "Coverage p10–p90": "coverage_p10_p90",
  "Rule coverage": "coverage_p10_p90",
};

/** Secondary metrics shown per model type (test split, in order). */
export const SECONDARY_METRICS: Record<string, string[]> = {
  churn: ["recall_at_top10pct", "lift_at_top10pct", "ece", "f1"],
  clv: ["spearman", "p_pay_roc_auc", "top_decile_capture", "revenue_bias_ratio", "range_coverage", "p_pay_ece"],
  credit: ["coverage_p10_p90_30d", "coverage_p10_p90_90d", "mae_30d", "mae_90d", "urgent_topup_recall", "urgent_topup_precision"],
};

const BASELINE_NAME_LABELS: Record<string, string> = {
  target_75pct: "เป้า 75%",
};

/** Lookup with a safe fallback for metric keys the UI doesn't know yet. */
export function metricInfo(key: string): MetricInfo {
  return (
    METRIC_INFO[key] ?? {
      label: key,
      tooltip: key,
      fmt: (v: number) => (Math.abs(v) <= 1 ? dec3(v) : v.toLocaleString()),
      higherIsBetter: true,
    }
  );
}

/** Resolve primary_metric.name (display label) to METRIC_INFO metadata. */
export function metricInfoByLabel(label: string): MetricInfo {
  const key = PRIMARY_LABEL_TO_KEY[label] ?? label;
  return metricInfo(key);
}

export function formatBaselineName(name: string): string {
  return BASELINE_NAME_LABELS[name] ?? name.replaceAll("_", " ");
}

/** Pick curated secondary metrics for a model card. */
export function pickSecondaryMetrics(
  modelType: string,
  metrics: Record<string, number>,
  componentMetrics?: Record<string, number>,
): Array<{ key: string; value: number }> {
  const keys = SECONDARY_METRICS[modelType] ?? [];
  const merged = { ...metrics, ...componentMetrics };
  return keys
    .filter((key) => {
      const v = merged[key];
      return typeof v === "number" && Number.isFinite(v);
    })
    .map((key) => ({ key, value: merged[key]! }));
}

export const SPLIT_ORDER = ["validation", "test", "backtest_avg"] as const;

export const SPLIT_LABELS: Record<(typeof SPLIT_ORDER)[number], string> = {
  validation: "Validation",
  test: "Test",
  backtest_avg: "Backtest avg",
};

/** "2026-06-03T11:20:00+07:00" → "3 Jun 2026" (Asia/Bangkok). */
export function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}
