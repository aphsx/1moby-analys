/**
 * Thai labels for every enum value shown on screen (docs/ui/CONTENT.md §4). `satisfies` makes a new
 * enum value in @moby/types a type error here until it gets a label.
 */
import type { LifecycleStage, PredictionOutput, RiskLevel, Segment, UrgencyLevel, ValueTier } from "@moby/types";

export const LIFECYCLE_LABEL = {
  "Active Paid": "ใช้งาน · จ่ายเงิน",
  "Active Free": "ใช้งาน · ไม่ได้เติมเงิน",
  Churned: "หยุดใช้",
  Ghost: "ไม่มีกิจกรรม",
} as const satisfies Record<LifecycleStage, string>;

export const LIFECYCLE_HELP = {
  "Active Paid": "มีการใช้งานหรือชำระเงินภายใน 180 วันก่อนวันตัดข้อมูล และเคยชำระเงินในช่วงข้อมูล",
  "Active Free": "มีการใช้งานภายใน 180 วัน แต่ไม่มีการชำระเงินในช่วงข้อมูล อาจใช้เครดิตเดิมที่เติมไว้ก่อนหน้า",
  Churned: "ไม่มีการใช้งานหรือชำระเงินเกิน 180 วัน",
  Ghost: "ไม่มีการใช้งานหรือชำระเงินเลยในช่วงข้อมูล ส่วนใหญ่เป็นบัญชีเก่าที่เลิกใช้ไปนานแล้ว",
} as const satisfies Record<LifecycleStage, string>;

export const RISK_LABEL = {
  low: "ต่ำ",
  medium: "ปานกลาง",
  high: "สูง",
  critical: "วิกฤต",
} as const satisfies Record<RiskLevel, string>;

/** Range text for each risk level. Always built from summary.churn.thresholds — never hardcode them. */
export function riskRange(t: { medium: number; high: number; critical: number }): Record<RiskLevel, string> {
  const p = (v: number) => `${Math.round(v * 100)}%`;
  return {
    low: `ต่ำกว่า ${p(t.medium)}`,
    medium: `${p(t.medium)}–${p(t.high)}`,
    high: `${p(t.high)}–${p(t.critical)}`,
    critical: `${p(t.critical)} ขึ้นไป`,
  };
}

export const VALUE_TIER_LABEL = {
  high: "มูลค่าสูง",
  mid: "มูลค่ากลาง",
  low: "มูลค่าต่ำ",
  none: "ยังประเมินไม่ได้",
} as const satisfies Record<ValueTier, string>;

export const VALUE_TIER_HELP = {
  high: "10% แรกของมูลค่า 6 เดือนในรอบทำนายนี้",
  mid: "อยู่ในช่วง 10–50% แรก",
  low: "ครึ่งล่างของมูลค่า 6 เดือน",
  none: "ยังไม่มีมูลค่าคาดการณ์",
} as const satisfies Record<ValueTier, string>;

// apps/ml/src/constants.py: URGENCY_CRITICAL_DAYS = 14, WARNING = 30, MONITOR = 90
export const URGENCY_LABEL = {
  critical: "ต้องเติมใน 14 วัน",
  warning: "ต้องเติมใน 15–30 วัน",
  monitor: "ต้องเติมใน 31–90 วัน",
  stable: "เกิน 90 วัน",
} as const satisfies Record<UrgencyLevel, string>;

export const USAGE_TREND_LABEL = {
  increasing: "ใช้งานเพิ่มขึ้น",
  stable: "ใช้งานคงที่",
  declining: "ใช้งานลดลง",
  no_usage: "ไม่มีการใช้งาน",
} as const satisfies Record<PredictionOutput["usage_trend"], string>;

export const SEGMENT_LABEL = {
  "High-Value At-Risk": "มูลค่าสูง · เสี่ยง",
  "Mid-Value At-Risk": "มูลค่ากลาง · เสี่ยง",
  "High-Value Stable": "มูลค่าสูง · มั่นคง",
  Emerging: "กำลังโต",
  Stable: "มั่นคง",
  "Low-Value Watch": "มูลค่าต่ำ · เฝ้าดู",
  "Low-Value At-Risk": "มูลค่าต่ำ · เสี่ยง",
  Lapsed: "หยุดใช้ · ชวนกลับได้",
  Dormant: "ไม่เคลื่อนไหว",
  Ghost: "ไม่มีกิจกรรม",
} as const satisfies Record<Segment, string>;

export const CHANNEL_LABEL = { bc: "SMS ส่งเอง", api: "SMS API", otp: "OTP", email: "Email" } as const;
