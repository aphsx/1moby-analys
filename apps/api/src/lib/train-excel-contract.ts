/**
 * [NEW] Train raw Excel contract — mirrors moby-data-prep/config/excel_schema.yaml.
 * Predict raw uses the same sheet list + required headers in predict-excel-contract.ts.
 *
 * Extra columns are allowed. Every listed header must be present (exact name
 * after trim) so clean/predict can populate the ML feature contract.
 */

export const TRAIN_REQUIRED_SHEETS = [
  "Users+User_profile",
  "Backend_payment",
  "SMS_usage (BC)",
  "SMS_usage (API)",
  "SMS_usage (OTP)",
  "Email_usage (BC)",
  "Email_usage (API)",
  "Email_usage (OTP)",
] as const;

export const TRAIN_OPTIONAL_SHEETS = [] as const;

export const TRAIN_ALL_SHEETS = TRAIN_REQUIRED_SHEETS;

export type TrainSheetName = (typeof TRAIN_ALL_SHEETS)[number];

export const USER_PROFILE_HEADERS = [
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
] as const;

export const PAYMENT_HEADERS = [
  "uid",
  "payment_date",
  "acc_id",
  "amount",
  "credit_add",
  "credit_type",
] as const;

export const USAGE_HEADERS = ["year", "month", "acc_id", "usage"] as const;

export const SHEET_REQUIRED_HEADERS: Record<TrainSheetName, readonly string[]> = {
  "Users+User_profile": USER_PROFILE_HEADERS,
  "Backend_payment": PAYMENT_HEADERS,
  "SMS_usage (BC)": USAGE_HEADERS,
  "SMS_usage (API)": USAGE_HEADERS,
  "SMS_usage (OTP)": USAGE_HEADERS,
  "Email_usage (BC)": USAGE_HEADERS,
  "Email_usage (API)": USAGE_HEADERS,
  "Email_usage (OTP)": USAGE_HEADERS,
};

export interface TrainSheetConfig {
  table: string;
  requiredHeaders: string[];
}

function sheetConfig(table: string, sheet: TrainSheetName): TrainSheetConfig {
  return { table, requiredHeaders: [...SHEET_REQUIRED_HEADERS[sheet]] };
}

export const TRAIN_SHEET_CONFIG: Record<TrainSheetName, TrainSheetConfig> = {
  "Users+User_profile": sheetConfig("train_raw_sheet_users_user_profile", "Users+User_profile"),
  "Backend_payment": sheetConfig("train_raw_sheet_backend_payment", "Backend_payment"),
  "SMS_usage (BC)": sheetConfig("train_raw_sheet_sms_usage_bc", "SMS_usage (BC)"),
  "SMS_usage (API)": sheetConfig("train_raw_sheet_sms_usage_api", "SMS_usage (API)"),
  "SMS_usage (OTP)": sheetConfig("train_raw_sheet_sms_usage_otp", "SMS_usage (OTP)"),
  "Email_usage (BC)": sheetConfig("train_raw_sheet_email_usage_bc", "Email_usage (BC)"),
  "Email_usage (API)": sheetConfig("train_raw_sheet_email_usage_api", "Email_usage (API)"),
  "Email_usage (OTP)": sheetConfig("train_raw_sheet_email_usage_otp", "Email_usage (OTP)"),
};

export const TRAIN_IMPORT_BATCH_SIZE = 500;
