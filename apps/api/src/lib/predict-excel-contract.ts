/**
 * [NEW] Predict raw Excel contract — same 8 sheets + required headers as train.
 * Extra columns are allowed; every SHEET_REQUIRED_HEADERS name must be present.
 * Legacy raw_customers/payments/usage removed (see 004_drop_legacy_raw_tables.sql).
 */
export {
  TRAIN_REQUIRED_SHEETS as PREDICT_REQUIRED_SHEETS,
  TRAIN_OPTIONAL_SHEETS as PREDICT_OPTIONAL_SHEETS,
  TRAIN_ALL_SHEETS as PREDICT_ALL_SHEETS,
  TRAIN_IMPORT_BATCH_SIZE as PREDICT_IMPORT_BATCH_SIZE,
  SHEET_REQUIRED_HEADERS,
  type TrainSheetName as PredictSheetName,
} from "./train-excel-contract";

import {
  SHEET_REQUIRED_HEADERS,
  type TrainSheetName,
} from "./train-excel-contract";

/** Sheet name → predict raw PostgreSQL table */
export const PREDICT_SHEET_CONFIG: Record<
  TrainSheetName,
  { table: string; requiredHeaders: string[] }
> = {
  "Users+User_profile": {
    table: "predict_raw_sheet_users_user_profile",
    requiredHeaders: [...SHEET_REQUIRED_HEADERS["Users+User_profile"]],
  },
  "Backend_payment": {
    table: "predict_raw_sheet_backend_payment",
    requiredHeaders: [...SHEET_REQUIRED_HEADERS["Backend_payment"]],
  },
  "SMS_usage (BC)": {
    table: "predict_raw_sheet_sms_usage_bc",
    requiredHeaders: [...SHEET_REQUIRED_HEADERS["SMS_usage (BC)"]],
  },
  "SMS_usage (API)": {
    table: "predict_raw_sheet_sms_usage_api",
    requiredHeaders: [...SHEET_REQUIRED_HEADERS["SMS_usage (API)"]],
  },
  "SMS_usage (OTP)": {
    table: "predict_raw_sheet_sms_usage_otp",
    requiredHeaders: [...SHEET_REQUIRED_HEADERS["SMS_usage (OTP)"]],
  },
  "Email_usage (BC)": {
    table: "predict_raw_sheet_email_usage_bc",
    requiredHeaders: [...SHEET_REQUIRED_HEADERS["Email_usage (BC)"]],
  },
  "Email_usage (API)": {
    table: "predict_raw_sheet_email_usage_api",
    requiredHeaders: [...SHEET_REQUIRED_HEADERS["Email_usage (API)"]],
  },
  "Email_usage (OTP)": {
    table: "predict_raw_sheet_email_usage_otp",
    requiredHeaders: [...SHEET_REQUIRED_HEADERS["Email_usage (OTP)"]],
  },
};
