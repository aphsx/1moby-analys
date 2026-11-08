/**
 * ML v2 model performance API.
 * Champion (alias='production') per model type + holdout/backtest evaluations
 * and baselines from ml_model_evaluations. Contract: apps/web/src/lib/ml-api.ts.
 */
import {
  type CandidateResult,
  EVALUATION_TYPE,
  MODEL_ALIAS,
  MODEL_TYPES,
  MODEL_VERSION_STATUS,
  type ModelPerfEntry,
  type ModelPerfRealized,
  type ModelType,
  type ModelVersionSummary,
  type SplitMetrics,
} from "@moby/types";
import Elysia, { t } from "elysia";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  mlModelAliases,
  mlModelEvaluations,
  mlModelVersions,
  mlPredictionRuns,
  mlTrainingRuns,
} from "../db/schema";
import { requireUser } from "../lib/http/auth-middleware";
import { badRequest, conflict, HttpError, notFound } from "../lib/http/errors";
import { DEFAULT_RISK_THRESHOLDS } from "../lib/ml-contract";
import { mlErrorToHttp, triggerMlJob } from "../lib/ml/ml-internal";
import { assertNotUsedByPredictions, predictionRunsUsingVersion } from "../lib/ml/model-registry";


// Primary headline metric per model type matching Colab winning models.
const PRIMARY_METRIC: Record<ModelType, { key: string; name: string }> = {
  churn: { key: "pr_auc", name: "PR-AUC" },
  clv: { key: "spearman_payers", name: "Spearman (ผู้จ่ายเงิน)" },
  credit: { key: "coverage_p10_p90_30d", name: "กรอบคาดการณ์ [p10–p90]" },
};

/** Credit coverage target floor matching Colab 03 is 80%. */
const CREDIT_COVERAGE_BASELINE = 0.80;

function isModelType(value: string): value is ModelType {
  return (MODEL_TYPES as readonly string[]).includes(value);
}

interface SelectionEntry {
  candidate?: string;
  cv_pr_auc?: number;
  test_pr_auc?: number;
  test_coverage_p10_p90?: number;
  gate_passed?: boolean;
  reason?: string;
}

interface ModelCard {
  method?: string;
  algorithm?: string;
  cutoff_date?: string;
  dataset_rows?: number;
  feature_set?: string;
  thresholds?: Record<string, number>;
  primary_metric?: {
    name?: string;
    value?: number | string;
    baseline?: number;
    baseline_name?: string;
  };
  // Candidate competition snapshots (present per model type that runs one).
  candidate_competition_cv_pr_auc?: Record<string, number>;
  candidate_competition_val_spearman?: Record<string, number>;
  component_metrics?: Record<string, number>;
  candidate_selection?: SelectionEntry[];
}

/** Test holdout score from the training run's candidate_selection log. */
function selectionTestScore(entry: SelectionEntry | undefined): number | null {
  if (!entry) return null;
  for (const key of ["test_pr_auc", "test_coverage_p10_p90"] as const) {
    const value = entry[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/** Rebuild the candidate competition (ranked, champion-flagged) from a card. */
function buildCompetition(card: ModelCard): CandidateResult[] | undefined {
  const churn = card.candidate_competition_cv_pr_auc;
  const clv = card.candidate_competition_val_spearman;
  const scores = churn ?? clv;
  if (!scores || Object.keys(scores).length === 0) return undefined;
  const cvMetric = churn ? "CV PR-AUC" : "Val Spearman";

  const selection = new Map<string, SelectionEntry>();
  for (const entry of card.candidate_selection ?? []) {
    if (entry.candidate) selection.set(entry.candidate, entry);
  }

  const results: CandidateResult[] = Object.entries(scores).map(([algorithm, cvScore]) => {
    const sel = selection.get(algorithm);
    const isChampion = algorithm === card.algorithm;
    return {
      algorithm,
      cv_score: cvScore,
      cv_metric: cvMetric,
      test_score: selectionTestScore(sel),
      gate_passed: sel?.gate_passed,
      is_champion: isChampion,
      reason: isChampion ? sel?.reason : undefined,
    };
  });
  results.sort((a, b) => (b.cv_score ?? 0) - (a.cv_score ?? 0));
  return results;
}

type EvaluationRow = typeof mlModelEvaluations.$inferSelect;

function asMetrics(json: unknown): Record<string, number> {
  return (json as Record<string, number> | null) ?? {};
}

/** Average each numeric metric key across backtest evaluation rows. */
function averageMetrics(rows: EvaluationRow[]): Record<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(asMetrics(row.metricsJson))) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const entry = sums.get(key) ?? { total: 0, n: 0 };
      entry.total += value;
      entry.n += 1;
      sums.set(key, entry);
    }
  }
  const avg: Record<string, number> = {};
  for (const [key, { total, n }] of sums) avg[key] = total / n;
  return avg;
}

/** Most recent realized (production_holdout) row for a champion version. */
async function fetchLatestRealized(
  modelType: ModelType,
  versionId: string
): Promise<ModelPerfRealized | null> {
  const [row] = await db
    .select({
      metricsJson: mlModelEvaluations.metricsJson,
      cutoffDate: mlModelEvaluations.cutoffDate,
      createdAt: mlModelEvaluations.createdAt,
      predictionRunId: mlModelEvaluations.predictionRunId,
      runName: mlPredictionRuns.name,
    })
    .from(mlModelEvaluations)
    .leftJoin(
      mlPredictionRuns,
      eq(mlModelEvaluations.predictionRunId, mlPredictionRuns.id)
    )
    .where(
      and(
        eq(mlModelEvaluations.modelVersionId, versionId),
        eq(mlModelEvaluations.evaluationType, EVALUATION_TYPE.PRODUCTION_HOLDOUT),
        eq(mlModelEvaluations.modelType, modelType)
      )
    )
    .orderBy(desc(mlModelEvaluations.createdAt))
    .limit(1);

  if (!row) return null;

  const metrics = asMetrics(row.metricsJson);
  const primaryKey = PRIMARY_METRIC[modelType].key;
  const primaryValue = metrics[primaryKey];
  return {
    primary_value: typeof primaryValue === "number" && Number.isFinite(primaryValue) ? primaryValue : null,
    metrics,
    measured_at: row.createdAt.toISOString(),
    prediction_run_id: row.predictionRunId,
    prediction_run_name: row.runName,
    cutoff_date: row.cutoffDate,
  };
}

async function buildEntry(modelType: (typeof MODEL_TYPES)[number]): Promise<ModelPerfEntry | null> {
  const [champion] = await db
    .select({
      id: mlModelVersions.id,
      version: mlModelVersions.version,
      trainedAt: mlModelVersions.trainedAt,
      modelCardJson: mlModelVersions.modelCardJson,
    })
    .from(mlModelAliases)
    .innerJoin(mlModelVersions, eq(mlModelAliases.modelVersionId, mlModelVersions.id))
    .where(and(eq(mlModelAliases.alias, MODEL_ALIAS.PRODUCTION), eq(mlModelAliases.modelType, modelType)))
    .limit(1);
  if (!champion) return null;

  const card = (champion.modelCardJson as ModelCard | null) ?? {};
  const evaluations = await db
    .select()
    .from(mlModelEvaluations)
    .where(eq(mlModelEvaluations.modelVersionId, champion.id));

  const holdout = evaluations.filter(
    (row) => row.baselineName === null && row.evaluationType === EVALUATION_TYPE.HOLDOUT
  );
  const backtests = evaluations.filter(
    (row) => row.baselineName === null && row.evaluationType === EVALUATION_TYPE.BACKTEST
  );

  const splits: SplitMetrics[] = [];
  for (const split of ["validation", "test"] as const) {
    const row = holdout.find((r) => r.datasetSplit === split);
    if (row) splits.push({ split, metrics: asMetrics(row.metricsJson) });
  }
  if (backtests.length > 0) {
    splits.push({ split: "backtest_avg", metrics: averageMetrics(backtests) });
  }

  const baselines = evaluations
    .filter((row) => row.baselineName !== null && row.datasetSplit === "test")
    .map((row) => ({ name: row.baselineName as string, metrics: asMetrics(row.metricsJson) }));

  let primaryName = card.primary_metric?.name;
  let primaryValue = card.primary_metric?.value;
  let primaryBaseline = card.primary_metric?.baseline;
  let primaryBaselineName = card.primary_metric?.baseline_name;

  const testRow = holdout.find((r) => r.datasetSplit === "test");
  const testMetrics = testRow ? asMetrics(testRow.metricsJson) : {};

  // Colab alignment: Map legacy synthetic metric names to clean Colab evaluations
  if (modelType === "clv") {
    if (!primaryName || primaryName === "CLV composite") {
      primaryName = PRIMARY_METRIC.clv.name;
      primaryValue = testMetrics["spearman_payers"] ?? testMetrics["spearman"] ?? primaryValue ?? "";
      primaryBaseline = 0.60;
      primaryBaselineName = "target_60pct";
    }
  } else if (modelType === "credit") {
    if (!primaryName || primaryName === "Coverage p10–p90") {
      primaryName = PRIMARY_METRIC.credit.name;
      primaryValue = testMetrics["coverage_p10_p90_30d"] ?? testMetrics["coverage_p10_p90"] ?? primaryValue ?? "";
      primaryBaseline = CREDIT_COVERAGE_BASELINE;
      primaryBaselineName = "target_80pct";
    }
  } else if (modelType === "churn") {
    if (!primaryName) {
      primaryName = PRIMARY_METRIC.churn.name;
      primaryValue = testMetrics["pr_auc"] ?? primaryValue ?? "";
      primaryBaseline = 0.70;
      primaryBaselineName = "target_70pct";
    }
  }

  const entry: ModelPerfEntry = {
    model_type: modelType,
    method: card.method ?? "",
    algorithm: card.algorithm ?? "",
    version: champion.version,
    trained_at: champion.trainedAt?.toISOString() ?? null,
    cutoff_date: card.cutoff_date ?? null,
    dataset_rows: card.dataset_rows ?? null,
    feature_set: card.feature_set ?? null,
    primary_metric: {
      name: primaryName ?? PRIMARY_METRIC[modelType].name,
      value: primaryValue ?? "",
      ...(primaryBaseline !== undefined ? { baseline: primaryBaseline } : {}),
      ...(primaryBaselineName !== undefined ? { baseline_name: primaryBaselineName } : {}),
    },
    splits,
    baselines,
  };

  if (card.component_metrics && Object.keys(card.component_metrics).length > 0) {
    entry.component_metrics = card.component_metrics;
  }

  const competition = buildCompetition(card);
  if (competition) entry.competition = competition;

  entry.realized = await fetchLatestRealized(modelType, champion.id);

  if (modelType === "churn") {
    entry.thresholds = card.thresholds ?? { ...DEFAULT_RISK_THRESHOLDS };
    if (testRow) {
      const calibration = testRow.calibrationJson as ModelPerfEntry["calibration"] | null;
      const confusion = testRow.confusionMatrixJson as ModelPerfEntry["confusion"] | null;
      const liftTable = testRow.liftTableJson as ModelPerfEntry["lift_table"] | null;
      if (calibration) entry.calibration = calibration;
      if (confusion) entry.confusion = confusion;
      if (liftTable) entry.lift_table = liftTable;
    }
  } else if (card.thresholds) {
    entry.thresholds = card.thresholds;
  }

  return entry;
}

interface VersionCard {
  algorithm?: string;
}

export const modelPerformanceRoutes = new Elysia({ prefix: "/model-performance" })
  .use(requireUser)
  .get("/", async (): Promise<ModelPerfEntry[]> => {
    const entries: ModelPerfEntry[] = [];
    for (const modelType of MODEL_TYPES) {
      const entry = await buildEntry(modelType);
      if (entry) entries.push(entry);
    }
    return entries;
  })
  // All trained versions for a model type — fuels the production-override picker.
  .get("/:modelType/versions", async ({ params }): Promise<ModelVersionSummary[]> => {
    if (!isModelType(params.modelType)) throw badRequest("Unknown model type");
    const primary = PRIMARY_METRIC[params.modelType];
    const rows = await db
      .select({
        id: mlModelVersions.id,
        version: mlModelVersions.version,
        status: mlModelVersions.status,
        isActive: sql<boolean>`CASE
          WHEN ${mlModelAliases.id} IS NOT NULL
            THEN ${mlModelAliases.modelVersionId} = ${mlModelVersions.id}
          ELSE ${mlModelVersions.isActive}
        END`,
        trainedAt: mlModelVersions.trainedAt,
        modelCardJson: mlModelVersions.modelCardJson,
        testMetricsJson: mlModelVersions.testMetricsJson,
        createdBy: mlTrainingRuns.createdBy,
      })
      .from(mlModelVersions)
      .leftJoin(mlTrainingRuns, eq(mlModelVersions.trainingRunId, mlTrainingRuns.id))
      .leftJoin(
        mlModelAliases,
        and(
          eq(mlModelAliases.modelType, params.modelType),
          eq(mlModelAliases.alias, MODEL_ALIAS.PRODUCTION)
        )
      )
      .where(eq(mlModelVersions.modelType, params.modelType))
      .orderBy(desc(mlModelVersions.trainedAt));

    return rows.map((row) => {
      const metrics = asMetrics(row.testMetricsJson);
      const metricValue =
        metrics[primary.key] ??
        (params.modelType === "clv" ? metrics["spearman"] : params.modelType === "credit" ? metrics["coverage_p10_p90"] : metrics["pr_auc"]);
      return {
        id: row.id,
        model_type: params.modelType,
        version: row.version,
        algorithm: (row.modelCardJson as VersionCard | null)?.algorithm ?? "",
        status: row.status,
        is_active: row.isActive,
        trained_at: row.trainedAt?.toISOString() ?? null,
        primary_metric_name: primary.name,
        primary_metric_value: typeof metricValue === "number" ? metricValue : null,
        created_by: row.createdBy ?? null,
      };
    });
  })
  // Permanently delete a non-production model version (artifacts + registry row).
  // Any authenticated user. Blocked while any prediction run still references
  // the version — delete those prediction results first.
  // The ML service also refuses the current production champion.
  .delete("/:modelType/versions/:id", async ({ params, userId }) => {
    if (!isModelType(params.modelType)) {
      throw badRequest("Unknown model type");
    }
    if (!params.id) {
      throw badRequest("model version id is required");
    }

    const [version] = await db
      .select({
        id: mlModelVersions.id,
        version: mlModelVersions.version,
        isActive: mlModelVersions.isActive,
        status: mlModelVersions.status,
        isProductionAlias: sql<boolean>`EXISTS (
          SELECT 1
          FROM ${mlModelAliases} AS alias_row
          WHERE alias_row.model_type = ${mlModelVersions.modelType}
            AND alias_row.alias = 'production'
            AND alias_row.model_version_id = ${mlModelVersions.id}
        )`,
        createdBy: mlTrainingRuns.createdBy,
      })
      .from(mlModelVersions)
      .leftJoin(mlTrainingRuns, eq(mlModelVersions.trainingRunId, mlTrainingRuns.id))
      .where(
        and(eq(mlModelVersions.id, params.id), eq(mlModelVersions.modelType, params.modelType))
      )
      .limit(1);

    if (!version) throw notFound("Model version not found");

    if (version.isActive || version.status === MODEL_VERSION_STATUS.PRODUCTION || version.isProductionAlias) {
      throw conflict(
        "This version is the production champion — switch production to another version before deleting it."
      );
    }

    assertNotUsedByPredictions(
      await predictionRunsUsingVersion(params.modelType, version.version, version.id),
      "เวอร์ชันนี้",
      "MODEL_IN_USE_BY_PREDICTIONS"
    );

    try {
      await triggerMlJob("/internal/model-delete", {
        model_type: params.modelType,
        model_version_id: params.id,
        created_by: userId ?? null,
      });
    } catch (error) {
      throw mlErrorToHttp(error, "Delete failed");
    }
    return { deleted: true };
  })
  // Manually pin a version to production. Reuses the ML service's promotion
  // transaction (action='manual_override') so the registry stays consistent.
  .post(
    "/:modelType/activate",
    async ({ params, body, userId }) => {
      if (!isModelType(params.modelType)) {
        throw badRequest("Unknown model type");
      }
      try {
        await triggerMlJob("/internal/model-activate", {
          model_type: params.modelType,
          model_version_id: body.model_version_id,
          reason: body.reason,
          created_by: userId,
        });
      } catch (error) {
        throw new HttpError(502, error instanceof Error ? error.message : "Activation failed");
      }
      return { ok: true };
    },
    {
      body: t.Object({
        model_version_id: t.String({ format: "uuid" }),
        reason: t.Optional(t.String()),
      }),
    }
  );
