/**
 * Roll back a failed import — delete catalog row (CASCADE raw + clean).
 */
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../db/client";
import { predictDataSources, trainDataSources } from "../db/schema";
import { importTimeoutMs } from "./constants";

/** Reap catalogs still importing after timeout + buffer (crash / killed container). */
function staleImportCutoff(): Date {
  const bufferMs = 5 * 60 * 1000;
  return new Date(Date.now() - importTimeoutMs() - bufferMs);
}

export async function abortTrainDataSource(sourceId: string): Promise<void> {
  await db.delete(trainDataSources).where(eq(trainDataSources.id, sourceId));
}

export async function abortPredictDataSource(sourceId: string): Promise<void> {
  await db.delete(predictDataSources).where(eq(predictDataSources.id, sourceId));
}

/** Delete train sources left in importing/cleaning after a crash. Returns how many. */
export async function releaseStaleTrainImports(): Promise<number> {
  const deleted = await db
    .delete(trainDataSources)
    .where(
      and(
        inArray(trainDataSources.importStatus, ["importing", "cleaning"]),
        isNull(trainDataSources.cleanedAt),
        lt(trainDataSources.createdAt, staleImportCutoff())
      )
    )
    .returning({ id: trainDataSources.id });
  return deleted.length;
}

/** Delete predict sources left in importing/cleaning after a crash. Returns how many. */
export async function releaseStalePredict(): Promise<number> {
  const deleted = await db
    .delete(predictDataSources)
    .where(
      and(
        inArray(predictDataSources.importStatus, ["importing", "cleaning"]),
        isNull(predictDataSources.cleanedAt),
        lt(predictDataSources.createdAt, staleImportCutoff())
      )
    )
    .returning({ id: predictDataSources.id });
  return deleted.length;
}
