import type { CustomerAiExplanationResult, PredictionOutput } from "@moby/types";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { conflict, HttpError } from "../http/errors";
import { mlPredictionOutputs } from "../../db/schema";
import { buildCustomerAiContext } from "./customer-ai-context";
import { generateCustomerAiExplanation } from "./customer-explanation";

type RunRow = {
  id: string;
  name: string;
  cutoffDate: string;
  predictSourceId: string;
};

const outputWhere = (runId: string, accId: number) =>
  and(eq(mlPredictionOutputs.predictionRunId, runId), eq(mlPredictionOutputs.accId, accId));

export async function createCustomerAiExplanation(
  run: RunRow,
  accId: number,
  output: PredictionOutput,
  force: boolean
): Promise<CustomerAiExplanationResult> {
  if (output.ai_status === "completed" && output.ai_explanation && !force) {
    throw conflict("AI explanation already exists", "AI_ALREADY_EXISTS");
  }

  await db.update(mlPredictionOutputs).set({ aiStatus: "pending" }).where(outputWhere(run.id, accId));

  try {
    const context = await buildCustomerAiContext(run, accId, output);
    const { explanation, model } = await generateCustomerAiExplanation(context);
    const generatedAt = new Date();

    // Persist the deterministic signals + SHAP factors the explanation was
    // grounded in. Keeps a structured, queryable record next to the free text
    // and lets the UI fall back to facts if the narrative is ever unavailable.
    const reasoningJson = {
      signals: context.signals,
      churn_factors: output.churn_factors ?? null,
    };

    const [updated] = await db
      .update(mlPredictionOutputs)
      .set({
        aiStatus: "completed",
        aiExplanation: explanation,
        aiReasoningJson: reasoningJson,
        aiModel: model,
        aiGeneratedAt: generatedAt,
      })
      .where(outputWhere(run.id, accId))
      .returning({
        accId: mlPredictionOutputs.accId,
        aiStatus: mlPredictionOutputs.aiStatus,
        aiExplanation: mlPredictionOutputs.aiExplanation,
      });

    return {
      acc_id: updated.accId,
      ai_status: updated.aiStatus as PredictionOutput["ai_status"],
      ai_explanation: updated.aiExplanation,
      ai_model: model,
      ai_generated_at: generatedAt.toISOString(),
    };
  } catch (e) {
    await db.update(mlPredictionOutputs).set({ aiStatus: "failed" }).where(outputWhere(run.id, accId));
    throw new HttpError(500, (e as Error).message || "Failed to generate AI explanation");
  }
}
