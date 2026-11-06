/**
 * Roll back a Data Source: deleting its row cascades to its raw and clean rows.
 */
import { IMPORT_STATUS } from "@moby/types";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../../db/client";
import { importTimeoutMs } from "../constants";
import { SOURCE_TABLES, type DataSourceKind } from "./source-tables";

/** Imports still running this long after the timeout (+5 min) were killed mid-way. */
function staleImportCutoff(): Date {
  const bufferMs = 5 * 60 * 1000;
  return new Date(Date.now() - importTimeoutMs() - bufferMs);
}

export async function deleteDataSource(kind: DataSourceKind, sourceId: string): Promise<void> {
  const { sources } = SOURCE_TABLES[kind];
  await db.delete(sources).where(eq(sources.id, sourceId));
}

/** Delete Data Sources left in importing/cleaning after a crash. Returns how many. */
export async function releaseStaleImports(kind: DataSourceKind): Promise<number> {
  const { sources } = SOURCE_TABLES[kind];
  const deleted = await db
    .delete(sources)
    .where(
      and(
        inArray(sources.importStatus, [IMPORT_STATUS.IMPORTING, IMPORT_STATUS.CLEANING]),
        isNull(sources.cleanedAt),
        lt(sources.createdAt, staleImportCutoff())
      )
    )
    .returning({ id: sources.id });
  return deleted.length;
}
