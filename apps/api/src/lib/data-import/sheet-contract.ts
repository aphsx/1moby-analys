/**
 * The 1Moby workbook contract, the same for Train and Predict Data Sources: which sheets
 * must exist and which headers each needs. Extra sheets and columns are ignored; every
 * listed header must be present (exact name after trim) so Clean can fill the ML inputs.
 */

export const REQUIRED_SHEETS = [
  "Users+User_profile",
  "Backend_payment",
  "SMS_usage (BC)",
  "SMS_usage (API)",
  "SMS_usage (OTP)",
  "Email_usage (BC)",
  "Email_usage (API)",
  "Email_usage (OTP)",
] as const;

export type SheetName = (typeof REQUIRED_SHEETS)[number];
export type UsageSheetName = Exclude<SheetName, "Users+User_profile" | "Backend_payment">;

const USER_PROFILE_HEADERS = [
  "acc_id",
  "status (SMS)",
  "user.credit + user.credit_premium",
  "credit_email",
  "expire",
  "expire_email",
  "status (Email)",
  "join_date",
  "last_access",
  "last_send",
];
const PAYMENT_HEADERS = ["uid", "payment_date", "acc_id", "amount", "credit_add", "credit_type"];
const USAGE_HEADERS = ["year", "month", "acc_id", "usage"];

export const SHEET_REQUIRED_HEADERS: Record<SheetName, readonly string[]> = {
  "Users+User_profile": USER_PROFILE_HEADERS,
  "Backend_payment": PAYMENT_HEADERS,
  "SMS_usage (BC)": USAGE_HEADERS,
  "SMS_usage (API)": USAGE_HEADERS,
  "SMS_usage (OTP)": USAGE_HEADERS,
  "Email_usage (BC)": USAGE_HEADERS,
  "Email_usage (API)": USAGE_HEADERS,
  "Email_usage (OTP)": USAGE_HEADERS,
};

/** How each usage sheet lands in the clean usage table. */
export const USAGE_SHEET_CHANNEL: Record<UsageSheetName, { channel: string; usageSource: string }> = {
  "SMS_usage (BC)": { channel: "sms", usageSource: "bc" },
  "SMS_usage (API)": { channel: "sms", usageSource: "api" },
  "SMS_usage (OTP)": { channel: "sms", usageSource: "otp" },
  "Email_usage (BC)": { channel: "email", usageSource: "bc" },
  "Email_usage (API)": { channel: "email", usageSource: "api" },
  "Email_usage (OTP)": { channel: "email", usageSource: "otp" },
};

export const USAGE_SHEET_NAMES = Object.keys(USAGE_SHEET_CHANNEL) as UsageSheetName[];

export const isSheetName = (name: string): name is SheetName =>
  (REQUIRED_SHEETS as readonly string[]).includes(name);

/** Rows per INSERT for raw and clean tables. */
export const IMPORT_BATCH_SIZE = 500;
