/**
 * Cutoff-date suggestions derived from a source's clean activity tables.
 *
 * The "latest observed activity" core — GREATEST of the last payment date and
 * the last usage month — was duplicated across train-data, predict-data and
 * training-runs. It lives here once, with one transform per scope:
 *   - train:   month-aligned (latest_activity − horizon), the latest fully
 *              observed label cutoff.
 *   - predict: month-aligned — the first of the month after the latest
 *              observed activity's month. Usage has monthly granularity and
 *              training only ever uses month-aligned cutoffs, so a mid-month
 *              predict cutoff would let features see a partial trailing month
 *              the model never saw in training (train/serve skew). Flooring
 *              `latest + 1 day` to the month start keeps parity: a month-end
 *              `latest` includes that full month, a mid-month `latest` drops
 *              the incomplete current month.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db/client";

export type CutoffSuggestion = {
  /** Suggested cutoff in YYYY-MM-DD, or null when the source has no clean activity. */
  cutoff_date: string | null;
  /** Latest observed activity date in YYYY-MM-DD, or null. */
  latest_data_date: string | null;
};

const EMPTY: CutoffSuggestion = { cutoff_date: null, latest_data_date: null };

/** Default label Horizon for training (days); matches the ML runner's horizon_days. */
export const DEFAULT_HORIZON_DAYS = 180;
/** History a training cutoff needs before it: the Lifecycle Stage active window (days). */
const ACTIVE_WINDOW_DAYS = 180;

/**
 * Training Gate 3: the source has activity older than `cutoff - ACTIVE_WINDOW_DAYS`
 * and activity reaching `cutoff + horizonDays`, so features and labels are fully observed.
 */
export async function trainCutoffPassesGate3(
  sourceId: string,
  cutoffDate: string,
  horizonDays: number
): Promise<boolean> {
  const [row] = await db.execute<{ history_ok: boolean | null; label_ok: boolean | null }>(sql`
    WITH activity AS (
      SELECT MIN(activity_date)::date AS min_activity,
             MAX(activity_date)::date AS max_activity
      FROM (
        SELECT payment_date::date AS activity_date
        FROM train_clean_payments
        WHERE source_id = ${sourceId} AND payment_date IS NOT NULL
        UNION ALL
        SELECT make_date(year, month, 1)::date AS activity_date
        FROM train_clean_usage
        WHERE source_id = ${sourceId} AND year IS NOT NULL AND month IS NOT NULL
      ) a
    )
    SELECT min_activity < (${cutoffDate}::date - ${ACTIVE_WINDOW_DAYS}::int) AS history_ok,
           max_activity >= (${cutoffDate}::date + ${horizonDays}::int) AS label_ok
    FROM activity
  `);
  return Boolean(row?.history_ok && row.label_ok);
}

/** Suggested training cutoff: month-aligned `latest_activity - horizonDays`. */
export async function getTrainCutoffSuggestion(
  sourceId: string,
  horizonDays: number
): Promise<CutoffSuggestion> {
  const [row] = await db.execute<CutoffSuggestion>(sql`
    SELECT to_char(date_trunc('month', (latest - ${horizonDays}::int)::timestamp)::date, 'YYYY-MM-DD') AS cutoff_date,
           to_char(latest, 'YYYY-MM-DD') AS latest_data_date
    FROM (
      SELECT GREATEST(
        (SELECT MAX(payment_date)::date
         FROM train_clean_payments WHERE source_id = ${sourceId}),
        (SELECT MAX(make_date(year, month, 1))
         FROM train_clean_usage
         WHERE source_id = ${sourceId} AND year IS NOT NULL AND month IS NOT NULL)
      ) AS latest
    ) s
  `);
  return row ?? EMPTY;
}

/** Suggested prediction cutoff: month-aligned floor of `latest_activity + 1 day`. */
export async function getPredictCutoffSuggestion(
  sourceId: string
): Promise<CutoffSuggestion> {
  const [row] = await db.execute<CutoffSuggestion>(sql`
    SELECT to_char(date_trunc('month', (latest + 1)::timestamp)::date, 'YYYY-MM-DD') AS cutoff_date,
           to_char(latest, 'YYYY-MM-DD') AS latest_data_date
    FROM (
      SELECT GREATEST(
        (SELECT MAX(payment_date)::date
         FROM predict_clean_payments WHERE source_id = ${sourceId}),
        (SELECT MAX(make_date(year, month, 1))
         FROM predict_clean_usage
         WHERE source_id = ${sourceId} AND year IS NOT NULL AND month IS NOT NULL)
      ) AS latest
    ) s
  `);
  return row ?? EMPTY;
}
