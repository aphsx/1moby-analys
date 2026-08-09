/**
 * Realized outcomes for one prediction run (TRAINING-PIPELINE §15).
 *
 * The outcome-backfill job (apps/ml/src/outcomes/) writes production_holdout
 * rows into ml_model_evaluations linked to the run via prediction_run_id.
 * This route only reads what the ML side persisted — no metric math here.
 */

import type { RealizedOutcome, RealizedOutcomesResponse } from "@moby/types";
import { and, asc, eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "../../db/client";
import { mlModelEvaluations, mlModelVersions } from "../../db/schema";
import { requireUser } from "../../lib/auth-middleware";
import { fetchRun, requireRunFound } from "./_helpers";

/** Must match PRODUCTION_HOLDOUT_EVALUATION_TYPE in apps/ml/src/outcomes/runner.py. */
const PRODUCTION_HOLDOUT_EVALUATION_TYPE = "production_holdout";

export const realizedOutcomesRoutes = new Elysia()
  .use(requireUser)
  // Org-wide read: realized metrics are shared evidence, like run outputs.
  .get(
    "/:id/realized-outcomes",
    async ({ params, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied || !run) {
        return denied;
      }

      const rows = await db
        .select({
          businessMetricsJson: mlModelEvaluations.businessMetricsJson,
          calibrationJson: mlModelEvaluations.calibrationJson,
          confusionMatrixJson: mlModelEvaluations.confusionMatrixJson,
          createdAt: mlModelEvaluations.createdAt,
          cutoffDate: mlModelEvaluations.cutoffDate,
          horizonDays: mlModelEvaluations.horizonDays,
          liftTableJson: mlModelEvaluations.liftTableJson,
          metricsJson: mlModelEvaluations.metricsJson,
          modelType: mlModelEvaluations.modelType,
          modelVersion: mlModelVersions.version,
          modelVersionId: mlModelEvaluations.modelVersionId,
        })
        .from(mlModelEvaluations)
        .leftJoin(
          mlModelVersions,
          eq(mlModelEvaluations.modelVersionId, mlModelVersions.id)
        )
        .where(
          and(
            eq(mlModelEvaluations.predictionRunId, run.id),
            eq(
              mlModelEvaluations.evaluationType,
              PRODUCTION_HOLDOUT_EVALUATION_TYPE
            )
          )
        )
        .orderBy(asc(mlModelEvaluations.modelType));

      const outcomes: RealizedOutcome[] = rows.map((row) => ({
        calibration:
          (row.calibrationJson as RealizedOutcome["calibration"]) ?? null,
        confusion_matrix:
          (row.confusionMatrixJson as Record<string, number> | null) ?? null,
        context:
          (row.businessMetricsJson as RealizedOutcome["context"]) ?? null,
        cutoff_date: row.cutoffDate,
        evaluation_type: PRODUCTION_HOLDOUT_EVALUATION_TYPE,
        horizon_days: row.horizonDays,
        lift_table:
          (row.liftTableJson as RealizedOutcome["lift_table"]) ?? null,
        measured_at: row.createdAt.toISOString(),
        metrics: (row.metricsJson as Record<string, number> | null) ?? {},
        model_type: row.modelType as RealizedOutcome["model_type"],
        model_version: row.modelVersion ?? null,
        model_version_id: row.modelVersionId,
      }));

      const response: RealizedOutcomesResponse = {
        cutoff_date: run.cutoffDate,
        evaluated: outcomes.length > 0,
        outcomes,
        prediction_run_id: run.id,
      };
      return response;
    },
    { params: t.Object({ id: t.String() }) }
  );
