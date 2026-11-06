/**
 * ML v2 training runs API.
 * Response contract mirrors apps/web/src/lib/ml-api.ts (snake_case keys).
 *
 * Org-shared model: reads are org-wide for any authenticated user; triggering
 * training and deleting a finished run are available to any authenticated user
 * (blocked while still referenced by a prediction run; production champions
 * owned by the run are auto-repointed or cleared when safe to delete).
 */
import { IMPORT_STATUS, MODEL_VERSION_STATUS, RUN_STATUS } from "@moby/types";
import Elysia, { t } from "elysia";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { mlModelVersions, mlTrainingRuns, trainDataSources } from "../db/schema";
import { requireUser } from "../lib/http/auth-middleware";
import { badRequest, conflict, notFound } from "../lib/http/errors";
import {
  DEFAULT_HORIZON_DAYS,
  getTrainCutoffSuggestion,
  trainCutoffPassesGate3,
} from "../lib/data-import/clean-cutoff";
import {
  callMlInternalJson,
  mlErrorToHttp,
  triggerMlJob,
  triggerRunOrFail,
} from "../lib/ml/ml-internal";
import { assertNotUsedByPredictions, predictionRunsUsingTrainingRun } from "../lib/ml/model-registry";
import { listTrainingRuns, mapTrainingRun, requireTrainingRun } from "../lib/ml/training-runs";
import { DATE_RE } from "../lib/constants";

export const trainingRunRoutes = new Elysia({ prefix: "/training-runs" })
  .use(requireUser)
  // Org-wide: every authenticated user sees all training runs.
  .get("/", async () => (await listTrainingRuns()).map(mapTrainingRun))
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

      if (!(await trainCutoffPassesGate3(body.train_source_id, cutoffDate, horizonDays))) {
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

      await triggerRunOrFail(mlTrainingRuns, inserted.id, "/internal/training-runs", {
        training_run_id: inserted.id,
      });
      return mapTrainingRun(await requireTrainingRun(inserted.id));
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
  )
  .get(
    "/:id",
    async ({ params }) => {
      return mapTrainingRun(await requireTrainingRun(params.id));
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
      const run = await requireTrainingRun(params.id);
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
        assertNotUsedByPredictions(
          await predictionRunsUsingTrainingRun(run.id),
          "โมเดลจากรอบนี้",
          "TRAINING_RUN_IN_USE_BY_PREDICTIONS"
        );

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
