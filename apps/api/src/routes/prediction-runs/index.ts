import Elysia from "elysia";
import { customer360Routes } from "./customer-360";
import { insightRoutes } from "./insight";
import { outputsRoutes } from "./outputs";
import { realizedOutcomesRoutes } from "./realized-outcomes";
import { runsRoutes } from "./runs";
import { summaryRoutes } from "./summary";

export const predictionRunRoutes = new Elysia({ prefix: "/prediction-runs" })
  .use(runsRoutes)
  .use(outputsRoutes)
  .use(summaryRoutes)
  .use(customer360Routes)
  .use(insightRoutes)
  .use(realizedOutcomesRoutes);
