import { createHash } from "node:crypto";
import type { PlanningResource } from "./planning.types.js";

export const TABLE: Record<PlanningResource, string> = {
  "revenue-targets": "revenue_target_versions",
  "forecast-versions": "forecast_versions",
};
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
