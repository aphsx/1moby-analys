/**
 * Train and Predict Data Sources share one workbook format and one pipeline; they only
 * differ in which tables they write. This map is that difference.
 */
import {
  predictCleanCustomers,
  predictCleanPayments,
  predictCleanUsage,
  predictDataSources,
  predictRawSheetBackendPayment,
  predictRawSheetEmailUsageApi,
  predictRawSheetEmailUsageBc,
  predictRawSheetEmailUsageOtp,
  predictRawSheetSmsUsageApi,
  predictRawSheetSmsUsageBc,
  predictRawSheetSmsUsageOtp,
  predictRawSheetUsersUserProfile,
  trainCleanCustomers,
  trainCleanPayments,
  trainCleanUsage,
  trainDataSources,
  trainRawSheetBackendPayment,
  trainRawSheetEmailUsageApi,
  trainRawSheetEmailUsageBc,
  trainRawSheetEmailUsageOtp,
  trainRawSheetSmsUsageApi,
  trainRawSheetSmsUsageBc,
  trainRawSheetSmsUsageOtp,
  trainRawSheetUsersUserProfile,
} from "../../db/schema";
import type { SheetName } from "./sheet-contract";

export type DataSourceKind = "train" | "predict";

export const SOURCE_TABLES = {
  train: {
    sources: trainDataSources,
    raw: {
      "Users+User_profile": trainRawSheetUsersUserProfile,
      "Backend_payment": trainRawSheetBackendPayment,
      "SMS_usage (BC)": trainRawSheetSmsUsageBc,
      "SMS_usage (API)": trainRawSheetSmsUsageApi,
      "SMS_usage (OTP)": trainRawSheetSmsUsageOtp,
      "Email_usage (BC)": trainRawSheetEmailUsageBc,
      "Email_usage (API)": trainRawSheetEmailUsageApi,
      "Email_usage (OTP)": trainRawSheetEmailUsageOtp,
    },
    clean: { customers: trainCleanCustomers, payments: trainCleanPayments, usage: trainCleanUsage },
  },
  predict: {
    sources: predictDataSources,
    raw: {
      "Users+User_profile": predictRawSheetUsersUserProfile,
      "Backend_payment": predictRawSheetBackendPayment,
      "SMS_usage (BC)": predictRawSheetSmsUsageBc,
      "SMS_usage (API)": predictRawSheetSmsUsageApi,
      "SMS_usage (OTP)": predictRawSheetSmsUsageOtp,
      "Email_usage (BC)": predictRawSheetEmailUsageBc,
      "Email_usage (API)": predictRawSheetEmailUsageApi,
      "Email_usage (OTP)": predictRawSheetEmailUsageOtp,
    },
    clean: { customers: predictCleanCustomers, payments: predictCleanPayments, usage: predictCleanUsage },
  },
} satisfies Record<DataSourceKind, { sources: unknown; raw: Record<SheetName, unknown>; clean: unknown }>;
