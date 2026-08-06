import type {
  ForecastComponentTransitionRequest,
  ForecastComponentContract,
  ForecastCompositionContract,
  ForecastVersionContract,
  RevenueTargetVersionContract,
  UpdateForecastComponentRequest,
} from "@naai-erp/contracts";

export type RevenueTarget = RevenueTargetVersionContract;
export type ForecastVersion = ForecastVersionContract;

export type ForecastComponent = ForecastComponentContract;
export type ForecastComposition = ForecastCompositionContract;
export type ForecastComponentUpdate = UpdateForecastComponentRequest;
export type ForecastComponentTransition = ForecastComponentTransitionRequest;

export const planningApi = Object.freeze({
  targets: "revenue-targets",
  forecasts: "forecast-versions",
  target: (id: string) => `revenue-targets/${encodeURIComponent(id)}`,
  forecast: (id: string) => `forecast-versions/${encodeURIComponent(id)}`,
  targetAction: (id: string, action: string) =>
    `revenue-targets/${encodeURIComponent(id)}/${action}`,
  forecastAction: (id: string, action: string) =>
    `forecast-versions/${encodeURIComponent(id)}/${action}`,
  composition: (id: string) => `forecast-versions/${encodeURIComponent(id)}/composition`,
  components: (id: string) => `forecast-versions/${encodeURIComponent(id)}/components`,
  component: (forecastId: string, componentId: string) =>
    `forecast-versions/${encodeURIComponent(forecastId)}/components/${encodeURIComponent(componentId)}`,
  componentAction: (forecastId: string, componentId: string, action: string) =>
    `forecast-versions/${encodeURIComponent(forecastId)}/components/${encodeURIComponent(componentId)}/${action}`,
});
