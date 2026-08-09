/**
 * [NEW] Predict raw Excel contract — same 8 sheets as train, different table names.
 * Legacy raw_customers/payments/usage removed (see 004_drop_legacy_raw_tables.sql).
 */
export {
  TRAIN_ALL_SHEETS as PREDICT_ALL_SHEETS,
  TRAIN_IMPORT_BATCH_SIZE as PREDICT_IMPORT_BATCH_SIZE,
  TRAIN_OPTIONAL_SHEETS as PREDICT_OPTIONAL_SHEETS,
  TRAIN_REQUIRED_SHEETS as PREDICT_REQUIRED_SHEETS,
  type TrainSheetName as PredictSheetName,
} from "./train-excel-contract";

import type { TrainSheetName } from "./train-excel-contract";

/** Sheet name → predict raw PostgreSQL table */
export const PREDICT_SHEET_CONFIG: Record<
  TrainSheetName,
  { table: string; requiredHeaders: string[] }
> = {
  Backend_payment: {
    requiredHeaders: ["uid", "payment_date", "acc_id", "amount", "credit_add"],
    table: "predict_raw_sheet_backend_payment",
  },
  "Email_usage (API)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "predict_raw_sheet_email_usage_api",
  },
  "Email_usage (BC)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "predict_raw_sheet_email_usage_bc",
  },
  "Email_usage (OTP)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "predict_raw_sheet_email_usage_otp",
  },
  "SMS_usage (API)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "predict_raw_sheet_sms_usage_api",
  },
  "SMS_usage (BC)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "predict_raw_sheet_sms_usage_bc",
  },
  "SMS_usage (OTP)": {
    requiredHeaders: ["year", "month", "acc_id", "usage"],
    table: "predict_raw_sheet_sms_usage_otp",
  },
  "Users+User_profile": {
    requiredHeaders: ["acc_id"],
    table: "predict_raw_sheet_users_user_profile",
  },
};
