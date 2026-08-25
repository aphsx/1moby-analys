import Elysia, { t } from "elysia";
import { createRunInsight, getRunInsight } from "../../lib/ai";
import { requireUser } from "../../lib/auth-middleware";
import { fetchRun, requireRunFound } from "./_helpers";

/**
 * Run-level AI base summary (the "สรุปก่อน" of the whole customer base).
 *   GET  /:id/insight  — read the cached summary (never generates)
 *   POST /:id/insight  — generate or regenerate (force) and cache it
 */
export const insightRoutes = new Elysia()
  .use(requireUser)
  .get(
    "/:id/insight",
    async ({ params, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied || !run) {
        return denied;
      }
      return getRunInsight(run.id);
    },
    { params: t.Object({ id: t.String() }) }
  )
  .post(
    "/:id/insight",
    async ({ params, body, set }) => {
      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied || !run) {
        return denied;
      }
      if (run.status !== "completed") {
        set.status = 400;
        return { message: "Run must be completed before generating insight" };
      }

      const result = await createRunInsight(run.id, body.force ?? false);
      if ("status" in result) {
        set.status = result.status;
        return result.body;
      }
      return result;
    },
    {
      body: t.Object({ force: t.Optional(t.Boolean()) }),
      params: t.Object({ id: t.String() }),
    }
  );
