/**
 * Train Data Source API — async import of the workbook (Import + Clean), its progress,
 * reads, suggested cutoff, and delete.
 *
 * Org-shared model: reads are org-wide; any authenticated user can import and
 * delete a source.
 */
import { IMPORT_STATUS } from "@moby/types";
import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { trainDataSources, user } from "../db/schema";
import { requireUser } from "../lib/http/auth-middleware";
import { badRequest, notFound } from "../lib/http/errors";
import { maxUploadBytes } from "../lib/constants";
import { deleteDataSource } from "../lib/data-import/abort-data-source";
import { DEFAULT_HORIZON_DAYS, getTrainCutoffSuggestion } from "../lib/data-import/clean-cutoff";
import { readImportBuffer } from "../lib/data-import/import-pipeline";
import { createDataSource } from "../lib/data-import/raw-import";
import { runTrainImportJob } from "../lib/data-import/train-progress/orchestrator";
import { importProgress } from "../lib/data-import/train-progress/progress";
import { publishTrainImportProgress, trainImportStatus } from "../lib/data-import/train-progress/stream";
import { isXlsxFilename, mapDataSourceRow } from "../lib/data-import/data-source-dto";

const sourceSelect = {
  id: trainDataSources.id,
  name: trainDataSources.name,
  clientLabel: trainDataSources.clientLabel,
  originalFilename: trainDataSources.originalFilename,
  fileChecksumSha256: trainDataSources.fileChecksumSha256,
  fileSizeBytes: trainDataSources.fileSizeBytes,
  importStatus: trainDataSources.importStatus,
  importedAt: trainDataSources.importedAt,
  sheetManifest: trainDataSources.sheetManifest,
  cleanManifest: trainDataSources.cleanManifest,
  cleanedAt: trainDataSources.cleanedAt,
  notes: trainDataSources.notes,
  errorMessage: trainDataSources.errorMessage,
  importedBy: trainDataSources.importedBy,
  createdAt: trainDataSources.createdAt,
  importerName: user.name,
  importerEmail: user.email,
};

export const trainDataRoutes = new Elysia({ prefix: "/train-data-sources" })
  .use(requireUser)
  .get("/", async () => {
    const rows = await db
      .select(sourceSelect)
      .from(trainDataSources)
      .leftJoin(user, eq(trainDataSources.importedBy, user.id))
      .orderBy(desc(trainDataSources.createdAt));

    return rows.map(mapDataSourceRow);
  })
  // Import runs in the background; the web polls /:id/import/progress.
  .post(
    "/import/async",
    async ({ body, userId }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!isXlsxFilename(filename)) {
        throw badRequest("Only .xlsx files are supported");
      }
      const buffer = await readImportBuffer(body.file);
      const sourceId = await createDataSource("train", {
        buffer,
        filename,
        name: body.name,
        client_label: body.client_label ?? null,
        notes: body.notes ?? null,
        imported_by: userId,
      });
      try {
        await publishTrainImportProgress(sourceId, importProgress.uploadReceived());
      } catch (e) {
        await deleteDataSource("train", sourceId);
        throw e;
      }
      runTrainImportJob(sourceId, buffer);
      return { source_id: sourceId, import_status: IMPORT_STATUS.IMPORTING };
    },
    {
      body: t.Object({
        file: t.File({ maxSize: maxUploadBytes() }),
        name: t.String({ minLength: 1 }),
        client_label: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/:id/import/progress",
    async ({ params, set }) => {
      const status = await trainImportStatus(params.id);
      if (status.status === "not_found") set.status = 404;
      return status;
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  .get("/:id", async ({ params }) => {
    const rows = await db
      .select(sourceSelect)
      .from(trainDataSources)
      .leftJoin(user, eq(trainDataSources.importedBy, user.id))
      .where(eq(trainDataSources.id, params.id))
      .limit(1);

    if (rows.length === 0) {
      throw notFound("Train data source not found");
    }
    return mapDataSourceRow(rows[0]);
  })
  // Gate 3 suggestion: latest training cutoff whose label horizon is fully
  // observed. Python checks `max_activity >= cutoff + horizon`, so the latest
  // safe cutoff is `latest_activity_date - horizon`.
  .get(
    "/:id/suggested-cutoff",
    async ({ params }) => {
      const [source] = await db
        .select({ id: trainDataSources.id })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, params.id))
        .limit(1);
      if (!source) {
        throw notFound("Train data source not found");
      }

      const { cutoff_date, latest_data_date } = await getTrainCutoffSuggestion(
        params.id,
        DEFAULT_HORIZON_DAYS
      );
      if (!cutoff_date || !latest_data_date) {
        throw badRequest("No clean activity data for this source yet");
      }
      return {
        suggested_cutoff: cutoff_date,
        latest_data_date: latest_data_date,
        horizon_days: DEFAULT_HORIZON_DAYS,
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  .delete(
    "/:id",
    async ({ params }) => {
      const [row] = await db
        .select({
          importStatus: trainDataSources.importStatus,
          importedBy: trainDataSources.importedBy,
        })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, params.id))
        .limit(1);

      if (!row) throw notFound("Train data source not found");

      await db.delete(trainDataSources).where(eq(trainDataSources.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  );
