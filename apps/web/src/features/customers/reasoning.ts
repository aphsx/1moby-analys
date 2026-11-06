/** Thai names for churn model features (SHAP `churn_factors`). */

const FEATURE_LABELS: Record<string, string> = {
  days_since_last_activity: "จำนวนวันที่ไม่มีการใช้งาน",
  days_since_last_send: "จำนวนวันที่ไม่ส่งข้อความ",
  days_since_last_payment: "จำนวนวันที่ไม่เติมเครดิต",
  days_since_last_usage: "จำนวนวันที่ไม่มีการใช้งาน/ส่งข้อความ",
  usage_total_180d: "ปริมาณการใช้งานรวม 180 วัน",
  usage_recent_90d: "ปริมาณการใช้งาน 90 วันล่าสุด",
  usage_recent_30d: "ปริมาณการใช้งาน 30 วันล่าสุด",
  usage_total_90d: "ปริมาณการใช้งานรวม 90 วัน",
  usage_active_months_180d: "จำนวนเดือนที่มีการใช้งาน (ใน 180 วัน)",
  usage_trend_pct: "แนวโน้มการเปลี่ยนแปลงการใช้งาน (%)",
  usage_trend_slope: "แนวโน้มการใช้งาน",
  payment_count_all: "จำนวนครั้งที่ชำระเงินทั้งหมด",
  payment_count_180d: "จำนวนครั้งที่ชำระเงิน 180 วัน",
  total_revenue_all: "รายได้รวมทั้งหมด",
  total_revenue_180d: "รายได้รวม 180 วัน",
  total_revenue: "รายได้รวม",
  avg_transaction_value: "มูลค่าเฉลี่ยต่อครั้ง",
  payment_to_usage_ratio: "สัดส่วนการชำระเงินต่อการใช้งาน",
  credit_balance_proxy: "เครดิตคงเหลือโดยประมาณ",
  current_sms_balance: "ยอด SMS คงเหลือปัจจุบัน",
  anchor_30d: "ฐานการใช้เครดิต 30 วัน",
  credit_runway_months: "เครดิตพอใช้ได้อีก (เดือน)",
  credit_added_180d: "เครดิตที่เติมรวม 180 วัน",
  n_purchases: "จำนวนครั้งที่ชำระเงิน",
  payment_amount_cv: "ความผันผวนของยอดเติมเครดิต",
  channel_hhi: "ความกระจุกตัวของช่องทาง (SMS/Email)",
  multichannel_flag: "ใช้หลายช่องทาง (SMS+Email)",
  customer_age_days: "อายุการเป็นลูกค้า (วัน)",
  recency_days: "ระยะเวลาตั้งแต่ใช้งานล่าสุด",
  frequency: "ความถี่การใช้งาน",
  monetary: "มูลค่าการใช้จ่าย",
  tenure_months: "อายุบัญชี (เดือน)",
};

/** Fallback: snake_case → spaced, capitalised words. */
export function humanizeFeature(feature: string): string {
  return (
    FEATURE_LABELS[feature] ??
    feature
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
  );
}
