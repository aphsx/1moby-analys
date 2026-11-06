import { type MonthlyUsagePoint, type PaymentEvent } from "@moby/types";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { predictCleanCustomers } from "../../db/schema";
import { monthKeysBeforeCutoff } from "../ml-contract";

export type PredictRunRef = {
  predictSourceId: string;
  cutoffDate: string;
};

export type CustomerProfile = {
  status_sms: string | null;
  status_email: string | null;
  credit_sms: number;
  credit_email: number;
  expire_sms: string | null;
  expire_email: string | null;
  join_date: string | null;
  last_access: string | null;
  last_send: string | null;
};

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function loadCustomerProfile(
  sourceId: string,
  accId: number
): Promise<CustomerProfile | null> {
  const [row] = await db
    .select()
    .from(predictCleanCustomers)
    .where(and(eq(predictCleanCustomers.sourceId, sourceId), eq(predictCleanCustomers.accId, accId)))
    .limit(1);
  if (!row) return null;

  return {
    status_sms: row.statusSms,
    status_email: row.statusEmail,
    credit_sms: Number(row.creditSms ?? 0),
    credit_email: Number(row.creditEmail ?? 0),
    expire_sms: row.expireSms,
    expire_email: row.expireEmail,
    join_date: row.joinDate,
    last_access: toIsoDate(row.lastAccess),
    last_send: toIsoDate(row.lastSend),
  };
}

export async function loadCustomerUsageMonthly(
  run: PredictRunRef,
  accId: number
): Promise<MonthlyUsagePoint[]> {
  const rows = await db.execute<{
    month: string;
    sms: number;
    email: number;
    bc: number;
    api: number;
    otp: number;
    total: number;
  }>(sql`
    SELECT to_char(make_date(year, month, 1), 'YYYY-MM') AS month,
           COALESCE(SUM(usage) FILTER (WHERE channel = 'sms'), 0)::float8 AS sms,
           COALESCE(SUM(usage) FILTER (WHERE channel = 'email'), 0)::float8 AS email,
           COALESCE(SUM(usage) FILTER (WHERE usage_source = 'bc'), 0)::float8 AS bc,
           COALESCE(SUM(usage) FILTER (WHERE usage_source = 'api'), 0)::float8 AS api,
           COALESCE(SUM(usage) FILTER (WHERE usage_source = 'otp'), 0)::float8 AS otp,
           COALESCE(SUM(usage), 0)::float8 AS total
    FROM predict_clean_usage
    WHERE source_id = ${run.predictSourceId}
      AND acc_id = ${accId}
      AND year IS NOT NULL
      AND month IS NOT NULL
      AND make_date(year, month, 1) >= date_trunc('month', ${run.cutoffDate}::date) - INTERVAL '12 months'
      AND make_date(year, month, 1) < date_trunc('month', ${run.cutoffDate}::date)
    GROUP BY 1
  `);

  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return monthKeysBeforeCutoff(run.cutoffDate).map((month) => {
    const row = byMonth.get(month);
    return {
      month,
      sms: row?.sms ?? 0,
      email: row?.email ?? 0,
      bc: row?.bc ?? 0,
      api: row?.api ?? 0,
      otp: row?.otp ?? 0,
      total: row?.total ?? 0,
    };
  });
}

export async function loadCustomerPayments(
  run: PredictRunRef,
  accId: number,
  limit = 50
): Promise<PaymentEvent[]> {
  const rows = await db.execute<{
    payment_date: Date;
    amount: number;
    credit_add: number;
    credit_type: string;
  }>(sql`
    SELECT payment_date,
           COALESCE(amount, 0)::float8 AS amount,
           COALESCE(credit_add, 0)::float8 AS credit_add,
           COALESCE(credit_type, '') AS credit_type
    FROM predict_clean_payments
    WHERE source_id = ${run.predictSourceId}
      AND acc_id = ${accId}
      AND payment_date < ${run.cutoffDate}::date
    ORDER BY payment_date DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    payment_date: new Date(row.payment_date).toISOString(),
    amount: row.amount,
    credit_add: row.credit_add,
    credit_type: row.credit_type,
  }));
}
