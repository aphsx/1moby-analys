/**
 * Thai labels for every enum value shown on screen (docs/ui/CONTENT.md §4). `satisfies` makes a new
 * enum value in @moby/types a type error here until it gets a label.
 */
import type { ContactChannel, ContactOutcome, LifecycleStage, PredictionOutput, RiskLevel, Segment, UrgencyLevel, ValueTier } from "@moby/types";

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

/**
 * Value Tier `none` has two cases (GLOSSARY.md): an Active customer predicted to pay ฿0, or a
 * Churned/Ghost customer with no CLV at all. Pick the label by stage.
 */
export const valueTierLabel = (tier: ValueTier, stage: LifecycleStage) =>
  tier === "none" && stage.startsWith("Active") ? "คาดว่าไม่จ่าย" : VALUE_TIER_LABEL[tier];

const ROUTINE = "สื่อสารตามรอบปกติ";
const AUTOMATED = "ใช้อีเมลอัตโนมัติ ไม่คุ้มที่จะใช้คนติดต่อ";

/**
 * The Playbook (GLOSSARY.md): one fixed action per Value Tier × Churn Risk Level. It is the only
 * "what to do" in the app: the heat grid and the customer page both read it (DASHBOARD.md §8.1).
 */
export const CELL_ACTION = {
  high: {
    low: "ลูกค้าหลักที่มั่นคง เหมาะกับการเสนอแพ็กเกจที่ใหญ่ขึ้น",
    medium: "เฝ้าดูใกล้ชิด และเตรียมข้อเสนอพิเศษเพื่อรักษาไว้",
    high: "โทรสอบถามความพึงพอใจและปัญหาการใช้งานภายใน 2 สัปดาห์",
    critical: "ให้ Account Manager ติดต่อภายในสัปดาห์นี้ เริ่มจากรายที่เสี่ยงหายมากที่สุด",
  },
  mid: {
    low: "กลุ่มที่โตได้ แนะนำบริการเสริม เช่น Email หรือ OTP",
    medium: "สื่อสารตามรอบปกติ พร้อมแนะนำฟีเจอร์ที่ยังไม่ได้ใช้",
    high: "ส่งแคมเปญรักษาลูกค้าแบบอัตโนมัติ แล้วติดตามผล",
    critical: "เสนอส่วนลดเติมเครดิต และเช็กว่ามีปัญหาการใช้งานหรือไม่",
  },
  low: { low: ROUTINE, medium: ROUTINE, high: AUTOMATED, critical: AUTOMATED },
  none: { low: ROUTINE, medium: ROUTINE, high: AUTOMATED, critical: AUTOMATED },
} as const satisfies Record<ValueTier, Record<RiskLevel, string>>;

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

export const CONTACT_CHANNEL_LABEL = { phone: "โทรศัพท์", email: "อีเมล", meeting: "นัดพบ", other: "อื่น ๆ" } as const satisfies Record<ContactChannel, string>;

export const CONTACT_OUTCOME_LABEL = {
  reached: "คุยแล้ว",
  no_answer: "ติดต่อไม่ได้",
  follow_up: "ต้องติดตามต่อ",
  resolved: "จบเรื่องแล้ว",
} as const satisfies Record<ContactOutcome, string>;
