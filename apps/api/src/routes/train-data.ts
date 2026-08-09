/**
 * [NEW] Train raw data API — import 8-sheet Excel into train_data_sources + train_raw_sheet_*.
 *
 * Org-shared model: reads are org-wide; importing is admin-only; deleting a
 * source is creator-or-admin.
 */

import { desc, eq } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "../db/client";
import { trainDataSources, user } from "../db/schema";
import { releaseStaleTrainImports } from "../lib/abort-data-source";
import { requireCreatorOrAdminForMutation } from "../lib/access-control";
import { requireAdmin, requireUser } from "../lib/auth-middleware";
import { getTrainCutoffSuggestion } from "../lib/clean-cutoff";
import { UUID_RE } from "../lib/constants";
import {
  isXlsxFilename,
  mapDataSourceRow,
} from "../lib/data-import/data-source-dto";
import { prepareTrainDataSource } from "../lib/train-import";
import {
  readImportBuffer,
  runTrainImportJob,
  runTrainImportPipeline,
} from "../lib/train-import-orchestrator";
import {
  publishTrainPipelineProgress,
  readLatestTrainImportStreamEntry,
} from "../lib/train-import-stream";

const sourceSelect = {
  cleanedAt: trainDataSources.cleanedAt,
  cleanManifest: trainDataSources.cleanManifest,
  clientLabel: trainDataSources.clientLabel,
  createdAt: trainDataSources.createdAt,
  errorMessage: trainDataSources.errorMessage,
  fileChecksumSha256: trainDataSources.fileChecksumSha256,
  fileSizeBytes: trainDataSources.fileSizeBytes,
  id: trainDataSources.id,
  importedAt: trainDataSources.importedAt,
  importedBy: trainDataSources.importedBy,
  importerEmail: user.email,
  importerName: user.name,
  importStatus: trainDataSources.importStatus,
  name: trainDataSources.name,
  notes: trainDataSources.notes,
  originalFilename: trainDataSources.originalFilename,
  sheetManifest: trainDataSources.sheetManifest,
};

// Admin-only: importing/replacing shared training data.
const adminTrainDataRoutes = new Elysia()
  .use(requireAdmin)
  .post(
    "/import",
    async ({ body, userId, set }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!isXlsxFilename(filename)) {
        set.status = 400;
        return { message: "Only .xlsx files are supported" };
      }

      const buffer = await readImportBuffer(body.file);

      try {
        const sourceId = await prepareTrainDataSource({
          buffer,
          client_label: body.client_label ?? null,
          filename,
          imported_by: userId!,
          name: body.name,
          notes: body.notes ?? null,
        });
        const result = await runTrainImportPipeline({
          buffer,
          client_label: body.client_label ?? null,
          filename,
          imported_by: userId!,
          name: body.name,
          notes: body.notes ?? null,
          sourceId,
        });
        return result;
      } catch (e) {
        const err = e as Error & { code?: string; source_id?: string };
        if (err.code === "DUPLICATE_FILE") {
          set.status = 409;
          return { message: err.message, source_id: err.source_id };
        }
        set.status = 400;
        return { message: err.message ?? "Import failed" };
      }
    },
    {
      body: t.Object({
        client_label: t.Optional(t.String()),
        file: t.File(),
        name: t.String({ minLength: 1 }),
        notes: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/import/async",
    async ({ body, userId, set }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!isXlsxFilename(filename)) {
        set.status = 400;
        return { message: "Only .xlsx files are supported" };
      }

      let buffer: Buffer;
      try {
        buffer = await readImportBuffer(body.file);
      } catch (e) {
        set.status = 413;
        return { message: (e as Error).message };
      }

      try {
        const sourceId = await prepareTrainDataSource({
          buffer,
          client_label: body.client_label ?? null,
          filename,
          imported_by: userId!,
          name: body.name,
          notes: body.notes ?? null,
        });

        await publishTrainPipelineProgress(sourceId, {
          phase: "raw",
          progress: 3,
          step: "Upload received — connecting progress…",
        });

        runTrainImportJob(sourceId, {
          buffer,
          client_label: body.client_label ?? null,
          filename,
          imported_by: userId!,
          name: body.name,
          notes: body.notes ?? null,
        });

        return { import_status: "importing", source_id: sourceId };
      } catch (e) {
        const err = e as Error & { code?: string; source_id?: string };
        if (err.code === "DUPLICATE_FILE") {
          set.status = 409;
          return { message: err.message, source_id: err.source_id };
        }
        set.status = 400;
        return { message: err.message ?? "Import failed" };
      }
    },
    {
      body: t.Object({
        client_label: t.Optional(t.String()),
        file: t.File(),
        name: t.String({ minLength: 1 }),
        notes: t.Optional(t.String()),
      }),
    }
  );

export const trainDataRoutes = new Elysia({ prefix: "/train-data-sources" })
  .use(requireUser)
  .get("/", async () => {
    await releaseStaleTrainImports();
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
          cleanManifest: trainDataSources.cleanManifest,
          errorMessage: trainDataSources.errorMessage,
          importStatus: trainDataSources.importStatus,
          sheetManifest: trainDataSources.sheetManifest,
        })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, sourceId))
        .limit(1);

      if (!row) {
        set.status = 404;
        return {
          message: "Train data source not found",
          status: "not_found" as const,
        };
      }

      // DB terminal state wins over Redis progress. Progress events are published
      // fire-and-forget and can arrive after the final "done" stream entry.
      if (row.importStatus === "ready") {
        return {
          phase: "clean" as const,
          progress: 100,
          result: {
            clean_manifest: row.cleanManifest ?? undefined,
            import_status: "ready",
            sheet_manifest: (row.sheetManifest ?? {}) as Record<string, number>,
            source_id: sourceId,
          },
          status: "ready" as const,
          step: "Ready for model training",
        };
      }

      if (row.importStatus === "failed") {
        return {
          message: row.errorMessage ?? "Import failed",
          progress: 0,
          status: "failed" as const,
          step: row.errorMessage ?? "Import failed",
        };
      }

      const snap = await readLatestTrainImportStreamEntry(sourceId);

      if (snap.kind === "done") {
        return {
          phase: "clean" as const,
          progress: 100,
          result: {
            clean_manifest: snap.result.clean_manifest,
            file_checksum_sha256: snap.result.file_checksum_sha256,
            import_status: snap.result.import_status,
            sheet_manifest: snap.result.sheet_manifest,
            source_id: snap.result.source_id,
          },
          status: "ready" as const,
          step: "Ready for model training",
        };
      }

      if (snap.kind === "failed") {
        return {
          code: snap.code,
          message: snap.message,
          progress: 0,
          source_id: snap.source_id,
          status: "failed" as const,
          step: snap.message,
        };
      }

      if (snap.kind === "progress") {
        return {
          phase: snap.event.phase,
          progress: snap.event.progress,
          rows: snap.event.rows,
          sheet: snap.event.sheet,
          status: "importing" as const,
          step: snap.event.step,
        };
      }

      return {
        phase: "raw" as const,
        progress: 0,
        status: "importing" as const,
        step: "Waiting for import to start…",
      };
    },
    { params: t.Object({ id: t.String() }) }
  )
  .get("/:id", async ({ params, set }) => {
    const rows = await db
      .select(sourceSelect)
      .from(trainDataSources)
      .leftJoin(user, eq(trainDataSources.importedBy, user.id))
      .where(eq(trainDataSources.id, params.id))
      .limit(1);

    if (rows.length === 0) {
      set.status = 404;
      return { message: "Train data source not found" };
    }
    return mapDataSourceRow(rows[0]);
  })
  // Gate 3 suggestion: latest training cutoff whose label horizon is fully
  // observed. Python checks `max_activity >= cutoff + horizon`, so the latest
  // safe cutoff is `latest_activity_date - horizon`.
  .get(
    "/:id/suggested-cutoff",
    async ({ params, set }) => {
      if (!UUID_RE.test(params.id)) {
        set.status = 404;
        return { message: "Train data source not found" };
      }
      const [source] = await db
        .select({ id: trainDataSources.id })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, params.id))
        .limit(1);
      if (!source) {
        set.status = 404;
        return { message: "Train data source not found" };
      }

      const HORIZON_DAYS = 180;
      const { cutoff_date, latest_data_date } = await getTrainCutoffSuggestion(
        params.id,
        HORIZON_DAYS
      );
      if (!(cutoff_date && latest_data_date)) {
        set.status = 400;
        return { message: "No clean activity data for this source yet" };
      }
      return {
        horizon_days: HORIZON_DAYS,
        latest_data_date,
        suggested_cutoff: cutoff_date,
      };
    },
    { params: t.Object({ id: t.String() }) }
  )
  .delete(
    "/:id",
    async ({ params, userId, isAdmin, set }) => {
      const [row] = await db
        .select({
          importedBy: trainDataSources.importedBy,
          importStatus: trainDataSources.importStatus,
        })
        .from(trainDataSources)
        .where(eq(trainDataSources.id, params.id))
        .limit(1);

      const denied = requireCreatorOrAdminForMutation(
        row,
        row?.importedBy,
        userId,
        isAdmin,
        set,
        {
          forbidden:
            "Only the importer of this data source or an admin can delete it.",
          notFound: "Train data source not found",
        }
      );
      if (denied) {
        return denied;
      }

      await db
        .delete(trainDataSources)
        .where(eq(trainDataSources.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String() }) }
  )
  .use(adminTrainDataRoutes);
