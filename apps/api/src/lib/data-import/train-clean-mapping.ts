/**
 * Excel header → clean column mapping (aligned with apps/ml/src/data_loader.py).
 */

import type { TrainSheetName } from "./train-excel-contract";

export const USAGE_SHEET_CHANNEL: Record<string, { channel: string; usageSource: string }> = {
  "SMS_usage (BC)": { channel: "sms", usageSource: "bc" },
  "SMS_usage (API)": { channel: "sms", usageSource: "api" },
  "SMS_usage (OTP)": { channel: "sms", usageSource: "otp" },
  "Email_usage (BC)": { channel: "email", usageSource: "bc" },
  "Email_usage (API)": { channel: "email", usageSource: "api" },
  "Email_usage (OTP)": { channel: "email", usageSource: "otp" },
};

export const USAGE_SHEET_NAMES = Object.keys(USAGE_SHEET_CHANNEL) as TrainSheetName[];
