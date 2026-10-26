/**
 * Train raw data API — import 8-sheet Excel into train_data_sources + train_raw_sheet_*.
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
import { badRequest, HttpError, notFound } from "../lib/http/errors";
import { maxUploadBytes } from "../lib/constants";
import { getTrainCutoffSuggestion } from "../lib/data-import/clean-cutoff";
import { prepareTrainDataSource } from "../lib/data-import/train-import";
import { abortTrainDataSource } from "../lib/data-import/abort-data-source";
import {
  publishTrainPipelineProgress,
  readLatestTrainImportStreamEntry,
} from "../lib/data-import/train-progress/stream";
import {
  readImportBuffer,
  runTrainImportJob,
  runTrainImportPipeline,
} from "../lib/data-import/train-progress/orchestrator";
import { isXlsxFilename, mapDataSourceRow } from "../lib/data-import/data-source-dto";
import { IMPORT_TIMEOUT_CODE, isImportTimeoutError } from "../lib/data-import/import-timeout";

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

// Any authenticated user can import training data.
const trainImportRoutes = new Elysia()
  .use(requireUser)
  .post(
    "/import",
    async ({ body, userId }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!isXlsxFilename(filename)) {
        throw badRequest("Only .xlsx files are supported");
      }

      const buffer = await readImportBuffer(body.file);

      let sourceId = "";
      try {
        sourceId = await prepareTrainDataSource({
          buffer,
          filename,
          name: body.name,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          imported_by: userId,
        });
        const result = await runTrainImportPipeline({
          buffer,
          filename,
          name: body.name,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          imported_by: userId,
          sourceId,
        });
        return result;
      } catch (e) {
        if (sourceId) await abortTrainDataSource(sourceId);
        const err = e as Error;
        if (isImportTimeoutError(err)) {
          throw new HttpError(504, err.message, IMPORT_TIMEOUT_CODE);
        }
        throw badRequest(err.message ?? "Import failed");
      }
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
  .post(
    "/import/async",
    async ({ body, userId }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!isXlsxFilename(filename)) {
        throw badRequest("Only .xlsx files are supported");
      }

      let buffer: Buffer;
      try {
        buffer = await readImportBuffer(body.file);
      } catch (e) {
        throw new HttpError(413, (e as Error).message);
      }

      let sourceId = "";
      try {
        sourceId = await prepareTrainDataSource({
          buffer,
          filename,
          name: body.name,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          imported_by: userId,
        });

        await publishTrainPipelineProgress(sourceId, {
          progress: 3,
          step: "Upload received — connecting progress…",
          phase: "raw",
        });

        runTrainImportJob(sourceId, {
          buffer,
          filename,
          name: body.name,
          client_label: body.client_label ?? null,
          notes: body.notes ?? null,
          imported_by: userId,
        });

        return { source_id: sourceId, import_status: IMPORT_STATUS.IMPORTING };
      } catch (e) {
        if (sourceId) await abortTrainDataSource(sourceId);
        const err = e as Error;
        if (isImportTimeoutError(err)) {
          throw new HttpError(504, err.message, IMPORT_TIMEOUT_CODE);
        }
        throw badRequest(err.message ?? "Import failed");
      }
    },
    {
      body: t.Object({
        file: t.File({ maxSize: maxUploadBytes() }),
        name: t.String({ minLength: 1 }),
        client_label: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    }
  );

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
  .get(
    "/:id/import/progress",
    async ({ params, set }) => {
      const sourceId = params.id;
      const [row] = await db
        .select({
          importStatus: trainDataSources.importStatus,
          errorMessage: trainDataSources.errorMessage,
          sheetManifest: trainDataSources.sheetManifest,
          cleanManifest: trainDataSources.cleanManifest,
        })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, sourceId))
        .limit(1);

      if (!row) {
        const snap = await readLatestTrainImportStreamEntry(sourceId);
        if (snap.kind === "failed") {
          return {
            status: "failed" as const,
            progress: 0,
            step: snap.message,
            message: snap.message,
            code: snap.code,
            source_id: snap.source_id,
          };
        }
        set.status = 404;
        return { status: "not_found" as const, message: "Train data source not found" };
      }

      // DB terminal state wins over Redis progress. Progress events are published
      // fire-and-forget and can arrive after the final "done" stream entry.
      if (row.importStatus === IMPORT_STATUS.READY) {
        return {
          status: "ready" as const,
          progress: 100,
          step: "Ready for model training",
          phase: "clean" as const,
          result: {
            source_id: sourceId,
            import_status: IMPORT_STATUS.READY,
            sheet_manifest: (row.sheetManifest ?? {}) as Record<string, number>,
            clean_manifest: row.cleanManifest ?? undefined,
          },
        };
      }

      if (row.importStatus === "failed") {
        return {
          status: "failed" as const,
          progress: 0,
          step: row.errorMessage ?? "Import failed",
          message: row.errorMessage ?? "Import failed",
        };
      }

      const snap = await readLatestTrainImportStreamEntry(sourceId);

      if (snap.kind === "done") {
        return {
          status: "ready" as const,
          progress: 100,
          step: "Ready for model training",
          phase: "clean" as const,
          result: {
            source_id: snap.result.source_id,
            import_status: snap.result.import_status,
            sheet_manifest: snap.result.sheet_manifest,
            file_checksum_sha256: snap.result.file_checksum_sha256,
            clean_manifest: snap.result.clean_manifest,
          },
        };
      }

      if (snap.kind === "failed") {
        return {
          status: "failed" as const,
          progress: 0,
          step: snap.message,
          message: snap.message,
          code: snap.code,
          source_id: snap.source_id,
        };
      }

      if (snap.kind === "progress") {
        return {
          status: "importing" as const,
          progress: snap.event.progress,
          step: snap.event.step,
          phase: snap.event.phase,
          sheet: snap.event.sheet,
          rows: snap.event.rows,
        };
      }

      return {
        status: "importing" as const,
        progress: 0,
        step: "Waiting for import to start…",
        phase: "raw" as const,
      };
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

      const HORIZON_DAYS = 180;
      const { cutoff_date, latest_data_date } = await getTrainCutoffSuggestion(
        params.id,
        HORIZON_DAYS
      );
      if (!cutoff_date || !latest_data_date) {
        throw badRequest("No clean activity data for this source yet");
      }
      return {
        suggested_cutoff: cutoff_date,
        latest_data_date: latest_data_date,
        horizon_days: HORIZON_DAYS,
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
  )
  .use(trainImportRoutes);
