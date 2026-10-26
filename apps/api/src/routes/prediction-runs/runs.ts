import { IMPORT_STATUS, MODEL_TYPES, RUN_STATUS } from "@moby/types";
import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionRuns, predictDataSources, user } from "../../db/schema";
import { requireUser } from "../../lib/http/auth-middleware";
import { badRequest, notFound } from "../../lib/http/errors";
import { triggerMlJob } from "../../lib/ml/ml-internal";
import { getPredictCutoffSuggestion } from "../../lib/data-import/clean-cutoff";
import { DATE_RE, UUID_RE } from "../../lib/constants";
import { fetchRun, mapRun, requireRun, runSelect } from "../../lib/ml/prediction-runs";

export const runsRoutes = new Elysia()
  .use(requireUser)
  // Org-wide: every authenticated user sees all runs.
  .get("/", async () => {
    const rows = await db
      .select(runSelect)
      .from(mlPredictionRuns)
      .leftJoin(predictDataSources, eq(mlPredictionRuns.predictSourceId, predictDataSources.id))
      .leftJoin(user, eq(mlPredictionRuns.createdBy, user.id))
      .orderBy(desc(mlPredictionRuns.createdAt));
    return rows.map(mapRun);
  })
  .post(
    "/",
    async ({ body, userId }) => {
      if (body.cutoff_date !== undefined && !DATE_RE.test(body.cutoff_date)) {
        throw badRequest("cutoff_date must be YYYY-MM-DD");
      }
      const [source] = await db
        .select({ id: predictDataSources.id, importStatus: predictDataSources.importStatus })
        .from(predictDataSources)
        .where(eq(predictDataSources.id, body.predict_source_id))
        .limit(1);
      if (!source) throw notFound("Predict data source not found");
      if (source.importStatus !== IMPORT_STATUS.READY) {
        throw badRequest("Predict data source must be ready before prediction");
      }
      const suggested = await getPredictCutoffSuggestion(body.predict_source_id);
      const cutoffDate = body.cutoff_date ?? suggested.cutoff_date;
      if (!cutoffDate) {
        throw badRequest("No clean activity data for this source yet");
      }

      // Optional per-run model overrides. Only provided, valid-UUID entries are
      // stored; missing model types fall back to the production champion.
      const overrides: Record<string, string> = {};
      for (const modelType of MODEL_TYPES) {
        const versionId = body.model_overrides?.[modelType];
        if (versionId) {
          if (!UUID_RE.test(versionId)) {
            throw badRequest(`model_overrides.${modelType} must be a UUID`);
          }
          overrides[modelType] = versionId;
        }
      }

      const [inserted] = await db
        .insert(mlPredictionRuns)
        .values({
          predictSourceId: body.predict_source_id,
          name: body.name,
          cutoffDate,
          status: RUN_STATUS.PENDING,
          createdBy: userId,
          modelOverridesJson: Object.keys(overrides).length > 0 ? overrides : null,
        })
        .returning({ id: mlPredictionRuns.id });

      try {
        await triggerMlJob("/internal/prediction-runs", { prediction_run_id: inserted.id });
      } catch (e) {
        await db
          .update(mlPredictionRuns)
          .set({ status: RUN_STATUS.FAILED, errorMessage: (e as Error).message, finishedAt: new Date() })
          .where(eq(mlPredictionRuns.id, inserted.id));
      }

      return mapRun(await requireRun(inserted.id));
    },
    {
      body: t.Object({
        predict_source_id: t.String({ format: "uuid" }),
        name: t.String({ minLength: 1 }),
        cutoff_date: t.Optional(t.String()),
        // Per-run model overrides — version id per model type; omit to use champion.
        model_overrides: t.Optional(
          t.Object({
            churn: t.Optional(t.String()),
            clv: t.Optional(t.String()),
            credit: t.Optional(t.String()),
          })
        ),
      }),
    }
  )
  .get(
    "/:id",
    async ({ params }) => {
      const run = await requireRun(params.id);
      return mapRun(run);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  // Retry mutates the run record — any authenticated user.
  .post(
    "/:id/retry",
    async ({ params }) => {
      const run = await requireRun(params.id);
      if (run.status !== RUN_STATUS.FAILED) {
        throw badRequest("Only failed runs can be retried");
      }

      await db
        .update(mlPredictionRuns)
        // Clear the timestamps too: the runner keeps an existing started_at, and the
        // stale-run reaper would otherwise kill a retry of a run first started >2h ago.
        .set({
          status: RUN_STATUS.PENDING,
          errorMessage: null,
          progressJson: null,
          startedAt: null,
          finishedAt: null,
        })
        .where(eq(mlPredictionRuns.id, run.id));

      try {
        await triggerMlJob("/internal/prediction-runs", { prediction_run_id: run.id });
      } catch (e) {
        await db
          .update(mlPredictionRuns)
          .set({ status: RUN_STATUS.FAILED, errorMessage: (e as Error).message, finishedAt: new Date() })
          .where(eq(mlPredictionRuns.id, run.id));
      }

      const fresh = await fetchRun(run.id);
      return mapRun(fresh!);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  .delete(
    "/:id",
    async ({ params }) => {
      const run = await requireRun(params.id);
      await db.delete(mlPredictionRuns).where(eq(mlPredictionRuns.id, run.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  );
