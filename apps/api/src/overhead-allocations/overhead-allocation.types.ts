import type { JournalActorContext } from "../journals/journal.types.js";
export type OverheadContext = JournalActorContext;
export type OverheadResource =
  "overhead-allocation-policies" | "overhead-source-pools" | "overhead-allocation-runs";
export type OverheadAllocationStore = Readonly<{
  list(
    c: OverheadContext,
    resource: OverheadResource,
    filters: Record<string, string | undefined>,
  ): Promise<unknown>;
  get(c: OverheadContext, resource: OverheadResource, id: string): Promise<unknown | undefined>;
  create(
    c: OverheadContext,
    resource: OverheadResource,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  transition(
    c: OverheadContext,
    resource: OverheadResource,
    id: string,
    action: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
}>;
export const OVERHEAD_ALLOCATION_STORE = Symbol("OVERHEAD_ALLOCATION_STORE");
