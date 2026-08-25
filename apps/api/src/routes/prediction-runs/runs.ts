import { desc, eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "../../db/client";
import { mlPredictionRuns, predictDataSources, user } from "../../db/schema";
import {
  denyNotFound,
  requireCreatorOrAdminForMutation,
} from "../../lib/access-control";
import { requireUser } from "../../lib/auth-middleware";
import { getPredictCutoffSuggestion } from "../../lib/clean-cutoff";
import { DATE_RE, RUN_STATUS, UUID_RE } from "../../lib/constants";
import { triggerMlJob } from "../../lib/ml-internal";
import { fetchRun, mapRun, requireRunFound, runSelect } from "./_helpers";

export const runsRoutes = new Elysia()
  .use(requireUser)
  // Org-wide: every authenticated user sees all runs.
  .get("/", async () => {
    const rows = await db
      .select(runSelect)
      .from(mlPredictionRuns)
      .leftJoin(
        predictDataSources,
        eq(mlPredictionRuns.predictSourceId, predictDataSources.id)
      )
      .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
      .orderBy(desc(mlPredictionRuns.createdAt));
    return rows.map(mapRun);
  })
  .post(
    "/",
    async ({ body, userId, set }) => {
      if (!UUID_RE.test(body.predict_source_id)) {
        set.status = 400;
        return { message: "predict_source_id must be a UUID" };
      }
      if (body.cutoff_date !== undefined && !DATE_RE.test(body.cutoff_date)) {
        set.status = 400;
        return { message: "cutoff_date must be YYYY-MM-DD" };
      }
      const [source] = await db
        .select({
          id: predictDataSources.id,
          importStatus: predictDataSources.importStatus,
        })
        .from(predictDataSources)
        .where(eq(predictDataSources.id, body.predict_source_id))
        .limit(1);
      if (!source) {
        return denyNotFound(set, "Predict data source not found");
      }
      if (source.importStatus !== "ready") {
        set.status = 400;
        return {
          message: "Predict data source must be ready before prediction",
        };
      }
      const suggested = await getPredictCutoffSuggestion(
        body.predict_source_id
      );
      const cutoffDate = body.cutoff_date ?? suggested.cutoff_date;
      if (!cutoffDate) {
        set.status = 400;
        return { message: "No clean activity data for this source yet" };
      }

      // Optional per-run model overrides. Only provided, valid-UUID entries are
      // stored; missing model types fall back to the production champion.
      const overrides: Record<string, string> = {};
      for (const modelType of ["churn", "clv", "credit"] as const) {
        const versionId = body.model_overrides?.[modelType];
        if (versionId) {
          if (!UUID_RE.test(versionId)) {
            set.status = 400;
            return { message: `model_overrides.${modelType} must be a UUID` };
          }
          overrides[modelType] = versionId;
        }
      }

      const [inserted] = await db
        .insert(mlPredictionRuns)
        .values({
          createdBy: userId!,
          cutoffDate,
          modelOverridesJson:
            Object.keys(overrides).length > 0 ? overrides : null,
          name: body.name,
          predictSourceId: body.predict_source_id,
          status: RUN_STATUS.PENDING,
        })
        .returning({ id: mlPredictionRuns.id });

      try {
        await triggerMlJob("/internal/prediction-runs", {
          prediction_run_id: inserted.id,
        });
      } catch (e) {
        await db
          .update(mlPredictionRuns)
          .set({
            errorMessage: (e as Error).message,
            status: RUN_STATUS.FAILED,
          })
          .where(eq(mlPredictionRuns.id, inserted.id));
      }

      const run = await fetchRun(inserted.id);
      if (!run) {
        throw new Error("Prediction run disappeared right after creation");
      }
      return mapRun(run);
    },
    {
      body: t.Object({
        cutoff_date: t.Optional(t.String()),
        // Per-run model overrides — version id per model type; omit to use champion.
        model_overrides: t.Optional(
          t.Object({
            churn: t.Optional(t.String()),
            clv: t.Optional(t.String()),
            credit: t.Optional(t.String()),
          })
        ),
        name: t.String({ minLength: 1 }),
        predict_source_id: t.String(),
      }),
    }
  )
  .get(
    "/:id",
    async ({ params, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied || !run) {
        return denied;
      }
      return mapRun(run);
    },
    { params: t.Object({ id: t.String() }) }
  )
  // Retry mutates the run record — creator or admin only.
  .post(
    "/:id/retry",
    async ({ params, userId, isAdmin, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireCreatorOrAdminForMutation(
        run,
        run?.createdBy,
        userId,
        isAdmin,
        set,
        {
          forbidden: "Only the creator of this run or an admin can retry it.",
          notFound: "Prediction run not found",
        }
      );
      if (denied || !run) {
        return denied;
      }
      if (run.status !== RUN_STATUS.FAILED) {
        set.status = 400;
        return { message: "Only failed runs can be retried" };
      }

      await db
        .update(mlPredictionRuns)
        .set({
          errorMessage: null,
          progressJson: null,
          status: RUN_STATUS.PENDING,
        })
        .where(eq(mlPredictionRuns.id, run.id));

      try {
        await triggerMlJob("/internal/prediction-runs", {
          prediction_run_id: run.id,
        });
      } catch (e) {
        await db
          .update(mlPredictionRuns)
          .set({
            errorMessage: (e as Error).message,
            status: RUN_STATUS.FAILED,
          })
          .where(eq(mlPredictionRuns.id, run.id));
      }

      const fresh = await fetchRun(run.id);
      if (!fresh) {
        throw new Error("Prediction run disappeared during retry");
      }
      return mapRun(fresh);
    },
    { params: t.Object({ id: t.String() }) }
  )
  .delete(
    "/:id",
    async ({ params, userId, isAdmin, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireCreatorOrAdminForMutation(
        run,
        run?.createdBy,
        userId,
        isAdmin,
        set,
        {
          forbidden: "Only the creator of this run or an admin can delete it.",
          notFound: "Prediction run not found",
        }
      );
      if (denied || !run) {
        return denied;
      }
      await db.delete(mlPredictionRuns).where(eq(mlPredictionRuns.id, run.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String() }) }
  );
