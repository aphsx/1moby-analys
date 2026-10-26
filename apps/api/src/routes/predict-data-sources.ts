/**
 * Predict Data Source API — import the workbook (Import + Clean, inline in the request),
 * reads, suggested cutoff, and delete.
 *
 * Org-shared model: reads and import are available to any authenticated user.
 * A successful import auto-triggers a prediction run (opt out with auto_run=false).
 */
import type { DataSourceImportResult } from "@moby/types";
import Elysia, { t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { predictDataSources, user } from "../db/schema";
import { requireUser } from "../lib/http/auth-middleware";
import { badRequest, HttpError, notFound } from "../lib/http/errors";
import { maxUploadBytes } from "../lib/constants";
import { deleteDataSource } from "../lib/data-import/abort-data-source";
import { getPredictCutoffSuggestion } from "../lib/data-import/clean-cutoff";
import { isXlsxFilename, mapDataSourceRow } from "../lib/data-import/data-source-dto";
import { readImportBuffer, runImportPipeline } from "../lib/data-import/import-pipeline";
import { IMPORT_TIMEOUT_CODE, isImportTimeoutError } from "../lib/data-import/import-timeout";
import { createDataSource } from "../lib/data-import/raw-import";
import { createAutoPredictionRun } from "../lib/ml/auto-prediction-run";

const sourceSelect = {
  id: predictDataSources.id,
  name: predictDataSources.name,
  clientLabel: predictDataSources.clientLabel,
  originalFilename: predictDataSources.originalFilename,
  fileChecksumSha256: predictDataSources.fileChecksumSha256,
  fileSizeBytes: predictDataSources.fileSizeBytes,
  importStatus: predictDataSources.importStatus,
  importedAt: predictDataSources.importedAt,
  sheetManifest: predictDataSources.sheetManifest,
  cleanManifest: predictDataSources.cleanManifest,
  cleanedAt: predictDataSources.cleanedAt,
  notes: predictDataSources.notes,
  errorMessage: predictDataSources.errorMessage,
  importedBy: predictDataSources.importedBy,
  createdAt: predictDataSources.createdAt,
  importerName: user.name,
  importerEmail: user.email,
};

export const predictDataRoutes = new Elysia({ prefix: "/predict-data-sources" })
  .use(requireUser)
  .get("/", async () => {
    const rows = await db
      .select(sourceSelect)
      .from(predictDataSources)
      .leftJoin(user, eq(predictDataSources.importedBy, user.id))
      .orderBy(desc(predictDataSources.createdAt));
    return rows.map(mapDataSourceRow);
  })
  .get("/:id", async ({ params }) => {
    const rows = await db
      .select(sourceSelect)
      .from(predictDataSources)
      .leftJoin(user, eq(predictDataSources.importedBy, user.id))
      .where(eq(predictDataSources.id, params.id))
      .limit(1);

    if (rows.length === 0) throw notFound("Predict data source not found");
    return mapDataSourceRow(rows[0]);
  })
  // Suggested prediction cutoff = day after the latest observed activity
  // (payments + usage months) in the source's clean tables.
  .get(
    "/:id/suggested-cutoff",
    async ({ params }) => {
      const [source] = await db
        .select({ id: predictDataSources.id })
        .from(predictDataSources)
        .where(eq(predictDataSources.id, params.id))
        .limit(1);
      if (!source) throw notFound("Predict data source not found");

      const { cutoff_date, latest_data_date } = await getPredictCutoffSuggestion(params.id);
      if (!cutoff_date) {
        throw badRequest("No clean activity data for this source yet");
      }
      return {
        suggested_cutoff: cutoff_date,
        latest_data_date: latest_data_date,
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) }
  )
  .post(
    "/import",
    async ({ body, userId }) => {
      const filename = body.file.name ?? "upload.xlsx";
      if (!isXlsxFilename(filename)) {
        throw badRequest("Only .xlsx files are supported");
      }

      const buffer = await readImportBuffer(body.file);
      const displayName = body.name?.trim() || filename;
      const sourceId = await createDataSource("predict", {
        buffer,
        filename,
        name: displayName,
        client_label: body.client_label ?? null,
        notes: body.notes ?? null,
        imported_by: userId,
      });

      let result: DataSourceImportResult;
      try {
        result = await runImportPipeline("predict", sourceId, buffer);
      } catch (e) {
        await deleteDataSource("predict", sourceId);
        const err = e as Error;
        const message = err.message?.slice(0, 500) ?? "Import failed";
        if (isImportTimeoutError(err)) throw new HttpError(504, message, IMPORT_TIMEOUT_CODE);
        throw badRequest(message);
      }

      // Auto prediction run (default on; opt out with auto_run=false). Fully
      // isolated from import success — createAutoPredictionRun never throws.
      const autoRunWanted = body.auto_run !== false && body.auto_run !== "false";
      const autoRunId = autoRunWanted
        ? await createAutoPredictionRun({ predictSourceId: sourceId, sourceName: displayName, createdBy: userId })
        : null;
      return { ...result, auto_prediction_run_id: autoRunId };
    },
    {
      body: t.Object({
        file: t.File({ maxSize: maxUploadBytes() }),
        name: t.Optional(t.String()),
        client_label: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        // Multipart form fields arrive as strings — accept both JSON booleans
        // and "true"/"false" literals. Default (omitted) = auto-run enabled.
        auto_run: t.Optional(t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")])),
      }),
    }
  );
