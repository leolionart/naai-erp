import type { JournalActorContext } from "../journals/journal.types.js";

export type ForecastComponentContext = JournalActorContext;
export type ForecastComponentStore = Readonly<{
  list(
    c: ForecastComponentContext,
    forecastId: string,
    filters: Record<string, string | undefined>,
  ): Promise<unknown>;
  get(c: ForecastComponentContext, forecastId: string, id: string): Promise<unknown | undefined>;
  create(
    c: ForecastComponentContext,
    forecastId: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  update(
    c: ForecastComponentContext,
    forecastId: string,
    id: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  remove(
    c: ForecastComponentContext,
    forecastId: string,
    id: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  transition(
    c: ForecastComponentContext,
    forecastId: string,
    id: string,
    action: "review" | "exclude",
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  composition(c: ForecastComponentContext, forecastId: string): Promise<unknown>;
}>;

export const FORECAST_COMPONENT_STORE = Symbol("FORECAST_COMPONENT_STORE");
