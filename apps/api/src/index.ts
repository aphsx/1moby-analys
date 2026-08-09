import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { auth } from "./auth";
import {
  releaseStalePredict,
  releaseStaleTrainImports,
} from "./lib/abort-data-source";
import { startStaleRunReaper } from "./lib/run-reaper";
import { aiChatRoutes } from "./routes/ai-chat";
import { modelPerformanceRoutes } from "./routes/model-performance";
import { outcomeBackfillRoutes } from "./routes/outcome-backfill";
import { predictDataRoutes } from "./routes/predict-data";
import { predictionRunRoutes } from "./routes/prediction-runs";
import { trainDataRoutes } from "./routes/train-data";
import { trainingRunRoutes } from "./routes/training-runs";

const PORT = Number(process.env.PORT ?? 3001);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

Promise.all([releaseStaleTrainImports(), releaseStalePredict()])
  .then(([train, predict]) => {
    if (train > 0 || predict > 0) {
      console.log(
        `[api] Released stale imports on startup: train=${train} predict=${predict}`
      );
    }
  })
  .catch((e) => console.error("[api] Failed to release stale imports:", e));

// Mark runs stuck in a non-terminal status as failed — now and every 5 minutes.
startStaleRunReaper();

const app = new Elysia()
  .use(
    cors({
      credentials: true,
      origin: ALLOWED_ORIGINS,
    })
  )
  // Better Auth handles all /api/auth/* routes; returns null for everything else
  .mount(auth.handler)
  // Train raw import -> train_data_sources + train_raw_sheet_* + train_clean_*
  .use(trainDataRoutes)
  // Predict raw import -> predict_data_sources + predict_raw_sheet_* + predict_clean_*
  .use(predictDataRoutes)
  // Isolated LLM chat API. UI wiring will be rebuilt separately.
  .use(aiChatRoutes)
  // ML v2 — prediction runs + outputs/summary (spec §4/§7)
  .use(predictionRunRoutes)
  // ML v2 — training runs (spec §2.6)
  .use(trainingRunRoutes)
  // ML v2 — champion model performance (spec §2.4)
  .use(modelPerformanceRoutes)
  // ML v2 — realized-outcome backfill trigger (TRAINING-PIPELINE §15, admin)
  .use(outcomeBackfillRoutes)
  .get("/health", () => ({
    db: "connected",
    message: "ML v2 API: prediction-runs, training-runs, model-performance.",
    status: "ok",
  }))
  .listen(PORT);

console.log(`[api] Elysia listening on port ${PORT}`);

export type App = typeof app;
