import type { ForecastVersionContract, RevenueTargetVersionContract } from "@naai-erp/contracts";

export type RevenueTarget = RevenueTargetVersionContract;
export type ForecastVersion = ForecastVersionContract;

export const planningApi = Object.freeze({
  targets: "revenue-targets",
  forecasts: "forecast-versions",
  target: (id: string) => `revenue-targets/${encodeURIComponent(id)}`,
  forecast: (id: string) => `forecast-versions/${encodeURIComponent(id)}`,
  targetAction: (id: string, action: string) =>
    `revenue-targets/${encodeURIComponent(id)}/${action}`,
  forecastAction: (id: string, action: string) =>
    `forecast-versions/${encodeURIComponent(id)}/${action}`,
});
