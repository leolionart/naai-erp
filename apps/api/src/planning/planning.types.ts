import type { JournalActorContext } from "../journals/journal.types.js";

export type PlanningContext = JournalActorContext;
export type PlanningResource = "revenue-targets" | "forecast-versions";
export type PlanningStore = Readonly<{
  list(
    c: PlanningContext,
    resource: PlanningResource,
    filters: Record<string, string | undefined>,
  ): Promise<unknown>;
  get(c: PlanningContext, resource: PlanningResource, id: string): Promise<unknown | undefined>;
  create(
    c: PlanningContext,
    resource: PlanningResource,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  transition(
    c: PlanningContext,
    resource: PlanningResource,
    id: string,
    action: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
}>;
export const PLANNING_STORE = Symbol("PLANNING_STORE");
