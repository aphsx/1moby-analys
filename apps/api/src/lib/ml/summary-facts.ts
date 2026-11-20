/**
 * Facts for the overview that come from the imported data rather than from model outputs:
 * payer concentration, the top revenue contributor, monthly senders, the data start, and
 * sending months with their Backtest (DASHBOARD.md §7–8, §11.2).
 */
import { LIFECYCLE_STAGE, MODEL_ALIAS, type RunSummary } from "@moby/types";
import { and, eq, sql, type AnyColumn } from "drizzle-orm";
import { db } from "../../db/client";
import { mlModelAliases, mlModelVersions } from "../../db/schema";
import { monthKeysBeforeCutoff } from "../ml-contract";
import { backtestDate, canBacktest, type ModelCard, type PayerTotal, sendingWindow, WINDOW_DAYS } from "./overview-math";

// inlined, not a parameter: `date - $1` is ambiguous to Postgres
const WINDOW = sql.raw(String(WINDOW_DAYS));

/**
 * The card of the model version that scored the run. Falls back to the current champion for runs
 * without a recorded version, or whose version has since been deleted.
 */
export async function modelCard(modelType: "churn" | "credit", version: string | undefined): Promise<ModelCard> {
  const v = mlModelVersions;
  const own = version
    ? await db.select({ card: v.modelCardJson }).from(v).where(and(eq(v.modelType, modelType), eq(v.version, version))).limit(1)
    : [];
  if (own[0]) return own[0].card as ModelCard;
  const champion = await db
    .select({ card: v.modelCardJson })
    .from(mlModelAliases)
    .innerJoin(v, eq(mlModelAliases.modelVersionId, v.id))
    .where(and(eq(mlModelAliases.alias, MODEL_ALIAS.PRODUCTION), eq(mlModelAliases.modelType, modelType)))
    .limit(1);
  return (champion[0]?.card as ModelCard) ?? null;
}

/** Every Payer of the 12 months before the cutoff, with what they paid in total and in the second half. */
export async function fetchPayerTotals(sourceId: string, cutoffDate: string): Promise<PayerTotal[]> {
  return db.execute<PayerTotal>(sql`
    SELECT acc_id,
           COALESCE(SUM(amount), 0)::float8 AS total,
           COALESCE(SUM(amount) FILTER (WHERE payment_date >= date_trunc('month', ${cutoffDate}::date) - INTERVAL '6 months'), 0)::float8 AS h2
    FROM predict_clean_payments
    WHERE source_id = ${sourceId}
      AND payment_date >= date_trunc('month', ${cutoffDate}::date) - INTERVAL '12 months'
      AND payment_date < date_trunc('month', ${cutoffDate}::date)
    GROUP BY acc_id
    HAVING COUNT(*) FILTER (WHERE amount > 0) > 0
  `);
}

/** One account's payments per month for the 12 months before the cutoff, oldest first. */
export async function fetchMonthlyAmounts(sourceId: string, cutoffDate: string, accId: number): Promise<number[]> {
  const rows = await db.execute<{ month: string; amount: number }>(sql`
    SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month, COALESCE(SUM(amount), 0)::float8 AS amount
    FROM predict_clean_payments
    WHERE source_id = ${sourceId} AND acc_id = ${accId}
      AND payment_date >= date_trunc('month', ${cutoffDate}::date) - INTERVAL '12 months'
      AND payment_date < date_trunc('month', ${cutoffDate}::date)
    GROUP BY 1
  `);
  const byMonth = new Map(rows.map((r) => [r.month, r.amount]));
  return monthKeysBeforeCutoff(cutoffDate, 12).map((m) => byMonth.get(m) ?? 0);
}

export async function fetchMonthlySenders(sourceId: string, cutoffDate: string): Promise<RunSummary["usage_monthly_senders"]> {
  const rows = await db.execute<{ month: string; senders: number }>(sql`
    SELECT to_char(make_date(year, month, 1), 'YYYY-MM') AS month, COUNT(DISTINCT acc_id)::int AS senders
    FROM predict_clean_usage
    WHERE source_id = ${sourceId} AND usage > 0
      AND make_date(year, month, 1) >= date_trunc('month', ${cutoffDate}::date) - INTERVAL '24 months'
      AND make_date(year, month, 1) < date_trunc('month', ${cutoffDate}::date)
    GROUP BY 1
  `);
  const byMonth = new Map(rows.map((r) => [r.month, r.senders]));
  return monthKeysBeforeCutoff(cutoffDate, 24).map((month) => ({ month, senders: byMonth.get(month) ?? 0 }));
}

export async function fetchDataStart(sourceId: string): Promise<string | null> {
  const [row] = await db.execute<{ data_start: string | null }>(sql`
    SELECT to_char(LEAST(
      (SELECT MIN(payment_date) FROM predict_clean_payments WHERE source_id = ${sourceId}),
      (SELECT MIN(make_date(year, month, 1)) FROM predict_clean_usage WHERE source_id = ${sourceId} AND usage > 0)
    ), 'YYYY-MM') AS data_start
  `);
  return row?.data_start ?? null;
}

/** Usage rows of `predict_clean_usage` that count as a sending month in the window before `date`. */
const sentInWindow = (sourceId: string, date: string) => sql`
  source_id = ${sourceId} AND usage > 0
  AND make_date(year, month, 1) >= ${date}::date - ${WINDOW} AND make_date(year, month, 1) < ${date}::date`;

/** A customer's sending months at the cutoff, for filtering the customer list (gap G7). */
export const sendingMonthsOf = (accId: AnyColumn, sourceId: string, cutoffDate: string) => sql`
  COALESCE((SELECT COUNT(DISTINCT make_date(year, month, 1)) FROM predict_clean_usage
            WHERE ${sentInWindow(sourceId, cutoffDate)} AND acc_id = ${accId}), 0)`;

export async function fetchSendingMonths(
  runId: string,
  sourceId: string,
  cutoffDate: string,
  dataStart: string | null
): Promise<RunSummary["sending_months"]> {
  const window = sendingWindow(cutoffDate);
  const b = canBacktest(cutoffDate, dataStart) ? backtestDate(cutoffDate) : null;

  const [histogram, backtest] = await Promise.all([
    db.execute<{ months: number; n: number }>(sql`
      WITH sm AS (
        SELECT acc_id, COUNT(DISTINCT make_date(year, month, 1))::int AS n
        FROM predict_clean_usage WHERE ${sentInWindow(sourceId, cutoffDate)} GROUP BY acc_id
      )
      SELECT COALESCE(sm.n, 0)::int AS months, COUNT(*)::int AS n
      FROM ml_prediction_outputs o LEFT JOIN sm ON sm.acc_id = o.acc_id
      WHERE o.prediction_run_id = ${runId} AND o.lifecycle_stage = ${LIFECYCLE_STAGE.ACTIVE_PAID}
      GROUP BY 1
    `),
    // The churn rule copies labels.py › build_churn_labels (bug-fix-only, so it should not drift):
    // eligible = any payment or usage in the 180 days before B and paid before B;
    // churned = no payment and no usage in the 180 days from B.
    b
      ? db.execute<{ months: number; n: number; churned: number }>(sql`
          WITH act AS (
            SELECT acc_id, payment_date::date AS d FROM predict_clean_payments WHERE source_id = ${sourceId}
            UNION ALL
            SELECT acc_id, make_date(year, month, 1) FROM predict_clean_usage WHERE source_id = ${sourceId} AND usage > 0
          ),
          elig AS (
            SELECT acc_id FROM act WHERE d >= ${b}::date - ${WINDOW} AND d < ${b}::date
            INTERSECT
            SELECT acc_id FROM predict_clean_payments WHERE source_id = ${sourceId} AND payment_date < ${b}::date
          ),
          fut AS (SELECT DISTINCT acc_id FROM act WHERE d >= ${b}::date AND d < ${b}::date + ${WINDOW}),
          sm AS (
            SELECT acc_id, COUNT(DISTINCT make_date(year, month, 1))::int AS n
            FROM predict_clean_usage WHERE ${sentInWindow(sourceId, b)} GROUP BY acc_id
          )
          SELECT COALESCE(sm.n, 0)::int AS months, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE fut.acc_id IS NULL)::int AS churned
          FROM elig LEFT JOIN sm USING (acc_id) LEFT JOIN fut USING (acc_id)
          GROUP BY 1
        `)
      : Promise.resolve([]),
  ]);

  const counts = new Map(histogram.map((r) => [r.months, r.n]));
  const rates = new Map(backtest.map((r) => [r.months, r]));
  return {
    window_months: window.length,
    window_start: window[0] ?? cutoffDate.slice(0, 7),
    backtest_date: b,
    buckets: Array.from({ length: window.length + 1 }, (_, months) => {
      const bt = rates.get(months);
      return {
        months,
        count: counts.get(months) ?? 0,
        backtest_n: b ? (bt?.n ?? 0) : null,
        backtest_churn_rate: bt && bt.n > 0 ? bt.churned / bt.n : null,
      };
    }),
  };
}

/** Per account, one flag per window month (oldest first): did they send messages that month. */
export async function fetchSendingFlags(sourceId: string, cutoffDate: string, accIds: number[]): Promise<Map<number, boolean[]>> {
  const window = sendingWindow(cutoffDate);
  if (accIds.length === 0) return new Map();
  const rows = await db.execute<{ acc_id: number; months: string[] }>(sql`
    SELECT acc_id, array_agg(DISTINCT to_char(make_date(year, month, 1), 'YYYY-MM')) AS months
    FROM predict_clean_usage
    WHERE ${sentInWindow(sourceId, cutoffDate)} AND acc_id IN (${sql.join(accIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY acc_id
  `);
  const sent = new Map(rows.map((r) => [r.acc_id, new Set(r.months)]));
  return new Map(accIds.map((id) => [id, window.map((m) => sent.get(id)?.has(m) ?? false)]));
}
