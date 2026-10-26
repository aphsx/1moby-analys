import Elysia, { t } from "elysia";
import { db } from "../../db/client";
import { requireUser } from "../../lib/http/auth-middleware";
import { notFound } from "../../lib/http/errors";
import {
  createCustomerAiExplanation,
  loadCustomerPayments,
  loadCustomerUsageMonthly,
} from "../../lib/ai";
import { mapOutput, requireOutput, requireRun } from "../../lib/ml/prediction-runs";

export const customer360Routes = new Elysia()
  .use(requireUser)
  .get(
    "/:id/customers/:acc_id/usage-monthly",
    async ({ params }) => {
      const accId = Number(params.acc_id);
      const run = await requireRun(params.id);
      if (!Number.isInteger(accId)) throw notFound("Prediction run not found");
      return loadCustomerUsageMonthly(run, accId);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }), acc_id: t.String() }) }
  )
  .get(
    "/:id/customers/:acc_id/payments",
    async ({ params }) => {
      const accId = Number(params.acc_id);
      const run = await requireRun(params.id);
      if (!Number.isInteger(accId)) throw notFound("Prediction run not found");
      return loadCustomerPayments(run, accId);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }), acc_id: t.String() }) }
  )
  .post(
    "/:id/outputs/:acc_id/ai-explanation",
    async ({ params, body }) => {
      const run = await requireRun(params.id);
      const row = await requireOutput(params.id, params.acc_id);

      const result = await createCustomerAiExplanation(
        run,
        row.accId,
        mapOutput(row),
        body.force ?? false
      );
      return result;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), acc_id: t.String() }),
      body: t.Object({ force: t.Optional(t.Boolean()) }),
    }
  );
