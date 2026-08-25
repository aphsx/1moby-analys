/**
 * [NEW] Train raw Excel contract — mirrors moby-data-prep/config/excel_schema.yaml.
 * Predict raw uses the same sheet list in predict-excel-contract.ts.
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

export interface TrainSheetConfig {
  requiredHeaders: string[];
  table: string;
}

export const TRAIN_SHEET_CONFIG: Record<TrainSheetName, TrainSheetConfig> = {
  Backend_payment: {
    requiredHeaders: ["uid", "payment_date", "acc_id", "amount", "credit_add"],
    table: "train_raw_sheet_backend_payment",
  },
  "Email_usage (API)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "train_raw_sheet_email_usage_api",
  },
  "Email_usage (BC)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "train_raw_sheet_email_usage_bc",
  },
  "Email_usage (OTP)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "train_raw_sheet_email_usage_otp",
  },
  "SMS_usage (API)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "train_raw_sheet_sms_usage_api",
  },
  "SMS_usage (BC)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "train_raw_sheet_sms_usage_bc",
  },
  "SMS_usage (OTP)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "train_raw_sheet_sms_usage_otp",
  },
  "Users+User_profile": {
    requiredHeaders: ["acc_id"],
    table: "train_raw_sheet_users_user_profile",
  },
};

export const TRAIN_IMPORT_BATCH_SIZE = 500;
