/**
 * ML v2 training runs API.
 * Response contract mirrors apps/web/src/lib/ml-api.ts (snake_case keys).
 *
 * Org-shared model: reads are org-wide for any authenticated user; triggering
 * training and deleting a finished run are available to any authenticated user
 * (blocked while still referenced by a prediction run; production champions
 * owned by the run are auto-repointed or cleared when safe to delete).
 */
import {
  IMPORT_STATUS,
  MODEL_VERSION_STATUS,
  RUN_STATUS,
  type RunStatus,
  type TrainingRun,
  type TrainingRunResult,
} from "@moby/types";
import Elysia, { t } from "elysia";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  mlModelVersions,
  mlPredictionRuns,
  mlTrainingRuns,
  trainDataSources,
  user,
} from "../db/schema";
import { requireUser } from "../lib/http/auth-middleware";
import { badRequest, conflict, notFound } from "../lib/http/errors";
import { callMlInternalJson, mlErrorToHttp, triggerMlJob } from "../lib/ml/ml-internal";
import { getTrainCutoffSuggestion } from "../lib/data-import/clean-cutoff";
import { DATE_RE, UUID_RE } from "../lib/constants";
const DEFAULT_HORIZON_DAYS = 180;
const ACTIVE_WINDOW_DAYS = 180;

const runSelect = {
  id: mlTrainingRuns.id,
  status: mlTrainingRuns.status,
  datasetName: trainDataSources.name,
  cutoffDate: mlTrainingRuns.cutoffDate,
  horizonDays: mlTrainingRuns.horizonDays,
  startedAt: mlTrainingRuns.startedAt,
  finishedAt: mlTrainingRuns.finishedAt,
  createdBy: mlTrainingRuns.createdBy,
  creatorName: user.name,
  creatorEmail: user.email,
  createdAt: mlTrainingRuns.createdAt,
  errorMessage: mlTrainingRuns.errorMessage,
  progressJson: mlTrainingRuns.progressJson,
  resultsJson: mlTrainingRuns.resultsJson,
};

interface TrainingRunRow {
  id: string;
  status: string;
  datasetName: string | null;
  cutoffDate: string;
  horizonDays: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdBy: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  createdAt: Date;
  errorMessage: string | null;
  progressJson: unknown;
  resultsJson: unknown;
}

function mapTrainingRun(row: TrainingRunRow): TrainingRun {
  return {
    id: row.id,
    status: row.status as RunStatus,
    dataset_name: row.datasetName ?? "dataset",
    cutoff_date: row.cutoffDate,
    horizon_days: row.horizonDays,
    started_at: (row.startedAt ?? row.createdAt).toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    created_by: row.createdBy,
    created_by_name: row.creatorName ?? row.creatorEmail ?? null,
    error_message: row.errorMessage,
    progress:
      row.status === "in_progress"
        ? ((row.progressJson as { phase: string; pct: number } | null) ?? null)
        : null,
    results: (row.resultsJson as TrainingRunResult[] | null) ?? null,
  };
}

async function fetchTrainingRun(id: string): Promise<TrainingRunRow | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await db
    .select(runSelect)
    .from(mlTrainingRuns)
    .leftJoin(trainDataSources, eq(mlTrainingRuns.sourceId, trainDataSources.id))
    .leftJoin(user, eq(mlTrainingRuns.createdBy, user.id))
    .where(eq(mlTrainingRuns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

const trainingWriteRoutes = new Elysia()
  .use(requireUser)
  .post(
    "/",
    async ({ body, userId }) => {
      if (body.cutoff_date !== undefined && !DATE_RE.test(body.cutoff_date)) {
        throw badRequest("cutoff_date must be YYYY-MM-DD");
      }
      const [source] = await db
        .select({ id: trainDataSources.id, importStatus: trainDataSources.importStatus })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, body.train_source_id))
        .limit(1);
      if (!source) throw notFound("Train data source not found");
      if (source.importStatus !== IMPORT_STATUS.READY) {
        throw badRequest("Train data source must be ready before training");
      }
      const horizonDays = body.horizon_days ?? DEFAULT_HORIZON_DAYS;
      if (horizonDays <= 0) {
        throw badRequest("horizon_days must be positive");
      }
      // Month-aligned: usage data is monthly, so a mid-month cutoff makes the
      // credit 30d label window catch usage periods inconsistently.
      const suggested = await getTrainCutoffSuggestion(body.train_source_id, horizonDays);
      const cutoffDate = body.cutoff_date ?? suggested.cutoff_date;
      if (!cutoffDate) {
        throw badRequest("No clean activity data for this source yet");
      }
      if (!cutoffDate.endsWith("-01")) {
        throw badRequest(
          "cutoff_date must be the first day of a month — usage data is monthly, so a mid-month cutoff leaks post-cutoff usage into features. Use the suggested cutoff."
        );
      }

      const [cutoffCheck] = await db.execute<{
        min_activity_date: string | null;
        max_activity_date: string | null;
        required_history_before: string;
        required_label_through: string;
        history_ok: boolean | null;
        label_ok: boolean | null;
      }>(sql`
        WITH activity AS (
          SELECT MIN(activity_date)::date AS min_activity,
                 MAX(activity_date)::date AS max_activity
          FROM (
            SELECT payment_date::date AS activity_date
            FROM train_clean_payments
            WHERE source_id = ${body.train_source_id} AND payment_date IS NOT NULL
            UNION ALL
            SELECT make_date(year, month, 1)::date AS activity_date
            FROM train_clean_usage
            WHERE source_id = ${body.train_source_id}
              AND year IS NOT NULL
              AND month IS NOT NULL
          ) a
        )
        SELECT
          to_char(min_activity, 'YYYY-MM-DD') AS min_activity_date,
          to_char(max_activity, 'YYYY-MM-DD') AS max_activity_date,
          to_char(${cutoffDate}::date - ${ACTIVE_WINDOW_DAYS}::int, 'YYYY-MM-DD') AS required_history_before,
          to_char(${cutoffDate}::date + ${horizonDays}::int, 'YYYY-MM-DD') AS required_label_through,
          min_activity < (${cutoffDate}::date - ${ACTIVE_WINDOW_DAYS}::int) AS history_ok,
          max_activity >= (${cutoffDate}::date + ${horizonDays}::int) AS label_ok
        FROM activity
      `);
      if (!cutoffCheck?.history_ok || !cutoffCheck.label_ok) {
        throw badRequest("cutoff_date does not satisfy training Gate 3. Use the suggested cutoff for this source.");
      }

      // One Training Run at a time: overlapping runs race for the same model version numbers.
      const [active] = await db
        .select({ id: mlTrainingRuns.id })
        .from(mlTrainingRuns)
        .where(inArray(mlTrainingRuns.status, [RUN_STATUS.PENDING, RUN_STATUS.IN_PROGRESS]))
        .limit(1);
      if (active) {
        throw conflict("Another training run is still in progress; wait for it to finish");
      }

      const [inserted] = await db
        .insert(mlTrainingRuns)
        .values({
          sourceId: body.train_source_id,
          cutoffDate,
          horizonDays,
          status: RUN_STATUS.PENDING,
          createdBy: userId,
        })
        .returning({ id: mlTrainingRuns.id });

      try {
        await triggerMlJob("/internal/training-runs", { training_run_id: inserted.id });
      } catch (e) {
        await db
          .update(mlTrainingRuns)
          .set({ status: RUN_STATUS.FAILED, errorMessage: (e as Error).message, finishedAt: new Date() })
          .where(eq(mlTrainingRuns.id, inserted.id));
      }

      const run = await fetchTrainingRun(inserted.id);
      return mapTrainingRun(run!);
    },
    {
      body: t.Object({
        train_source_id: t.String({ format: "uuid" }),
        cutoff_date: t.Optional(t.String()),
        horizon_days: t.Optional(t.Number()),
        // sent by the web client; dataset_name is derived from the source server-side
        dataset_name: t.Optional(t.String()),
      }),
    }
  );

export const trainingRunRoutes = new Elysia({ prefix: "/training-runs" })
  .use(requireUser)
  // Org-wide: every authenticated user sees all training runs.
  .get("/", async () => {
    const rows = await db
      .select(runSelect)
      .from(mlTrainingRuns)
      .leftJoin(trainDataSources, eq(mlTrainingRuns.sourceId, trainDataSources.id))
      .leftJoin(user, eq(mlTrainingRuns.createdBy, user.id))
      .orderBy(desc(mlTrainingRuns.createdAt));
    return rows.map(mapTrainingRun);
  })
  .use(trainingWriteRoutes)
  .get(
    "/:id",
    async ({ params }) => {
      const run = await fetchTrainingRun(params.id);
      if (!run) throw notFound("Training run not found");
      return mapTrainingRun(run);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  // Delete a training run from history (and cascade its model versions).
  // Any authenticated user. Active/pending runs stay. Prediction runs that
  // still reference versions from this run block delete. Production champions
  // owned by the run are auto-repointed (or cleared when no replacement exists).
  .delete(
    "/:id",
    async ({ params, userId }) => {
      const run = await fetchTrainingRun(params.id);
      if (!run) throw notFound("Training run not found");
      if (run.status === RUN_STATUS.PENDING || run.status === RUN_STATUS.IN_PROGRESS) {
        throw conflict("Cannot delete a training run that is still running");
      }

      const versions = await db
        .select({
          id: mlModelVersions.id,
          modelType: mlModelVersions.modelType,
          version: mlModelVersions.version,
          isActive: mlModelVersions.isActive,
          status: mlModelVersions.status,
        })
        .from(mlModelVersions)
        .where(eq(mlModelVersions.trainingRunId, run.id));

      let productionRepointed: Array<{
        model_type: string;
        from_version: string;
        to_version: string;
      }> = [];
      let productionCleared: Array<{ model_type: string; from_version: string }> = [];

      if (versions.length > 0) {
        const refs = await db
          .select({
            id: mlPredictionRuns.id,
            name: mlPredictionRuns.name,
          })
          .from(mlPredictionRuns)
          .where(
            sql`EXISTS (
              SELECT 1 FROM ml_model_versions mv
              WHERE mv.training_run_id = ${run.id}::uuid
                AND (
                  ${mlPredictionRuns.modelVersionsJson} ->> mv.model_type = mv.version
                  OR ${mlPredictionRuns.modelOverridesJson} ->> mv.model_type = mv.id::text
                )
            )`
          )
          .orderBy(desc(mlPredictionRuns.createdAt))
          .limit(5);

        if (refs.length > 0) {
          const names = refs.map((r) => r.name || r.id.slice(0, 8)).join(", ");
          const more = refs.length === 5 ? "…" : "";
          throw conflict(
            `ยังมี prediction run ที่ใช้โมเดลจากรอบนี้: ${names}${more} — ลบผล prediction เหล่านั้นก่อน`,
            "TRAINING_RUN_IN_USE_BY_PREDICTIONS"
          );
        }

        const production = versions.filter((v) => v.isActive || v.status === MODEL_VERSION_STATUS.PRODUCTION);
        if (production.length > 0) {
          try {
            const repoint = await callMlInternalJson<{
              repointed?: Array<{
                model_type: string;
                from_version: string;
                to_version: string;
              }>;
              cleared?: Array<{ model_type: string; from_version: string }>;
            }>("/internal/repoint-production-for-training-run", {
              training_run_id: run.id,
              created_by: userId ?? null,
            });
            productionRepointed = repoint.repointed ?? [];
            productionCleared = repoint.cleared ?? [];
          } catch (error) {
            throw mlErrorToHttp(error, "Failed to repoint production champions before delete");
          }
        }

        // Remove artifacts + registry rows via ML service before cascading the
        // training run (DB cascade alone would leave orphan .pkl directories).
        for (const version of versions) {
          try {
            await triggerMlJob("/internal/model-delete", {
              model_type: version.modelType,
              model_version_id: version.id,
              created_by: userId ?? null,
              // A training run can contain several model types. Do not
              // auto-promote a temporary sole version while deleting the
              // whole run; the run deletion must remove all of its versions.
              auto_promote_sole_remaining: false,
            });
          } catch (error) {
            throw mlErrorToHttp(error, `Failed to delete model version ${version.version}`);
          }
        }
      }

      await db.delete(mlTrainingRuns).where(eq(mlTrainingRuns.id, run.id));
      return {
        deleted: true,
        ...(productionRepointed.length > 0 ? { production_repointed: productionRepointed } : {}),
        ...(productionCleared.length > 0 ? { production_cleared: productionCleared } : {}),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  );
