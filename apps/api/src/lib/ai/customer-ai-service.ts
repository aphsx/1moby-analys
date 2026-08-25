import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { mlPredictionOutputs } from "../../db/schema";
import type { PredictionOutput } from "../ml-contract";
import { buildCustomerAiContext } from "./customer-ai-context";
import { generateCustomerAiExplanation } from "./customer-explanation";

type RunRow = {
  id: string;
  name: string;
  cutoffDate: string;
  predictSourceId: string;
};

export type CustomerAiExplanationResponse = {
  acc_id: number;
  ai_status: PredictionOutput["ai_status"];
  ai_explanation: string | null;
  ai_model: string;
  ai_generated_at: string;
};

type ServiceError = {
  status: number;
  body: { message: string; code?: string };
};

const outputWhere = (runId: string, accId: number) =>
  and(
    eq(mlPredictionOutputs.predictionRunId, runId),
    eq(mlPredictionOutputs.accId, accId)
  );

export async function createCustomerAiExplanation(
  run: RunRow,
  accId: number,
  output: PredictionOutput,
  force: boolean
): Promise<CustomerAiExplanationResponse | ServiceError> {
  if (output.ai_status === "completed" && output.ai_explanation && !force) {
    return {
      body: {
        code: "ai_already_exists",
        message: "AI explanation already exists",
      },
      status: 409,
    };
  }

  await db
    .update(mlPredictionOutputs)
    .set({ aiStatus: "pending" })
    .where(outputWhere(run.id, accId));

  try {
    const context = await buildCustomerAiContext(run, accId, output);
    const { explanation, model } = await generateCustomerAiExplanation(context);
    const generatedAt = new Date();

    // Persist the deterministic signals + SHAP factors the explanation was
    // grounded in. Keeps a structured, queryable record next to the free text
    // and lets the UI fall back to facts if the narrative is ever unavailable.
    const reasoningJson = {
      churn_factors: output.churn_factors ?? null,
      signals: context.signals,
    };

    const [updated] = await db
      .update(mlPredictionOutputs)
      .set({
        aiExplanation: explanation,
        aiGeneratedAt: generatedAt,
        aiModel: model,
        aiReasoningJson: reasoningJson,
        aiStatus: "completed",
      })
      .where(outputWhere(run.id, accId))
      .returning({
        accId: mlPredictionOutputs.accId,
        aiExplanation: mlPredictionOutputs.aiExplanation,
        aiStatus: mlPredictionOutputs.aiStatus,
      });

    return {
      acc_id: updated.accId,
      ai_explanation: updated.aiExplanation,
      ai_generated_at: generatedAt.toISOString(),
      ai_model: model,
      ai_status: updated.aiStatus as PredictionOutput["ai_status"],
    };
  } catch (e) {
    await db
      .update(mlPredictionOutputs)
      .set({ aiStatus: "failed" })
      .where(outputWhere(run.id, accId));
    return {
      body: {
        message: (e as Error).message || "Failed to generate AI explanation",
      },
      status: 500,
    };
  }
}
