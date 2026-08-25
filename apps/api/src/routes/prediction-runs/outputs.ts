import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import Elysia, { t } from "elysia";
import { db } from "../../db/client";
import { mlPredictionOutputs } from "../../db/schema";
import { denyNotFound } from "../../lib/access-control";
import { requireUser } from "../../lib/auth-middleware";
import { UUID_RE } from "../../lib/constants";
import {
  fetchRun,
  mapOutput,
  type OutputsQueryParams,
  requireRunFound,
  SORT_COLUMNS,
} from "./_helpers";

function parseSort(sort: string | undefined): SQL {
  const [field, dir] = (sort ?? "priority_score:desc").split(":");
  const column =
    SORT_COLUMNS[(field ?? "") as keyof typeof SORT_COLUMNS] ??
    SORT_COLUMNS.priority_score;
  const direction = dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  return sql`${column} ${direction} NULLS LAST`;
}

function outputFilters(runId: string, q: OutputsQueryParams): SQL | undefined {
  const o = mlPredictionOutputs;
  const conds: SQL[] = [eq(o.predictionRunId, runId)];
  if (q.search) {
    conds.push(sql`${o.accId}::text LIKE ${`%${q.search}%`}`);
  }
  if (q.lifecycle_stage) {
    conds.push(eq(o.lifecycleStage, q.lifecycle_stage));
  }
  if (q.churn_risk_level) {
    conds.push(eq(o.churnRiskLevel, q.churn_risk_level));
  }
  if (q.customer_value_tier) {
    conds.push(eq(o.customerValueTier, q.customer_value_tier));
  }
  if (q.credit_urgency_level) {
    conds.push(eq(o.creditUrgencyLevel, q.credit_urgency_level));
  }
  if (q.ever_paid === "true" || q.ever_paid === "false") {
    conds.push(eq(o.everPaid, q.ever_paid === "true"));
  }
  if (q.segment) {
    conds.push(eq(o.segment, q.segment));
  }
  if (q.needs_review === "true" || q.needs_review === "false") {
    conds.push(eq(o.needsReview, q.needs_review === "true"));
  }
  return and(...conds);
}

export const outputsRoutes = new Elysia()
  .use(requireUser)
  .get(
    "/:id/outputs",
    async ({ params, query, set }) => {
      if (!UUID_RE.test(params.id)) {
        return denyNotFound(set, "Prediction run not found");
      }
      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied || !run) {
        return denied;
      }

      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.min(200, Math.max(1, query.page_size ?? 8));
      const where = outputFilters(run.id, query);

      const [[{ total }], rows] = await Promise.all([
        db
          .select({ total: sql<number>`COUNT(*)::int` })
          .from(mlPredictionOutputs)
          .where(where),
        db
          .select()
          .from(mlPredictionOutputs)
          .where(where)
          .orderBy(parseSort(query.sort), asc(mlPredictionOutputs.accId))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ]);

      return { data: rows.map(mapOutput), page, page_size: pageSize, total };
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        churn_risk_level: t.Optional(t.String()),
        credit_urgency_level: t.Optional(t.String()),
        customer_value_tier: t.Optional(t.String()),
        ever_paid: t.Optional(t.String()),
        lifecycle_stage: t.Optional(t.String()),
        needs_review: t.Optional(t.String()),
        page: t.Optional(t.Numeric()),
        page_size: t.Optional(t.Numeric()),
        search: t.Optional(t.String()),
        segment: t.Optional(t.String()),
        sort: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/:id/outputs/:acc_id",
    async ({ params, set }) => {
      const accId = Number(params.acc_id);
      if (!(UUID_RE.test(params.id) && Number.isInteger(accId))) {
        return denyNotFound(set, "Prediction output not found");
      }
      const run = await fetchRun(params.id);
      const denied = requireRunFound(run, set);
      if (denied) {
        return denied;
      }
      const [row] = await db
        .select()
        .from(mlPredictionOutputs)
        .where(
          and(
            eq(mlPredictionOutputs.predictionRunId, params.id),
            eq(mlPredictionOutputs.accId, accId)
          )
        )
        .limit(1);
      if (!row) {
        return denyNotFound(set, "Prediction output not found");
      }
      return mapOutput(row);
    },
    { params: t.Object({ acc_id: t.String(), id: t.String() }) }
  );
