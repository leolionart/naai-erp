import type { JournalActorContext } from "../journals/journal.types.js";
export type ProjectCostContext = JournalActorContext;
export type ProjectCostStore = Readonly<{
  listCosts(org: string, projectId?: string): Promise<unknown>;
  getCost(org: string, id: string): Promise<unknown | undefined>;
  unallocated(org: string): Promise<unknown>;
  createAllocation(
    c: ProjectCostContext,
    i: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  listAllocations(org: string): Promise<unknown>;
  getAllocation(org: string, id: string): Promise<unknown | undefined>;
  transition(
    c: ProjectCostContext,
    id: string,
    action: string,
    i: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
}>;
export const PROJECT_COST_STORE = Symbol("PROJECT_COST_STORE");
