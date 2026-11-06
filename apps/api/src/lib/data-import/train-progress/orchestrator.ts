/**
 * The async train import job: runs Import + Clean in the background while the web polls
 * GET /import/progress, publishing each step to the Redis Stream.
 */
import { deleteDataSource } from "../abort-data-source";
import { runImportPipeline } from "../import-pipeline";
import { IMPORT_TIMEOUT_CODE, isImportTimeoutError } from "../import-timeout";
import { publishTrainImportDone, publishTrainImportError, publishTrainImportProgress } from "./stream";

/** Fire-and-forget: the HTTP request has already returned the new source id. */
export function runTrainImportJob(sourceId: string, buffer: Buffer): void {
  void (async () => {
    try {
      const result = await runImportPipeline("train", sourceId, buffer, (event) => {
        void publishTrainImportProgress(sourceId, event);
      });
      await publishTrainImportDone(sourceId, result);
    } catch (e) {
      const err = e as Error;
      await publishTrainImportError(sourceId, err.message ?? "Import failed", {
        code: isImportTimeoutError(err) ? IMPORT_TIMEOUT_CODE : undefined,
      });
      await deleteDataSource("train", sourceId);
    }
  })();
}
