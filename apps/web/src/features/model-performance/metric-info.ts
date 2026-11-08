/**
 * Metric display metadata for the Model Performance page.
 * The UI never computes metrics, it only explains them.
 */
import { formatCount } from "@/lib/format";

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
const int = (v: number): string => formatCount(v);

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
  f2: {
    label: "F2-Score",
    tooltip: "วัดความแม่นยำที่เน้น Recall เป็น 2 เท่าตามเกณฑ์ธุรกิจ Colab 01",
    help: "F-beta score (beta=2.0) ให้น้ำหนักกับการตรวจจับลูกค้าที่จะเลิกใช้จริง (Recall) เป็น 2 เท่าเทียบกับ Precision เพื่อไม่ให้หลุดเคสสำคัญ ใช้เป็นเกณฑ์หาจุดตัด High Risk",
    goodRange: "เป้าหมาย > 0.75",
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
    label: "Spearman (ทั้งหมด)",
    tooltip: "จัดอันดับลูกค้าตามมูลค่ารวมทุกคน — วัดความสัมพันธ์อันดับ",
    help: "วัดว่าจัดลำดับลูกค้าจากมูลค่าต่ำไปสูงตรงกับความเป็นจริงแค่ไหนเมื่อรวมลูกค้าทุกคน (รวมคนที่ไม่ชำระเงิน)",
    goodRange: "≈ 0.45–0.55 ปกติ · > 0.55 ดี",
    fmt: dec3,
    higherIsBetter: true,
  },
  spearman_payers: {
    label: "Spearman (ผู้จ่ายเงิน)",
    tooltip: "จัดอันดับลูกค้าตามมูลค่าจริงเฉพาะกลุ่มที่ชำระเงิน — ตัวชี้วัดหลัก Colab 02",
    help: "วัดการจัดลำดับลูกค้าจากมูลค่าต่ำไปสูงเฉพาะในกลุ่มที่มียอดชำระจริง (> ฿0) ช่วยพิสูจน์ว่าโมเดลเรียงลำดับลูกค้ารายใหญ่ได้แม่นยำจริง",
    goodRange: "เป้าหมาย > 0.60 (Colab 02)",
    fmt: dec3,
    higherIsBetter: true,
  },
  portfolio_bias_pct: {
    label: "Portfolio bias",
    tooltip: "(Σ ทำนาย - Σ จริง) ÷ Σ จริง × 100% — เป้าหมาย < ±10%",
    help: "เปอร์เซ็นต์ความคลาดเคลื่อนของยอดเงินพอร์ตโฟลิโอรวม 6 เดือน เทียบกับยอดเงินจริง — ค่าบวกแปลว่าทำนายสูงกว่าจริง ค่าติดลบแปลว่าทำนายต่ำกว่าจริง",
    goodRange: "เป้าหมาย < ±10% (Colab 02)",
    fmt: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
    higherIsBetter: false,
  },
  total_actual: {
    label: "ยอดเงินจริงรวม",
    tooltip: "ยอดเงินจริงรวมของชุดทดสอบ 6 เดือน",
    help: "ผลรวมยอดชำระเงินจริงทั้งหมดของลูกค้าในชุดทดสอบช่วง 180 วัน",
    fmt: (v: number) => `฿${formatCount(v)}`,
    higherIsBetter: true,
  },
  total_predicted: {
    label: "ยอดเงินทำนายรวม",
    tooltip: "ยอดเงินที่โมเดลพยากรณ์รวม 6 เดือน",
    help: "ผลรวมยอดชำระเงินที่โมเดลพยากรณ์ให้ลูกค้าทุกคนในชุดทดสอบช่วง 180 วัน",
    fmt: (v: number) => `฿${formatCount(v)}`,
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
  spearman_30d: {
    label: "Spearman (ยอดใช้ 30 วัน)",
    tooltip: "ความแม่นยำในการจัดลำดับลูกค้าที่ใช้เครดิตมากไปน้อยใน 30 วันข้างหน้า",
    help: "วัดว่าโมเดลเรียงลำดับลูกค้าที่จะใช้ SMS มากไปน้อยใน 30 วันข้างหน้าได้ตรงความจริงแค่ไหน — ไม่ถูกค่าเฉลี่ยของขาใหญ่ดึงหลอกเหมือน MAE",
    goodRange: "เป้าหมาย > 0.75 (Colab 03)",
    fmt: dec3,
    higherIsBetter: true,
  },
  mae_30d: {
    label: "MAE 30 วัน (SMS)",
    tooltip: "คลาดเคลื่อนเฉลี่ยของค่ากลาง p50 ที่ 30 วัน (หน่วย SMS)",
    help: "เฉลี่ยว่าทายการใช้เครดิต 30 วันข้างหน้า (ค่ากลาง p50) คลาดเคลื่อนจากจริงกี่ข้อความ (มีหน่วยเป็นจำนวน SMS ซึ่งรวมองค์กรขนาดใหญ่ที่ส่งหลักแสน–ล้านข้อความ)",
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
    label: "กรอบคาดการณ์ [p10–p90]",
    tooltip: "ความแม่นยำของกรอบคาดการณ์ต่ำ–สูง [p10, p90] ใน 30 วัน — เป้าหมาย 80–90%",
    help: "วัดว่ายอดใช้ SMS จริงใน 30 วันข้างหน้าตกอยู่ในกรอบคาดการณ์ [p10 (ขั้นต่ำ) ถึง p90 (ขั้นสูง)] กี่ % ของลูกค้าที่ยังเคลื่อนไหว — ค่าที่เหมาะสมที่สุดตามทฤษฎีคือ 80–90% (ต่ำกว่า 80% แปลว่ากรอบแคบไป, สูงกว่า 90% แปลว่าเผื่อกรอบกว้างเกินจริง)",
    goodRange: "เป้าหมาย 80–90% (Colab 03)",
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
  urgent_topup_f1: {
    label: "Urgent top-up F1",
    tooltip: "F1-Score แจ้งเตือนเติมเงินด่วน (เครดิตจะหมดใน ≤ 14 วัน) ตาม Colab 03",
    help: "วัดความสมดุลระหว่างการเตือนลูกค้าที่เครดิตใกล้หมดได้ครบ (Recall) และการเตือนได้แม่นยำไม่เตือนมั่ว (Precision) ตามเกณฑ์แจ้งเตือนด่วน",
    goodRange: "เป้าหมาย > 0.60 (Colab 03)",
    fmt: dec3,
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
  "ROC-AUC": "roc_auc",
  "Spearman (ผู้จ่ายเงิน)": "spearman_payers",
  "Portfolio bias": "portfolio_bias_pct",
  "กรอบคาดการณ์ [p10–p90]": "coverage_p10_p90_30d",
  "80% Coverage (30 วัน)": "coverage_p10_p90_30d",
  "Coverage p10–p90": "coverage_p10_p90_30d",
  "CLV composite": "clv_composite",
};

export const SECONDARY_METRICS: Record<string, string[]> = {
  churn: ["roc_auc", "pr_auc", "f2", "f1", "recall", "precision", "lift_at_top10pct", "ece"],
  clv: ["spearman_payers", "portfolio_bias_pct", "spearman", "mae", "top_decile_capture", "p_pay_roc_auc", "total_predicted", "total_actual"],
  credit: ["coverage_p10_p90_30d", "urgent_topup_f1", "spearman_30d", "urgent_topup_recall", "urgent_topup_precision", "mae_30d"],
};

const BASELINE_NAME_LABELS: Record<string, string> = {
  target_85pct: "เป้า 85%",
  target_80pct: "เป้า 80%",
  target_75pct: "เป้า 75%",
  target_70pct: "เป้า 70%",
  target_60pct: "เป้า 60%",
};

export function metricInfo(key: string): MetricInfo {
  return (
    METRIC_INFO[key] ?? {
      label: key,
      tooltip: key,
      help: key,
      fmt: (v: number) => (Math.abs(v) <= 1 ? dec3(v) : formatCount(v)),
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
  clv: "spearman_payers",
  credit: "coverage_p10_p90_30d",
};

export const SPLIT_ORDER = ["validation", "test", "backtest_avg"] as const;

export const SPLIT_LABELS: Record<(typeof SPLIT_ORDER)[number], string> = {
  validation: "ชุดตรวจสอบ",
  test: "ชุดทดสอบ",
  backtest_avg: "ย้อนทดสอบเฉลี่ย",
};

