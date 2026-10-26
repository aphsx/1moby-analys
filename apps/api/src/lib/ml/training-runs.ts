/**
 * Training Run reads shared by the training-runs routes: one select, one row type
 * (inferred from the select), one mapping to the `TrainingRun` contract.
 */
import type { RunStatus, TrainingRun, TrainingRunResult } from "@moby/types";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { mlTrainingRuns, trainDataSources, user } from "../../db/schema";
import { notFound } from "../http/errors";

const trainingRunSelect = {
  id: mlTrainingRuns.id,
  status: mlTrainingRuns.status,
  sourceName: trainDataSources.name,
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

function selectTrainingRuns() {
  return db
    .select(trainingRunSelect)
    .from(mlTrainingRuns)
    .leftJoin(trainDataSources, eq(mlTrainingRuns.sourceId, trainDataSources.id))
    .leftJoin(user, eq(mlTrainingRuns.createdBy, user.id));
}

export type TrainingRunRow = Awaited<ReturnType<typeof selectTrainingRuns>>[number];

export function mapTrainingRun(row: TrainingRunRow): TrainingRun {
  return {
    id: row.id,
    status: row.status as RunStatus,
    dataset_name: row.sourceName ?? "dataset",
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

/** Every Training Run, newest first (runs are visible org-wide). */
export async function listTrainingRuns(): Promise<TrainingRunRow[]> {
  return selectTrainingRuns().orderBy(desc(mlTrainingRuns.createdAt));
}

/** One Training Run, or a 404. */
export async function requireTrainingRun(id: string): Promise<TrainingRunRow> {
  const [row] = await selectTrainingRuns().where(eq(mlTrainingRuns.id, id)).limit(1);
  if (!row) throw notFound("Training run not found");
  return row;
}
