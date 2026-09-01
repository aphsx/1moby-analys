/**
 * Metric display metadata for the Model Performance page.
 * Thai tooltip meanings come from docs/ML-CALCULATIONS-TH.md §9 —
 * the UI never computes metrics, it only explains them.
 */

export interface MetricInfo {
  label: string;
  /** Short line — hover fallback. */
  tooltip: string;
  /** Plain Thai for the ? popover (business readers). */
  help: string;
  /** Optional “good enough” hint shown under the popover body. */
  goodRange?: string;
  fmt: (v: number) => string;
  higherIsBetter: boolean;
}

const dec3 = (v: number): string => v.toFixed(3);
const pct1 = (v: number): string => `${(v * 100).toFixed(1)}%`;
const times = (v: number): string => `${v.toFixed(2)}×`;
const int = (v: number): string => Math.round(v).toLocaleString();

export const METRIC_INFO: Record<string, MetricInfo> = {
  pr_auc: {
    label: "PR-AUC",
    tooltip: "คุณภาพการจับคนที่จะ churn จริงเมื่อ class เอียง — ค่าหลัก",
    help: "วัดว่าโมเดลจัดลำดับ “ใครเสี่ยงจะเลิกใช้” ได้ดีแค่ไหน เมื่อคนที่จะ churn มีน้อยกว่าคนที่อยู่ต่อ — ไม่ใช่ % ถูกทั้งหมด แต่บอกว่า list ลำดับความเสี่ยงน่าเชื่อแค่ไหน",
    goodRange: "≈ 0.65 ใช้ได้ · > 0.70 ดี",
    fmt: dec3,
    higherIsBetter: true,
  },
  roc_auc: {
    label: "ROC-AUC",
    tooltip: "ความสามารถแยกกลุ่มโดยรวม — > 0.97 ต้องสงสัย data leak",
    help: "ความสามารถแยก churn vs ไม่ churn โดยรวม — มักสูงกว่า PR-AUC; ถ้า > 0.97 ควรสงสัย data leak",
    goodRange: "0.80–0.92 ปกติ",
    fmt: dec3,
    higherIsBetter: true,
  },
  precision: {
    label: "Precision",
    tooltip: "กลุ่มที่โมเดลชี้ว่าเสี่ยง ชี้ถูกกี่ % — โทรไปไม่เก้อกี่สาย",
    help: "ในกลุ่มที่โมเดลบอกว่า “เสี่ยงสูง” มีกี่ % ที่จะเลิกใช้จริง — สูง = โทร/ทักไปแล้วไม่เสียเวลาเปล่า",
    goodRange: "ขึ้นกับ threshold — ดูคู่กับ recall",
    fmt: pct1,
    higherIsBetter: true,
  },
  recall: {
    label: "Recall",
    tooltip: "คนที่จะ churn จริง โมเดลจับได้กี่ % — หลุดมือไปกี่คน",
    help: "ในลูกค้าที่จะเลิกใช้จริง ๆ โมเดลจับได้กี่ % — สูง = หลุดมือน้อย แต่อาจมี false alarm เยอะ",
    goodRange: "ขึ้นกับ threshold — ดูคู่กับ precision",
    fmt: pct1,
    higherIsBetter: true,
  },
  f1: {
    label: "F1",
    tooltip: "สมดุล precision/recall ที่ threshold เดียว — ค่าขึ้นกับ threshold เสมอ",
    help: "ค่ากลางระหว่าง precision กับ recall ที่จุดตัดความเสี่ยงที่เลือกไว้ — เปลี่ยน threshold แล้ว F1 เปลี่ยนด้วย ใช้เป็น reference ไม่ใช่ตัว promote",
    goodRange: "≈ 0.65+ ที่ threshold ปัจจุบัน",
    fmt: dec3,
    higherIsBetter: true,
  },
  recall_at_top10pct: {
    label: "Recall@top-10%",
    tooltip: "ถ้าทีมขายโทรได้แค่ 10% ของลูกค้า จะครอบ churner จริงกี่ %",
    help: "ถ้าทีมดูแลได้แค่ 10% ลูกค้าที่โมเดลจัด “เสี่ยงสุด” จะครอบคลุมคนที่จะเลิกใช้จริงกี่ % ของทั้งหมด — ใกล้เคียงงานขายจริง",
    goodRange: "> 25% ใช้ได้ · > 35% ดี",
    fmt: pct1,
    higherIsBetter: true,
  },
  lift_at_top10pct: {
    label: "Lift@top-10%",
    tooltip: "top 10% ของโมเดลเจอ churner หนาแน่นกว่าสุ่มกี่เท่า — > 2.5× ถือว่าใช้งานได้",
    help: "top 10% ที่โมเดลชี้มี churner หนาแน่นกว่าการสุ่มลูกค้ามากแค่ไหน — 2.5× แปลว่าเจอ churner ถี่กว่าสุ่ม 2.5 เท่า",
    goodRange: "> 2.5× ใช้งานได้",
    fmt: times,
    higherIsBetter: true,
  },
  brier: {
    label: "Brier score",
    tooltip: "ความแม่นของค่าความน่าจะเป็น — ยิ่งต่ำยิ่งดี",
    help: "วัดว่า % ความเสี่ยงที่โมเดลบอก (เช่น 70%) ใกล้ความเป็นจริงแค่ไหน — ยิ่งต่ำยิ่งดี",
    fmt: dec3,
    higherIsBetter: false,
  },
  ece: {
    label: "ECE",
    tooltip: "ความตรงของ calibration (บอก 70% แล้ว churn จริง ~70% ไหม) — เป้า < 0.05",
    help: "ถ้าโมเดลบอกว่า “โอกาสเลิกใช้ 70%” แล้วในชุดนั้นเลิกจริงประมาณ 70% ไหม — ยิ่งต่ำยิ่งเชื่อถือตัวเลข % ได้",
    goodRange: "< 0.05 ดี · > 0.10 ไม่ promote",
    fmt: dec3,
    higherIsBetter: false,
  },
  clv_composite: {
    label: "CLV composite",
    tooltip: "คะแนนรวม: Spearman + top-decile + portfolio bias + range coverage + p_pay ECE",
    help: "คะแนนรวมคุณภาพ CLV — รวมการจัดอันดับมูลค่า, จับลูกค้ารายใหญ่, ยอดรวม portfolio, ช่วงมูลค่า และความน่าจะเป็นจ่าย — ใช้ตัดสิน promote",
    goodRange: "> 0.70 ดี",
    fmt: dec3,
    higherIsBetter: true,
  },
  p_pay_roc_auc: {
    label: "P(pay) ROC-AUC",
    tooltip: "แยกลูกค้าที่จะมีรายได้ใน 6 เดือนได้ดีแค่ไหน",
    help: "วัดว่าแยก “ลูกค้าที่จะมีรายได้ใน 6 เดือน” กับ “ไม่มีรายได้” ได้ดีแค่ไหน — ใกล้ 1 = แยกได้ดีมาก",
    goodRange: "> 0.85 ดี",
    fmt: dec3,
    higherIsBetter: true,
  },
  p_pay_ece: {
    label: "P(pay) ECE",
    tooltip: "ความตรงของความน่าจะเป็นจ่าย — ยิ่งต่ำยิ่งดี",
    help: "ถ้าโมเดลบอกว่า “โอกาสจ่าย 30%” แล้วในชุดนั้นจ่ายจริงประมาณ 30% ไหม — ยิ่งต่ำยิ่งดี",
    goodRange: "< 0.05 ดี",
    fmt: dec3,
    higherIsBetter: false,
  },
  revenue_bias_ratio: {
    label: "Portfolio bias",
    tooltip: "Σ ทำนาย / Σ จริง — 1.0 = ยอดรวมไม่เอียง",
    help: "ยอด CLV รวมที่ทำนาย ÷ ยอดรายได้จริงรวม — 1.0 = ไม่เอียง, >1 = ทำนายสูงเกิน, <1 = ต่ำเกิน",
    goodRange: "0.85–1.15 ใกล้ 1.0 ดี",
    fmt: (v: number) => `${v.toFixed(2)}×`,
    higherIsBetter: false,
  },
  range_coverage: {
    label: "Value range coverage",
    tooltip: "รายได้จริง (ถ้าจ่าย) ตกในช่วง p10–p90 กี่ %",
    help: "ในลูกค้าที่มีรายได้จริง กี่ % ที่ยอดจริงอยู่ในช่วงต่ำ–สูงที่โมเดลให้ — สูง = ช่วงมูลค่าน่าเชื่อ",
    goodRange: "> 70%",
    fmt: pct1,
    higherIsBetter: true,
  },
  spearman: {
    label: "Spearman",
    tooltip: "จัดอันดับลูกค้าตามมูลค่า — องค์ประกอบหลักของ CLV composite",
    help: "วัดว่าจัดลำดับลูกค้าจาก “มูลค่าต่ำ → สูง” ตรงกับความเป็นจริงแค่ไหน — ไม่ใช่ % accuracy; ~0.5 ปกติสำหรับข้อมูลรายได้ที่มีศูนย์เยอะ",
    goodRange: "≈ 0.45–0.55 ปกติ · > 0.55 ดี",
    fmt: dec3,
    higherIsBetter: true,
  },
  mae: {
    label: "MAE (฿)",
    tooltip: "คลาดเคลื่อนเฉลี่ยเป็นบาท",
    help: "เฉลี่ยว่าทาย CLV ต่อคนคลาดเคลื่อนจากยอดจริงกี่บาท — โดนลูกค้ารายใหญ่ (whale) ลากแรง",
    fmt: int,
    higherIsBetter: false,
  },
  rmse: {
    label: "RMSE (฿)",
    tooltip: "คลาดเคลื่อนเฉลี่ยเป็นบาท — โดน outlier ลากแรงกว่า MAE",
    help: "คลาดเคลื่อนเฉลี่ยแบบยกกำลังสอง — penalize การทาย whale ผิดมากกว่า MAE",
    fmt: int,
    higherIsBetter: false,
  },
  smape: {
    label: "SMAPE",
    tooltip: "% คลาดเคลื่อนแบบสมมาตร (กัน zero หาร) — รายงานประกอบ",
    help: "เปอร์เซ็นต์ความคลาดเคลื่อนแบบสมมาตร — ใช้เปรียบเทียบ scale ต่างกันได้",
    fmt: pct1,
    higherIsBetter: false,
  },
  top_decile_capture: {
    label: "Top-decile capture",
    tooltip: "top 10% ตามโมเดล กินรายได้จริงกี่ % ของทั้งหมด — เป้า > 35%",
    help: "ลูกค้า 10% ที่โมเดลให้ CLV สูงสุด ครอบคลุมรายได้จริงรวมกี่ % — สูง = จับลูกค้ารายใหญ่/มีมูลค่าได้ดี",
    goodRange: "> 70% ดี",
    fmt: pct1,
    higherIsBetter: true,
  },
  mae_30d: {
    label: "MAE 30d",
    tooltip: "คลาดเคลื่อนของ p50 ที่ horizon 30 วัน (เครดิต)",
    help: "เฉลี่ยว่าทายการใช้เครดิต 30 วันข้างหน้า (ค่ากลาง p50) คลาดเคลื่อนจากจริงกี่หน่วย",
    fmt: int,
    higherIsBetter: false,
  },
  smape_30d: {
    label: "SMAPE 30d",
    tooltip: "% คลาดเคลื่อนแบบสมมาตรที่ horizon 30 วัน",
    help: "% ความคลาดเคลื่อนของการทำนายใช้เครดิต 30 วัน",
    fmt: pct1,
    higherIsBetter: false,
  },
  mae_90d: {
    label: "MAE 90d",
    tooltip: "คลาดเคลื่อนของ p50 ที่ horizon 90 วัน (เครดิต)",
    help: "เฉลี่ยว่าทายการใช้เครดิต 90 วันข้างหน้า (ค่ากลาง p50) คลาดเคลื่อนจากจริงกี่หน่วย",
    fmt: int,
    higherIsBetter: false,
  },
  smape_90d: {
    label: "SMAPE 90d",
    tooltip: "% คลาดเคลื่อนแบบสมมาตรที่ horizon 90 วัน",
    help: "% ความคลาดเคลื่อนของการทำนายใช้เครดิต 90 วัน",
    fmt: pct1,
    higherIsBetter: false,
  },
  coverage_p10_p90: {
    label: "Coverage p10–p90",
    tooltip: "ค่าจริงตกในช่วง p10–p90 กี่ % — ควร ≈ 80% (75–85%)",
    help: "กี่ % ของลูกค้าที่การใช้เครดิตจริงตกอยู่ในช่วง “ต่ำ–สูง” ที่โมเดลให้ — ใกล้ 80% แปลว่าช่วงทำนายน่าเชื่อ",
    goodRange: "75–85% เป้า · > 90% กว้างเกิน",
    fmt: pct1,
    higherIsBetter: true,
  },
  coverage_p10_p90_30d: {
    label: "Coverage 30d",
    tooltip: "ช่วง p10–p90 ครอบค่าจริง 30 วัน กี่ %",
    help: "เฉพาะ horizon 30 วัน — กี่ % ที่ใช้จริงอยู่ในช่วงที่โมเดลให้",
    goodRange: "≈ 75–85%",
    fmt: pct1,
    higherIsBetter: true,
  },
  coverage_p10_p90_90d: {
    label: "Coverage 90d",
    tooltip: "ช่วง p10–p90 ครอบค่าจริง 90 วัน กี่ %",
    help: "เฉพาะ horizon 90 วัน — กี่ % ที่ใช้จริงอยู่ในช่วงที่โมเดลให้",
    goodRange: "≈ 75–85%",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_topup_recall: {
    label: "Urgent recall",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนครบแค่ไหน — เป้า > 0.7",
    help: "ในลูกค้าที่เครดิตใกล้หมดจริง (ต้องเติมภายใน ~14 วัน) โมเดลเตือนครบกี่ % — สูง = ไม่พลาดเคสเร่งด่วน",
    goodRange: "> 70%",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_topup_precision: {
    label: "Urgent precision",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนถูกแค่ไหน",
    help: "ในลูกค้าที่โมเดลเตือนว่า “เร่งด่วน” มีกี่ % ที่ใกล้หมดจริง — สูง = ไม่รบกวนลูกค้าเปล่า ๆ",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_recall: {
    label: "Urgent recall",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนครบแค่ไหน — เป้า > 0.7",
    help: "ในลูกค้าที่เครดิตใกล้หมดจริง โมเดลเตือนครบกี่ %",
    goodRange: "> 70%",
    fmt: pct1,
    higherIsBetter: true,
  },
  urgent_precision: {
    label: "Urgent precision",
    tooltip: "bucket \"ต้อง top-up ≤14 วัน\" เตือนถูกแค่ไหน",
    help: "ในลูกค้าที่โมเดลเตือนว่าเร่งด่วน มีกี่ % ที่ใกล้หมดจริง",
    fmt: pct1,
    higherIsBetter: true,
  },
};

const PRIMARY_LABEL_TO_KEY: Record<string, string> = {
  "PR-AUC": "pr_auc",
  "CLV composite": "clv_composite",
  "Coverage p10–p90": "coverage_p10_p90",
  "Rule coverage": "coverage_p10_p90",
};

export const SECONDARY_METRICS: Record<string, string[]> = {
  churn: ["recall_at_top10pct", "lift_at_top10pct", "ece", "f1"],
  clv: ["spearman", "p_pay_roc_auc", "top_decile_capture", "revenue_bias_ratio", "range_coverage", "p_pay_ece"],
  credit: ["coverage_p10_p90_30d", "coverage_p10_p90_90d", "mae_30d", "mae_90d", "urgent_topup_recall", "urgent_topup_precision"],
};

/** Subset shown on the Model Performance page (minimal but complete). */
export const DISPLAY_SECONDARY_METRICS: Record<string, string[]> = {
  churn: ["recall_at_top10pct", "lift_at_top10pct", "ece"],
  clv: ["spearman", "top_decile_capture", "p_pay_roc_auc"],
  credit: ["coverage_p10_p90_30d", "coverage_p10_p90_90d", "mae_30d"],
};

const BASELINE_NAME_LABELS: Record<string, string> = {
  target_75pct: "เป้า 75%",
};

export function metricInfo(key: string): MetricInfo {
  return (
    METRIC_INFO[key] ?? {
      label: key,
      tooltip: key,
      help: key,
      fmt: (v: number) => (Math.abs(v) <= 1 ? dec3(v) : v.toLocaleString()),
      higherIsBetter: true,
    }
  );
}

export function metricInfoByLabel(label: string): MetricInfo {
  const key = PRIMARY_LABEL_TO_KEY[label] ?? label;
  return metricInfo(key);
}

export function formatBaselineName(name: string): string {
  return BASELINE_NAME_LABELS[name] ?? name.replaceAll("_", " ");
}

export function pickSecondaryMetrics(
  modelType: string,
  metrics: Record<string, number>,
  componentMetrics?: Record<string, number>,
  keyList?: string[],
): Array<{ key: string; value: number }> {
  const keys = keyList ?? SECONDARY_METRICS[modelType] ?? [];
  const merged = { ...metrics, ...componentMetrics };
  return keys
    .filter((key) => {
      const v = merged[key];
      return typeof v === "number" && Number.isFinite(v);
    })
    .map((key) => ({ key, value: merged[key]! }));
}

export const PRIMARY_METRIC_KEY: Record<string, string> = {
  churn: "pr_auc",
  clv: "clv_composite",
  credit: "coverage_p10_p90",
};

export const SPLIT_ORDER = ["validation", "test", "backtest_avg"] as const;

export const SPLIT_LABELS: Record<(typeof SPLIT_ORDER)[number], string> = {
  validation: "Val",
  test: "Test",
  backtest_avg: "BT avg",
};

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
