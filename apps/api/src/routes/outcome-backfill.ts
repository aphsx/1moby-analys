/**
 * Realized-outcome backfill trigger.
 *
 * Any authenticated user: proxies to FastAPI /internal/outcome-backfill, which spawns
 * `python -m src.cli.backfill_outcomes`. The job finds completed prediction
 * runs whose horizon has elapsed relative to the newest clean predict data,
 * rebuilds actual labels, and upserts realized metrics into
 * ml_model_evaluations (evaluation_type='production_holdout'). Per-run
 * evidence (including failures) lands in ml_data_validation_reports.
 */
import { RUN_STATUS } from "@moby/types";
import Elysia, { t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { mlPredictionRuns } from "../db/schema";
import { requireUser } from "../lib/http/auth-middleware";
import { badRequest, HttpError, notFound } from "../lib/http/errors";
import { triggerMlJob } from "../lib/ml/ml-internal";
import type { OutcomeBackfillResponse } from "@moby/types";

export const outcomeBackfillRoutes = new Elysia({ prefix: "/outcome-backfill" })
  .use(requireUser)
  .post(
    "/",
    async ({ body }) => {
      if (body.prediction_run_id !== undefined) {
        const [run] = await db
          .select({ id: mlPredictionRuns.id, status: mlPredictionRuns.status })
          .from(mlPredictionRuns)
          .where(eq(mlPredictionRuns.id, body.prediction_run_id))
          .limit(1);
        if (!run) throw notFound("Prediction run not found");
        if (run.status !== RUN_STATUS.COMPLETED) {
          throw badRequest("Only completed prediction runs can be measured against realized outcomes");
        }
      }

      try {
        await triggerMlJob("/internal/outcome-backfill", {
          prediction_run_id: body.prediction_run_id ?? null,
          force: body.force ?? false,
        });
      } catch (e) {
        // No run row owns this job's status — surface the trigger failure to
        // the caller instead of pretending the backfill was accepted.
        throw new HttpError(502, (e as Error).message);
      }

      const response: OutcomeBackfillResponse = {
        accepted: true,
        prediction_run_id: body.prediction_run_id ?? null,
        force: body.force ?? false,
      };
      return response;
    },
    {
      body: t.Object({
        prediction_run_id: t.Optional(t.String({ format: "uuid" })),
        force: t.Optional(t.Boolean()),
      }),
    }
  );
